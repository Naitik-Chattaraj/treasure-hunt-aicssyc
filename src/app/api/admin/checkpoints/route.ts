import { NextRequest, NextResponse } from 'next/server';
import { getBothSupabaseAdmins, getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/auth';

// Log the real error on the server; send only a generic message to the client
function serverError(publicMessage: string, err: unknown) {
  console.error(publicMessage, err);
  return NextResponse.json({ error: publicMessage }, { status: 500 });
}

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
      latitude,
      longitude,
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

    let allCheckpoints: Record<string, unknown>[] = [];

    if (isMultiDb && db2) {
      // Query checkpoints from both databases in parallel
      const [res1, res2] = await Promise.all([
        db1.from('checkpoints').select(checkpointSelectQuery).order('id', { ascending: true }),
        db2.from('checkpoints').select(checkpointSelectQuery).order('id', { ascending: true }),
      ]);

      const cps1 = res1.data || [];
      const cps2 = res2.data || [];
      allCheckpoints = [...cps1, ...cps2];
      allCheckpoints.sort((a, b) => Number(a.id) - Number(b.id));
    } else {
      const { data: checkpoints, error } = await db1
        .from('checkpoints')
        .select(checkpointSelectQuery)
        .order('id', { ascending: true });

      if (error) {
        return serverError('Failed to load checkpoints', error);
      }
      allCheckpoints = checkpoints || [];
    }

    return NextResponse.json({ checkpoints: allCheckpoints });
  } catch (err: unknown) {
    return serverError('Failed to load checkpoints', err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const adminToken = req.cookies.get('admin_session')?.value;
    if (!adminToken || !(await verifyAdminToken(adminToken))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, title, area, clue, qr_hash, latitude, longitude } = await req.json();

    if (!id || id < 1 || id > 24) {
      return NextResponse.json({ error: 'Valid checkpoint ID (1-24) required' }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (title !== undefined && title !== null) updatePayload.title = title;
    if (area !== undefined && area !== null) updatePayload.area = area;
    if (clue !== undefined && clue !== null) updatePayload.clue = clue;
    if (qr_hash !== undefined && qr_hash !== null) updatePayload.qr_hash = qr_hash;

    if (latitude !== undefined) {
      updatePayload.latitude = latitude !== null && latitude !== '' ? Number(latitude) : null;
    }
    if (longitude !== undefined) {
      updatePayload.longitude = longitude !== null && longitude !== '' ? Number(longitude) : null;
    }

    // Determine target database based on checkpoint ID (1..12 is Route 1, 13..24 is Route 2)
    const targetRoute: 1 | 2 = id <= 12 ? 1 : 2;
    const supabase = getSupabaseAdmin(targetRoute);

    if (!supabase) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    let { data: updated, error } = await supabase
      .from('checkpoints')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .maybeSingle();

    // Fallback: If not found in targetRoute db and dual-db is configured, try the other DB
    if (!updated && !error) {
      const altRoute: 1 | 2 = targetRoute === 1 ? 2 : 1;
      const altSupabase = getSupabaseAdmin(altRoute);
      if (altSupabase && altSupabase !== supabase) {
        const altRes = await altSupabase
          .from('checkpoints')
          .update(updatePayload)
          .eq('id', id)
          .select()
          .maybeSingle();
        if (altRes.data) {
          updated = altRes.data;
          error = null;
        }
      }
    }

    if (error) {
      console.error('Failed to update checkpoint in Supabase:', error);
      return NextResponse.json({ error: error.message || 'Failed to update checkpoint' }, { status: 500 });
    }

    return NextResponse.json({ success: true, checkpoint: updated });
  } catch (err: unknown) {
    console.error('PUT /api/admin/checkpoints error:', err);
    return serverError('Failed to update checkpoint', err);
  }
}
