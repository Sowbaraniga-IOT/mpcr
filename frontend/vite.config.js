import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// The Django backend (../backend/, `py manage.py runserver`). /api is forwarded to it, so the
// browser only ever talks to one origin.
const backend = { '/api': { target: process.env.MPCR_BACKEND ?? 'http://127.0.0.1:8000', changeOrigin: true } }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The version in package.json, shown in the footer, sidebar and title block.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { proxy: backend },
  preview: { proxy: backend },
})
