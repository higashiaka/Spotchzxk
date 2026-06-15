// Vite build config: registers the React and Tailwind plugins.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    global: 'globalThis',
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://spotchzxk.xyz',
        changeOrigin: true,
      },
      '/ws': {
        target: 'https://spotchzxk.xyz',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
