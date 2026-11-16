import type { SealedBox } from '../crypto/vault';
import { SyncUnavailableError, type RemoteRecord, type RemoteVault } from './syncCore';
import { supabase } from './supabaseClient';

// The real server behind RemoteVault: your one row in the `vaults` table
// (supabase/vaults.sql). Row-level security means every query here can only
// ever see or change the signed-in person's own row.

/** Checks that a value from the server really is a sealed box. */
export function isSealedBox(value: unknown): value is SealedBox {
  if (typeof value !== 'object' || value === null) return false;
  const box = value as Record<string, unknown>;
  return (
    box.version === 1 &&
    typeof box.salt === 'string' &&
    typeof box.iterations === 'number' &&
    Number.isInteger(box.iterations) &&
    box.iterations > 0 &&
    typeof box.iv === 'string' &&
    typeof box.ciphertext === 'string'
  );
}

function recordFrom(row: unknown): RemoteRecord {
  const candidate = (row ?? {}) as Record<string, unknown>;
  if (!isSealedBox(candidate.sealed_box) || typeof candidate.revision !== 'number') {
    throw new Error('The synced data has an unexpected shape.');
  }
  return { box: candidate.sealed_box, revision: candidate.revision };
}

interface QueryProblem {
  code?: string;
  message: string;
}

/** Network trouble or a sleeping database arrive without a database error code. */
function problemFrom(error: QueryProblem): Error {
  if (!error.code || /fetch|network|timeout/i.test(error.message)) return new SyncUnavailableError();
  return new Error(`Sync failed (${error.code}).`);
}

/** Runs a query; a thrown network error (no connection at all) becomes SyncUnavailableError. */
async function reach<T>(query: () => PromiseLike<T>): Promise<T> {
  try {
    return await query();
  } catch {
    throw new SyncUnavailableError();
  }
}

export const supabaseVault: RemoteVault = {
  async fetch() {
    const { data, error } = await reach(() => supabase.from('vaults').select('sealed_box, revision').maybeSingle());
    if (error !== null) throw problemFrom(error);
    return data === null ? null : recordFrom(data);
  },

  async create(box) {
    const { data, error } = await reach(() =>
      supabase.from('vaults').insert({ sealed_box: box }).select('sealed_box, revision').single(),
    );
    // 23505: "already exists" — another device set up sync first.
    if (error?.code === '23505') return 'exists';
    if (error !== null) throw problemFrom(error);
    return recordFrom(data);
  },

  async update(box, expectedRevision) {
    const { data, error } = await reach(() =>
      supabase
        .from('vaults')
        .update({ sealed_box: box, revision: expectedRevision + 1, updated_at: new Date().toISOString() })
        // Only if nobody saved in between.
        .eq('revision', expectedRevision)
        .select('sealed_box, revision'),
    );
    if (error !== null) throw problemFrom(error);
    if (data.length === 0) return 'conflict';
    return recordFrom(data[0]);
  },
};
