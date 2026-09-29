import { NextRequest, NextResponse } from 'next/server';
import { getBothSupabaseAdmins, getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/auth';

// POST: Add new question to a node's pool
export async function POST(req: NextRequest) {
  try {
    const adminToken = req.cookies.get('admin_session')?.value;
    if (!adminToken || !(await verifyAdminToken(adminToken))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { nodeId, challengeType, question, options, answer } = await req.json();

    if (!nodeId || !challengeType || !question || !answer) {
      return NextResponse.json({ error: 'Missing required question parameters' }, { status: 400 });
    }

    const numNodeId = Number(nodeId);
    const targetRoute: 1 | 2 = numNodeId <= 12 ? 1 : 2;
    const supabase = getSupabaseAdmin(targetRoute);

    if (!supabase) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    const { data: newQuestion, error } = await supabase
      .from('questions_pool')
      .insert({
        node_id: numNodeId,
        challenge_type: challengeType,
        question: question.trim(),
        options: challengeType === 'mcq' && Array.isArray(options) ? options : null,
        answer: answer.trim(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, question: newQuestion });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT: Edit existing question
export async function PUT(req: NextRequest) {
  try {
    const adminToken = req.cookies.get('admin_session')?.value;
    if (!adminToken || !(await verifyAdminToken(adminToken))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, challengeType, question, options, answer } = await req.json();

    if (!id || !challengeType || !question || !answer) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { db1, db2, isMultiDb } = getBothSupabaseAdmins();
    if (!db1) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    // Try updating in DB 1 first
    const { data: updated1, error: error1 } = await db1
      .from('questions_pool')
      .update({
        challenge_type: challengeType,
        question: question.trim(),
        options: challengeType === 'mcq' && Array.isArray(options) ? options : null,
        answer: answer.trim(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (updated1) {
      return NextResponse.json({ success: true, question: updated1 });
    }

    // If not found in DB 1 and DB 2 is available, try DB 2
    if (isMultiDb && db2) {
      const { data: updated2, error: error2 } = await db2
        .from('questions_pool')
        .update({
          challenge_type: challengeType,
          question: question.trim(),
          options: challengeType === 'mcq' && Array.isArray(options) ? options : null,
          answer: answer.trim(),
        })
        .eq('id', id)
        .select()
        .maybeSingle();

      if (updated2) {
        return NextResponse.json({ success: true, question: updated2 });
      }
      if (error2) {
        return NextResponse.json({ error: error2.message }, { status: 500 });
      }
    }

    if (error1) {
      return NextResponse.json({ error: error1.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: Remove question from pool
export async function DELETE(req: NextRequest) {
  try {
    const adminToken = req.cookies.get('admin_session')?.value;
    if (!adminToken || !(await verifyAdminToken(adminToken))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Question ID required' }, { status: 400 });
    }

    const { db1, db2, isMultiDb } = getBothSupabaseAdmins();
    if (!db1) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    // Attempt delete on DB 1
    const { error: error1, count: count1 } = await db1
      .from('questions_pool')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (count1 && count1 > 0) {
      return NextResponse.json({ success: true, message: 'Question deleted from Route 1 database' });
    }

    // Attempt delete on DB 2 if applicable
    if (isMultiDb && db2) {
      const { error: error2 } = await db2
        .from('questions_pool')
        .delete()
        .eq('id', id);

      if (error2) {
        return NextResponse.json({ error: error2.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: 'Question deleted from Route 2 database' });
    }

    if (error1) {
      return NextResponse.json({ error: error1.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Question deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
