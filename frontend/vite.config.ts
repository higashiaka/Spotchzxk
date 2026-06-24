// Vite build config: registers the React and Tailwind plugins.
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'https://spotchzxk.xyz'
  const previewBypass = env.VITE_DEV_PREVIEW_BYPASS?.trim()
  const proxyHeaders: Record<string, string> = {
    Origin: proxyTarget,
  }

  if (previewBypass) {
    proxyHeaders.Cookie = `preview_bypass=${previewBypass}`
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      global: 'globalThis',
    },
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          headers: proxyHeaders,
        },
        '/ws': {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
          headers: proxyHeaders,
        },
      },
    },
  }
})
