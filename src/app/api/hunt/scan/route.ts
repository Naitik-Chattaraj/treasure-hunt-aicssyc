import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isRoute2Configured } from '@/lib/supabase';
import { verifyTeamToken, isRoleSessionValid } from '@/lib/auth';
import { getTeamChallenge } from '@/lib/challenges';

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('team_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await verifyTeamToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { qrHash } = await req.json();
    const cleanQrHash = qrHash?.trim();

    if (!cleanQrHash) {
      return NextResponse.json({ error: 'QR hash missing' }, { status: 400 });
    }

    const primaryRoute: 1 | 2 = payload.assignedRoute === 2 ? 2 : 1;
    let teamDb = getSupabaseAdmin(primaryRoute);

    if (!teamDb) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    // 1. Fetch team info from their route database
    let { data: team, error: teamError } = await teamDb
      .from('teams')
      .select('*')
      .eq('id', payload.teamId)
      .maybeSingle();

    if (!team && isRoute2Configured()) {
      const altDb = getSupabaseAdmin(primaryRoute === 1 ? 2 : 1);
      if (altDb) {
        const { data: altTeam } = await altDb
          .from('teams')
          .select('*')
          .eq('id', payload.teamId)
          .maybeSingle();
        if (altTeam) {
          team = altTeam;
          teamDb = altDb;
        }
      }
    }

    if (teamError || !team) {
      console.error('API /hunt/scan: Team error:', teamError);
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Strictly enforce max 1 device for Field Scout and max 1 device for Base Decoder
    if (!isRoleSessionValid(team.device_id, payload.deviceId, payload.operativeRole)) {
      const response = NextResponse.json({ error: 'Session expired: logged in from another device' }, { status: 401 });
      response.cookies.delete('team_session');
      return response;
    }

    if (team.status !== 'approved') {
      return NextResponse.json({ error: 'Team not approved' }, { status: 403 });
    }

    // Check cooldown
    if (team.cooldown_until && new Date(team.cooldown_until).getTime() > Date.now()) {
      const waitSeconds = Math.ceil((new Date(team.cooldown_until).getTime() - Date.now()) / 1000);
      return NextResponse.json({
        error: 'cooldown_active',
        message: team.wrong_attempts >= 5 ? `WASTED. Wait ${waitSeconds}s.` : `SYSTEM LOCKOUT: Anti-brute-force active. Wait ${waitSeconds}s before scanning.`,
        waitSeconds,
      }, { status: 429 });
    }

    const assignedRoute: 1 | 2 = (team.assigned_route === 2 ? 2 : 1);
    const currentStage: number = team.current_stage || 1;

    // 2. Find matching checkpoint by QR hash (case-insensitive) in team's route database
    let matchedNode: {
      id: number;
      route_id: number;
      stage: number;
      title: string;
      area: string;
      clue: string;
    } | null = null;

    try {
      const { data: dbNode } = await teamDb
        .from('checkpoints')
        .select('*')
        .eq('qr_hash', cleanQrHash)
        .maybeSingle();

      if (dbNode) {
        matchedNode = {
          id: dbNode.id,
          route_id: dbNode.route_id || assignedRoute,
          stage: dbNode.stage || dbNode.id,
          title: dbNode.title,
          area: dbNode.area,
          clue: dbNode.clue,
        };
      }
    } catch (e) {
      console.warn('DB QR lookup warning in team database:', e);
    }

    // If NOT found in team's database, check if it belongs to the OTHER route
    if (!matchedNode) {
      let otherRouteId: number | null = null;

      if (isRoute2Configured()) {
        const altRoute: 1 | 2 = assignedRoute === 1 ? 2 : 1;
        const altDb = getSupabaseAdmin(altRoute);
        if (altDb) {
          try {
            const { data: otherDbNode } = await altDb
              .from('checkpoints')
              .select('route_id')
              .eq('qr_hash', cleanQrHash)
              .maybeSingle();
            if (otherDbNode) {
              otherRouteId = otherDbNode.route_id || altRoute;
            }
          } catch {}
        }
      }



      let targetCheckpointId = currentStage;
      try {
        const { data: cp } = await teamDb.from('checkpoints').select('id').eq('route_id', assignedRoute).eq('stage', currentStage).maybeSingle();
        if (cp) targetCheckpointId = cp.id;
      } catch {}

      if (otherRouteId) {
        // Log cross-route scan attempt in team's database
        try {
          await teamDb.from('submissions_log').insert({
            team_id: team.id,
            node_id: targetCheckpointId,
            submission_type: 'scan',
            submitted_value: cleanQrHash,
            is_correct: false,
          });
        } catch {}

        return NextResponse.json({
          success: false,
          error: 'route_mismatch',
          message: `ROUTE MISMATCH: This QR code belongs to Route 0${otherRouteId}. Your team is assigned to Route 0${assignedRoute}!`,
        });
      }
    }

    if (!matchedNode) {
      // Safely log failed scan
      let targetCheckpointId = currentStage;
      try {
        const { data: cp } = await teamDb.from('checkpoints').select('id').eq('route_id', assignedRoute).eq('stage', currentStage).maybeSingle();
        if (cp) targetCheckpointId = cp.id;
      } catch {}

      try {
        await teamDb.from('submissions_log').insert({
          team_id: team.id,
          node_id: targetCheckpointId,
          submission_type: 'scan',
          submitted_value: cleanQrHash,
          is_correct: false,
        });
      } catch {}

      let errorMsg = 'UNKNOWN QR CODE. ACCESS DENIED.';
      let waitSeconds = 0;

      if (currentStage > 1) {
        const attempts = (team.wrong_attempts || 0) + 1;
        if (attempts >= 5) {
          const cooldownSeconds = 60;
          const cooldownUntil = new Date(Date.now() + cooldownSeconds * 1000).toISOString();
          await teamDb.from('teams').update({ wrong_attempts: attempts, cooldown_until: cooldownUntil, updated_at: new Date().toISOString() }).eq('id', team.id);
          errorMsg = 'WASTED';
          waitSeconds = cooldownSeconds;
        } else {
          await teamDb.from('teams').update({ wrong_attempts: attempts, updated_at: new Date().toISOString() }).eq('id', team.id);
        }
      }

      return NextResponse.json({
        success: false,
        error: 'invalid_qr',
        message: errorMsg,
        waitSeconds,
      });
    }

    if (matchedNode.route_id !== assignedRoute) {
      return NextResponse.json({
        success: false,
        error: 'route_mismatch',
        message: `ROUTE MISMATCH: This QR code belongs to Route 0${matchedNode.route_id}. Your team is assigned to Route 0${assignedRoute}!`,
      });
    }

    // 3. Sequence check: If scanned a future node
    if (matchedNode.stage > currentStage) {
      return NextResponse.json({
        success: false,
        error: 'sequence_violation',
        nodeId: matchedNode.stage,
        currentStage,
        message: `SEQUENCE VIOLATION: Accessing Node 0${matchedNode.stage} out of order. You haven't reached this node yet!`,
      });
    }

    // If scanned a node already completed in the past
    if (matchedNode.stage < currentStage) {
      return NextResponse.json({
        success: false,
        error: 'already_completed',
        nodeId: matchedNode.stage,
        currentStage,
        message: `NODE 0${matchedNode.stage} ALREADY COMPROMISED. CURRENT TARGET: NODE 0${currentStage}`,
      });
    }

    // 4. Exact stage match! Get or assign this team's question in its route database
    let challengeData: any = null;

    try {
      const { challenge } = await getTeamChallenge(teamDb, team.id, matchedNode.id, { assignIfMissing: true });
      if (!challenge) {
        return NextResponse.json({
          success: false,
          error: 'no_question',
          message: `CRITICAL: No questions configured for Node 0${matchedNode.stage}. Contact Admins.`,
        });
      }
      
      challengeData = {
        ...challenge,
        nodeId: matchedNode.stage,
        checkpointId: matchedNode.id,
      };
    } catch (e) {
      console.warn('team_active_challenges process warning:', e);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }


    // Batch auxiliary updates to reduce server execution time
    const updates: any[] = [];

    // Safely log successful scan in submissions audit
    updates.push(
      teamDb.from('submissions_log').insert({
        team_id: team.id,
        node_id: matchedNode.id,
        submission_type: 'scan',
        submitted_value: cleanQrHash,
        is_correct: true,
      })
    );

    const teamUpdates: any = {};
    // Reset wrong attempts on successful scan
    if ((team.wrong_attempts || 0) > 0) {
      teamUpdates.wrong_attempts = 0;
    }
    // Set start time on first scan
    if (!team.start_time) {
      teamUpdates.start_time = new Date().toISOString();
    }

    if (Object.keys(teamUpdates).length > 0) {
      teamUpdates.updated_at = new Date().toISOString();
      updates.push(teamDb.from('teams').update(teamUpdates).eq('id', team.id));
    }

    try {
      await Promise.all(updates);
    } catch (e) {
      console.warn('Background updates failed:', e);
    }

    return NextResponse.json({
      success: true,
      nodeId: matchedNode.stage,
      checkpointId: matchedNode.id,
      stage: matchedNode.stage,
      routeId: matchedNode.route_id,
      title: matchedNode.title,
      challenge: challengeData,
    });
  } catch (err: unknown) {
    console.error('API /hunt/scan: Internal Error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
