import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import os from 'node:os';
import 'dotenv/config';

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

// Leer configuración desde el .env
const localIP = getLocalLanIp();
const BACKEND_PORT = process.env.VITE_SERVER_PORT || 5002;
const FRONTEND_PORT = process.env.VITE_CLIENT_PORT || 5172;
const SERVER_HOST = process.env.VITE_SERVER_HOST || localIP;

console.log('🌐 IP detectada para el proxy:', localIP);
console.log('🔧 Puerto del servidor:', BACKEND_PORT);
console.log('🔧 Puerto del cliente:', FRONTEND_PORT);

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: parseInt(FRONTEND_PORT, 10),
    https: false,
    proxy: {
      '/api': {
        target: `http://${SERVER_HOST}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/audio': {
        target: `http://${SERVER_HOST}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/cover': {
        target: `http://${SERVER_HOST}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/artist-cover': {
        target: `http://${SERVER_HOST}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/songs': {
        target: `http://${SERVER_HOST}:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
