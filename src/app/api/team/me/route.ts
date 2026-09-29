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

    // Enforce role-based device session (up to 1 scout + 1 decoder)
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
        const response = NextResponse.json(
          { error: 'Session expired: logged in from another device' },
          { status: 401 }
        );
        response.cookies.delete('team_session');
        return response;
      }
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

    const assignedRoute = team.assigned_route || 1;

    return NextResponse.json({
      team: {
        id: team.id,
        uid: team.uid,
        teamName: team.team_name,
        teamLead: team.team_lead,
        members: team.members,
        status: team.status,
        assignedRoute,
        assigned_route: assignedRoute,
        operativeRole: payload.operativeRole || 'Base Decoder',
        operativeName: payload.operativeName || team.team_lead,
      },
      progress: {
        currentStage: team.current_stage,
        assignedRoute,
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
