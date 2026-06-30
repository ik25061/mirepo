// ====== CONFIGURACIÓN DE IP ======
// Cambia esta variable según la computadora donde estés trabajando
// En desarrollo, Vite proxy redirige las peticiones al backend,
// así que usamos rutas relativas para evitar Mixed Content con HTTPS.
// Para conexión directa (sin proxy Vite), usa la IP del servidor.
const DIRECT = false; // Cambiar a true para conectar directo sin proxy Vite
const SERVER_IP = '172.16.12.4';
// const SERVER_IP = '192.168.1.152';

const API_URL = DIRECT ? `https://${SERVER_IP}:5001` : '';
async function post(url, body) {
  const res = await fetch(`${API_URL}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
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
    const url = `${API_URL}/api/library${qs.toString() ? `?${qs.toString()}` : ''}`;
    return fetch(url).then((r) => r.json());
  },
  rescan: () => post('/api/rescan'),
  like: (id, liked) => post(`/api/songs/${id}/like`, { liked }),
  hideSong: (id) => post(`/api/songs/${id}/hide`),
  deleteSong: (id) => del('/api/songs', { id }),
  hideArtist: (artist) => post('/api/artists/hide', { artist }),
  syncMetadata: (filename) => put('/api/songs/sync-metadata', { filename }),
  recognize: (audioBlob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    return fetch(`${API_URL}/api/recognize`, {
      method: 'POST',
      body: formData,
    }).then((r) => r.json());
  },
  scanDuplicates: (folderPath) => post('/api/scan', { folderPath }),
  deleteDuplicate: (filePath) => del('/api/delete-duplicate', { filePath }),
  fixMetadata: (filePath) => post('/api/fix-metadata', { filePath }),
};

export const audioUrl = (id) => `${API_URL}/audio/${id}`;
export const serverUrl = API_URL;
export const coverUrl = (id) => `${API_URL}/cover/${id}`;
export const artistCoverUrl = (artist) => `${API_URL}/artist-cover/${encodeURIComponent(artist)}`;