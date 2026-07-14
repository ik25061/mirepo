/**
 * ============================================================
 * DB - BASE DE DATOS (JSON)
 * ============================================================
 * 
 * Gestiona usuarios, preferencias (likes, hides) y playlists.
 * Todos los datos se almacenan en archivos JSON.
 * 
 * Archivos:
 * - users.json: Usuarios registrados
 * - prefs.json: Preferencias por usuario (likes, hides)
 * - playlists.json: Listas de reproducción
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREFS_PATH = path.join(__dirname, 'prefs.json');
const USERS_PATH = path.join(__dirname, 'users.json');
const PLAY_LISTS_PATH = path.join(__dirname, 'playlists.json');

// ============================================================
// 1. INICIALIZACIÓN
// ============================================================

export async function initDatabase() {
  console.log('[db] 📚 Inicializando base de datos...');
  
  // Asegurar que el directorio existe
  const serverDir = path.dirname(PREFS_PATH);
  if (!fs.existsSync(serverDir)) {
    fs.mkdirSync(serverDir, { recursive: true });
  }
  
  // Crear users.json si no existe
  if (!fs.existsSync(USERS_PATH)) {
    fs.writeFileSync(USERS_PATH, JSON.stringify({ users: [] }, null, 2));
    console.log('[db] ✅ users.json creado');
  }
  
  // Crear prefs.json si no existe
  if (!fs.existsSync(PREFS_PATH)) {
    fs.writeFileSync(PREFS_PATH, JSON.stringify({}, null, 2));
    console.log('[db] ✅ prefs.json creado');
  } else {
    // Migrar formato antiguo a nuevo si es necesario
    try {
      const data = JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8'));
      // Si el formato es antiguo (tiene 'songs' o 'artists' en la raíz)
      if (data.songs !== undefined || data.artists !== undefined) {
        console.log('[db] 🔄 Migrando preferencias del formato antiguo al nuevo...');
        const newPrefs = {
          "0": {
            songs: data.songs || {},
            artists: data.artists || {}
          }
        };
        fs.writeFileSync(PREFS_PATH, JSON.stringify(newPrefs, null, 2));
        console.log('[db] ✅ Migración completada');
      }
    } catch (err) {
      console.warn('[db] ⚠️ Error en migración:', err.message);
    }
  }
  
  // Crear playlists.json si no existe
  if (!fs.existsSync(PLAY_LISTS_PATH)) {
    fs.writeFileSync(PLAY_LISTS_PATH, JSON.stringify({ playlists: [] }, null, 2));
    console.log('[db] ✅ playlists.json creado');
  }
  
  console.log('[db] ✅ Base de datos inicializada');
  return true;
}

// ============================================================
// 2. USUARIOS
// ============================================================

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

export async function getAllUsers() {
  const data = loadUsers();
  return data.users;
}

// ============================================================
// 3. PREFERENCIAS (por usuario)
// ============================================================

let prefsCache = null;

function loadPrefs() {
  try {
    if (fs.existsSync(PREFS_PATH)) {
      const data = fs.readFileSync(PREFS_PATH, 'utf8');
      prefsCache = JSON.parse(data);
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
  // Asegurar que prefsCache está cargado
  if (prefsCache === null) {
    loadPrefs();
  }
  const uid = String(userId || '0');
  if (!prefsCache[uid]) {
    prefsCache[uid] = { songs: {}, artists: {} };
  }
  if (!prefsCache[uid].songs) prefsCache[uid].songs = {};
  if (!prefsCache[uid].artists) prefsCache[uid].artists = {};
  return prefsCache[uid];
}

// Cargar preferencias al iniciar
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
  console.log(`[db] ✅ ${field}=${value} para canción ${song.id} (usuario ${userId || 'anon'})`);
}

export async function setArtistHidden(artist, hidden, userId) {
  const userPrefs = getUserPrefs(userId);
  userPrefs.artists[artist] = hidden;
  savePrefs();
  console.log(`[db] ✅ Artista "${artist}" ${hidden ? 'oculto' : 'visible'} (usuario ${userId || 'anon'})`);
}

export async function deleteSongFromPrefs(songId, userId) {
  const userPrefs = getUserPrefs(userId);
  if (userPrefs.songs[songId]) {
    delete userPrefs.songs[songId];
    savePrefs();
    console.log(`[db] 🗑️ Preferencias eliminadas para canción ${songId}`);
  }
}

export async function addPlayHistory(userId, songId) {
  // No implementado en versión simple
}

export async function getPlayHistory(userId, limit = 100) {
  return [];
}

// ============================================================
// 4. PLAY LISTS
// ============================================================

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
  console.log(`[db] 📋 Playlist "${name}" creada (ID: ${playlist.id})`);
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
    console.log(`[db] ➕ Canción ${songId} agregada a playlist ${playlistId}`);
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
  console.log(`[db] ➖ Canción ${songId} eliminada de playlist ${playlistId}`);
  return playlist;
}

export async function deletePlayList(id) {
  const data = loadPlayLists();
  data.playlists = data.playlists.filter(p => p.id !== id);
  savePlayLists(data);
  console.log(`[db] 🗑️ Playlist ${id} eliminada`);
  return true;
}

//====================================
// ARTISTAS FAVORITOS
// ============================================================

export async function getFavoriteArtists(userId) {
  const userPrefs = getUserPrefs(userId);
  return userPrefs.favoriteArtists || [];
}

export async function toggleFavoriteArtist(artist, userId) {
  const userPrefs = getUserPrefs(userId);
  if (!userPrefs.favoriteArtists) userPrefs.favoriteArtists = [];
  const index = userPrefs.favoriteArtists.indexOf(artist);
  if (index === -1) {
    userPrefs.favoriteArtists.push(artist);
  } else {
    userPrefs.favoriteArtists.splice(index, 1);
  }
  savePrefs();
  return userPrefs.favoriteArtists;
}

// ============================================================
// 5. EXPORTACIONES
// ============================================================

export const prefs = prefsCache;
