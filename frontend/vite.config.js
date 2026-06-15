
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Esto expone el frontend a la red local
    port: 5173  // El puerto por defecto de Vite
  }
})