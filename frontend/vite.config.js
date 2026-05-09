import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // Spring Boot backend — must be listed BEFORE the /api catch-all
      '/api/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // FastAPI simulation bridge (Python)
      '/api': {
        target: 'http://localhost:8004',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
