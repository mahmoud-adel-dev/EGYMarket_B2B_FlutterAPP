import { defineConfig } from 'vitest/config';
import path from 'path';

// Dedicated config for the MongoDB integration / chaos suite. These tests boot a
// real (in-memory, replica-set) MongoDB via mongodb-memory-server and therefore
// download the MongoDB binary on first run; they are intentionally split out of
// the fast unit suite and run via `npm run test:integration`.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['integration/**/*.test.ts'],
    // mongodb-memory-server replica sets are slow to boot; give each suite headroom.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // The integration tests are intentionally sequential (one shared in-memory DB)
    // to keep them deterministic and to avoid booting many MongoDB instances.
    fileParallelism: false,
  },
});
