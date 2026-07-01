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
    fs.writeFileSync(PREFS_PATH, JSON.stringify({ songs: {}, artists: {} }, null, 2));
  }
  return true;
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

// ====== PREFERENCIAS ======
let prefsCache = null;

function loadPrefs() {
  try {
    if (fs.existsSync(PREFS_PATH)) {
      const data = fs.readFileSync(PREFS_PATH, 'utf8');
      prefsCache = JSON.parse(data);
      if (!prefsCache.songs) prefsCache.songs = {};
      if (!prefsCache.artists) prefsCache.artists = {};
      return prefsCache;
    }
  } catch (err) {
    console.warn('[db] Error cargando prefs:', err.message);
  }
  prefsCache = { songs: {}, artists: {} };
  return prefsCache;
}

function savePrefs() {
  try {
    fs.writeFileSync(PREFS_PATH, JSON.stringify(prefsCache, null, 2));
  } catch (err) {
    console.warn('[db] Error guardando prefs:', err.message);
  }
}

loadPrefs();

export async function getSongPrefs(userId) {
  return { ...prefsCache.songs };
}

export async function getHiddenArtists(userId) {
  const hidden = new Set();
  for (const [artist, data] of Object.entries(prefsCache.artists || {})) {
    if (data === true || data?.hidden === true) {
      hidden.add(artist);
    }
  }
  return hidden;
}

export async function setSongFlag(song, field, value, userId) {
  if (!prefsCache.songs[song.id]) {
    prefsCache.songs[song.id] = {};
  }
  prefsCache.songs[song.id][field] = value;
  savePrefs();
}

export async function setArtistHidden(artist, hidden, userId) {
  prefsCache.artists[artist] = hidden;
  savePrefs();
}

export async function deleteSongFromPrefs(songId, userId) {
  if (prefsCache.songs[songId]) {
    delete prefsCache.songs[songId];
    savePrefs();
  }
}

export async function addPlayHistory(userId, songId) {
  // No implementado en versión simple
}

export async function getPlayHistory(userId, limit = 100) {
  return [];
}

export { prefsCache as prefs };