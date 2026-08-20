// ====== CONFIGURACIÓN DE IP DINÁMICA ======
let API_URL = '';
let apiUrlPromise = null;
const DEFAULT_PORT = import.meta.env.VITE_SERVER_PORT || '5002';
const DEFAULT_HOST = import.meta.env.VITE_SERVER_HOST || '';
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
    try {
      const storedPort = new URL(storedUrl).port;
      if (storedPort && storedPort !== DEFAULT_PORT) {
        console.warn(`⚠️ Puerto guardado (${storedPort}) obsoleto. Se re-detectará el servidor en el puerto ${DEFAULT_PORT}.`);
        window.localStorage.removeItem(API_URL_STORAGE_KEY);
      } else {
        API_URL = storedUrl.replace(/\/$/, '');
        return API_URL;
      }
    } catch {
      window.localStorage.removeItem(API_URL_STORAGE_KEY);
    }
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

  const defaultHost = import.meta.env.VITE_SERVER_HOST || DEFAULT_HOST || 'localhost';
  const enteredIp = window.prompt('Ingresa la IP de tu computadora (WiFi):', defaultHost);
  const normalizedIp = enteredIp ? enteredIp.replace(/^https?:\/\//, '').replace(/\/$/, '') : defaultHost;
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

    const originalMessage = err && err.message ? String(err.message) : String(err);
    let enhancedMessage = originalMessage;

    if (err && err.name === 'AbortError') {
      enhancedMessage = `Tiempo de espera agotado al conectar con ${fullUrl}. Verifica que el servidor esté activo y la conexión de red.`;
    } else if (originalMessage.toLowerCase().includes('failed to fetch') || originalMessage.toLowerCase().includes('networkrequestfailed') || originalMessage.toLowerCase().includes('networkerror')) {
      enhancedMessage = `No se pudo conectar a ${fullUrl}. Comprueba que la IP/puerto sean correctos, que el servidor esté corriendo y que el dispositivo esté en la misma red. Mensaje original: ${originalMessage}`;
    } else {
      enhancedMessage = `Error en petición a ${fullUrl}: ${originalMessage}`;
    }

    const enhancedError = new Error(enhancedMessage);
    enhancedError.cause = err;
    throw enhancedError;
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
    if (params.liked) qs.set('liked', params.liked);
    if (params.shuffleSeed) qs.set('shuffleSeed', params.shuffleSeed);
    const url = `/api/library${qs.toString() ? `?${qs.toString()}` : ''}`;
    return request(url);
  },

  rescan: () => request('/api/rescan', { method: 'POST' }),
  rescanStreamUrl: () => `${getApiUrl() || ''}/api/rescan-stream`,

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

  // Artistas con paginación
  getArtists: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    if (params.userId) qs.set('userId', params.userId);
    if (params.search) qs.set('search', params.search);
    const url = `/api/artists${qs.toString() ? `?${qs.toString()}` : ''}`;
    return request(url);
  },

  getArtistSongs: (artistId, params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    if (params.userId) qs.set('userId', params.userId);
    const url = `/api/artists/${artistId}/songs${qs.toString() ? `?${qs.toString()}` : ''}`;
    return request(url);
  },

  // Álbumes con paginación
  getAlbums: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    if (params.userId) qs.set('userId', params.userId);
    if (params.search) qs.set('search', params.search);
    const url = `/api/albums${qs.toString() ? `?${qs.toString()}` : ''}`;
    return request(url);
  },

  getAlbumSongs: (albumId, params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    if (params.userId) qs.set('userId', params.userId);
    const url = `/api/albums/${albumId}/songs${qs.toString() ? `?${qs.toString()}` : ''}`;
    return request(url);
  },

  // Géneros con paginación
  getGenres: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    if (params.userId) qs.set('userId', params.userId);
    if (params.search) qs.set('search', params.search);
    const url = `/api/genres${qs.toString() ? `?${qs.toString()}` : ''}`;
    return request(url);
  },

  getGenreSongs: (genreId, params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    if (params.userId) qs.set('userId', params.userId);
    const url = `/api/genres/${genreId}/songs${qs.toString() ? `?${qs.toString()}` : ''}`;
    return request(url);
  },

  // Años con paginación
  getYears: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    if (params.userId) qs.set('userId', params.userId);
    if (params.search) qs.set('search', params.search);
    const url = `/api/years${qs.toString() ? `?${qs.toString()}` : ''}`;
    return request(url);
  },

  getYearSongs: (year, params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    if (params.userId) qs.set('userId', params.userId);
    const url = `/api/years/${year}/songs${qs.toString() ? `?${qs.toString()}` : ''}`;
    return request(url);
  },

  getLikedSongs: (userId, params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    if (userId) qs.set('userId', userId);
    const url = `/api/liked-songs${qs.toString() ? `?${qs.toString()}` : ''}`;
    return request(url);
  },
  getFavoriteArtists: (userId) => request(`/api/favorite-artists?userId=${userId}`),
  
  toggleFavoriteArtist: (artist, userId) => request('/api/favorite-artists/toggle', {
    method: 'POST',
    body: JSON.stringify({ artist, userId }),
  }),

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