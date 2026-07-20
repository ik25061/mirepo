// ============================================================
// db.js - NUEVA CAPA DE DATOS SQLITE (CON CONEXIÓN PERSISTENTE)
// ============================================================

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'localfy.db');

// ============================================================
// CONEXIÓN PERSISTENTE
// ============================================================

let db = null;
let dbReady = false;
let dbPromise = null;

/**
 * Obtiene la conexión a la base de datos (singleton)
 */
async function getDb() {
  if (db && dbReady) return db;
  
  if (dbPromise) return dbPromise;
  
  dbPromise = (async () => {
    try {
      db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database,
      });
      
      // Activar claves foráneas
      await db.exec('PRAGMA foreign_keys = ON');
      // Mejorar rendimiento
      await db.exec('PRAGMA journal_mode = WAL');
      await db.exec('PRAGMA synchronous = NORMAL');
      
      dbReady = true;
      console.log('[db] ✅ Conectado a localfy.db (persistente)');
      return db;
    } catch (err) {
      console.error('[db] ❌ Error conectando a localfy.db:', err);
      throw err;
    }
  })();
  
  return dbPromise;
}

/**
 * Cierra la conexión a la base de datos (para graceful shutdown)
 */
export async function closeDb() {
  if (db) {
    await db.close();
    db = null;
    dbReady = false;
    dbPromise = null;
    console.log('[db] 🔒 Conexión cerrada');
  }
}

// ============================================================
// FUNCIONES PARA OBTENER DATOS DE LA BIBLIOTECA
// ============================================================

/**
 * Obtiene canciones con sus artistas, álbumes, años y géneros.
 */
