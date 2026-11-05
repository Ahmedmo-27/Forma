import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'BACKEND_'])
  const backendOrigin = process.env.BACKEND_ORIGIN || env.BACKEND_ORIGIN || process.env.VITE_API_URL || env.VITE_API_URL || ''

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
