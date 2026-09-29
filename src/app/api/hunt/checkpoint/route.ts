import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyTeamToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('team_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await verifyTeamToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    // 1. Fetch team's current stage and status
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('status, current_stage, cooldown_until')
      .eq('id', payload.teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team record not found' }, { status: 404 });
    }

    if (team.status !== 'approved') {
      return NextResponse.json({ error: 'Team is not approved' }, { status: 403 });
    }

    if (team.current_stage > 12) {
      return NextResponse.json({ message: 'Hunt already completed' });
    }

    // 2. Fetch checkpoint coordinates and physical clue (without sensitive QR hash)
    const { data: cp, error: cpError } = await supabase
      .from('checkpoints')
      .select('id, title, area, clue')
      .eq('id', team.current_stage)
      .single();

    if (cpError || !cp) {
      return NextResponse.json({ error: 'Checkpoint not configured' }, { status: 404 });
    }

    // 3. Check if team has already scanned the QR code and has an etched question
    const { data: activeChallenge } = await supabase
      .from('team_active_challenges')
      .select(`
        id,
        node_id,
        question_id,
        questions_pool (
          id,
          challenge_type,
          question,
          options
        )
      `)
      .eq('team_id', payload.teamId)
      .eq('node_id', team.current_stage)
      .maybeSingle();

    let etchedChallenge = null;
    let qrScanned = false;

    if (activeChallenge && activeChallenge.questions_pool) {
      qrScanned = true;
      const q = Array.isArray(activeChallenge.questions_pool) 
        ? activeChallenge.questions_pool[0] 
        : activeChallenge.questions_pool;

      etchedChallenge = {
        id: q.id,
        nodeId: cp.id,
        type: q.challenge_type,
        question: q.question,
        options: q.options,
      };
    }

    return NextResponse.json({
      checkpoint: {
        id: cp.id,
        title: cp.title,
        area: cp.area,
        clue: cp.clue,
        qrScanned,
        challenge: etchedChallenge,
      },
      cooldownUntil: team.cooldown_until ? new Date(team.cooldown_until).getTime() : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
