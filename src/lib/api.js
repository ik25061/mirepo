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
    try {
      const response = await fetch(`${baseUrl}/api/test`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return false;
  }
}

export async function detectServerIP() {
  if (typeof window === 'undefined') {
    return '';
  }

  let storedUrl = window.localStorage.getItem(API_URL_STORAGE_KEY);
  if (storedUrl) {
    try {
      const storedPort = new URL(storedUrl).port;
      if (storedPort && storedPort !== DEFAULT_PORT) {
        console.warn(`⚠️ Puerto guardado (${storedPort}) obsoleto. Se re-detectará el servidor en el puerto ${DEFAULT_PORT}.`);
        window.localStorage.removeItem(API_URL_STORAGE_KEY);
        storedUrl = null;
      } else if (!navigator.onLine || await probeServer(storedUrl)) {
        API_URL = storedUrl.replace(/\/$/, '');
        return API_URL;
      } else {
        console.warn('[API] El servidor guardado no responde; se intentará detectar de nuevo.');
        window.localStorage.removeItem(API_URL_STORAGE_KEY);
        storedUrl = null;
      }
    } catch {
      window.localStorage.removeItem(API_URL_STORAGE_KEY);
      storedUrl = null;
    }
  }

  // La web utiliza rutas relativas (mismo origen o proxy de Vite).
  // Solo se usa una URL absoluta cuando se configura VITE_SERVER_HOST.
  // No se sondea localhost ni se muestran prompts al usuario.
  if (!navigator.onLine || !DEFAULT_HOST.trim()) return '';

  let configuredUrl;
  try {
    const host = DEFAULT_HOST.includes('://') ? DEFAULT_HOST : `http://${DEFAULT_HOST}`;
    const parsedUrl = new URL(host);
    if (!parsedUrl.port) parsedUrl.port = DEFAULT_PORT;
    configuredUrl = parsedUrl.origin;
  } catch {
    console.warn('[API] VITE_SERVER_HOST no contiene una dirección válida.');
    return '';
  }

  if (await probeServer(configuredUrl)) {
    API_URL = configuredUrl;
    window.localStorage.setItem(API_URL_STORAGE_KEY, API_URL);
    return API_URL;
  }

  return '';
}

export function getApiUrl() {
  return API_URL;
}

async function ensureApiUrl() {
  if (API_URL) return API_URL;
  if (!apiUrlPromise) {
    apiUrlPromise = detectServerIP()
      .catch((err) => {
        console.warn('No se pudo inicializar la URL del servidor:', err);
        return '';
      })
      .finally(() => {
        // Si el inicio ocurrió offline, permitir un nuevo intento al reconectar.
        if (!API_URL) apiUrlPromise = null;
      });
  }
  return apiUrlPromise;
}
// Si la conexión vuelve, descartar una URL fallida o una detección vacía.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    API_URL = '';
    apiUrlPromise = null;
  });
}

// ====== FUNCIONES DE API ======

async function request(url, options = {}) {
  const baseUrl = await ensureApiUrl();
  const fullUrl = `${baseUrl}${url}`;
  console.log('📡 Petición a:', fullUrl || url);
  
  try {
    // El token se lee en cada petición para reflejar inmediatamente login/logout
    // sin reconstruir el cliente ni mantener una copia obsoleta en memoria.
    const token = typeof window !== 'undefined'
      ? window.localStorage.getItem('mirepo_token')
      : null;

    const response = await fetch(fullUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  getLyrics: (songId) => request(`/api/lyrics/${encodeURIComponent(songId)}`),
  rescanStreamUrl: () => `${getApiUrl() || ''}/api/rescan-stream`,

  like: (id, liked, userId) => 
    request(`/api/songs/${id}/like`, {
      method: 'POST',
      body: JSON.stringify({ liked, userId }),
    }),

  hideSong: (id, userId, hidden = true) =>
    request(`/api/songs/${id}/hide`, {
      method: 'POST',
      body: JSON.stringify({ userId, hidden }),
    }),

  getHiddenSongs: (userId, params = {}) => {
    const qs = new URLSearchParams({ userId: String(userId) });
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    return request(`/api/hidden-songs?${qs.toString()}`);
  },

  getDeferredDeletions: (userId, params = {}) => {
    const qs = new URLSearchParams({ userId: String(userId) });
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    return request(`/api/deferred-deletions?${qs.toString()}`);
  },

  setDeferredDeletion: (id, userId, marked = true) =>
    request(`/api/songs/${id}/deferred-deletion`, {
      method: 'POST',
      body: JSON.stringify({ userId, marked }),
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
  createPlayList: (name, description, userId, isPublic = false) =>
    request('/api/playlists', {
      method: 'POST',
      body: JSON.stringify({ name, description, userId, isPublic }),
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
  updatePlayList: (id, patch) => request(`/api/playlists/${id}`, { method: 'PATCH', body: JSON.stringify(patch || {}) }),

  updateSong: (id, fields) => request(`/api/songs/${id}`, { method: 'PUT', body: JSON.stringify(fields || {}) }),
  setSongGenres: (id, genres) => request(`/api/songs/${id}/genres`, { method: 'PUT', body: JSON.stringify({ genres }) }),
  setSongMoods: (id, moods) => request(`/api/songs/${id}/moods`, { method: 'PUT', body: JSON.stringify({ moods }) }),

  createGenre: (name) => request('/api/genres', { method: 'POST', body: JSON.stringify({ name }) }),
  renameGenre: (id, name) => request(`/api/genres/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteGenre: (id) => request(`/api/genres/${id}`, { method: 'DELETE' }),

  getMoods: () => request('/api/moods'),
  createMood: (name, color) => request('/api/moods', { method: 'POST', body: JSON.stringify({ name, color }) }),
  renameMood: (id, name, color) => request(`/api/moods/${id}`, { method: 'PUT', body: JSON.stringify({ name, color }) }),
  deleteMood: (id) => request(`/api/moods/${id}`, { method: 'DELETE' }),
  getMoodSongs: (moodId, params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    if (params.userId) qs.set('userId', params.userId);
    return request(`/api/moods/${moodId}/songs${qs.toString() ? `?${qs.toString()}` : ''}`);
  },

  getUserSettings: (userId) => request(`/api/users/${userId}/settings`),
  updateUserSettings: (userId, patch) => request(`/api/users/${userId}/settings`, { method: 'PUT', body: JSON.stringify(patch || {}) }),

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

  getPodcasts: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    if (params.search) qs.set('search', params.search);
    const url = `/api/podcasts${qs.toString() ? `?${qs.toString()}` : ''}`;
    return request(url);
  },
  getPodcast: (id) => request(`/api/podcasts/${id}`),
  getPodcastTx: (id, lang = 'es') => request(`/api/podcasts/${id}/transcript?lang=${lang}`),
  rescanPodcasts: () => request('/api/podcasts/rescan', { method: 'POST' }),
};

export const audioUrl = (id) => `${getApiUrl() || ''}/audio/${id}`;
export const coverUrl = (id) => `${getApiUrl() || ''}/cover/${id}`;
export const artistCoverUrl = (artist) => `${getApiUrl() || ''}/artist-cover/${encodeURIComponent(artist)}`;
export const podcastAudioUrl = (id) => `${getApiUrl() || ''}/podcast-audio/${id}`;
export const podcastCoverUrl = (id) => `${getApiUrl() || ''}/podcast-cover/${id}`;
export const podcastImageUrl = (id, idx) => `${getApiUrl() || ''}/podcast-image/${id}/${idx}`;
export const serverUrl = getApiUrl();