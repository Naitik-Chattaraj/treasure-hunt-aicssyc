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
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    // Fetch team profile
    const { data: team, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', payload.teamId)
      .single();

    if (error || !team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Fetch completions
    const { data: completions } = await supabase
      .from('hunt_completions')
      .select('node_id, completed_at')
      .eq('team_id', team.id)
      .order('node_id', { ascending: true });

    const completedNodes = (completions || []).map((c) => ({
      nodeId: c.node_id,
      timestamp: new Date(c.completed_at).getTime(),
    }));

    return NextResponse.json({
      team: {
        id: team.id,
        uid: team.uid,
        teamName: team.team_name,
        teamLead: team.team_lead,
        members: team.members,
        status: team.status,
      },
      progress: {
        currentStage: team.current_stage,
        startTime: team.start_time ? new Date(team.start_time).getTime() : null,
        completedNodes,
        completionToken: team.completion_token,
        cooldownUntil: team.cooldown_until ? new Date(team.cooldown_until).getTime() : null,
        wrongAttempts: team.wrong_attempts,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
