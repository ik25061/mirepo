import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREFS_PATH = path.join(__dirname, 'prefs.json');

// Estructura: { songs: { song_id: { liked, hidden, deleted } }, artists: { artist_name: hidden } }
let prefs = { songs: {}, artists: {} };

function loadPrefs() {
  try {
    if (fs.existsSync(PREFS_PATH)) {
      const data = fs.readFileSync(PREFS_PATH, 'utf8');
      prefs = JSON.parse(data);
      if (!prefs.songs) prefs.songs = {};
      if (!prefs.artists) prefs.artists = {};
      console.log(`[db] 📋 ${Object.keys(prefs.songs).length} preferencias cargadas.`);
    }
  } catch (err) {
    console.warn('[db] Error cargando prefs:', err.message);
  }
}

function savePrefs() {
  try {
    fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2));
  } catch (err) {
    console.warn('[db] Error guardando prefs:', err.message);
  }
}

loadPrefs();

export async function getSongPrefs() {
  return prefs.songs;
}

export async function getHiddenArtists() {
  const hidden = new Set();
  for (const [artist, data] of Object.entries(prefs.artists)) {
    if (data === true || data?.hidden === true) {
      hidden.add(artist);
    }
  }
  return hidden;
}

export async function setSongFlag(song, field, value) {
  if (!prefs.songs[song.id]) {
    prefs.songs[song.id] = {};
  }
  prefs.songs[song.id][field] = value;
  savePrefs();
}

export async function setArtistHidden(artist, hidden) {
  prefs.artists[artist] = hidden;
  savePrefs();
}

export async function deleteSongFromPrefs(songId) {
  if (prefs.songs[songId]) {
    delete prefs.songs[songId];
    savePrefs();
    console.log(`[db] 🗑️ Preferencias eliminadas para canción ${songId}`);
  }
}

export { prefs };