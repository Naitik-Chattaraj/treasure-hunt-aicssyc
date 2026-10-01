import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isRoute2Configured } from '@/lib/supabase';
import { verifyTeamToken, isRoleSessionValid } from '@/lib/auth';

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

    const primaryRoute: 1 | 2 = payload.assignedRoute === 2 ? 2 : 1;
    let supabase = getSupabaseAdmin(primaryRoute);

    if (!supabase) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    // Fetch team profile from assigned route database
    let { data: team, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', payload.teamId)
      .maybeSingle();

    // Fallback check on alternate database if not found in primary (handles route migrations or legacy sessions)
    if (!team && isRoute2Configured()) {
      const alternateRoute: 1 | 2 = primaryRoute === 1 ? 2 : 1;
      const altDb = getSupabaseAdmin(alternateRoute);
      if (altDb) {
        const { data: altTeam } = await altDb
          .from('teams')
          .select('*')
          .eq('id', payload.teamId)
          .maybeSingle();
        if (altTeam) {
          team = altTeam;
          supabase = altDb;
        }
      }
    }

    if (error || !team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Strictly enforce max 1 device for Field Scout and max 1 device for Base Decoder
    if (!isRoleSessionValid(team.device_id, payload.deviceId, payload.operativeRole)) {
      const response = NextResponse.json(
        { error: 'Session expired: logged in from another device' },
        { status: 401 }
      );
      response.cookies.delete('team_session');
      return response;
    }

    // Fetch completions strictly from this team's route database
    const { data: completions } = await supabase
      .from('hunt_completions')
      .select('node_id, completed_at')
      .eq('team_id', team.id)
      .order('node_id', { ascending: true });

    const completedNodes = (completions || []).map((c) => ({
      nodeId: c.node_id,
      timestamp: new Date(c.completed_at).getTime(),
    }));

    const assignedRoute: 1 | 2 = (team.assigned_route === 2 ? 2 : 1);

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
