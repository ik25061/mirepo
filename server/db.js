import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREFS_PATH = path.join(__dirname, 'prefs.json');
const USERS_PATH = path.join(__dirname, 'users.json');

// ====== INICIALIZAR ======
export async function initDatabase() {
  console.log('[db] 📚 Base de datos JSON inicializada');
  if (!fs.existsSync(USERS_PATH)) {
    fs.writeFileSync(USERS_PATH, JSON.stringify({ users: [] }, null, 2));
  }
  if (!fs.existsSync(PREFS_PATH)) {
    fs.writeFileSync(PREFS_PATH, JSON.stringify({}, null, 2));
  } else {
    // Migrar formato antiguo (global) a nuevo formato (por usuario)
    migrateOldPrefs();
  }
  return true;
}

// ====== MIGRACIÓN DE FORMATO ANTIGUO A NUEVO ======
function migrateOldPrefs() {
  try {
    const data = JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8'));
    
    // Si ya tiene el nuevo formato (objeto con userId como clave), no migrar
    if (!data.songs && !data.artists) return;
    
    // Si está vacío, inicializar
    if (Object.keys(data).length === 0) return;
    
    console.log('[db] 🔄 Migrando preferencias del formato antiguo al nuevo...');
    
    // El formato antiguo era { songs: { [songId]: {...} }, artists: { [artist]: true/false } }
    // Convertir a: { "0": { songs: {...}, artists: {...} } } (userId "0" = anónimo)
    const newPrefs = {
      "0": {
        songs: data.songs || {},
        artists: data.artists || {}
      }
    };
    
    fs.writeFileSync(PREFS_PATH, JSON.stringify(newPrefs, null, 2));
    console.log('[db] ✅ Migración completada');
  } catch (err) {
    console.warn('[db] ⚠️ Error en migración:', err.message);
  }
}

