import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyTeamToken } from '@/lib/auth';
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

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    // 1. Fetch team info with select('*') so it never fails on schema discrepancies
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('*')
      .eq('id', payload.teamId)
      .single();

    if (teamError || !team) {
      console.error('API /hunt/scan: Team error:', teamError);
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    if (team.device_id && team.device_id !== payload.deviceId) {
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

    const assignedRoute: 1 | 2 = (team.assigned_route === 2 || team.assignedRoute === 2) ? 2 : 1;
    const currentStage: number = team.current_stage || 1;

    // 2. Find matching checkpoint by QR hash (case-insensitive) in database or mock fallback
    let matchedNode: {
      id: number;
      route_id: number;
      stage: number;
      title: string;
      area: string;
      clue: string;
    } | null = null;

    try {
      const { data: dbNode } = await supabase
        .from('checkpoints')
        .select('*')
        .ilike('qr_hash', cleanQrHash)
        .maybeSingle();

      if (dbNode) {
        matchedNode = {
          id: dbNode.id,
          route_id: dbNode.route_id || 1,
          stage: dbNode.stage || dbNode.id,
          title: dbNode.title,
          area: dbNode.area,
          clue: dbNode.clue,
        };
      }
    } catch (e) {
      console.warn('DB QR lookup warning:', e);
    }

    // Fallback to MOCK_CHECKPOINTS for hash match if DB table is unpopulated or missing hash
    if (!matchedNode) {
      const mockMatch = MOCK_CHECKPOINTS.find((c) => c.qrHash?.toLowerCase() === cleanQrHash.toLowerCase());
      if (mockMatch) {
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

    if (!matchedNode) {
      // Safely log failed scan
      try {
        await supabase.from('submissions_log').insert({
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

    // Check route match
    if (matchedNode.route_id !== assignedRoute) {
      try {
        await supabase.from('submissions_log').insert({
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

    // 4. Exact stage match! Check or etch challenge
    let challengeData: any = null;

    try {
      let { data: existingActive } = await supabase
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
        .maybeSingle();

      if (!existingActive) {
        // Fetch questions for this node from pool
        const { data: pool } = await supabase
          .from('questions_pool')
          .select('id, challenge_type, question, options')
          .eq('node_id', matchedNode.id);

        if (pool && pool.length > 0) {
          const chosen = pool[Math.floor(Math.random() * pool.length)];
          const { data: inserted } = await supabase
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
      await supabase.from('submissions_log').insert({
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
