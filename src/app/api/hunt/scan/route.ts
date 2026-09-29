import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyTeamToken } from '@/lib/auth';

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

    // 1. Fetch team info
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, status, current_stage, cooldown_until')
      .eq('id', payload.teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
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

    // 2. Find matching checkpoint by QR hash (case-insensitive)
    const { data: matchedNode } = await supabase
      .from('checkpoints')
      .select('id, title, area, clue')
      .ilike('qr_hash', cleanQrHash)
      .maybeSingle();

    if (!matchedNode) {
      // Log failed scan
      await supabase.from('submissions_log').insert({
        team_id: team.id,
        node_id: team.current_stage,
        submission_type: 'scan',
        submitted_value: cleanQrHash,
        is_correct: false,
      });

      return NextResponse.json({
        success: false,
        error: 'invalid_qr',
        message: 'UNKNOWN QR CODE. ACCESS DENIED.',
      });
    }

    // 3. Sequence check: If scanned a future node
    if (matchedNode.id > team.current_stage) {
      return NextResponse.json({
        success: false,
        error: 'sequence_violation',
        nodeId: matchedNode.id,
        currentStage: team.current_stage,
        message: `SEQUENCE VIOLATION: Accessing Node 0${matchedNode.id} out of order. You haven't reached this node yet!`,
      });
    }

    // If scanned a node already completed in the past
    if (matchedNode.id < team.current_stage) {
      return NextResponse.json({
        success: false,
        error: 'already_completed',
        nodeId: matchedNode.id,
        currentStage: team.current_stage,
        message: `NODE 0${matchedNode.id} ALREADY COMPROMISED. CURRENT TARGET: NODE 0${team.current_stage}`,
      });
    }

    // 4. Exact stage match! (matchedNode.id === team.current_stage)
    // Check if a question has already been etched for this team at this node
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
      // Fetch all available questions for this node from the pool
      const { data: pool, error: poolError } = await supabase
        .from('questions_pool')
        .select('id, challenge_type, question, options')
        .eq('node_id', matchedNode.id);

      if (poolError || !pool || pool.length === 0) {
        return NextResponse.json({ error: 'Question bank depleted for this node' }, { status: 500 });
      }

      // Randomly select one question from the pool
      const randomIndex = Math.floor(Math.random() * pool.length);
      const chosenQuestion = pool[randomIndex];

      // Etch it permanently in Supabase for this team!
      const { data: inserted, error: insertError } = await supabase
        .from('team_active_challenges')
        .insert({
          team_id: team.id,
          node_id: matchedNode.id,
          question_id: chosenQuestion.id,
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

      if (insertError) {
        // In case of concurrent scan race condition, fetch the existing one
        const { data: raceExisting } = await supabase
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
          .single();
        existingActive = raceExisting;
      } else {
        existingActive = inserted;
      }
    }

    // Log successful scan in submissions audit
    await supabase.from('submissions_log').insert({
      team_id: team.id,
      node_id: matchedNode.id,
      submission_type: 'scan',
      submitted_value: cleanQrHash,
      is_correct: true,
    });

    const q = Array.isArray(existingActive?.questions_pool) 
      ? existingActive?.questions_pool[0] 
      : existingActive?.questions_pool;

    return NextResponse.json({
      success: true,
      nodeId: matchedNode.id,
      title: matchedNode.title,
      challenge: q ? {
        id: q.id,
        nodeId: matchedNode.id,
        type: q.challenge_type,
        question: q.question,
        options: q.options,
      } : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