export async function getSongsWithDetails({ limit = 100, offset = 0, userId = null } = {}) {
  const database = await getDb();

  let sql = `
    SELECT
      s.id,
      s.title,
      s.relPath,
      s.duration,
      s.track,
      s.hasLyrics,
      a.name AS artist,
      al.name AS album,
      y.year AS year,
      (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM user_liked_songs uls WHERE uls.song_id = s.id AND uls.user_id = ?
      ) THEN 1 ELSE 0 END) AS liked,
      (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM user_hidden_songs uhs WHERE uhs.song_id = s.id AND uhs.user_id = ?
      ) THEN 1 ELSE 0 END) AS hidden
    FROM songs s
    LEFT JOIN artists a ON s.artist_id = a.id
    LEFT JOIN albums al ON s.album_id = al.id
    LEFT JOIN years y ON s.year_id = y.id
    WHERE 1=1
  `;

  const params = [userId || null, userId || null];

  if (userId) {
    sql += ` AND s.id NOT IN (
      SELECT song_id FROM user_hidden_songs WHERE user_id = ?
    )`;
    params.push(userId);
  }

  sql += ` ORDER BY s.title LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const songs = await database.all(sql, params);

  for (const song of songs) {
    const genres = await database.all(`
      SELECT g.name
      FROM genres g
      JOIN song_genres sg ON g.id = sg.genre_id
      WHERE sg.song_id = ?
    `, [song.id]);
    song.genre = genres.map(g => g.name);
    song.liked = !!song.liked;
    song.hidden = !!song.hidden;
    song.hasCover = false;
  }

  return songs;
}

/**
 * Obtiene el conteo total de canciones visibles para un usuario.
 */
export async function getTotalSongsCount(userId = null) {
  const database = await getDb();
  
  let sql = 'SELECT COUNT(*) as total FROM songs';
  const params = [];

  if (userId) {
    sql += ` WHERE id NOT IN (
      SELECT song_id FROM user_hidden_songs WHERE user_id = ?
    )`;
    params.push(userId);
  }

  const result = await database.get(sql, params);
  return result.total;
}

/**
 * Obtiene el conteo de canciones en la papelera (trash).
 */
export async function getTrashCount(userId = null) {
  const database = await getDb();
  
  let sql = 'SELECT COUNT(*) as total FROM user_hidden_songs';
  const params = [];

  if (userId) {
    sql += ' WHERE user_id = ?';
    params.push(userId);
  }

  const result = await database.get(sql, params);
  return result.total;
}

// ============================================================
// FUNCIONES PARA ARTISTAS, ÁLBUMES, GÉNEROS, AÑOS
// ============================================================

/**
 * Obtiene todos los artistas con sus canciones.
 */
export async function getArtistsWithSongs(userId = null) {
  const database = await getDb();

  let artistSql = `
    SELECT DISTINCT
      a.id,
      a.name,
      (SELECT s.id FROM songs s WHERE s.artist_id = a.id LIMIT 1) AS coverId
    FROM artists a
    WHERE 1=1
  `;
  const params = [];

  if (userId) {
    artistSql += ` AND a.id NOT IN (
      SELECT artist_id FROM user_hidden_artists WHERE user_id = ?
    )`;
    params.push(userId);
  }

  artistSql += ' ORDER BY a.name';
  const artists = await database.all(artistSql, params);

  for (const artist of artists) {
    let songSql = `
      SELECT
        s.id,
        s.title,
        s.relPath,
        s.duration,
        s.track,
        s.hasLyrics,
        al.name AS album,
        y.year AS year
      FROM songs s
      LEFT JOIN albums al ON s.album_id = al.id
      LEFT JOIN years y ON s.year_id = y.id
      WHERE s.artist_id = ?
    `;
    const songParams = [artist.id];

    if (userId) {
      songSql += ` AND s.id NOT IN (
        SELECT song_id FROM user_hidden_songs WHERE user_id = ?
      )`;
      songParams.push(userId);
    }

    const songs = await database.all(songSql, songParams);
    artist.songs = songs;
    
    if (!artist.coverId && songs.length > 0) {
      artist.coverId = songs[0].id;
    }
  }

  return artists.filter(a => a.songs.length > 0);
}

/**
 * Obtiene todos los álbumes con sus canciones.
 */
export async function getAlbumsWithSongs(userId = null) {
  const database = await getDb();

  let albumSql = `
    SELECT DISTINCT
      al.id,
      al.name,
      al.year,
      a.name AS artist,
      (SELECT s.id FROM songs s WHERE s.album_id = al.id LIMIT 1) AS coverId
    FROM albums al
    LEFT JOIN artists a ON al.artist_id = a.id
    WHERE 1=1
  `;
  const params = [];

  if (userId) {
    albumSql += ` AND al.id NOT IN (
      SELECT album_id FROM user_favorite_albums WHERE user_id = ?
    )`;
    params.push(userId);
  }

  albumSql += ' ORDER BY al.name';
  const albums = await database.all(albumSql, params);

  for (const album of albums) {
    let songSql = `
      SELECT
        s.id,
        s.title,
        s.relPath,
        s.duration,
        s.track,
        s.hasLyrics
      FROM songs s
      WHERE s.album_id = ?
    `;
    const songParams = [album.id];

    if (userId) {
      songSql += ` AND s.id NOT IN (
        SELECT song_id FROM user_hidden_songs WHERE user_id = ?
      )`;
      songParams.push(userId);
    }

    const songs = await database.all(songSql, songParams);
    album.songs = songs;
    
    if (!album.coverId && songs.length > 0) {
      album.coverId = songs[0].id;
    }
  }

  return albums.filter(a => a.songs.length > 0);
}

/**
 * Obtiene todos los géneros con sus canciones.
 */
export async function getGenresWithSongs(userId = null) {
  const database = await getDb();

  const genres = await database.all(`
    SELECT
      g.id,
      g.name,
      (SELECT s.id FROM songs s 
       JOIN song_genres sg ON s.id = sg.song_id 
       WHERE sg.genre_id = g.id LIMIT 1) AS coverId
    FROM genres g
    ORDER BY g.name
  `);

  for (const genre of genres) {
    let songSql = `
      SELECT
        s.id,
        s.title,
        s.relPath,
        s.duration,
        s.track,
        s.hasLyrics,
        a.name AS artist,
        al.name AS album,
        y.year AS year
      FROM songs s
      JOIN song_genres sg ON s.id = sg.song_id
      LEFT JOIN artists a ON s.artist_id = a.id
      LEFT JOIN albums al ON s.album_id = al.id
      LEFT JOIN years y ON s.year_id = y.id
      WHERE sg.genre_id = ?
    `;
    const songParams = [genre.id];

    if (userId) {
      songSql += ` AND s.id NOT IN (
        SELECT song_id FROM user_hidden_songs WHERE user_id = ?
      )`;
      songParams.push(userId);
    }

    const songs = await database.all(songSql, songParams);
    genre.songs = songs;
    
    if (!genre.coverId && songs.length > 0) {
      genre.coverId = songs[0].id;
    }
  }

  return genres.filter(g => g.songs.length > 0);
}

/**
 * Obtiene todos los años con sus canciones.
 */
export async function getYearsWithSongs(userId = null) {
  const database = await getDb();

  const years = await database.all(`
    SELECT
      y.id,
      y.year,
      (SELECT s.id FROM songs s WHERE s.year_id = y.id LIMIT 1) AS coverId
    FROM years y
    ORDER BY y.year DESC
  `);

  for (const year of years) {
    let songSql = `
      SELECT
        s.id,
        s.title,
        s.relPath,
        s.duration,
        s.track,
        s.hasLyrics,
        a.name AS artist,
        al.name AS album
      FROM songs s
      LEFT JOIN artists a ON s.artist_id = a.id
      LEFT JOIN albums al ON s.album_id = al.id
      WHERE s.year_id = ?
    `;
    const songParams = [year.id];

    if (userId) {
      songSql += ` AND s.id NOT IN (
        SELECT song_id FROM user_hidden_songs WHERE user_id = ?
      )`;
      songParams.push(userId);
    }

    const songs = await database.all(songSql, songParams);
    year.songs = songs;
    
    if (!year.coverId && songs.length > 0) {
      year.coverId = songs[0].id;
    }
  }

  return years.filter(y => y.songs.length > 0);
}

// ============================================================
// FUNCIONES PARA CANCIONES QUE ME GUSTAN
// ============================================================

export async function getLikedSongs(userId) {
  const database = await getDb();

  const songs = await database.all(`
    SELECT
      s.id,
      s.title,
      s.relPath,
      s.duration,
      s.track,
      s.hasLyrics,
      a.name AS artist,
      al.name AS album,
      y.year AS year,
      1 AS liked
    FROM songs s
    JOIN user_liked_songs uls ON s.id = uls.song_id
    LEFT JOIN artists a ON s.artist_id = a.id
    LEFT JOIN albums al ON s.album_id = al.id
    LEFT JOIN years y ON s.year_id = y.id
    WHERE uls.user_id = ?
    ORDER BY uls.created_at DESC
  `, [userId]);

  for (const song of songs) {
    const genres = await database.all(`
      SELECT g.name
      FROM genres g
      JOIN song_genres sg ON g.id = sg.genre_id
      WHERE sg.song_id = ?
    `, [song.id]);
    song.genre = genres.map(g => g.name);
  }

  return songs;
}

// ============================================================
// FUNCIONES PARA PREFERENCIAS DE USUARIO
// ============================================================

export async function getSongPrefs(userId) {
  const database = await getDb();
  
  const result = {};

  const liked = await database.all(
    'SELECT song_id FROM user_liked_songs WHERE user_id = ?',
    [userId]
  );
  for (const row of liked) {
    if (!result[row.song_id]) result[row.song_id] = {};
    result[row.song_id].liked = true;
  }

  const hidden = await database.all(
    'SELECT song_id FROM user_hidden_songs WHERE user_id = ?',
    [userId]
  );
  for (const row of hidden) {
    if (!result[row.song_id]) result[row.song_id] = {};
    result[row.song_id].hidden = true;
    result[row.song_id].deleted = true;
  }

  return result;
}

export async function setSongLiked(songId, liked, userId) {
  const database = await getDb();

  if (liked) {
    await database.run(
      'INSERT OR IGNORE INTO user_liked_songs (user_id, song_id) VALUES (?, ?)',
      [userId, songId]
    );
  } else {
    await database.run(
      'DELETE FROM user_liked_songs WHERE user_id = ? AND song_id = ?',
      [userId, songId]
    );
  }
}

export async function setSongHidden(songId, hidden, userId) {
  const database = await getDb();

  if (hidden) {
    await database.run(
      'INSERT OR IGNORE INTO user_hidden_songs (user_id, song_id) VALUES (?, ?)',
      [userId, songId]
    );
  } else {
    await database.run(
      'DELETE FROM user_hidden_songs WHERE user_id = ? AND song_id = ?',
      [userId, songId]
    );
  }
}

export async function getHiddenArtistsIds(userId) {
  const database = await getDb();
  
  const rows = await database.all(
    'SELECT artist_id FROM user_hidden_artists WHERE user_id = ?',
    [userId]
  );
  
  return new Set(rows.map(r => r.artist_id));
}

export async function getHiddenArtists(userId) {
  const database = await getDb();
  
  const rows = await database.all(`
    SELECT a.name
    FROM user_hidden_artists uha
    JOIN artists a ON uha.artist_id = a.id
    WHERE uha.user_id = ?
  `, [userId]);
  
  return new Set(rows.map(r => r.name));
}

export async function setArtistHidden(artistId, hidden, userId) {
  const database = await getDb();

  if (hidden) {
    await database.run(
      'INSERT OR IGNORE INTO user_hidden_artists (user_id, artist_id) VALUES (?, ?)',
      [userId, artistId]
    );
  } else {
    await database.run(
      'DELETE FROM user_hidden_artists WHERE user_id = ? AND artist_id = ?',
      [userId, artistId]
    );
  }
}

export async function getFavoriteArtists(userId) {
  const database = await getDb();
  
  const rows = await database.all(`
    SELECT a.name
    FROM user_favorite_artists ufa
    JOIN artists a ON ufa.artist_id = a.id
    WHERE ufa.user_id = ?
  `, [userId]);
  
  return rows.map(r => r.name);
}

export async function toggleFavoriteArtist(artistId, userId) {
  const database = await getDb();
  
  const exists = await database.get(
    'SELECT 1 FROM user_favorite_artists WHERE user_id = ? AND artist_id = ?',
    [userId, artistId]
  );
  
  if (exists) {
    await database.run(
      'DELETE FROM user_favorite_artists WHERE user_id = ? AND artist_id = ?',
      [userId, artistId]
    );
  } else {
    await database.run(
      'INSERT OR IGNORE INTO user_favorite_artists (user_id, artist_id) VALUES (?, ?)',
      [userId, artistId]
    );
  }
  
  return !exists;
}

// ============================================================
// FUNCIONES PARA USUARIOS (AUTENTICACIÓN)
// ============================================================

export async function createUser(username, password) {
  const database = await getDb();
  
  const exists = await database.get(
    'SELECT 1 FROM users WHERE username = ?',
    [username]
  );
  
  if (exists) {
    throw new Error('El usuario ya existe');
  }
  
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  
  const result = await database.run(
    'INSERT INTO users (username, salt, password_hash) VALUES (?, ?, ?)',
    [username, salt, hash]
  );
  
  return { id: result.lastID, username };
}

export async function findUser(username, password) {
  const database = await getDb();
  
  const user = await database.get(
    'SELECT * FROM users WHERE username = ?',
    [username]
  );
  
  if (!user) {
    return null;
  }
  
  const hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
  if (hash !== user.password_hash) {
    return null;
  }
  
  return user;
}

export async function getUserByToken(token) {
  const database = await getDb();
  
  const user = await database.get(
    'SELECT * FROM users WHERE session_token = ?',
    [token]
  );
  
  return user || null;
}

export async function updateUserSession(userId, token) {
  const database = await getDb();
  
  await database.run(
    'UPDATE users SET session_token = ? WHERE id = ?',
    [token, userId]
  );
}

export async function clearUserSession(token) {
  const database = await getDb();
  
  await database.run(
    'UPDATE users SET session_token = NULL WHERE session_token = ?',
    [token]
  );
}

export async function getAllUsers() {
  const database = await getDb();
  
  const users = await database.all(
    'SELECT id, username, created_at FROM users'
  );
  
  return users;
}

// ============================================================
// FUNCIONES PARA PLAYLISTS
// ============================================================

export async function createPlayList(name, description, userId) {
  const database = await getDb();
  
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  
  await database.run(
    `INSERT INTO playlists (id, name, description, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, name.trim(), description?.trim() || '', userId]
  );
  
  const playlist = await database.get(
    'SELECT * FROM playlists WHERE id = ?',
    [id]
  );
  
  return playlist;
}

