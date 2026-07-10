// ====== CONFIGURACIÓN DE IP DINÁMICA ======
let API_URL = '';
let apiUrlPromise = null;

// En src/lib/api.js, cambia la función detectServerIP por esta:
export async function detectServerIP() {
  const host = window.location.hostname;
  const port = '5001';
  
  // En Android/iOS (Capacitor), host suele ser 'localhost'
  // Pero no queremos que intente fetch('/api/config/ip') porque dará el error del HTML
  
  const isMobile = window.location.protocol === 'capacitor:' || 
                   window.location.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1');

  if (isMobile) {
    // Para el celular, forzamos el prompt directamente si no hay IP
    const ip = prompt('Ingresa la IP de tu computadora (WiFi):', '172.16.12.4') || '172.16.12.4';
    API_URL = `http://${ip}:${port}`;
  } else {
    API_URL = `http://${host}:${port}`;
  }
  
  return API_URL;
}

export function getApiUrl() {
  return API_URL;
}

async function ensureApiUrl() {
  if (API_URL) return API_URL;
  if (!apiUrlPromise) {
    apiUrlPromise = detectServerIP().catch((err) => {
      console.warn('No se pudo inicializar la URL del servidor:', err);
      return '';
    });
  }
  return apiUrlPromise;
}

// Detectar IP al cargar
ensureApiUrl();

// ====== FUNCIONES DE API ======

async function request(url, options = {}) {
  const baseUrl = await ensureApiUrl();
  const fullUrl = `${baseUrl}${url}`;
  console.log('📡 Petición a:', fullUrl);
  
  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    const responseText = await response.text();

    if (!response.ok) {
      console.error('❌ Error respuesta:', response.status, responseText);
      throw new Error(`Error ${response.status}: ${responseText || 'Respuesta inválida del servidor'}`);
    }

    if (!responseText) {
      return null;
    }

    try {
      return JSON.parse(responseText);
    } catch (err) {
      console.error('❌ Respuesta no válida como JSON:', responseText);
      throw new Error('El servidor devolvió una respuesta inválida. Revisa la IP del servidor y que la API esté disponible.');
    }
  } catch (err) {
    console.error('❌ Error en petición:', err);
    throw err;
  }
}

export const api = {
  // Autenticación
  login: (username, password) => 
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  
  register: (username, password) => 
    request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  verifyToken: (token) =>
    request('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  logout: (token) =>
    request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  // Biblioteca
  getLibrary: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    if (params.userId) qs.set('userId', params.userId);
    const url = `/api/library${qs.toString() ? `?${qs.toString()}` : ''}`;
    return request(url);
  },

  rescan: () => request('/api/rescan', { method: 'POST' }),

  like: (id, liked, userId) => 
    request(`/api/songs/${id}/like`, {
      method: 'POST',
      body: JSON.stringify({ liked, userId }),
    }),

  hideSong: (id, userId) => 
    request(`/api/songs/${id}/hide`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  deleteSong: (id, userId) => 
    request('/api/songs', {
      method: 'DELETE',
      body: JSON.stringify({ id, userId }),
    }),

  hideArtist: (artist, userId) => 
    request('/api/artists/hide', {
      method: 'POST',
      body: JSON.stringify({ artist, userId }),
    }),

  unhideArtist: (artist, userId) => 
    request('/api/artists/unhide', {
      method: 'POST',
      body: JSON.stringify({ artist, userId }),
    }),

  getArtists: (userId) => request(`/api/artists${userId ? `?userId=${userId}` : ''}`),
  getAlbums: (userId) => request(`/api/albums${userId ? `?userId=${userId}` : ''}`),
  getGenres: () => request('/api/genres'),
  getLikedSongs: (userId) => request(`/api/library?userId=${userId}&liked=true`),

  getPlayLists: (userId) => request(`/api/playlists${userId ? `?userId=${userId}` : ''}`),
  getPlayList: (id) => request(`/api/playlists/${id}`),
  createPlayList: (name, description, userId) => 
    request('/api/playlists', {
      method: 'POST',
      body: JSON.stringify({ name, description, userId }),
    }),
  addSongToPlayList: (playlistId, songId) => 
    request(`/api/playlists/${playlistId}/songs`, {
      method: 'POST',
      body: JSON.stringify({ songId }),
    }),
  removeSongFromPlayList: (playlistId, songId) => 
    request(`/api/playlists/${playlistId}/songs`, {
      method: 'DELETE',
      body: JSON.stringify({ songId }),
    }),
  deletePlayList: (id) => request(`/api/playlists/${id}`, { method: 'DELETE' }),

  scanDuplicates: (folderPath) => request('/api/scan', {
    method: 'POST',
    body: JSON.stringify({ folderPath }),
  }),
  deleteDuplicate: (filePath) => request('/api/delete-duplicate', {
    method: 'DELETE',
    body: JSON.stringify({ filePath }),
  }),
  fixMetadata: (filePath) => request('/api/fix-metadata', {
    method: 'POST',
    body: JSON.stringify({ filePath }),
  }),
};

export const audioUrl = (id) => `${API_URL}/audio/${id}`;
export const coverUrl = (id) => `${API_URL}/cover/${id}`;
export const artistCoverUrl = (artist) => `${API_URL}/artist-cover/${encodeURIComponent(artist)}`;
export const serverUrl = API_URL;