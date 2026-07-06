import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5172,
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