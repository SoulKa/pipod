import { defineConfig } from 'vitest/config'

// Monorepo test entrypoint. Each workspace keeps its own vitest.config.ts (environment,
// includes, env); listing them as projects makes `yarn test` run the whole suite in one
// process with each project's config applied — so the server still gets DB_FILE=:memory:.
export default defineConfig({
  test: {
    projects: ['apps/console', 'apps/server'],
  },
})
