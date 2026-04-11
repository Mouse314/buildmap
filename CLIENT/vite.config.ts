import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const plansApiProxyTarget =
  typeof process.env.VITE_PLANS_API_PROXY_TARGET === 'string' && process.env.VITE_PLANS_API_PROXY_TARGET.trim().length > 0
    ? process.env.VITE_PLANS_API_PROXY_TARGET.trim()
    : 'http://localhost:3001'

// https://vite.dev/config/
export default defineConfig({
  // Use relative base so the build works when hosted under subpaths (e.g. GitHub Pages).
  // This also keeps import.meta.env.BASE_URL usable for public asset fetching.
  base: './',
  build: {
    // Keep authored CSS declarations as-is to avoid dropping unprefixed backdrop-filter in production.
    cssMinify: 'esbuild',
  },
  server: {
    proxy: {
      '/api/plans': {
        target: plansApiProxyTarget,
        changeOrigin: true,
      },
      '/api/admin': {
        target: plansApiProxyTarget,
        changeOrigin: true,
      },
      '/api/schedule': {
        target: plansApiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
})
