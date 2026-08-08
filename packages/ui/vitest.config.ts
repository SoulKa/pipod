import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { vueTestConfig } from '../../vitest.vue'

// Shared touch UI components (on-screen keyboard). Needs a real DOM because the keyboard
// teleports to <body> and writes its height onto the document element.
export default defineConfig({
  plugins: [vue()],
  test: vueTestConfig('ui'),
})
