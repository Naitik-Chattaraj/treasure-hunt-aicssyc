import { NextResponse } from 'next/server';
import { getBothSupabaseAdmins } from '@/lib/supabase';

interface LeaderboardTeamRow {
  id: string;
  team_name: string;
  team_lead: string;
  current_stage: number;
  start_time: string | null;
  completed_at: string | null;
  completion_token?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  assigned_route?: number;
  updated_at?: string | null;
}

// In-memory cache to reduce repeated database queries under high concurrent load
let cachedData: unknown[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5000; // 5-second server-side memory cache

export async function GET() {
  try {
    const now = Date.now();
    if (cachedData && now - lastFetchTime < CACHE_TTL_MS) {
      return NextResponse.json(
        { leaderboard: cachedData },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
            'X-Cache': 'HIT',
          },
        }
      );
    }

    const { db1, db2, isMultiDb } = getBothSupabaseAdmins();
    if (!db1) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    let allTeams: LeaderboardTeamRow[] = [];
    const selectFields = 'id, team_name, team_lead, current_stage, start_time, completed_at, completion_token, status, assigned_route, updated_at';

    if (isMultiDb && db2) {
      // Query approved and disqualified/rejected teams in parallel from both Route 1 and Route 2 databases
      const [res1, res2] = await Promise.all([
        db1
          .from('teams')
          .select(selectFields)
          .in('status', ['approved', 'rejected']),
        db2
          .from('teams')
          .select(selectFields)
          .in('status', ['approved', 'rejected']),
      ]);

      if (res1.error) console.error('Leaderboard DB1 query error:', res1.error);
      if (res2.error) console.error('Leaderboard DB2 query error:', res2.error);

      const teams1 = res1.data || [];
      const teams2 = res2.data || [];
      allTeams = [...teams1, ...teams2];
    } else {
      const { data: teams, error } = await db1
        .from('teams')
        .select(selectFields)
        .in('status', ['approved', 'rejected']);

      if (error) {
        console.error('Leaderboard query error:', error);
        return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
      }
      allTeams = teams || [];
    }

    // Backend provides timestamps, status and victory code; time calculations and dynamic live sorting happen on the frontend
    const formatted = allTeams.map((t) => {
      const isFinished = t.current_stage > 12 || Boolean(t.completed_at);
      const victoryCode = t.completion_token || (isFinished ? `WIN-${t.id.slice(0, 8).toUpperCase()}` : null);
      return {
        id: t.id,
        teamName: t.team_name,
        teamLead: t.team_lead,
        currentStage: t.current_stage,
        assignedRoute: t.assigned_route || 1,
        startTime: t.start_time,
        completedAt: t.completed_at,
        completed_at: t.completed_at,
        updatedAt: t.updated_at,
        status: t.status,
        completionToken: victoryCode,
        completion_token: victoryCode,
      };
    });

    // Update in-memory cache
    cachedData = formatted;
    lastFetchTime = now;

    return NextResponse.json(
      { leaderboard: formatted },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
          'X-Cache': 'MISS',
        },
      }
    );
  } catch (err: unknown) {
    console.error('API /leaderboard error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
