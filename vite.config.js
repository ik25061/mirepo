import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import os from 'node:os';

function getLocalLanIp() {
  const interfaces = os.networkInterfaces();
  // Prioridad: IP en la red 172.16.x.x (la que usas)
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('172.16.')) {
        return iface.address;
      }
    }
  }
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
// 🔽 CAMBIA este valor al puerto donde corre tu servidor (5002)
const BACKEND_PORT = 5002;   // <--- antes era 5001

console.log('🌐 IP detectada para el proxy:', localIP);

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5172,               // puerto del frontend (no lo cambies)
    https: false,
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