export async function getPlayLists(userId) {
  const database = await getDb();
  
  let sql = 'SELECT * FROM playlists';
  const params = [];
  
  if (userId) {
    sql += ' WHERE user_id = ? OR user_id IS NULL';
    params.push(userId);
  }
  
  sql += ' ORDER BY created_at DESC';
  
  const playlists = await database.all(sql, params);
  
  for (const pl of playlists) {
    const songs = await database.all(
      'SELECT song_id FROM playlist_songs WHERE playlist_id = ? ORDER BY position',
      [pl.id]
    );
    pl.songIds = songs.map(s => s.song_id);
  }
  
  return playlists;
}

export async function getPlayList(id) {
  const database = await getDb();
  
  const playlist = await database.get(
    'SELECT * FROM playlists WHERE id = ?',
    [id]
  );
  
  if (playlist) {
    const songs = await database.all(
      'SELECT song_id FROM playlist_songs WHERE playlist_id = ? ORDER BY position',
      [id]
    );
    playlist.songIds = songs.map(s => s.song_id);
  }
  
  return playlist || null;
}

export async function addSongToPlayList(playlistId, songId) {
  const database = await getDb();
  
  const count = await database.get(
    'SELECT COUNT(*) as total FROM playlist_songs WHERE playlist_id = ?',
    [playlistId]
  );
  
  await database.run(
    `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position)
     VALUES (?, ?, ?)`,
    [playlistId, songId, count.total]
  );
  
  await database.run(
    'UPDATE playlists SET updated_at = datetime("now") WHERE id = ?',
    [playlistId]
  );
  
  return getPlayList(playlistId);
}

