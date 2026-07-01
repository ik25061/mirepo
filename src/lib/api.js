// ====== CONFIGURACIÓN DE IP DINÁMICA ======
let API_URL = '';
let SERVER_IP = 'localhost';
let SERVER_PORT = 5001;

export async function detectServerIP() {
  try {
    const response = await fetch('/api/config/ip');
    if (response.ok) {
      const data = await response.json();
      SERVER_IP = data.ip;
      SERVER_PORT = data.port;
      API_URL = data.serverUrl || `http://${SERVER_IP}:${SERVER_PORT}`;
      console.log(`📡 Servidor detectado: ${API_URL}`);
      return API_URL;
    }
  } catch (err) {
    console.warn('⚠️ No se pudo detectar IP automáticamente, usando localhost');
  }
  
  const host = window.location.hostname;
  const port = '5001';
  API_URL = `http://${host}:${port}`;
  return API_URL;
}

// Detectar IP al cargar
detectServerIP();

export function getApiUrl() {
  return API_URL;
}

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
    if (params.userId) qs.set('userId', String(params.userId));
    const url = `${API_URL}/api/library${qs.toString() ? `?${qs.toString()}` : ''}`;
    return fetch(url).then((r) => r.json());
  },
  rescan: () => post('/api/rescan'),
  like: (id, liked, userId) => post(`/api/songs/${id}/like`, { liked, userId }),
  hideSong: (id, userId) => post(`/api/songs/${id}/hide`, { userId }),
  deleteSong: (id, userId) => del('/api/songs', { id, userId }),
  hideArtist: (artist, userId) => post('/api/artists/hide', { artist, userId }),
  getConfigIp: () => fetch('/api/config/ip').then(r => r.json()),
};

export const audioUrl = (id) => `${API_URL}/audio/${id}`;
export const coverUrl = (id) => `${API_URL}/cover/${id}`;
export const artistCoverUrl = (artist) => `${API_URL}/artist-cover/${encodeURIComponent(artist)}`;
export const serverUrl = API_URL;