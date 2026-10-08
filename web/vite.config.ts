import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The UI runs on its own port in development and forwards API calls to the
// Stringherd server, so the browser sees a single address and the session
// cookie works without any cross-origin setup.
const server = process.env.STRINGHERD_SERVER ?? 'http://127.0.0.1:8100'

export default defineConfig({
  plugins: [react()],
  server: {
    // 5180, not Vite's default 5173: FitJournal's web app uses 5173 and its backend
    // only accepts that origin. strictPort fails loudly instead of drifting to 5181.
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': server,
      '/health': server,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: { include: [/tokens\.css/], modules: { classNameStrategy: 'non-scoped' } },
  },
})
