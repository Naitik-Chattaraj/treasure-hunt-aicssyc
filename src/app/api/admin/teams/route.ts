import { NextRequest, NextResponse } from 'next/server';
import { getBothSupabaseAdmins } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/auth';

// Log the real error on the server; send only a generic message to the client
function serverError(publicMessage: string, err: unknown) {
  console.error(publicMessage, err);
  return NextResponse.json({ error: publicMessage }, { status: 500 });
}

// In-memory cache to reduce repeated database queries under multiple admin dashboard views
let cachedTeams: any[] | null = null;
let lastTeamsFetch = 0;
const TEAMS_CACHE_TTL = 4000; // 4-second memory cache

export function invalidateAdminTeamsCache() {
  cachedTeams = null;
  lastTeamsFetch = 0;
}

export async function GET(req: NextRequest) {
  try {
    const adminToken = req.cookies.get('admin_session')?.value;
    if (!adminToken || !(await verifyAdminToken(adminToken))) {
      return NextResponse.json({ error: 'Unauthorized administrative access' }, { status: 401 });
    }

    const now = Date.now();
    if (cachedTeams && now - lastTeamsFetch < TEAMS_CACHE_TTL) {
      return NextResponse.json({ teams: cachedTeams });
    }

    const { db1, db2, isMultiDb } = getBothSupabaseAdmins();
    if (!db1) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    let allTeams: any[] = [];
    const teamSelectQuery = 'id, uid, team_name, team_lead, members, status, assigned_route, current_stage, start_time, completed_at, wrong_attempts, cooldown_until, created_at, updated_at';

    if (isMultiDb && db2) {
      const [res1, res2] = await Promise.all([
        db1.from('teams').select(teamSelectQuery).order('created_at', { ascending: false }),
        db2.from('teams').select(teamSelectQuery).order('created_at', { ascending: false }),
      ]);

      const teams1 = res1.data || [];
      const teams2 = res2.data || [];
      allTeams = [...teams1, ...teams2];
      allTeams.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      const { data: teams, error } = await db1
        .from('teams')
        .select(teamSelectQuery)
        .order('created_at', { ascending: false });

      if (error) {
        return serverError('Failed to load teams', error);
      }
      allTeams = teams || [];
    }

    cachedTeams = allTeams;
    lastTeamsFetch = now;

    return NextResponse.json({ teams: allTeams });
  } catch (err: unknown) {
    return serverError('Failed to load teams', err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const adminToken = req.cookies.get('admin_session')?.value;
    if (!adminToken || !(await verifyAdminToken(adminToken))) {
      return NextResponse.json({ error: 'Unauthorized administrative access' }, { status: 401 });
    }

    const { teamId, assignedRoute } = await req.json();
    if (!teamId || (assignedRoute !== 1 && assignedRoute !== 2)) {
      return NextResponse.json({ error: 'Valid teamId and assignedRoute (1 or 2) required' }, { status: 400 });
    }

    const { db1, db2, isMultiDb } = getBothSupabaseAdmins();
    if (!db1) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    // 1. Check if team is currently in Route 1 database
    const { data: team1 } = await db1
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .maybeSingle();

    if (team1) {
      if (assignedRoute === 1 || !isMultiDb || !db2) {
        // Simple update within DB 1
        const { data: updated, error } = await db1
          .from('teams')
          .update({
            assigned_route: assignedRoute,
            updated_at: new Date().toISOString(),
          })
          .eq('id', teamId)
          .select()
          .single();

        if (error) return serverError('Failed to change team route', error);
        invalidateAdminTeamsCache();
        return NextResponse.json({ success: true, team: updated });
      } else {
        // Migrate team from DB 1 to DB 2
        const teamDataToMove = {
          ...team1,
          assigned_route: 2,
          updated_at: new Date().toISOString(),
        };

        const { data: inserted, error: insertError } = await db2
          .from('teams')
          .upsert(teamDataToMove)
          .select()
          .single();

        if (insertError) {
          return serverError('Failed to move team to the other route', insertError);
        }

        // Remove from DB 1 now that it's moved to DB 2
        await db1.from('teams').delete().eq('id', teamId);
        invalidateAdminTeamsCache();
        return NextResponse.json({ success: true, team: inserted });
      }
    }

    // 2. Check if team is in Route 2 database
    if (isMultiDb && db2) {
      const { data: team2 } = await db2
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .maybeSingle();

      if (team2) {
        if (assignedRoute === 2) {
          // Simple update within DB 2
          const { data: updated, error } = await db2
            .from('teams')
            .update({
              assigned_route: 2,
              updated_at: new Date().toISOString(),
            })
            .eq('id', teamId)
            .select()
            .single();

          if (error) return serverError('Failed to change team route', error);
          invalidateAdminTeamsCache();
          return NextResponse.json({ success: true, team: updated });
        } else {
          // Migrate team from DB 2 to DB 1
          const teamDataToMove = {
            ...team2,
            assigned_route: 1,
            updated_at: new Date().toISOString(),
          };

          const { data: inserted, error: insertError } = await db1
            .from('teams')
            .upsert(teamDataToMove)
            .select()
            .single();

          if (insertError) {
            return serverError('Failed to move team to the other route', insertError);
          }

          // Remove from DB 2
          await db2.from('teams').delete().eq('id', teamId);
          invalidateAdminTeamsCache();
          return NextResponse.json({ success: true, team: inserted });
        }
      }
    }

    return NextResponse.json({ error: 'Team record not found in either database' }, { status: 404 });
  } catch (err: unknown) {
    return serverError('Failed to change team route', err);
  }
}
