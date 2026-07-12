import { defineConfig } from 'vitest/config'

// The framework-light modules (api client, tournament feed) need no DOM, so the node
// environment is enough. Testing the .vue views would want @vue/test-utils + a DOM
// shim, which we deliberately don't pull in.
export default defineConfig({
  test: {
    name: 'console',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
