import React from 'react';
import ReactDOM from 'react-dom/client';
// Force cache invalidation for auth hook fixes
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/src/offline-sw.js')
      .then((registration) => {
        console.log('Service Worker registrado con scope:', registration.scope);
      })
      .catch((error) => {
        console.error('Error registrando Service Worker:', error);
      });
  });
}