import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import os from 'node:os';

function getLocalLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('127.')) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalLanIp();
const BACKEND_PORT = 5001;

export default defineConfig({
  plugins: [
    react(),
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
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5172,
    https: false,  // <-- HTTP
    proxy: {
      '/api': {
        target: `http://${localIP}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/audio': {
        target: `http://${localIP}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/cover': {
        target: `http://${localIP}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/artist-cover': {
        target: `http://${localIP}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/songs': {
        target: `http://${localIP}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5172,
    https: false,  // <-- HTTP
    proxy: {
      '/api': {
        target: `http://${localIP}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/audio': {
        target: `http://${localIP}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/cover': {
        target: `http://${localIP}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/artist-cover': {
        target: `http://${localIP}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/songs': {
        target: `http://${localIP}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});