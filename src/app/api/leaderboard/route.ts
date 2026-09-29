import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    const { data: teams, error } = await supabase
      .from('teams')
      .select('id, team_name, team_lead, current_stage, start_time, completed_at, status')
      .eq('status', 'approved');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const now = Date.now();

    const formatted = (teams || []).map((t) => {
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
        startTime: t.start_time,
        completedAt: t.completed_at,
        status: t.status,
        elapsedSeconds,
      };
    });

    // Sort:
    // 1. Stage (descending)
    // 2. Elapsed seconds (ascending - fastest first)
    formatted.sort((a, b) => {
      if (b.currentStage !== a.currentStage) {
        return b.currentStage - a.currentStage;
      }
      if (a.elapsedSeconds !== null && b.elapsedSeconds !== null) {
        return a.elapsedSeconds - b.elapsedSeconds;
      }
      return 0;
    });

    return NextResponse.json({ leaderboard: formatted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
