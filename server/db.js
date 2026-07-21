// ============================================================
// db.js - CAPA DE DATOS PARA ESQUEMA OPTIMIZADO
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

// Función helper para normalizar texto (quitar acentos, lowercase)
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export async function getDb() {
  if (db && dbReady) return db;
  if (dbPromise) return dbPromise;
  
  dbPromise = (async () => {
    try {
      db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database,
      });
      
      await db.exec('PRAGMA foreign_keys = ON');
      await db.exec('PRAGMA journal_mode = WAL');
      await db.exec('PRAGMA synchronous = NORMAL');
      
      dbReady = true;
      console.log('[db] ✅ Conectado a localfy.db');
      return db;
    } catch (err) {
      console.error('[db] ❌ Error conectando:', err);
      throw err;
    }
  })();
  
  return dbPromise;
}

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
// FUNCIONES PARA OBTENER DATOS (usando la vista v_complete_songs)
// ============================================================

export async function getSongsWithDetails({ limit = 100, offset = 0, userId = null } = {}) {
  const database = await getDb();

  let sql = `
    SELECT
      v.song_id AS id,
      v.song_title AS title,
      v.relative_path AS relPath,
      v.duration,
      v.track,
      v.hasLyrics,
      v.main_artist_name AS artist,
      v.album_name AS album,
      v.album_year AS year,
      v.cover_path,
      (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM user_song_interactions usi 
        WHERE usi.song_id = v.song_id 
        AND usi.user_id = ? 
        AND usi.interaction_type = 'LIKE'
      ) THEN 1 ELSE 0 END) AS liked,
      (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM user_song_interactions usi 
        WHERE usi.song_id = v.song_id 
        AND usi.user_id = ? 
        AND usi.interaction_type = 'HIDE'
      ) THEN 1 ELSE 0 END) AS hidden
    FROM v_complete_songs v
    WHERE 1=1
  `;

  const params = [userId || null, userId || null];

  if (userId) {
    sql += ` AND v.song_id NOT IN (
      SELECT song_id FROM user_song_interactions 
      WHERE user_id = ? AND interaction_type = 'HIDE'
    )`;
    params.push(userId);
  }

  sql += ` ORDER BY v.song_title LIMIT ? OFFSET ?`;
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
    song.hasCover = !!song.cover_path;
  }

  return songs;
}

export async function getTotalSongsCount(userId = null) {
  const database = await getDb();
  
  let sql = 'SELECT COUNT(*) as total FROM songs';
  const params = [];

  if (userId) {
    sql += ` WHERE id NOT IN (
      SELECT song_id FROM user_song_interactions 
      WHERE user_id = ? AND interaction_type = 'HIDE'
    )`;
    params.push(userId);
  }

  const result = await database.get(sql, params);
  return result.total;
}

export async function getTrashCount(userId = null) {
  const database = await getDb();
  
  let sql = 'SELECT COUNT(*) as total FROM user_song_interactions WHERE interaction_type = "HIDE"';
  const params = [];

  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }

  const result = await database.get(sql, params);
  return result.total;
}

// ============================================================
// FUNCIONES PARA ARTISTAS CON PAGINACIÓN
// ============================================================

