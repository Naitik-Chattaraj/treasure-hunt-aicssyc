import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isRoute2Configured } from '@/lib/supabase';
import { verifyTeamToken, isRoleSessionValid } from '@/lib/auth';
import { MOCK_CHECKPOINTS } from '@/lib/mock-data';

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
        message: `SYSTEM LOCKOUT: Anti-brute-force active. Wait ${waitSeconds}s before scanning.`,
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
        .ilike('qr_hash', cleanQrHash)
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
              .ilike('qr_hash', cleanQrHash)
              .maybeSingle();
            if (otherDbNode) {
              otherRouteId = otherDbNode.route_id || altRoute;
            }
          } catch {}
        }
      }

      if (!otherRouteId) {
        const mockMatch = MOCK_CHECKPOINTS.find((c) => c.qrHash?.toLowerCase() === cleanQrHash.toLowerCase());
        if (mockMatch && mockMatch.routeId !== assignedRoute) {
          otherRouteId = mockMatch.routeId;
        } else if (mockMatch && mockMatch.routeId === assignedRoute) {
          matchedNode = {
            id: mockMatch.id,
            route_id: mockMatch.routeId,
            stage: mockMatch.stage,
            title: mockMatch.title,
            area: mockMatch.area,
            clue: mockMatch.clue,
          };
        }
      }

      if (otherRouteId) {
        // Log cross-route scan attempt in team's database
        try {
          await teamDb.from('submissions_log').insert({
            team_id: team.id,
            node_id: currentStage,
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
      try {
        await teamDb.from('submissions_log').insert({
          team_id: team.id,
          node_id: currentStage,
          submission_type: 'scan',
          submitted_value: cleanQrHash,
          is_correct: false,
        });
      } catch {}

      return NextResponse.json({
        success: false,
        error: 'invalid_qr',
        message: 'UNKNOWN QR CODE. ACCESS DENIED.',
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

    // 4. Exact stage match! Check or etch challenge in team's route database
    let challengeData: any = null;

    try {
      let { data: existingActive } = await teamDb
        .from('team_active_challenges')
        .select(`
          id,
          question_id,
          questions_pool (
            id,
            challenge_type,
            question,
            options
          )
        `)
        .eq('team_id', team.id)
        .eq('node_id', matchedNode.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existingActive) {
        // Fetch questions for this node from team's route pool
        const { data: pool } = await teamDb
          .from('questions_pool')
          .select('id, challenge_type, question, options')
          .eq('node_id', matchedNode.id);

        if (pool && pool.length > 0) {
          const chosen = pool[Math.floor(Math.random() * pool.length)];
          const { data: inserted } = await teamDb
            .from('team_active_challenges')
            .insert({
              team_id: team.id,
              node_id: matchedNode.id,
              question_id: chosen.id,
            })
            .select(`
              id,
              question_id,
              questions_pool (
                id,
                challenge_type,
                question,
                options
              )
            `)
            .single();

          existingActive = inserted;
        }
      }

      if (existingActive?.questions_pool) {
        const q = Array.isArray(existingActive.questions_pool) 
          ? existingActive.questions_pool[0] 
          : existingActive.questions_pool;

        challengeData = {
          id: q.id,
          nodeId: matchedNode.stage,
          checkpointId: matchedNode.id,
          type: q.challenge_type,
          question: q.question,
          options: q.options,
        };
      }
    } catch (e) {
      console.warn('team_active_challenges process warning:', e);
    }

    // Fallback challenge from mock data if DB questions pool is unpopulated
    if (!challengeData) {
      const mockNode = MOCK_CHECKPOINTS.find((c) => c.id === matchedNode?.id);
      if (mockNode?.challenge) {
        challengeData = mockNode.challenge;
      }
    }

    // Safely log successful scan in submissions audit
    try {
      await teamDb.from('submissions_log').insert({
        team_id: team.id,
        node_id: matchedNode.id,
        submission_type: 'scan',
        submitted_value: cleanQrHash,
        is_correct: true,
      });
    } catch {}

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
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
