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
  },
});
