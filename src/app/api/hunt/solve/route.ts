import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isRoute2Configured } from '@/lib/supabase';
import { verifyTeamToken, isRoleSessionValid } from '@/lib/auth';

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

    const primaryRoute: 1 | 2 = payload.assignedRoute === 2 ? 2 : 1;
    let supabase = getSupabaseAdmin(primaryRoute);

    if (!supabase) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    // 1. Fetch team from route database
    let { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, status, current_stage, cooldown_until, wrong_attempts, start_time, assigned_route, device_id')
      .eq('id', payload.teamId)
      .maybeSingle();

    if (!team && isRoute2Configured()) {
      const altDb = getSupabaseAdmin(primaryRoute === 1 ? 2 : 1);
      if (altDb) {
        const { data: altTeam } = await altDb
          .from('teams')
          .select('id, status, current_stage, cooldown_until, wrong_attempts, start_time, assigned_route, device_id')
          .eq('id', payload.teamId)
          .maybeSingle();
        if (altTeam) {
          team = altTeam;
          supabase = altDb;
        }
      }
    }

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Strictly enforce max 1 device for Field Scout and max 1 device for Base Decoder
    if (!isRoleSessionValid(team.device_id, payload.deviceId, payload.operativeRole)) {
      const response = NextResponse.json({ error: 'Session expired: logged in from another device' }, { status: 401 });
      response.cookies.delete('team_session');
      return response;
    }

    // Role restriction: Only Base Decoders can submit challenge solutions
    if (payload.operativeRole === 'Field Scout') {
      return NextResponse.json({
        error: 'role_forbidden',
        message: 'FIELD SCOUT DETECTED: Only Base Decoders in the command room can decode challenges!',
      }, { status: 403 });
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

    const assignedRoute: 1 | 2 = (team.assigned_route === 2 ? 2 : 1);

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
      return NextResponse.json({
        error: 'checkpoint_not_found',
        message: 'Could not find active checkpoint in database.',
      }, { status: 500 });
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
      // UNIQUE (team_id, node_id) guarantees at most one row, so no ordering is needed
      const { data: activeChallenge, error: acError } = await supabase
        .from('team_active_challenges')
        .select('id, question_id')
        .eq('team_id', team.id)
        .eq('node_id', cpId)
        .maybeSingle();

      if (acError) console.error('team_active_challenges lookup error:', acError);

      if (activeChallenge?.question_id) {
        const { data: q, error: qError } = await supabase
          .from('questions_pool')
          .select('answer')
          .eq('id', activeChallenge.question_id)
          .maybeSingle();

        if (qError) console.error('questions_pool answer lookup error:', qError);

        if (q) {
          isMatch = String(q.answer).trim().toLowerCase() === cleanAnswer.toLowerCase();
          activeChallengeId = activeChallenge.id;
        }
      }
    } catch (e) {
      console.warn('team_active_challenges lookup warning:', e);
    }

    if (!activeChallengeId) {
      return NextResponse.json({
        error: 'challenge_not_unlocked',
        message: 'QR code must be scanned on campus before submitting answers!',
      }, { status: 400 });
    }

    // Log the submission attempt in team's route database
    await supabase.from('submissions_log').insert({
      team_id: team.id,
      node_id: nodeId,
      submission_type: 'answer',
      submitted_value: cleanAnswer,
      is_correct: isMatch,
    });

    if (isMatch) {
      // Correct answer!
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

      // Update team record in route database
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

