import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'server',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Force every worker onto a throwaway in-memory database (see env.ts DB_FILE hook).
    env: { DB_FILE: ':memory:' },
  },
})
