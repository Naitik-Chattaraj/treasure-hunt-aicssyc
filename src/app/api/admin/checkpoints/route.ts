import { NextRequest, NextResponse } from 'next/server';
import { getBothSupabaseAdmins, getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const adminToken = req.cookies.get('admin_session')?.value;
    if (!adminToken || !(await verifyAdminToken(adminToken))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { db1, db2, isMultiDb } = getBothSupabaseAdmins();
    if (!db1) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    const checkpointSelectQuery = `
      id,
      route_id,
      stage,
      title,
      area,
      clue,
      qr_hash,
      questions_pool (
        id,
        node_id,
        challenge_type,
        question,
        options,
        answer,
        created_at
      )
    `;

    let allCheckpoints: any[] = [];

    if (isMultiDb && db2) {
      // Query checkpoints from both databases in parallel
      const [res1, res2] = await Promise.all([
        db1.from('checkpoints').select(checkpointSelectQuery).order('id', { ascending: true }),
        db2.from('checkpoints').select(checkpointSelectQuery).order('id', { ascending: true }),
      ]);

      const cps1 = res1.data || [];
      const cps2 = res2.data || [];
      allCheckpoints = [...cps1, ...cps2];
      allCheckpoints.sort((a, b) => a.id - b.id);
    } else {
      const { data: checkpoints, error } = await db1
        .from('checkpoints')
        .select(checkpointSelectQuery)
        .order('id', { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      allCheckpoints = checkpoints || [];
    }

    return NextResponse.json({ checkpoints: allCheckpoints });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const adminToken = req.cookies.get('admin_session')?.value;
    if (!adminToken || !(await verifyAdminToken(adminToken))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, title, area, clue, qr_hash } = await req.json();

    if (!id || id < 1 || id > 24) {
      return NextResponse.json({ error: 'Valid checkpoint ID (1-24) required' }, { status: 400 });
    }

    // Determine target database based on checkpoint ID (1..12 is Route 1, 13..24 is Route 2)
    const targetRoute: 1 | 2 = id <= 12 ? 1 : 2;
    const supabase = getSupabaseAdmin(targetRoute);

    if (!supabase) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    const { data: updated, error } = await supabase
      .from('checkpoints')
      .update({
        title,
        area,
        clue,
        qr_hash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, checkpoint: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