// ====== USUARIOS ======
function loadUsers() {
  try {
    if (fs.existsSync(USERS_PATH)) {
      const data = fs.readFileSync(USERS_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('[db] Error cargando usuarios:', err.message);
  }
  return { users: [] };
}

function saveUsers(data) {
  try {
    fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('[db] Error guardando usuarios:', err.message);
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return derived === hash;
}

export async function createUser(username, password) {
  console.log('[db] 📝 Creando usuario:', username);
  const data = loadUsers();
  
  if (data.users.find(u => u.username === username)) {
    throw new Error('El usuario ya existe');
  }

  const { salt, hash } = hashPassword(password);
  const user = {
    id: data.users.length + 1,
    username,
    salt,
    password_hash: hash,
    session_token: null,
    created_at: new Date().toISOString()
  };
  
  data.users.push(user);
  saveUsers(data);
  console.log(`[db] ✅ Usuario "${username}" (ID: ${user.id}) creado`);
  return { id: user.id, username: user.username };
}

export async function findUser(username, password) {
  console.log('[db] 🔍 Buscando usuario:', username);
  const data = loadUsers();
  const user = data.users.find(u => u.username === username);
  
  if (!user) {
    console.log('[db] ❌ Usuario no encontrado');
    return null;
  }
  
  console.log('[db] 👤 Usuario encontrado, verificando contraseña...');
  if (!verifyPassword(password, user.salt, user.password_hash)) {
    console.log('[db] ❌ Contraseña incorrecta');
    return null;
  }
  
  console.log('[db] ✅ Contraseña correcta');
  return user;
}

export async function getUserByToken(token) {
  const data = loadUsers();
  return data.users.find(u => u.session_token === token) || null;
}

export async function updateUserSession(userId, token) {
  console.log('[db] 🔑 Actualizando sesión para usuario:', userId);
  const data = loadUsers();
  const user = data.users.find(u => u.id === userId);
  if (user) {
    user.session_token = token;
    saveUsers(data);
    console.log('[db] ✅ Sesión actualizada');
  }
}

export async function clearUserSession(token) {
  const data = loadUsers();
  const user = data.users.find(u => u.session_token === token);
  if (user) {
    user.session_token = null;
    saveUsers(data);
  }
}

// ====== PREFERENCIAS (ahora por usuario) ======
let prefsCache = null;

function loadPrefs() {
  try {
    if (fs.existsSync(PREFS_PATH)) {
      const data = fs.readFileSync(PREFS_PATH, 'utf8');
      prefsCache = JSON.parse(data);
      // Asegurar que sea un objeto
      if (typeof prefsCache !== 'object' || prefsCache === null) {
        prefsCache = {};
      }
      return prefsCache;
    }
  } catch (err) {
    console.warn('[db] Error cargando prefs:', err.message);
  }
  prefsCache = {};
  return prefsCache;
}

function savePrefs() {
  try {
    fs.writeFileSync(PREFS_PATH, JSON.stringify(prefsCache, null, 2));
  } catch (err) {
    console.warn('[db] Error guardando prefs:', err.message);
  }
}

function getUserPrefs(userId) {
  const uid = String(userId || '0');
  if (!prefsCache[uid]) {
    prefsCache[uid] = { songs: {}, artists: {} };
  }
  if (!prefsCache[uid].songs) prefsCache[uid].songs = {};
  if (!prefsCache[uid].artists) prefsCache[uid].artists = {};
  return prefsCache[uid];
}

loadPrefs();

export async function getSongPrefs(userId) {
  const userPrefs = getUserPrefs(userId);
  return { ...userPrefs.songs };
}

export async function getHiddenArtists(userId) {
  const userPrefs = getUserPrefs(userId);
  const hidden = new Set();
  for (const [artist, data] of Object.entries(userPrefs.artists || {})) {
    if (data === true || data?.hidden === true) {
      hidden.add(artist);
    }
  }
  return hidden;
}

export async function setSongFlag(song, field, value, userId) {
  const userPrefs = getUserPrefs(userId);
  if (!userPrefs.songs[song.id]) {
    userPrefs.songs[song.id] = {};
  }
  userPrefs.songs[song.id][field] = value;
  savePrefs();
}

export async function setArtistHidden(artist, hidden, userId) {
  const userPrefs = getUserPrefs(userId);
  userPrefs.artists[artist] = hidden;
  savePrefs();
}

export async function deleteSongFromPrefs(songId, userId) {
  const userPrefs = getUserPrefs(userId);
  if (userPrefs.songs[songId]) {
    delete userPrefs.songs[songId];
    savePrefs();
  }
}

export async function addPlayHistory(userId, songId) {
  // No implementado en versión simple
}

export async function getPlayHistory(userId, limit = 100) {
  return [];
}

// ====== PLAY LISTS ======
const PLAY_LISTS_PATH = path.join(__dirname, 'playlists.json');

function loadPlayLists() {
  try {
    if (fs.existsSync(PLAY_LISTS_PATH)) {
      return JSON.parse(fs.readFileSync(PLAY_LISTS_PATH, 'utf8'));
    }
  } catch (err) {
    console.warn('[db] Error cargando playlists:', err.message);
  }
  return { playlists: [] };
}

function savePlayLists(data) {
  try {
    fs.writeFileSync(PLAY_LISTS_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('[db] Error guardando playlists:', err.message);
  }
}

export async function createPlayList(name, description, userId) {
  const data = loadPlayLists();
  const playlist = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: name.trim(),
    description: description?.trim() || '',
    userId: userId || null,
    songIds: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  data.playlists.push(playlist);
  savePlayLists(data);
  return playlist;
}

export async function getPlayLists(userId) {
  const data = loadPlayLists();
  if (userId) {
    return data.playlists.filter(p => p.userId === null || p.userId === String(userId));
  }
  return data.playlists;
}

export async function getPlayList(id) {
  const data = loadPlayLists();
  return data.playlists.find(p => p.id === id) || null;
}

export async function addSongToPlayList(playlistId, songId) {
  const data = loadPlayLists();
  const playlist = data.playlists.find(p => p.id === playlistId);
  if (!playlist) return null;
  if (!playlist.songIds.includes(songId)) {
    playlist.songIds.push(songId);
    playlist.updated_at = new Date().toISOString();
    savePlayLists(data);
  }
  return playlist;
}

export async function removeSongFromPlayList(playlistId, songId) {
  const data = loadPlayLists();
  const playlist = data.playlists.find(p => p.id === playlistId);
  if (!playlist) return null;
  playlist.songIds = playlist.songIds.filter(id => id !== songId);
  playlist.updated_at = new Date().toISOString();
  savePlayLists(data);
  return playlist;
}

export async function deletePlayList(id) {
  const data = loadPlayLists();
  data.playlists = data.playlists.filter(p => p.id !== id);
  savePlayLists(data);
  return true;
}

export { prefsCache as prefs };
