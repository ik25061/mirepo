import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'mirepo.db');
const PREFS_PATH = path.join(__dirname, 'prefs.json');

// ====== SINGLETON DB ======
let db = null;

export async function initDatabase() {
  if (db) return db;
  
  try {
    // Abrir base de datos
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    // Habilitar claves foráneas y WAL
    await db.exec('PRAGMA foreign_keys = ON');
    await db.exec('PRAGMA journal_mode = WAL');

    // ====== TABLA: USUARIOS ======
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        session_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ====== TABLA: PREFERENCIAS DE USUARIO ======
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_prefs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        song_id TEXT NOT NULL,
        field TEXT NOT NULL,
        value INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, song_id, field),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ====== TABLA: ARTISTAS OCULTOS POR USUARIO ======
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_hidden_artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        artist TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, artist),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ====== TABLA: HISTORIAL DE REPRODUCCIÓN (para shuffle) ======
    await db.exec(`
      CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        song_id TEXT NOT NULL,
        played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ====== TABLA: VERSION DE LA DB ======
    await db.exec(`
      CREATE TABLE IF NOT EXISTS db_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    
    // Verificar/actualizar versión
    const versionRow = await db.get('SELECT value FROM db_meta WHERE key = "version"');
    if (!versionRow) {
      await db.run('INSERT INTO db_meta (key, value) VALUES ("version", "1")');
    }

    console.log('[db] 📚 Base de datos SQLite inicializada correctamente');
    console.log(`[db] 📁 Ruta: ${DB_PATH}`);
    return db;
  } catch (err) {
    console.error('[db] ❌ Error inicializando base de datos:', err.message);
    throw err;
  }
}

// ====== FUNCIONES DE USUARIO ======

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
  const db = await initDatabase();
  
  // Verificar si el usuario ya existe
  const existing = await db.get('SELECT id FROM users WHERE username = ?', username);
  if (existing) {
    throw new Error('El usuario ya existe');
  }

  const { salt, hash } = hashPassword(password);
  const result = await db.run(
    'INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)',
    username, hash, salt
  );
  
  console.log(`[db] ✅ Usuario "${username}" (ID: ${result.lastID}) creado`);
  return { id: result.lastID, username };
}

export async function findUser(username, password) {
  const db = await initDatabase();
  const user = await db.get('SELECT * FROM users WHERE username = ?', username);
  
  if (!user) return null;
  if (!verifyPassword(password, user.salt, user.password_hash)) return null;
  
  return user;
}

export async function getUserByToken(token) {
  const db = await initDatabase();
  return await db.get('SELECT * FROM users WHERE session_token = ?', token);
}

export async function updateUserSession(userId, token) {
  const db = await initDatabase();
  await db.run(
    'UPDATE users SET session_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    token, userId
  );
}

export async function clearUserSession(token) {
  const db = await initDatabase();
  await db.run('UPDATE users SET session_token = NULL WHERE session_token = ?', token);
}

export async function getAllUsers() {
  const db = await initDatabase();
  return await db.all('SELECT id, username, created_at, updated_at FROM users ORDER BY id');
}

// ====== FUNCIONES DE PREFERENCIAS ======

// Cargar preferencias desde JSON (para compatibilidad con datos existentes)
let legacyPrefs = null;

function loadLegacyPrefs() {
  try {
    if (fs.existsSync(PREFS_PATH)) {
      const data = fs.readFileSync(PREFS_PATH, 'utf8');
      legacyPrefs = JSON.parse(data);
      if (!legacyPrefs.songs) legacyPrefs.songs = {};
      if (!legacyPrefs.artists) legacyPrefs.artists = {};
      return legacyPrefs;
    }
  } catch (err) {
    console.warn('[db] Error cargando prefs legacy:', err.message);
  }
  legacyPrefs = { songs: {}, artists: {} };
  return legacyPrefs;
}

loadLegacyPrefs();

export async function getSongPrefs(userId) {
  const db = await initDatabase();
  const prefs = {};
  
  // Si hay userId, cargar desde SQLite
  if (userId) {
    try {
      const rows = await db.all(
        'SELECT song_id, field, value FROM user_prefs WHERE user_id = ?',
        userId
      );
      for (const row of rows) {
        if (!prefs[row.song_id]) prefs[row.song_id] = {};
        prefs[row.song_id][row.field] = Boolean(row.value);
      }
    } catch (err) {
      console.warn('[db] Error cargando prefs de usuario:', err.message);
    }
  }
  
  // Si no hay userId o no hay prefs en SQLite, usar legacy
  if (Object.keys(prefs).length === 0 && legacyPrefs) {
    return { ...legacyPrefs.songs };
  }
  
  return prefs;
}