// En server/db.js
export async function getArtistsWithPagination({ userId = null, limit = 20, offset = 0, search = '' } = {}) {
  const database = await getDb();

  let sql = `
    SELECT
      a.id,
      a.name,
      (SELECT COUNT(*) FROM song_artists sa WHERE sa.artist_id = a.id) AS song_count,
      (SELECT s.id FROM songs s 
       JOIN song_artists sa2 ON s.id = sa2.song_id 
       WHERE sa2.artist_id = a.id LIMIT 1) AS coverId
    FROM artists a
    WHERE 1=1
  `;
  const params = [];

  if (userId) {
    sql += ` AND a.id NOT IN (
      SELECT artist_id FROM user_artist_interactions 
      WHERE user_id = ? AND interaction_type = 'HIDE'
    )`;
    params.push(userId);
  }

  if (search) {
    const normalizedSearch = normalizeText(search);
    // Usar REPLACE para quitar acentos de los datos y comparar con término normalizado
    sql += ` AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(a.name,'á','a'),'é','e'),'í','i'),'ó','o'),'ú','u')) LIKE LOWER(?)`;
    params.push(`%${normalizedSearch}%`);
  }

  sql += ` ORDER BY a.name LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const items = await database.all(sql, params);
  
  let countSql = `SELECT COUNT(*) as total FROM artists a WHERE 1=1`;
  const countParams = [];
  if (userId) {
    countSql += ` AND a.id NOT IN (
      SELECT artist_id FROM user_artist_interactions 
      WHERE user_id = ? AND interaction_type = 'HIDE'
    )`;
    countParams.push(userId);
  }
  if (search) {
    countSql += ` AND a.name LIKE ?`;
    countParams.push(`%${search}%`);
  }
  const totalResult = await database.get(countSql, countParams);
  const total = totalResult.total;

  return {
    items,
    pagination: {
      offset,
      limit,
      total,
      hasMore: offset + limit < total
    }
  };
}

export async function getSongsByArtist({ artistId, userId = null, limit = 100, offset = 0 } = {}) {
  const database = await getDb();

  let sql = `
    SELECT
      s.id,
      s.title,
      s.relPath,
      s.duration,
      s.track,
      s.hasLyrics,
      al.name AS album,
      al.year AS year,
      (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM user_song_interactions usi 
        WHERE usi.song_id = s.id 
        AND usi.user_id = ? 
        AND usi.interaction_type = 'LIKE'
      ) THEN 1 ELSE 0 END) AS liked
    FROM songs s
    LEFT JOIN albums al ON s.album_id = al.id
    JOIN song_artists sa ON s.id = sa.song_id
    WHERE sa.artist_id = ?
  `;
  const params = [userId || null, artistId];

  if (userId) {
    sql += ` AND s.id NOT IN (
      SELECT song_id FROM user_song_interactions 
      WHERE user_id = ? AND interaction_type = 'HIDE'
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
  }

  let countSql = `
    SELECT COUNT(*) as total
    FROM songs s
    JOIN song_artists sa ON s.id = sa.song_id
    WHERE sa.artist_id = ?
  `;
  const countParams = [artistId];
  if (userId) {
    countSql += ` AND s.id NOT IN (
      SELECT song_id FROM user_song_interactions 
      WHERE user_id = ? AND interaction_type = 'HIDE'
    )`;
    countParams.push(userId);
  }
  const totalResult = await database.get(countSql, countParams);
  const total = totalResult.total;

  return {
    songs,
    pagination: {
      offset,
      limit,
      total,
      hasMore: offset + limit < total
    }
  };
}

export async function getArtistIdByName(name) {
  const database = await getDb();
  const result = await database.get('SELECT id FROM artists WHERE name = ?', [name]);
  return result?.id || null;
}

// ============================================================
// FUNCIONES PARA ÁLBUMES CON PAGINACIÓN
// ============================================================

export async function getAlbumsWithPagination({ userId = null, limit = 100, offset = 0, search = '' } = {}) {
  const database = await getDb();

  let sql = `
    SELECT
      al.id,
      al.name,
      a.name AS artist,
      al.year,
      al.cover_path,
      (SELECT COUNT(*) FROM songs s WHERE s.album_id = al.id) AS song_count,
      (SELECT s.id FROM songs s WHERE s.album_id = al.id LIMIT 1) AS coverId
    FROM albums al
    LEFT JOIN artists a ON al.main_artist_id = a.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    const normalizedSearch = normalizeText(search);
    sql += ` AND (LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(al.name,'á','a'),'é','e'),'í','i'),'ó','o'),'ú','u')) LIKE LOWER(?) OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(a.name,'á','a'),'é','e'),'í','i'),'ó','o'),'ú','u')) LIKE LOWER(?))`;
    params.push(`%${normalizedSearch}%`, `%${normalizedSearch}%`);
  }

  sql += ` ORDER BY al.name LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const albums = await database.all(sql, params);

  let countSql = `SELECT COUNT(*) as total FROM albums al WHERE 1=1`;
  const countParams = [];
  if (search) {
    countSql += ` AND (al.name LIKE ? OR al.name LIKE ?)`;
    countParams.push(`%${search}%`, `%${search}%`);
  }
  const totalResult = await database.get(countSql, countParams);
  const total = totalResult.total;

  return {
    items: albums,
    pagination: {
      offset,
      limit,
      total,
      hasMore: offset + limit < total
    }
  };
}

