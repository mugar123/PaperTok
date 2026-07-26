import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/papertok/',
  plugins: [react()],
  server: {
    proxy: {
      '/api/arxiv': {
        // arXiv 301-redirects http to https and the proxy does not follow
        // redirects, so the http target made every dev request fail.
        target: 'https://export.arxiv.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/arxiv/, '/api/query'),
      },
    },
  },
})
