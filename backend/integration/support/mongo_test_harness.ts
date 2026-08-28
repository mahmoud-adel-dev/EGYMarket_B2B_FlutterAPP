import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import { connectToDatabase } from '@/lib/db/mongoose';
import { detectTransactionSupport } from '@/lib/db/transaction';

const EXTERNAL_CONFIRMATION = 'I_UNDERSTAND_THIS_DROPS_TEST_DATA';
const SAFE_DATABASE_NAME = /(^|[-_])(test|testing|integration|ci|chaos)([-_]|$)/i;
const FORBIDDEN_DATABASES = new Set(['admin', 'config', 'local', 'production', 'prod']);

let memoryReplicaSet: MongoMemoryReplSet | undefined;
let activeDatabaseName: string | undefined;
let external = false;

function databaseNameFromUri(uri: string): string {
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i);
  return decodeURIComponent(match?.[1] ?? '').trim();
}

function replaceDatabaseName(uri: string, databaseName: string): string {
  const authorityStart = uri.indexOf('://') + 3;
  const pathStart = uri.indexOf('/', authorityStart);
  if (pathStart === -1) return `${uri}/${databaseName}`;
  const queryStart = uri.indexOf('?', pathStart);
  return queryStart === -1
    ? `${uri.slice(0, pathStart + 1)}${databaseName}`
    : `${uri.slice(0, pathStart + 1)}${databaseName}${uri.slice(queryStart)}`;
}

/**
 * Reject an external URI unless it is unmistakably a disposable test database.
 * The tests delete every document and finally drop their run-specific database.
 */
export function assertSafeExternalMongoUri(uri: string): string {
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    throw new Error('MONGODB_TEST_URI must be a mongodb:// or mongodb+srv:// URI');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MongoDB integration tests are blocked while NODE_ENV=production');
  }
  if (process.env.MONGODB_TEST_ALLOW_EXTERNAL !== EXTERNAL_CONFIRMATION) {
    throw new Error(
      `External MongoDB tests are destructive. Set MONGODB_TEST_ALLOW_EXTERNAL=${EXTERNAL_CONFIRMATION}`
    );
  }
  if (process.env.MONGODB_URI && process.env.MONGODB_URI.trim() === uri.trim()) {
    throw new Error('MONGODB_TEST_URI must not be identical to the application MONGODB_URI');
  }

  const databaseName = databaseNameFromUri(uri);
  if (!databaseName) {
    throw new Error('MONGODB_TEST_URI must include an explicit database name');
  }
  if (FORBIDDEN_DATABASES.has(databaseName.toLowerCase()) || !SAFE_DATABASE_NAME.test(databaseName)) {
    throw new Error(
      `Unsafe MongoDB test database "${databaseName}". Its name must contain test, integration, ci, or chaos`
    );
  }
  return databaseName;
}

export async function startMongoIntegrationDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) return;

  const externalUri = process.env.MONGODB_TEST_URI?.trim();
  let uri: string;
  if (externalUri) {
    external = true;
    const baseDatabaseName = assertSafeExternalMongoUri(externalUri);
    const runSuffix = `${process.pid}_${randomBytes(4).toString('hex')}`;
    activeDatabaseName = `${baseDatabaseName}_${runSuffix}`;
    uri = replaceDatabaseName(externalUri, activeDatabaseName);
  } else {
    memoryReplicaSet = await MongoMemoryReplSet.create({
      // Windows/CI hosts with cold filesystem caches may need more than the
      // library's 10s default while WiredTiger creates its journal files.
      instanceOpts: [{ launchTimeout: 60_000 }],
      replSet: {
        count: 1,
        storageEngine: 'wiredTiger',
      },
    });
    activeDatabaseName = `seals_integration_test_${process.pid}`;
    uri = memoryReplicaSet.getUri(activeDatabaseName);
  }

  (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
  process.env.MONGODB_URI = uri;
  await connectToDatabase();

  const transactionSupport = await detectTransactionSupport();
  if (transactionSupport !== 'replica_set') {
    throw new Error(
      'MongoDB integration tests require a replica set or sharded cluster so transaction rollback is exercised'
    );
  }

  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init())
  );
}

export async function clearMongoIntegrationDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({})
    )
  );
}

export async function stopMongoIntegrationDatabase(): Promise<void> {
  try {
    if (mongoose.connection.readyState === 1 && activeDatabaseName) {
      const connectedName = mongoose.connection.db?.databaseName;
      if (connectedName !== activeDatabaseName || !SAFE_DATABASE_NAME.test(connectedName)) {
        throw new Error(`Refusing to drop unexpected MongoDB database "${connectedName ?? 'unknown'}"`);
      }
      await mongoose.connection.dropDatabase();
    }
  } finally {
    await mongoose.disconnect().catch(() => undefined);
    global.mongooseCache = { conn: null, promise: null };
    await memoryReplicaSet?.stop().catch(() => undefined);
    memoryReplicaSet = undefined;
    activeDatabaseName = undefined;
    external = false;
  }
}

export function mongoIntegrationRuntime() {
  return {
    external,
    databaseName: activeDatabaseName,
  };
}
