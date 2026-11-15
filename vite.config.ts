import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves the app from juliuspdev.github.io/budgetflow/, so the
  // published build must look for its files under /budgetflow/. The local
  // preview stays at the root.
  base: command === 'build' ? '/budgetflow/' : '/',
  test: {
    include: ['src/**/*.test.ts'],
  },
}))
