import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
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

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    // Check if team already has start_time set
    const { data: team } = await supabase
      .from('teams')
      .select('start_time')
      .eq('id', teamId)
      .single();

    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    // If approving and timer hasn't started yet, set start_time
    if (status === 'approved' && !team?.start_time) {
      updatePayload.start_time = new Date().toISOString();
    }

    const { data: updated, error } = await supabase
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
