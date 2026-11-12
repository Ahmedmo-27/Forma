import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function ensureAbsoluteOrigin(url) {
  if (!url) return url
  const trimmed = String(url).trim().replace(/\/+$/, '')
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^localhost(?::\d+)?(\/|$)/i.test(trimmed) || /^127\.0\.0\.1(?::\d+)?(\/|$)/.test(trimmed)) {
    return `http://${trimmed}`
  }
  if (/^[a-z0-9.-]+(?::\d+)?(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'BACKEND_'])
  const backendOrigin = ensureAbsoluteOrigin(
    process.env.BACKEND_ORIGIN || env.BACKEND_ORIGIN || process.env.VITE_API_URL || env.VITE_API_URL || ''
  )

  return {
    envPrefix: ['VITE_', 'BACKEND_'],
    define: {
      'import.meta.env.BACKEND_ORIGIN': JSON.stringify(backendOrigin),
    },
    plugins: [
      tailwindcss(),
      react(),
    ],
  }
})
