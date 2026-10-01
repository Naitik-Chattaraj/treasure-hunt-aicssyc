import { NextResponse } from 'next/server';
import { getBothSupabaseAdmins } from '@/lib/supabase';

export async function GET() {
  try {
    const { db1, db2, isMultiDb } = getBothSupabaseAdmins();
    if (!db1) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    let allTeams: any[] = [];

    if (isMultiDb && db2) {
      // Query approved teams in parallel from both Route 1 and Route 2 databases
      const [res1, res2] = await Promise.all([
        db1
          .from('teams')
          .select('id, team_name, team_lead, current_stage, start_time, completed_at, status, assigned_route')
          .eq('status', 'approved'),
        db2
          .from('teams')
          .select('id, team_name, team_lead, current_stage, start_time, completed_at, status, assigned_route')
          .eq('status', 'approved'),
      ]);

      const teams1 = res1.data || [];
      const teams2 = res2.data || [];
      allTeams = [...teams1, ...teams2];
    } else {
      const { data: teams, error } = await db1
        .from('teams')
        .select('id, team_name, team_lead, current_stage, start_time, completed_at, status, assigned_route')
        .eq('status', 'approved');

      if (error) {
        console.error('Leaderboard query error:', error);
        return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
      }
      allTeams = teams || [];
    }

    const now = Date.now();

    const formatted = allTeams.map((t) => {
      let elapsedSeconds: number | null = null;
      if (t.start_time) {
        const start = new Date(t.start_time).getTime();
        const end = t.completed_at ? new Date(t.completed_at).getTime() : now;
        elapsedSeconds = Math.max(0, Math.floor((end - start) / 1000));
      }

      return {
        id: t.id,
        teamName: t.team_name,
        teamLead: t.team_lead,
        currentStage: t.current_stage,
        assignedRoute: t.assigned_route || 1,
        startTime: t.start_time,
        completedAt: t.completed_at,
        completed_at: t.completed_at,
        status: t.status,
        elapsedSeconds,
      };
    });

    // Sort:
    // 1. Stage (descending - furthest ahead first)
    // 2. Elapsed seconds (ascending - fastest first, null last)
    // 3. Completed at (ascending - earliest first, null last)
    // 4. ID (ascending - stable tie-breaker)
    formatted.sort((a, b) => {
      if (b.currentStage !== a.currentStage) {
        return b.currentStage - a.currentStage;
      }

      // Sort null last, then by elapsedSeconds (fastest first)
      if (a.elapsedSeconds === null && b.elapsedSeconds !== null) return 1;
      if (a.elapsedSeconds !== null && b.elapsedSeconds === null) return -1;
      if (a.elapsedSeconds !== null && b.elapsedSeconds !== null && a.elapsedSeconds !== b.elapsedSeconds) {
        return a.elapsedSeconds - b.elapsedSeconds;
      }

      // Then by completed_at (earliest completion first, null last)
      const aComp = a.completedAt ?? a.completed_at;
      const bComp = b.completedAt ?? b.completed_at;
      if (aComp && bComp) {
        const aTime = new Date(aComp).getTime();
        const bTime = new Date(bComp).getTime();
        if (!isNaN(aTime) && !isNaN(bTime) && aTime !== bTime) {
          return aTime - bTime;
        }
      } else if (aComp && !bComp) {
        return -1;
      } else if (!aComp && bComp) {
        return 1;
      }

      // Then by id (deterministic tie-break to avoid swapping between polls)
      return String(a.id).localeCompare(String(b.id));
    });

    return NextResponse.json({ leaderboard: formatted });
  } catch (err: unknown) {
    console.error('API /leaderboard error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
