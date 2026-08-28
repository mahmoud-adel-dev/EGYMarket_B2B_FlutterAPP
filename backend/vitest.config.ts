import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    // The Mongoose connection module validates this at import time; unit tests
    // never open a real connection but the variable must exist.
    setupFiles: ['./tests/setup.ts'],
    // Integration tests boot a real (in-memory) MongoDB via mongodb-memory-server
    // and download the MongoDB binary on first run; they must not run as part of
    // the fast unit suite, nor be imported into it. Run them with `npm run test:integration`.
    exclude: [
      'integration/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
    ],
  },
});
