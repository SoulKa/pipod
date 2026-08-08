import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'server',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Force every worker onto a throwaway in-memory database (see env.ts DB_FILE hook),
    // and mute the service-level logger so test output stays readable.
    env: { DB_FILE: ':memory:', LOG_LEVEL: 'silent' },
  },
})
