import { afterAll, beforeAll, beforeEach } from 'vitest';

import {
  clearMongoIntegrationDatabase,
  startMongoIntegrationDatabase,
  stopMongoIntegrationDatabase,
} from './support/mongo_test_harness';

beforeAll(async () => {
  await startMongoIntegrationDatabase();
});

beforeEach(async () => {
  await clearMongoIntegrationDatabase();
});

afterAll(async () => {
  await stopMongoIntegrationDatabase();
});

