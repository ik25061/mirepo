// ====== CONFIGURACIÓN DE IP ======
// Cambia esta variable según la computadora donde estés trabajando
const SERVER_IP = '172.16.12.4';
// const SERVER_IP = '192.168.1.152';

const API_URL = `http://${SERVER_IP}:5000`;

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
  getLibrary: () => fetch(`${API_URL}/api/library`).then((r) => r.json()),
  rescan: () => post('/api/rescan'),
  like: (id, liked) => post(`/api/songs/${id}/like`, { liked }),
  hideSong: (id) => post(`/api/songs/${id}/hide`),
  deleteSong: (filename) => del('/api/songs', { filename }),
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
};

export const audioUrl = (id) => `${API_URL}/audio/${id}`;
export const coverUrl = (id) => `${API_URL}/cover/${id}`;
export const artistCoverUrl = (artist) => `${API_URL}/artist-cover/${encodeURIComponent(artist)}`;