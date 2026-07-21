import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import os from 'node:os';
import 'dotenv/config';

function getLocalLanIp() {
  const interfaces = os.networkInterfaces();
  // Prioridad 1: IP en la red 172.x.x.x (usas dos computadoras con IPs 172.16.x.x)
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('172.')) {
        return iface.address;
      }
    }
  }
  // Prioridad 2: IP en la red 192.168.x.x
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168.')) {
        return iface.address;
      }
    }
  }
  // Prioridad 3: cualquier otra IP no interna
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
// El proxy de Vite siempre debe apuntar a localhost porque
// Express y Vite corren en la MISMA computadora.
// VITE_SERVER_HOST se usa SOLO para que el frontend (api.js)
// sepa a qué IP conectarse desde el móvil (Capacitor).
const PROXY_TARGET = `http://localhost:${BACKEND_PORT}`;

console.log('🌐 IP de red local detectada:', localIP);
console.log('🔧 Puerto del servidor:', BACKEND_PORT);
console.log('🔧 Puerto del cliente:', FRONTEND_PORT);
console.log('🔁 Proxy de Vite →', PROXY_TARGET);
console.log('📱 Para conectar desde móvil usa IP:', localIP);
console.log('   (configurable en .env con VITE_SERVER_HOST)');

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: parseInt(FRONTEND_PORT, 10),
    https: false,
    proxy: {
      '/api': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
      },
      '/audio': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
      },
      '/cover': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
      },
      '/artist-cover': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
      },
      '/songs': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
