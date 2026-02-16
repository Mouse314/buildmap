import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Use relative base so the build works when hosted under subpaths (e.g. GitHub Pages).
  // This also keeps import.meta.env.BASE_URL usable for public asset fetching.
  base: './',
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
})
