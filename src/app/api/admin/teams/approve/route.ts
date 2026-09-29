import { NextRequest, NextResponse } from 'next/server';
import { getBothSupabaseAdmins } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const adminToken = req.cookies.get('admin_session')?.value;
    if (!adminToken || !(await verifyAdminToken(adminToken))) {
      return NextResponse.json({ error: 'Unauthorized administrative access' }, { status: 401 });
    }

    const { teamId, status } = await req.json();

    if (!teamId || !['approved', 'rejected', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { db1, db2, isMultiDb } = getBothSupabaseAdmins();
    if (!db1) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    // Try finding team in DB 1 first
    let targetDb = db1;
    let { data: team } = await db1
      .from('teams')
      .select('id, start_time')
      .eq('id', teamId)
      .maybeSingle();

    if (!team && isMultiDb && db2) {
      // Try finding team in DB 2
      const { data: team2 } = await db2
        .from('teams')
        .select('id, start_time')
        .eq('id', teamId)
        .maybeSingle();

      if (team2) {
        team = team2;
        targetDb = db2;
      }
    }

    if (!team) {
      return NextResponse.json({ error: 'Team not found in any database' }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    // If approving and timer hasn't started yet, set start_time
    if (status === 'approved' && !team.start_time) {
      updatePayload.start_time = new Date().toISOString();
    }

    const { data: updated, error } = await targetDb
      .from('teams')
      .update(updatePayload)
      .eq('id', teamId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, team: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