export async function removeSongFromPlayList(playlistId, songId) {
  const database = await getDb();
  
  await database.run(
    'DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?',
    [playlistId, songId]
  );
  
  await database.run(
    'UPDATE playlists SET updated_at = datetime("now") WHERE id = ?',
    [playlistId]
  );
  
  return getPlayList(playlistId);
}

export async function deletePlayList(id) {
  const database = await getDb();
  
  await database.run('DELETE FROM playlists WHERE id = ?', [id]);
  
  return true;
}

// ============================================================
// FUNCIONES PARA LETRAS
// ============================================================

export async function getLyrics(songId) {
  const database = await getDb();
  
  const result = await database.get(
    'SELECT * FROM lyrics WHERE song_id = ?',
    [songId]
  );
  
  return result || null;
}

export async function saveLyrics(songId, { text, syncedText, translatedText }) {
  const database = await getDb();
  
  await database.run(
    `INSERT OR REPLACE INTO lyrics (song_id, text, synced_text, translated_text, updated_at)
     VALUES (?, ?, ?, ?, datetime("now"))`,
    [songId, text, syncedText, translatedText]
  );
}

// ============================================================
// FUNCIONES PARA PORTADAS
// ============================================================

export async function getAlbumCover(albumId) {
  const database = await getDb();
  
  const result = await database.get(
    'SELECT cover FROM albums WHERE id = ?',
    [albumId]
  );
  
  return result?.cover || null;
}

