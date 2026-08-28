import { defineConfig } from 'vitest/config';
import path from 'path';

// Dedicated config for the MongoDB integration / chaos suite. By default the
// setup boots a real in-memory replica set. MONGODB_TEST_URI may point at a
// disposable external replica set, subject to the destructive-test guard.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['integration/**/*.test.ts'],
    setupFiles: ['./integration/setup.ts'],
    // mongodb-memory-server replica sets are slow to boot; give each suite headroom.
    testTimeout: 180_000,
    hookTimeout: 240_000,
    // The integration tests are intentionally sequential (one shared in-memory DB)
    // to keep them deterministic and to avoid booting many MongoDB instances.
    fileParallelism: false,
    maxWorkers: 1,
  },
});
