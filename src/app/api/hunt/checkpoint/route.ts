import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isRoute2Configured } from '@/lib/supabase';
import { verifyTeamToken, isRoleSessionValid } from '@/lib/auth';
import { MOCK_CHECKPOINTS } from '@/lib/mock-data';

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

    // 1. Fetch team's profile from the route database
    let { data: team, error: teamError } = await supabase
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

    // 2. Fetch checkpoint from the team's route database
    let cp: {
      id: number;
      route_id?: number;
      stage?: number;
      title: string;
      area: string;
      clue: string;
    } | null = null;

    try {
      const { data: routeCp } = await supabase
        .from('checkpoints')
        .select('*')
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
          .select('*')
          .eq('stage', currentStage)
          .maybeSingle();
        if (idCp) {
          cp = idCp;
        }
      } catch (e) {
        console.warn('DB stage checkpoint query warning:', e);
      }
    }

    // Fallback to MOCK_CHECKPOINTS if database checkpoints table is unpopulated
    if (!cp) {
      const mockCp = MOCK_CHECKPOINTS.find((c) => c.routeId === assignedRoute && c.stage === currentStage) 
                  || MOCK_CHECKPOINTS.find((c) => c.id === currentStage);
      if (mockCp) {
        cp = {
          id: mockCp.id,
          route_id: mockCp.routeId,
          stage: mockCp.stage,
          title: mockCp.title,
          area: mockCp.area,
          clue: mockCp.clue,
        };
      }
    }

    if (!cp) {
      return NextResponse.json({ error: 'Checkpoint not configured' }, { status: 404 });
    }

    // 3. Check if team has already scanned the QR code and has an etched question
    let etchedChallenge = null;
    let qrScanned = false;

    try {
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
        .eq('team_id', team.id)
        .eq('node_id', cp.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeChallenge) {
        qrScanned = true;
        
        if (activeChallenge.questions_pool) {
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
      }

      // FALLBACK: If team_active_challenges insert failed (e.g. empty questions pool causing foreign key error),
      // check if a successful scan was logged in submissions_log
      if (!qrScanned) {
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
        }
      }
    } catch (e) {
      console.warn('team_active_challenges check warning:', e);
    }

    // Fallback challenge from mock data if etched challenge not in DB
    if (qrScanned && !etchedChallenge) {
      const mockNode = MOCK_CHECKPOINTS.find(c => c.id === cp?.id);
      if (mockNode?.challenge) {
        etchedChallenge = mockNode.challenge;
      }
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
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
