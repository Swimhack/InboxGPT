// Test environment variables
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.NEXTAUTH_SECRET = 'test-secret-for-vitest';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-not-real';
