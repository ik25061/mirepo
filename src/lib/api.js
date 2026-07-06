// ====== CONFIGURACIÓN - RUTAS RELATIVAS ======
// Usar rutas relativas para que el proxy de Vite funcione

async function post(url, body) {
  const res = await fetch(url, {
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
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

async function del(url, body) {
  const res = await fetch(url, {
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
    const url = `/api/library${qs.toString() ? `?${qs.toString()}` : ''}`;
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
    return fetch(`/api/artists${qs}`).then(r => r.json());
  },
  getAlbums: (userId) => {
    const qs = userId ? `?userId=${userId}` : '';
    return fetch(`/api/albums${qs}`).then(r => r.json());
  },
  getGenres: (userId) => {
    const qs = userId ? `?userId=${userId}` : '';
    return fetch(`/api/genres${qs}`).then(r => r.json());
  },
  getYears: (userId) => {
    const qs = userId ? `?userId=${userId}` : '';
    return fetch(`/api/years${qs}`).then(r => r.json());
  },
  getLikedSongs: (userId) => {
    const qs = userId ? `?userId=${userId}&liked=true` : '?liked=true';
    return fetch(`/api/library${qs}`).then(r => r.json());
  },
  // ====== PLAY LISTS ======
  getPlayLists: (userId) => {
    const qs = userId ? `?userId=${userId}` : '';
    return fetch(`/api/playlists${qs}`).then(r => r.json());
  },
  getPlayList: (id) => fetch(`/api/playlists/${id}`).then(r => r.json()),
  createPlayList: (name, description, userId) => post('/api/playlists', { name, description, userId }),
  addSongToPlayList: (playlistId, songId) => post(`/api/playlists/${playlistId}/songs`, { songId }),
  removeSongFromPlayList: (playlistId, songId) => {
    return fetch(`/api/playlists/${playlistId}/songs`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId })
    }).then(r => r.json());
  },
  deletePlayList: (id) => {
    return fetch(`/api/playlists/${id}`, { method: 'DELETE' }).then(r => r.json());
  },
};

// ====== URLs DE AUDIO E IMÁGENES ======
export const audioUrl = (id) => `/audio/${id}`;
export const coverUrl = (id) => `/cover/${id}`;
export const artistCoverUrl = (artist) => `/artist-cover/${encodeURIComponent(artist)}`;
export const serverUrl = '';