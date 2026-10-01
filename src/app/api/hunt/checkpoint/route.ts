import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isRoute2Configured } from '@/lib/supabase';
import { verifyTeamToken, isRoleSessionValid } from '@/lib/auth';
import { getTeamChallenge } from '@/lib/challenges';

interface CheckpointMeta {
  id: number;
  route_id?: number;
  stage?: number;
  title: string;
  area: string;
  clue: string;
}

// Server in-memory cache for static checkpoint metadata (5-minute TTL) to eliminate repetitive DB queries
const checkpointCache = new Map<string, { cp: CheckpointMeta; cachedAt: number }>();
const CP_CACHE_TTL = 300000;

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

    const primaryRoute: 1 | 2 = payload.assignedRoute === 2 ? 2 : 1;
    let supabase = getSupabaseAdmin(primaryRoute);

    if (!supabase) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    const teamColumns = 'id, status, assigned_route, current_stage, device_id, cooldown_until';

    // 1. Fetch team's profile from the route database (trimmed columns to save DB egress)
    let { data: team, error: teamError } = await supabase
      .from('teams')
      .select(teamColumns)
      .eq('id', payload.teamId)
      .maybeSingle();

    if (!team && isRoute2Configured()) {
      const altDb = getSupabaseAdmin(primaryRoute === 1 ? 2 : 1);
      if (altDb) {
        const { data: altTeam } = await altDb
          .from('teams')
          .select(teamColumns)
          .eq('id', payload.teamId)
          .maybeSingle();
        if (altTeam) {
          team = altTeam;
          supabase = altDb;
        }
      }
    }

    if (teamError || !team) {
      console.error('API /hunt/checkpoint: Team not found:', teamError);
      return NextResponse.json({ error: 'Team record not found' }, { status: 404 });
    }

    // Strictly enforce max 1 device for Field Scout and max 1 device for Base Decoder
    if (!isRoleSessionValid(team.device_id, payload.deviceId, payload.operativeRole)) {
      const response = NextResponse.json({ error: 'Session expired: logged in from another device' }, { status: 401 });
      response.cookies.delete('team_session');
      return response;
    }

    if (team.status !== 'approved') {
      return NextResponse.json({ error: 'Team is not approved' }, { status: 403 });
    }

    const currentStage = team.current_stage || 1;
    if (currentStage > 12) {
      return NextResponse.json({ message: 'Hunt already completed' });
    }

    const assignedRoute: 1 | 2 = (team.assigned_route === 2 ? 2 : 1);

    // 2. Fetch checkpoint from in-memory cache or route database
    const cacheKey = `${assignedRoute}_${currentStage}`;
    const cachedEntry = checkpointCache.get(cacheKey);
    let cp: CheckpointMeta | null = (cachedEntry && Date.now() - cachedEntry.cachedAt < CP_CACHE_TTL)
      ? cachedEntry.cp
      : null;

    if (!cp) {
      try {
        const { data: routeCp } = await supabase
          .from('checkpoints')
          .select('id, route_id, stage, title, area, clue')
          .eq('route_id', assignedRoute)
          .eq('stage', currentStage)
          .maybeSingle();

        if (routeCp) {
          cp = routeCp;
        }
      } catch (e) {
        console.warn('DB route_id checkpoint query warning:', e);
      }

      if (!cp) {
        try {
          const { data: idCp } = await supabase
            .from('checkpoints')
            .select('id, route_id, stage, title, area, clue')
            .eq('stage', currentStage)
            .maybeSingle();
          if (idCp) {
            cp = idCp;
          }
        } catch (e) {
          console.warn('DB stage checkpoint query warning:', e);
        }
      }

      if (cp) {
        checkpointCache.set(cacheKey, { cp, cachedAt: Date.now() });
      }
    }



    if (!cp) {
      return NextResponse.json({ error: 'Checkpoint not configured' }, { status: 404 });
    }

    // 3. Check if team has already scanned the QR code and has an etched question
    let etchedChallenge = null;
    let qrScanned = false;

    try {
      let state = await getTeamChallenge(supabase, team.id, cp.id, { assignIfMissing: false });

      // If the scan was logged but no question got assigned (e.g. the pool was empty at scan time),
      // assign one now so the Base Decoder's screen can still show it
      if (!state.unlocked) {
        const { data: scanLog } = await supabase
          .from('submissions_log')
          .select('id')
          .eq('team_id', team.id)
          .eq('node_id', cp.id)
          .eq('submission_type', 'scan')
          .eq('is_correct', true)
          .limit(1)
          .maybeSingle();

        if (scanLog) {
          qrScanned = true;
          state = await getTeamChallenge(supabase, team.id, cp.id, { assignIfMissing: true });
        }
      }

      if (state.unlocked) qrScanned = true;
      if (state.challenge) {
        etchedChallenge = { ...state.challenge, nodeId: cp.id };
      }
    } catch (e) {
      console.warn('team_active_challenges check warning:', e);
    }



    return NextResponse.json({
      checkpoint: {
        id: cp.id,
        routeId: cp.route_id || assignedRoute,
        route_id: cp.route_id || assignedRoute,
        stage: cp.stage || currentStage,
        title: cp.title,
        area: cp.area,
        clue: cp.clue,
        qrScanned,
        challenge: etchedChallenge,
      },
      cooldownUntil: team.cooldown_until ? new Date(team.cooldown_until).getTime() : null,
    });
  } catch (err: unknown) {
    console.error('API /hunt/checkpoint: Internal Error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
