import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Mirepo - Reproductor de Música',
        short_name: 'Mirepo',
        description: 'Reproductor de música con React y Vite',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5172,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, 'certs', 'server.key')),
      cert: fs.readFileSync(path.resolve(__dirname, 'certs', 'server.cert')),
    },
    allowedHosts: true,
    watch: {
      ignored: ['**/server/**', '**/node_modules/**'],
    },
    proxy: {
      '/api': {
        target: 'https://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/audio': {
        target: 'https://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/cover': {
        target: 'https://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/artist-cover': {
        target: 'https://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/songs': {
        target: 'https://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5172,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, 'certs', 'server.key')),
      cert: fs.readFileSync(path.resolve(__dirname, 'certs', 'server.cert')),
    },
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'https://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/audio': {
        target: 'https://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/cover': {
        target: 'https://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/artist-cover': {
        target: 'https://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/songs': {
        target: 'https://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})