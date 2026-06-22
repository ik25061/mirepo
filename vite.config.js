import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5172,
    // Proxy desactivado porque usamos URL directa con SERVER_IP
    // Si quieres usar proxy, descomenta la sección de abajo y comenta SERVER_IP en api.js
    /*
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/audio': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/cover': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/artist-cover': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/songs': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    }
    */
  },
})