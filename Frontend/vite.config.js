import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

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
  // Empty prefix loads SENTRY_* for the build plugin (not exposed to client).
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'BACKEND_', 'SENTRY_', ''])
  const backendOrigin = ensureAbsoluteOrigin(
    process.env.BACKEND_ORIGIN || env.BACKEND_ORIGIN || process.env.VITE_API_URL || env.VITE_API_URL || ''
  )

  // Keep SDK release === uploaded release (Vercel injects VERCEL_GIT_COMMIT_SHA).
  const release =
    process.env.VITE_SENTRY_RELEASE ||
    env.VITE_SENTRY_RELEASE ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    env.VERCEL_GIT_COMMIT_SHA ||
    ''
  if (release && !process.env.VITE_SENTRY_RELEASE) {
    process.env.VITE_SENTRY_RELEASE = release
  }

  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || env.SENTRY_AUTH_TOKEN
  const sentryOrg = process.env.SENTRY_ORG || env.SENTRY_ORG || 'forma-f4'
  const sentryProject = process.env.SENTRY_PROJECT || env.SENTRY_PROJECT || 'forma-web'

  return {
    envPrefix: ['VITE_', 'BACKEND_'],
    define: {
      'import.meta.env.BACKEND_ORIGIN': JSON.stringify(backendOrigin),
      'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(release || ''),
    },
    build: {
      // Hidden: emit maps for upload, don't link them publicly in JS.
      sourcemap: 'hidden',
    },
    plugins: [
      tailwindcss(),
      react(),
      // After other plugins. Skips upload when SENTRY_AUTH_TOKEN is unset (local builds).
      ...(sentryAuthToken
        ? [
            sentryVitePlugin({
              org: sentryOrg,
              project: sentryProject,
              authToken: sentryAuthToken,
              release: release ? { name: release } : undefined,
              sourcemaps: {
                filesToDeleteAfterUpload: ['./dist/**/*.map'],
              },
            }),
          ]
        : []),
    ],
    server: backendOrigin
      ? {
          proxy: {
            '/api': {
              target: backendOrigin,
              changeOrigin: true,
              cookieDomainRewrite: '',
            },
            '/uploads': {
              target: backendOrigin,
              changeOrigin: true,
              cookieDomainRewrite: '',
            },
            '/health': { target: backendOrigin, changeOrigin: true },
          },
        }
      : undefined,
  }
})
