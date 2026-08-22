import mongoose from 'mongoose';
import { ClientSession } from 'mongodb';
import connectToDatabase from '@/lib/db/mongoose';

export type TransactionSupport = 'replica_set' | 'standalone';

let transactionSupport: TransactionSupport | null = null;

/**
 * Detect whether the connected deployment supports multi-document transactions
 * (replica set / sharded cluster, e.g. MongoDB Atlas). Standalone dev servers do not.
 * The result is cached for the process lifetime.
 */
export async function detectTransactionSupport(): Promise<TransactionSupport> {
  if (transactionSupport) return transactionSupport;
  const conn = await connectToDatabase();
  try {
    // hello command exposes topology capability without side effects.
    const admin = conn.connection.db!.admin();
    const hello = await admin.command({ hello: 1 });
    transactionSupport = (hello as { setName?: string }).setName ? 'replica_set' : 'standalone';
  } catch {
    transactionSupport = 'standalone';
  }
  return transactionSupport;
}

/**
 * Run `fn` inside a MongoDB multi-document transaction when the topology supports it.
 * On standalone deployments (local development) `fn` runs with an undefined session;
 * callers MUST therefore keep every step individually race-safe (conditional
 * single-statement updates, unique indexes) so correctness never depends on the
 * transaction being available.
 *
 * Transactions are retried once on transient commit errors per driver guidance.
 */
export async function runInTransaction<T>(fn: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  await connectToDatabase();
  if ((await detectTransactionSupport()) === 'standalone') {
    return fn(undefined);
  }
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => fn(session), {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
  } finally {
    await session.endSession();
  }
}
