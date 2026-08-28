import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const confirmation = 'I_UNDERSTAND_THIS_DROPS_TEST_DATA';
const uri = process.env.MONGODB_TEST_URI?.trim();

if (!uri) {
  console.error('MONGODB_TEST_URI is required for test:integration:live.');
  process.exit(2);
}
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run destructive MongoDB tests with NODE_ENV=production.');
  process.exit(2);
}
if (process.env.MONGODB_TEST_ALLOW_EXTERNAL !== confirmation) {
  console.error(`Set MONGODB_TEST_ALLOW_EXTERNAL=${confirmation} to acknowledge test database deletion.`);
  process.exit(2);
}

const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const result = spawnSync(
  process.execPath,
  [vitest, 'run', '--config', 'vitest.integration.config.ts'],
  {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: process.env,
    stdio: 'inherit',
  }
);

process.exit(result.status ?? 1);

