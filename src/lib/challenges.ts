import { SupabaseClient } from '@supabase/supabase-js';
import { ChallengeType } from '@/types/hunt';

export interface AssignedChallenge {
  id: string;
  type: ChallengeType;
  question: string;
  options?: string[];
}

export interface TeamChallengeState {
  // True once a question row exists for this team at this checkpoint
  unlocked: boolean;
  challenge: AssignedChallenge | null;
}

const UNIQUE_VIOLATION = '23505';

// Server-side in-memory cache for static question records (5-minute TTL)
const questionCache = new Map<string, { challenge: AssignedChallenge; cachedAt: number }>();
const QUESTION_CACHE_TTL = 300000;

async function findActiveRow(db: SupabaseClient, teamId: string, checkpointId: number) {
  // UNIQUE (team_id, node_id) guarantees at most one row, so no ordering is needed
  const { data, error } = await db
    .from('team_active_challenges')
    .select('id, question_id')
    .eq('team_id', teamId)
    .eq('node_id', checkpointId)
    .maybeSingle();

  if (error) console.error('team_active_challenges lookup error:', error);
  return data;
}

/**
 * Returns the question assigned to a team for a checkpoint. When `assignIfMissing` is set and
 * nothing is assigned yet, picks a random question from that checkpoint's pool and assigns it.
 * The answer is never selected, so the result is safe to send to the client.
 */
export async function getTeamChallenge(
  db: SupabaseClient,
  teamId: string,
  checkpointId: number,
  { assignIfMissing }: { assignIfMissing: boolean }
): Promise<TeamChallengeState> {
  let row = await findActiveRow(db, teamId, checkpointId);

  if (!row && assignIfMissing) {
    const { data: pool, error: poolError } = await db
      .from('questions_pool')
      .select('id')
      .eq('node_id', checkpointId);

    if (poolError) console.error('questions_pool lookup error:', poolError);

    if (pool && pool.length > 0) {
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      const { data: inserted, error: insertError } = await db
        .from('team_active_challenges')
        .insert({ team_id: teamId, node_id: checkpointId, question_id: chosen.id })
        .select('id, question_id')
        .single();

      if (insertError?.code === UNIQUE_VIOLATION) {
        // Another device assigned a question at the same moment; use that one
        row = await findActiveRow(db, teamId, checkpointId);
      } else if (insertError) {
        console.error('team_active_challenges insert error:', insertError);
      } else {
        row = inserted;
      }
    } else {
      console.error(`No questions configured for checkpoint ${checkpointId}`);
    }
  }

  if (!row) return { unlocked: false, challenge: null };

  const cached = questionCache.get(row.question_id);
  if (cached && Date.now() - cached.cachedAt < QUESTION_CACHE_TTL) {
    return {
      unlocked: true,
      challenge: cached.challenge,
    };
  }

  const { data: q, error: questionError } = await db
    .from('questions_pool')
    .select('id, challenge_type, question, options')
    .eq('id', row.question_id)
    .maybeSingle();

  if (questionError) console.error('questions_pool question lookup error:', questionError);
  if (!q) return { unlocked: true, challenge: null };

  const assignedChallenge: AssignedChallenge = {
    id: q.id,
    type: q.challenge_type,
    question: q.question,
    options: q.options ?? undefined,
  };

  questionCache.set(row.question_id, {
    challenge: assignedChallenge,
    cachedAt: Date.now(),
  });

  return {
    unlocked: true,
    challenge: assignedChallenge,
  };
}
