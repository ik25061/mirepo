// ====== CONFIGURACIÓN DE IP DINÁMICA ======
let API_URL = '';

export async function detectServerIP() {
  // Usar la IP desde donde se sirve la página
  const host = window.location.hostname;
  const port = '5001';
  
  // Si es localhost, usar localhost
  if (host === 'localhost' || host === '127.0.0.1') {
    API_URL = `http://localhost:${port}`;
  } else {
    // Usar la IP del host actual
    API_URL = `http://${host}:${port}`;
  }
  
  console.log(`📡 Usando URL: ${API_URL}`);
  return API_URL;
}

// Detectar IP al cargar
detectServerIP();

export function getApiUrl() {
  return API_URL;
}

// ====== FUNCIONES DE API ======

async function post(url, body) {
  const res = await fetch(`${API_URL}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Error ${res.status}: ${errorText}`);
  }
  return res.json();
}

async function put(url, body) {
  const res = await fetch(`${API_URL}${url}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

async function del(url, body) {
  const res = await fetch(`${API_URL}${url}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export const api = {
  getLibrary: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    if (params.userId) qs.set('userId', String(params.userId));
    const url = `${API_URL}/api/library${qs.toString() ? `?${qs.toString()}` : ''}`;
    console.log('[api] GET Library:', url);
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Error ${r.status}`);
      return r.json();
    });
  },
  rescan: () => post('/api/rescan'),
  like: (id, liked, userId) => post(`/api/songs/${id}/like`, { liked, userId }),
  hideSong: (id, userId) => post(`/api/songs/${id}/hide`, { userId }),
  deleteSong: (id, userId) => del('/api/songs', { id, userId }),
  hideArtist: (artist, userId) => post('/api/artists/hide', { artist, userId }),
  getConfigIp: () => fetch('/api/config/ip').then(r => r.json()),
  scanDuplicates: (folderPath) => post('/api/scan', { folderPath }),
  deleteDuplicate: (filePath) => del('/api/delete-duplicate', { filePath }),
  fixMetadata: (filePath) => post('/api/fix-metadata', { filePath }),
  getArtists: (userId) => {
    const qs = userId ? `?userId=${userId}` : '';
    return fetch(`${API_URL}/api/artists${qs}`).then(r => r.json());
  },
  getAlbums: (userId) => {
    const qs = userId ? `?userId=${userId}` : '';
    return fetch(`${API_URL}/api/albums${qs}`).then(r => r.json());
  },
  getGenres: () => fetch(`${API_URL}/api/genres`).then(r => r.json()),
  getLikedSongs: (userId) => {
    const qs = userId ? `?userId=${userId}&liked=true` : '?liked=true';
    return fetch(`${API_URL}/api/library${qs}`).then(r => r.json());
  },
  // ====== PLAY LISTS ======
  getPlayLists: (userId) => {
    const qs = userId ? `?userId=${userId}` : '';
    return fetch(`${API_URL}/api/playlists${qs}`).then(r => r.json());
  },
  getPlayList: (id) => fetch(`${API_URL}/api/playlists/${id}`).then(r => r.json()),
  createPlayList: (name, description, userId) => post('/api/playlists', { name, description, userId }),
  addSongToPlayList: (playlistId, songId) => post(`/api/playlists/${playlistId}/songs`, { songId }),
  removeSongFromPlayList: (playlistId, songId) => {
    return fetch(`${API_URL}/api/playlists/${playlistId}/songs`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId })
    }).then(r => r.json());
  },
  deletePlayList: (id) => {
    return fetch(`${API_URL}/api/playlists/${id}`, { method: 'DELETE' }).then(r => r.json());
  },
};

// ====== URLs DE AUDIO E IMÁGENES ======
export const audioUrl = (id) => `${API_URL}/audio/${id}`;
export const coverUrl = (id) => `${API_URL}/cover/${id}`;
export const artistCoverUrl = (artist) => `${API_URL}/artist-cover/${encodeURIComponent(artist)}`;
export const serverUrl = API_URL;