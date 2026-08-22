import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import mongoose from 'mongoose';
import { updateExpiredSubscriptions } from '@/lib/subscriptions/maintenance';
import { processDueDeletionRequests } from '@/lib/privacy/deletion_maintenance';
import { cancelUnpaidExpiredOrders } from '@/lib/orders/maintenance';

function hasValidCronSecret(request: NextRequest) {
  const expected = process.env.CRON_SECRET || '';
  const received = request.headers.get('x-cron-secret') || '';
  if (expected.length < 32 || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

/**
 * Overlap guard: cron schedulers may fire while a previous run is still in
 * progress. A claimed lock document makes concurrent runs a no-op instead of a
 * double-cancel race; TTL-style staleness (10 min) self-heals crashed runs.
 */
const LOCK_KEY = 'maintenance_run';
const LOCK_TTL_MS = 10 * 60 * 1000;

async function acquireMaintenanceLock(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) return false;
  const locks = db.collection('maintenance_locks');
  try {
    await locks.createIndex({ key: 1 }, { unique: true });
  } catch {
    /* index already exists */
  }
  const result = await locks.updateOne(
    { key: LOCK_KEY, acquired_at: { $lt: new Date(Date.now() - LOCK_TTL_MS) } },
    { $set: { key: LOCK_KEY, acquired_at: new Date() } }
  );
  if (result.upsertedCount === 1) return true;
  // No stale lock present and none insertable → someone else holds it.
  return false;
}

async function releaseMaintenanceLock(): Promise<void> {
  await mongoose.connection.db?.collection('maintenance_locks').deleteOne({ key: LOCK_KEY });
}

export async function POST(request: NextRequest) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Invalid maintenance credential' }, { status: 401 });
  }

  await connectToDatabase();
  if (!(await acquireMaintenanceLock())) {
    return NextResponse.json({ success: true, skipped: true, reason: 'another run in progress', ran_at: new Date().toISOString() });
  }
  try {
    const [subscriptions, deletions, orders] = await Promise.all([
      updateExpiredSubscriptions(),
      processDueDeletionRequests(),
      cancelUnpaidExpiredOrders(),
    ]);
    return NextResponse.json({ success: true, ran_at: new Date().toISOString(), subscriptions, deletions, orders });
  } finally {
    await releaseMaintenanceLock();
  }
}
