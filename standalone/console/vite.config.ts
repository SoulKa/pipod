import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The server hosts REST (/api) and socket.io (/socket.io); proxy both in dev so the
// console talks to one origin exactly as it will in production.
const serverTarget = process.env.SERVER_URL ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': { target: serverTarget, changeOrigin: true },
      '/socket.io': { target: serverTarget, ws: true, changeOrigin: true },
    },
  },
})