export async function getSongsByAlbum({ albumId, userId = null, limit = 100, offset = 0 } = {}) {
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
      (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM user_song_interactions usi 
        WHERE usi.song_id = s.id 
        AND usi.user_id = ? 
        AND usi.interaction_type = 'LIKE'
      ) THEN 1 ELSE 0 END) AS liked
    FROM songs s
    LEFT JOIN artists a ON s.artist_id = a.id
    WHERE s.album_id = ?
  `;
  const params = [userId || null, albumId];

  if (userId) {
    sql += ` AND s.id NOT IN (
      SELECT song_id FROM user_song_interactions 
      WHERE user_id = ? AND interaction_type = 'HIDE'
    )`;
    params.push(userId);
  }

  sql += ` ORDER BY s.track, s.title LIMIT ? OFFSET ?`;
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
  }

  let countSql = `SELECT COUNT(*) as total FROM songs s WHERE s.album_id = ?`;
  const countParams = [albumId];
  if (userId) {
    countSql += ` AND s.id NOT IN (
      SELECT song_id FROM user_song_interactions 
      WHERE user_id = ? AND interaction_type = 'HIDE'
    )`;
    countParams.push(userId);
  }
  const totalResult = await database.get(countSql, countParams);
  const total = totalResult.total;

  return {
    songs,
    pagination: {
      offset,
      limit,
      total,
      hasMore: offset + limit < total
    }
  };
}

// ============================================================
// FUNCIONES PARA GÉNEROS CON PAGINACIÓN
// ============================================================

export async function getGenresWithPagination({ userId = null, limit = 100, offset = 0, search = '' } = {}) {
  const database = await getDb();

  let sql = `
    SELECT
      g.id,
      g.name,
      (SELECT COUNT(*) FROM song_genres sg WHERE sg.genre_id = g.id) AS song_count,
      (SELECT s.id FROM songs s 
       JOIN song_genres sg2 ON s.id = sg2.song_id 
       WHERE sg2.genre_id = g.id LIMIT 1) AS coverId
    FROM genres g
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    const normalizedSearch = normalizeText(search);
    sql += ` AND LOWER(g.name) LIKE LOWER(?)`;
    params.push(`%${normalizedSearch}%`);
  }

  sql += ` ORDER BY g.name LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const genres = await database.all(sql, params);

  let countSql = `SELECT COUNT(*) as total FROM genres g WHERE 1=1`;
  const countParams = [];
  if (search) {
    countSql += ` AND g.name LIKE ?`;
    countParams.push(`%${search}%`);
  }
  const totalResult = await database.get(countSql, countParams);
  const total = totalResult.total;

  return {
    items: genres,
    pagination: {
      offset,
      limit,
      total,
      hasMore: offset + limit < total
    }
  };
}

export async function getSongsByGenre({ genreId, userId = null, limit = 100, offset = 0 } = {}) {
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
      al.year AS year,
      (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM user_song_interactions usi 
        WHERE usi.song_id = s.id 
        AND usi.user_id = ? 
        AND usi.interaction_type = 'LIKE'
      ) THEN 1 ELSE 0 END) AS liked
    FROM songs s
    LEFT JOIN artists a ON s.artist_id = a.id
    LEFT JOIN albums al ON s.album_id = al.id
    JOIN song_genres sg ON s.id = sg.song_id
    WHERE sg.genre_id = ?
  `;
  const params = [userId || null, genreId];

  if (userId) {
    sql += ` AND s.id NOT IN (
      SELECT song_id FROM user_song_interactions 
      WHERE user_id = ? AND interaction_type = 'HIDE'
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
      JOIN song_genres sg2 ON g.id = sg2.genre_id
      WHERE sg2.song_id = ?
    `, [song.id]);
    song.genre = genres.map(g => g.name);
    song.liked = !!song.liked;
  }

  let countSql = `
    SELECT COUNT(*) as total
    FROM songs s
    JOIN song_genres sg ON s.id = sg.song_id
    WHERE sg.genre_id = ?
  `;
  const countParams = [genreId];
  if (userId) {
    countSql += ` AND s.id NOT IN (
      SELECT song_id FROM user_song_interactions 
      WHERE user_id = ? AND interaction_type = 'HIDE'
    )`;
    countParams.push(userId);
  }
  const totalResult = await database.get(countSql, countParams);
  const total = totalResult.total;

  return {
    songs,
    pagination: {
      offset,
      limit,
      total,
      hasMore: offset + limit < total
    }
  };
}