export async function getHiddenArtists(userId) {
  const db = await initDatabase();
  const hidden = new Set();
  
  // Artistas ocultos desde legacy (para compatibilidad)
  if (legacyPrefs?.artists) {
    for (const [artist, data] of Object.entries(legacyPrefs.artists)) {
      if (data === true || data?.hidden === true) {
        hidden.add(artist);
      }
    }
  }
  
  // Artistas ocultos desde SQLite (por usuario)
  if (userId) {
    try {
      const rows = await db.all(
        'SELECT artist FROM user_hidden_artists WHERE user_id = ?',
        userId
      );
      for (const row of rows) {
        hidden.add(row.artist);
      }
    } catch (err) {
      console.warn('[db] Error cargando artistas ocultos:', err.message);
    }
  }
  
  return hidden;
}

export async function setSongFlag(song, field, value, userId) {
  // Guardar en SQLite si hay userId
  if (userId) {
    try {
      const db = await initDatabase();
      await db.run(`
        INSERT INTO user_prefs (user_id, song_id, field, value) 
        VALUES (?, ?, ?, ?) 
        ON CONFLICT(user_id, song_id, field) 
        DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
      `, userId, song.id, field, value ? 1 : 0, value ? 1 : 0);
    } catch (err) {
      console.warn('[db] Error guardando preferencia:', err.message);
    }
  }
  
  // También guardar en legacy (compatibilidad)
  if (!legacyPrefs.songs[song.id]) {
    legacyPrefs.songs[song.id] = {};
  }
  legacyPrefs.songs[song.id][field] = value;
  try {
    fs.writeFileSync(PREFS_PATH, JSON.stringify(legacyPrefs, null, 2));
  } catch (err) {
    console.warn('[db] Error guardando prefs legacy:', err.message);
  }
}

export async function setArtistHidden(artist, hidden, userId) {
  // Guardar en SQLite si hay userId
  if (userId) {
    try {
      const db = await initDatabase();
      if (hidden) {
        await db.run(
          'INSERT OR IGNORE INTO user_hidden_artists (user_id, artist) VALUES (?, ?)',
          userId, artist
        );
      } else {
        await db.run(
          'DELETE FROM user_hidden_artists WHERE user_id = ? AND artist = ?',
          userId, artist
        );
      }
    } catch (err) {
      console.warn('[db] Error guardando artista oculto:', err.message);
    }
  }
  
  // Guardar en legacy
  legacyPrefs.artists[artist] = hidden;
  try {
    fs.writeFileSync(PREFS_PATH, JSON.stringify(legacyPrefs, null, 2));
  } catch (err) {
    console.warn('[db] Error guardando prefs legacy:', err.message);
  }
}

export async function deleteSongFromPrefs(songId, userId) {
  // Eliminar de SQLite
  if (userId) {
    try {
      const db = await initDatabase();
      await db.run(
        'DELETE FROM user_prefs WHERE user_id = ? AND song_id = ?',
        userId, songId
      );
    } catch (err) {
      console.warn('[db] Error eliminando preferencia:', err.message);
    }
  }
  
  // Eliminar de legacy
  if (legacyPrefs.songs[songId]) {
    delete legacyPrefs.songs[songId];
    try {
      fs.writeFileSync(PREFS_PATH, JSON.stringify(legacyPrefs, null, 2));
    } catch (err) {
      console.warn('[db] Error guardando prefs legacy:', err.message);
    }
  }
}

// ====== HISTORIAL DE REPRODUCCIÓN ======

export async function addPlayHistory(userId, songId) {
  if (!userId) return;
  try {
    const db = await initDatabase();
    await db.run(
      'INSERT INTO play_history (user_id, song_id) VALUES (?, ?)',
      userId, songId
    );
  } catch (err) {
    console.warn('[db] Error guardando historial:', err.message);
  }
}

export async function getPlayHistory(userId, limit = 100) {
  if (!userId) return [];
  try {
    const db = await initDatabase();
    return await db.all(
      'SELECT song_id, played_at FROM play_history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?',
      userId, limit
    );
  } catch (err) {
    console.warn('[db] Error cargando historial:', err.message);
    return [];
  }
}

export { legacyPrefs as prefs };