import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { vueTestConfig } from '../../vitest.vue'

// Renderer .vue component tests run under happy-dom via the shared config. Main-process code
// is only tested where it is plain Node (e.g. discovery), with a per-file node environment.
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  test: vueTestConfig('launcher')
})
