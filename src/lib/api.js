// ====== CONFIGURACIÓN DE IP DINÁMICA ======
let API_URL = '';
let apiUrlPromise = null;
const DEFAULT_PORT = '5001';
const API_URL_STORAGE_KEY = 'mirepo_api_url';

async function probeServer(baseUrl) {
  if (!baseUrl || typeof window === 'undefined') return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`${baseUrl}/api/test`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

export async function detectServerIP() {
  if (typeof window === 'undefined') {
    return '';
  }

  const storedUrl = window.localStorage.getItem(API_URL_STORAGE_KEY);
  if (storedUrl) {
    API_URL = storedUrl.replace(/\/$/, '');
    return API_URL;
  }

  const isCapacitor = window.location.protocol === 'capacitor:' || window.Capacitor?.isNativePlatform?.();
  if (!isCapacitor) {
    API_URL = '';
    return API_URL;
  }

  const candidates = [
    `http://localhost:${DEFAULT_PORT}`,
    `http://127.0.0.1:${DEFAULT_PORT}`,
    `http://10.0.2.2:${DEFAULT_PORT}`,
    `http://${window.location.hostname}:${DEFAULT_PORT}`,
  ];

  for (const candidate of candidates) {
    if (await probeServer(candidate)) {
      API_URL = candidate;
      window.localStorage.setItem(API_URL_STORAGE_KEY, API_URL);
      return API_URL;
    }
  }

  const enteredIp = window.prompt('Ingresa la IP de tu computadora (WiFi):', '172.16.12.4');
  const normalizedIp = enteredIp ? enteredIp.replace(/^https?:\/\//, '').replace(/\/$/, '') : '172.16.12.4';
  API_URL = `http://${normalizedIp}:${DEFAULT_PORT}`;
  window.localStorage.setItem(API_URL_STORAGE_KEY, API_URL);
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
  console.log('📡 Petición a:', fullUrl || url);
  
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

export const audioUrl = (id) => `${getApiUrl() || ''}/audio/${id}`;
export const coverUrl = (id) => `${getApiUrl() || ''}/cover/${id}`;
export const artistCoverUrl = (artist) => `${getApiUrl() || ''}/artist-cover/${encodeURIComponent(artist)}`;
export const serverUrl = getApiUrl();