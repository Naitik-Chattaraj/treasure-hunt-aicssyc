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

    const { nodeId, answer } = await req.json();
    const cleanAnswer = answer ? String(answer).trim() : '';

    if (!nodeId || !cleanAnswer) {
      return NextResponse.json({ error: 'Node ID and answer required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    // 1. Fetch team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, status, current_stage, cooldown_until, wrong_attempts, start_time, assigned_route, device_id')
      .eq('id', payload.teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    if (team.device_id && payload.deviceId) {
      let isSessionValid = true;
      if (team.device_id.startsWith('{')) {
        try {
          const parsed = JSON.parse(team.device_id);
          const roleKey = payload.operativeRole === 'Field Scout' ? 'scout' : 'decoder';
          if (parsed[roleKey] && parsed[roleKey] !== payload.deviceId) {
            isSessionValid = false;
          }
        } catch {}
      } else if (team.device_id !== payload.deviceId) {
        isSessionValid = false;
      }

      if (!isSessionValid) {
        const response = NextResponse.json({ error: 'Session expired: logged in from another device' }, { status: 401 });
        response.cookies.delete('team_session');
        return response;
      }
    }

    if (team.status !== 'approved') {
      return NextResponse.json({ error: 'Team not approved' }, { status: 403 });
    }

    // 2. Check cooldown lockout
    if (team.cooldown_until && new Date(team.cooldown_until).getTime() > Date.now()) {
      const waitSeconds = Math.ceil((new Date(team.cooldown_until).getTime() - Date.now()) / 1000);
      return NextResponse.json({
        error: 'cooldown_active',
        message: `SYSTEM LOCKOUT: Anti-brute-force active. Wait ${waitSeconds}s before re-attempting.`,
        waitSeconds,
      }, { status: 429 });
    }

    const assignedRoute = team.assigned_route || 1;

    // Fetch the checkpoint for this team's route and current stage
    let cpId = nodeId;
    try {
      const { data: currentCp } = await supabase
        .from('checkpoints')
        .select('id, route_id, stage')
        .eq('route_id', assignedRoute)
        .eq('stage', team.current_stage)
        .maybeSingle();

      if (currentCp) {
        cpId = currentCp.id;
      }
    } catch {}

    if (!cpId) {
      const mockCp = MOCK_CHECKPOINTS.find((c) => c.routeId === assignedRoute && c.stage === team.current_stage)
                  || MOCK_CHECKPOINTS.find((c) => c.id === team.current_stage);
      if (mockCp) cpId = mockCp.id;
    }

    // 3. Verify node matches team's current stage (or checkpoint id)
    if (nodeId !== team.current_stage && nodeId !== cpId) {
      return NextResponse.json({
        error: 'stage_mismatch',
        message: `Invalid node submission. Your current target is Node 0${team.current_stage}`,
      }, { status: 400 });
    }

    // 4. Fetch the specific etched question assigned to this team
    let isMatch = false;
    let activeChallengeId: string | null = null;

    try {
      const { data: activeChallenge } = await supabase
        .from('team_active_challenges')
        .select(`
          id,
          question_id,
          questions_pool (
            id,
            answer
          )
        `)
        .eq('team_id', team.id)
        .eq('node_id', cpId)
        .maybeSingle();

      if (activeChallenge && activeChallenge.questions_pool) {
        const q = Array.isArray(activeChallenge.questions_pool) 
          ? activeChallenge.questions_pool[0] 
          : activeChallenge.questions_pool;
        isMatch = q.answer.trim().toLowerCase() === cleanAnswer.toLowerCase();
        activeChallengeId = activeChallenge.id;
      }
    } catch (e) {
      console.warn('team_active_challenges lookup warning:', e);
    }

    // Fallback if challenge was served from MOCK_CHECKPOINTS
    if (!activeChallengeId) {
      const mockCp = MOCK_CHECKPOINTS.find((c) => c.id === cpId || (c.stage === team.current_stage && c.routeId === assignedRoute));
      if (mockCp && mockCp.challenge && mockCp.challenge.answer) {
        isMatch = mockCp.challenge.answer.trim().toLowerCase() === cleanAnswer.toLowerCase();
      } else {
        return NextResponse.json({
          error: 'challenge_not_unlocked',
          message: 'QR code must be scanned on campus before submitting answers!',
        }, { status: 400 });
      }
    }

    // Log the submission attempt
    await supabase.from('submissions_log').insert({
      team_id: team.id,
      node_id: nodeId,
      submission_type: 'answer',
      submitted_value: cleanAnswer,
      is_correct: isMatch,
    });

    if (isMatch) {
      // Correct!
      const nextStage = team.current_stage + 1;
      const isVictorious = nextStage > 12;
      const completionToken = isVictorious
        ? `WIN-${Date.now().toString(16).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
        : null;

      // Mark etched challenge as solved if tracked in DB
      if (activeChallengeId) {
        await supabase
          .from('team_active_challenges')
          .update({
            is_solved: true,
            solved_at: new Date().toISOString(),
          })
          .eq('id', activeChallengeId);
      }

      // Record completed node in hunt completions
      await supabase.from('hunt_completions').upsert({
        team_id: team.id,
        node_id: nodeId,
        completed_at: new Date().toISOString(),
      });

      // Update team record
      await supabase
        .from('teams')
        .update({
          current_stage: nextStage,
          wrong_attempts: 0,
          cooldown_until: null,
          ...(isVictorious ? {
            completed_at: new Date().toISOString(),
            completion_token: completionToken,
          } : {}),
          ...(!team.start_time ? {
            start_time: new Date().toISOString(),
          } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', team.id);

      return NextResponse.json({
        success: true,
        nextStage,
        completed: isVictorious,
        completionToken,
      });
    }

    // Incorrect answer -> trigger penalty cooldown
    const attempts = (team.wrong_attempts || 0) + 1;
    const cooldownSeconds = attempts === 1 ? 15 : attempts === 2 ? 30 : 60;
    const cooldownUntil = new Date(Date.now() + cooldownSeconds * 1000).toISOString();

    await supabase
      .from('teams')
      .update({
        wrong_attempts: attempts,
        cooldown_until: cooldownUntil,
        updated_at: new Date().toISOString(),
      })
      .eq('id', team.id);

    return NextResponse.json({
      success: false,
      error: 'incorrect_answer',
      message: 'INCORRECT OVERRIDE CODE. TERMINAL LOCKED.',
      cooldownSeconds,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
