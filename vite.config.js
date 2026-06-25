import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5172,
    // Excluir la carpeta server del watch para evitar recargas
    watch: {
      ignored: ['**/server/**', '**/node_modules/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/audio': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/cover': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/artist-cover': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/songs': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})