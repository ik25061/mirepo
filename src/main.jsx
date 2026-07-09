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