// ============================================================
// FUNCIONES PARA AÑOS CON PAGINACIÓN
// ============================================================

export async function getYearsWithPagination({ userId = null, limit = 100, offset = 0, search = '' } = {}) {
  const database = await getDb();

  let sql = `
    SELECT
      al.year,
      COUNT(DISTINCT s.id) AS song_count,
      MAX(s.id) AS coverId
    FROM albums al
    LEFT JOIN songs s ON s.album_id = al.id
    WHERE al.year IS NOT NULL
    GROUP BY al.year
  `;
  const params = [];

  if (search) {
    sql += ` AND CAST(al.year AS TEXT) LIKE ?`;
    params.push(`%${search}%`);
  }

  sql += ` ORDER BY al.year DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const years = await database.all(sql, params);

  let countSql = `SELECT COUNT(DISTINCT year) as total FROM albums WHERE year IS NOT NULL`;
  const countParams = [];
  if (search) {
    countSql += ` AND CAST(year AS TEXT) LIKE ?`;
    countParams.push(`%${search}%`);
  }
  const totalResult = await database.get(countSql, countParams);
  const total = totalResult.total;

  return {
    items: years,
    pagination: {
      offset,
      limit,
      total,
      hasMore: offset + limit < total
    }
  };
}

export async function getSongsByYear({ year, userId = null, limit = 100, offset = 0 } = {}) {
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
      (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM user_song_interactions usi 
        WHERE usi.song_id = s.id 
        AND usi.user_id = ? 
        AND usi.interaction_type = 'LIKE'
      ) THEN 1 ELSE 0 END) AS liked
    FROM songs s
    LEFT JOIN artists a ON s.artist_id = a.id
    LEFT JOIN albums al ON s.album_id = al.id
    WHERE al.year = ?
  `;
  const params = [userId || null, year];

  if (userId) {
    sql += ` AND s.id NOT IN (
      SELECT song_id FROM user_song_interactions 
      WHERE user_id = ? AND interaction_type = 'HIDE'
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
  }

  let countSql = `
    SELECT COUNT(*) as total
    FROM songs s
    LEFT JOIN albums al ON s.album_id = al.id
    WHERE al.year = ?
  `;
  const countParams = [year];
  if (userId) {
    countSql += ` AND s.id NOT IN (
      SELECT song_id FROM user_song_interactions 
      WHERE user_id = ? AND interaction_type = 'HIDE'
    )`;
    countParams.push(userId);
  }
  const totalResult = await database.get(countSql, countParams);
  const total = totalResult.total;

  return {
    songs,
    pagination: {
      offset,
      limit,
      total,
      hasMore: offset + limit < total
    }
  };
}

// ============================================================
// FUNCIONES PARA CANCIONES QUE ME GUSTAN (CORREGIDO)
// ============================================================

export async function getLikedSongs(userId, limit = 100, offset = 0) {
  const database = await getDb();

  try {
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
        al.year AS year,
        1 AS liked
      FROM songs s
      JOIN user_song_interactions usi ON s.id = usi.song_id
      LEFT JOIN song_artists sa ON s.id = sa.song_id AND sa.is_main = 1
      LEFT JOIN artists a ON sa.artist_id = a.id
      LEFT JOIN albums al ON s.album_id = al.id
      WHERE usi.user_id = ? AND usi.interaction_type = 'LIKE'
      ORDER BY usi.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, limit, offset]);

    // Obtener géneros para cada canción
    for (const song of songs) {
      const genres = await database.all(`
        SELECT g.name
        FROM genres g
        JOIN song_genres sg ON g.id = sg.genre_id
        WHERE sg.song_id = ?
      `, [song.id]);
      song.genre = genres.map(g => g.name);
      // Asegurar que liked esté en true
      song.liked = true;
      song.hasCover = false;
    }

    return songs;
  } catch (error) {
    console.error('[db] Error en getLikedSongs:', error);
    throw error;
  }
}

export async function getLikedSongsCount(userId) {
  const database = await getDb();
  
  try {
    const result = await database.get(
      'SELECT COUNT(*) as total FROM user_song_interactions WHERE user_id = ? AND interaction_type = "LIKE"',
      [userId]
    );
    return result.total;
  } catch (error) {
    console.error('[db] Error en getLikedSongsCount:', error);
    throw error;
  }
}

// ============================================================
// FUNCIONES PARA CANCIONES OCULTAS (DISLIKE)
// ============================================================

export async function getHiddenSongIds(userId) {
  const database = await getDb();
  const rows = await database.all(
    'SELECT song_id FROM user_song_interactions WHERE user_id = ? AND interaction_type = "HIDE"',
    [userId]
  );
  return new Set(rows.map(r => r.song_id));
}

// ============================================================
// FUNCIONES PARA INTERACCIONES CON CANCIONES
// ============================================================

export async function setSongLiked(songId, liked, userId) {
  const database = await getDb();

  if (liked) {
    await database.run(
      `INSERT OR IGNORE INTO user_song_interactions (user_id, song_id, interaction_type)
       VALUES (?, ?, 'LIKE')`,
      [userId, songId]
    );
  } else {
    await database.run(
      `DELETE FROM user_song_interactions 
       WHERE user_id = ? AND song_id = ? AND interaction_type = 'LIKE'`,
      [userId, songId]
    );
  }
}

export async function setSongHidden(songId, hidden, userId) {
  const database = await getDb();

  if (hidden) {
    await database.run(
      `INSERT OR IGNORE INTO user_song_interactions (user_id, song_id, interaction_type)
       VALUES (?, ?, 'HIDE')`,
      [userId, songId]
    );
  } else {
    await database.run(
      `DELETE FROM user_song_interactions 
       WHERE user_id = ? AND song_id = ? AND interaction_type = 'HIDE'`,
      [userId, songId]
    );
  }
}

export async function getSongPrefs(userId) {
  const database = await getDb();
  
  const result = {};

  const interactions = await database.all(
    `SELECT song_id, interaction_type 
     FROM user_song_interactions 
     WHERE user_id = ?`,
    [userId]
  );
  
  for (const row of interactions) {
    if (!result[row.song_id]) result[row.song_id] = {};
    if (row.interaction_type === 'LIKE') {
      result[row.song_id].liked = true;
    } else if (row.interaction_type === 'HIDE') {
      result[row.song_id].hidden = true;
      result[row.song_id].deleted = true;
    }
  }

  return result;
}

// ============================================================
// FUNCIONES PARA INTERACCIONES CON ARTISTAS
// ============================================================

export async function getHiddenArtists(userId) {
  const database = await getDb();
  
  const rows = await database.all(`
    SELECT a.name
    FROM user_artist_interactions uai
    JOIN artists a ON uai.artist_id = a.id
    WHERE uai.user_id = ? AND uai.interaction_type = 'HIDE'
  `, [userId]);
  
  return new Set(rows.map(r => r.name));
}

export async function setArtistHidden(artistId, hidden, userId) {
  const database = await getDb();

  if (hidden) {
    await database.run(
      `INSERT OR IGNORE INTO user_artist_interactions (user_id, artist_id, interaction_type)
       VALUES (?, ?, 'HIDE')`,
      [userId, artistId]
    );
  } else {
    await database.run(
      `DELETE FROM user_artist_interactions 
       WHERE user_id = ? AND artist_id = ? AND interaction_type = 'HIDE'`,
      [userId, artistId]
    );
  }
}

export async function getFavoriteArtists(userId) {
  const database = await getDb();
  
  const rows = await database.all(`
    SELECT a.name
    FROM user_artist_interactions uai
    JOIN artists a ON uai.artist_id = a.id
    WHERE uai.user_id = ? AND uai.interaction_type = 'FAVORITE'
  `, [userId]);
  
  return rows.map(r => r.name);
}

export async function toggleFavoriteArtist(artistId, userId) {
  const database = await getDb();
  
  const exists = await database.get(
    `SELECT 1 FROM user_artist_interactions 
     WHERE user_id = ? AND artist_id = ? AND interaction_type = 'FAVORITE'`,
    [userId, artistId]
  );
  
  if (exists) {
    await database.run(
      `DELETE FROM user_artist_interactions 
       WHERE user_id = ? AND artist_id = ? AND interaction_type = 'FAVORITE'`,
      [userId, artistId]
    );
    return false;
  } else {
    await database.run(
      `INSERT OR IGNORE INTO user_artist_interactions (user_id, artist_id, interaction_type)
       VALUES (?, ?, 'FAVORITE')`,
      [userId, artistId]
    );
    return true;
  }
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

export async function deleteLyrics(songId) {
  const database = await getDb();
  await database.run('DELETE FROM lyrics WHERE song_id = ?', [songId]);
}

// ============================================================
// FUNCIONES PARA PORTADAS Y METADATOS
// ============================================================

export async function getAlbumCover(albumId) {
  const database = await getDb();
  
  const result = await database.get(
    'SELECT cover_path FROM albums WHERE id = ?',
    [albumId]
  );
  
  return result?.cover_path || null;
}

export async function saveAlbumCover(albumId, coverPath) {
  const database = await getDb();
  
  await database.run(
    'UPDATE albums SET cover_path = ? WHERE id = ?',
    [coverPath, albumId]
  );
}

export async function updateSongPath(songId, newPath, newTitle) {
  const database = await getDb();
  
  await database.run(
    'UPDATE songs SET relPath = ?, title = ? WHERE id = ?',
    [newPath, newTitle, songId]
  );
}

// ============================================================
// FUNCIONES AUXILIARES PARA SCANNER
// ============================================================

export async function getOrCreateArtist(database, name) {
  if (!name || name === 'Artista desconocido') return null;
  
  const row = await database.get('SELECT id FROM artists WHERE name = ?', [name]);
  if (row) return row.id;
  
  const result = await database.run('INSERT INTO artists (name) VALUES (?)', [name]);
  return result.lastID;
}

export async function getOrCreateAlbum(database, name, mainArtistId, year) {
  if (!name || name === 'Álbum desconocido') return null;
  
  const row = await database.get(
    'SELECT id FROM albums WHERE name = ? AND main_artist_id = ?',
    [name, mainArtistId]
  );
  if (row) return row.id;
  
  const result = await database.run(
    'INSERT INTO albums (name, main_artist_id, year) VALUES (?, ?, ?)',
    [name, mainArtistId, year]
  );
  return result.lastID;
}

export async function getOrCreateGenre(database, name) {
  if (!name || name === 'Sin género') return null;
  
  const row = await database.get('SELECT id FROM genres WHERE name = ?', [name]);
  if (row) return row.id;
  
  const result = await database.run('INSERT INTO genres (name) VALUES (?)', [name]);
  return result.lastID;
}

// ============================================================
// CIERRE DE LA CONEXIÓN
// ============================================================

process.on('SIGINT', async () => {
  await closeDb();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDb();
  process.exit(0);
});