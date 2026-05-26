import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail loudly if 5173 is taken — avoids silently serving an old build on 5174+.
    strictPort: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
