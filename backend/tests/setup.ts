process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/seals_test';
// NODE_ENV is typed read-only by Next.js ambient types; bypass for the test runner.
(process.env as Record<string, string | undefined>).NODE_ENV ??= 'test';