export async function saveAlbumCover(albumId, coverData) {
  const database = await getDb();
  
  await database.run(
    'UPDATE albums SET cover = ? WHERE id = ?',
    [coverData, albumId]
  );
}

// ============================================================
// CIERRE DE LA CONEXIÓN (para graceful shutdown)
// ============================================================

process.on('SIGINT', async () => {
  await closeDb();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDb();
  process.exit(0);
});

// ============================================================
// EXPORTACIONES PRINCIPALES
// ============================================================

export default {
  getSongsWithDetails,
  getTotalSongsCount,
  getTrashCount,
  getLikedSongs,
  getArtistsWithSongs,
  getAlbumsWithSongs,
  getGenresWithSongs,
  getYearsWithSongs,
  getSongPrefs,
  setSongLiked,
  setSongHidden,
  getHiddenArtists,
  getHiddenArtistsIds,
  setArtistHidden,
  getFavoriteArtists,
  toggleFavoriteArtist,
  createUser,
  findUser,
  getUserByToken,
  updateUserSession,
  clearUserSession,
  getAllUsers,
  createPlayList,
  getPlayLists,
  getPlayList,
  addSongToPlayList,
  removeSongFromPlayList,
  deletePlayList,
  getLyrics,
  saveLyrics,
  getAlbumCover,
  saveAlbumCover,
  closeDb,
};