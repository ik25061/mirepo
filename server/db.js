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

// Caché de artistas normalizados para getOrCreateArtist (se invalida al
// cerrar/reabrir la BD, p. ej. tras un rescan con build_music_db.py).
let artistCache = null;

// Función helper para normalizar texto (quitar acentos, lowercase)
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Rellena song.genre para TODAS las canciones de la lista con UNA sola
// consulta SQL (evita el problema N+1: una query de géneros por canción).
async function attachGenres(database, songs) {
  if (!songs || songs.length === 0) return;
  const bySong = new Map();
  const CHUNK = 500; // mantenerse bajo el límite de variables de SQLite (~999)
  for (let i = 0; i < songs.length; i += CHUNK) {
    const chunk = songs.slice(i, i + CHUNK);
    const ids = chunk.map(s => s.id);
    const placeholders = ids.map(() => '?').join(',');
    const rows = await database.all(
      `SELECT sg.song_id, g.name
       FROM song_genres sg
       JOIN genres g ON g.id = sg.genre_id
       WHERE sg.song_id IN (${placeholders})
       ORDER BY g.name`,
      ids
    );
    for (const row of rows) {
      if (!bySong.has(row.song_id)) bySong.set(row.song_id, []);
      bySong.get(row.song_id).push(row.name);
    }
  }
  for (const song of songs) {
    song.genre = bySong.get(song.id) || [];
  }
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
      
      // La BD se abrió (posiblemente tras un rescan que la reconstruyó):
      // descartar cachés que apunten al esquema/datos anteriores.
      artistCache = null;

      await db.exec('PRAGMA foreign_keys = ON');
      await db.exec('PRAGMA journal_mode = WAL');
      await db.exec('PRAGMA synchronous = NORMAL');
      await db.exec('PRAGMA busy_timeout = 5000');
      await db.exec('PRAGMA cache_size = -20000'); // ~20 MB de caché
      await db.exec('PRAGMA temp_store = MEMORY');
      
      // Crear esquema si no existe
      await initSchema(db);

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
    artistCache = null;
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
      v.bpm,
      v.key_name,
      v.hasLyrics,
      v.main_artist_name AS artist,
      v.main_artist_id AS artist_id,
      v.album_id AS album_id,
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

  await attachGenres(database, songs);
  for (const song of songs) {
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
export async function getArtistsWithPagination({ userId = null, limit = 20, offset = 0, search = '', minSongs = 0 } = {}) {
  const database = await getDb();

  let total;
  let items;

  if (!search) {
    // Sin búsqueda: paginación en SQL (rápido)
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

    if (minSongs > 0) {
      sql += ` AND (SELECT COUNT(*) FROM song_artists sa WHERE sa.artist_id = a.id) >= ?`;
      params.push(minSongs);
    }

    sql += ` ORDER BY a.name LIMIT ? OFFSET ?`;
    items = await database.all(sql, [...params, limit, offset]);

    let countSql = `SELECT COUNT(*) as total FROM artists a WHERE 1=1`;
    const countParams = [];
    if (userId) {
      countSql += ` AND a.id NOT IN (
        SELECT artist_id FROM user_artist_interactions 
        WHERE user_id = ? AND interaction_type = 'HIDE'
      )`;
      countParams.push(userId);
    }
    if (minSongs > 0) {
      countSql += ` AND (SELECT COUNT(*) FROM song_artists sa WHERE sa.artist_id = a.id) >= ?`;
      countParams.push(minSongs);
    }
    const totalResult = await database.get(countSql, countParams);
    total = totalResult.total;
  } else {
    // Con búsqueda: filtrado tolerante a mayúsculas/minúsculas y acentos.
    // OPTIMIZACIÓN: Fetch "ligero" de nombres e IDs primero.
    let lightSql = `SELECT id, name FROM artists a WHERE 1=1`;
    const lightParams = [];
    if (userId) {
      lightSql += ` AND a.id NOT IN (
        SELECT artist_id FROM user_artist_interactions
        WHERE user_id = ? AND interaction_type = 'HIDE'
      )`;
      lightParams.push(userId);
    }

    const allArtists = await database.all(lightSql, lightParams);
    const normalizedSearch = normalizeText(search);
    const filtered = allArtists.filter(a => normalizeText(a.name).includes(normalizedSearch));

    total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    // Rellenar detalles (conteo y portada) solo para los elementos de esta página
    if (page.length > 0) {
      const ids = page.map(p => p.id);
      const placeholders = ids.map(() => '?').join(',');
      const detailedSql = `
        SELECT
          a.id,
          a.name,
          (SELECT COUNT(*) FROM song_artists sa WHERE sa.artist_id = a.id) AS song_count,
          (SELECT s.id FROM songs s
           JOIN song_artists sa2 ON s.id = sa2.song_id
           WHERE sa2.artist_id = a.id LIMIT 1) AS coverId
        FROM artists a
        WHERE a.id IN (${placeholders})
        ORDER BY a.name
      `;
      items = await database.all(detailedSql, ids);
    } else {
      items = [];
    }
  }

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
      v.song_id AS id,
      v.song_title AS title,
      v.relative_path AS relPath,
      v.duration,
      v.track,
      v.hasLyrics,
      v.album_id,
      v.album_name AS album,
      v.album_year AS year,
      v.cover_path,
      v.main_artist_name AS artist,
      (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM user_song_interactions usi
        WHERE usi.song_id = v.song_id
        AND usi.user_id = ?
        AND usi.interaction_type = 'LIKE'
      ) THEN 1 ELSE 0 END) AS liked
    FROM v_complete_songs v
    JOIN song_artists sa ON v.song_id = sa.song_id
    WHERE sa.artist_id = ?
  `;
  const params = [userId || null, artistId];

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

  await attachGenres(database, songs);
  for (const song of songs) {
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

// Agrupa álbumes del mismo artista con nombres similares (helper)
function mergeAlbums(items) {
  const grouped = new Map();
  for (const item of items) {
    const baseName = normalizeText(item.name).split(/[:-–()]/)[0].trim();
    const key = `${item.artist}|${baseName}|${item.year || 'null'}`;

    if (!grouped.has(key)) {
      grouped.set(key, item);
    } else {
      const existing = grouped.get(key);
      // Fusionar: mantener el que tenga más canciones o portada
      if (item.song_count > existing.song_count || (!existing.cover_path && item.cover_path)) {
        grouped.set(key, item);
      }
    }
  }
  return Array.from(grouped.values());
}

export async function getAlbumsWithPagination({ userId = null, limit = 100, offset = 0, search = '', minSongs = 0 } = {}) {
  const database = await getDb();

  let total;
  let items;

  if (!search) {
    // Sin búsqueda: paginación directa en SQL (rápido).
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

    if (minSongs > 0) {
      sql += ` AND (SELECT COUNT(*) FROM songs s WHERE s.album_id = al.id) >= ?`;
      params.push(minSongs);
    }

    sql += ` ORDER BY al.name, al.year LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const allRows = await database.all(sql, params);
    items = mergeAlbums(allRows);

    let countSql = `SELECT COUNT(*) as total FROM albums al WHERE 1=1`;
    const countParams = [];
    if (minSongs > 0) {
      countSql += ` AND (SELECT COUNT(*) FROM songs s WHERE s.album_id = al.id) >= ?`;
      countParams.push(minSongs);
    }
    const totalResult = await database.get(countSql, countParams);
    total = totalResult.total;
  } else {
    // Búsqueda: query ligero para filtrar en JS
    const lightRows = await database.all(`
      SELECT al.id, al.name, a.name AS artist, al.year, al.cover_path
      FROM albums al
      LEFT JOIN artists a ON al.main_artist_id = a.id
      ORDER BY al.name, al.year
    `);

    const normalizedSearch = normalizeText(search);
    const filtered = lightRows.filter(
      item =>
        normalizeText(item.name).includes(normalizedSearch) ||
        normalizeText(item.artist || '').includes(normalizedSearch)
    );

    const merged = mergeAlbums(filtered);
    total = merged.length;
    items = merged.slice(offset, offset + limit);

    if (items.length > 0) {
      const ids = items.map(i => i.id);
      const placeholders = ids.map(() => '?').join(',');
      const detailedSql = `
        SELECT al.id AS id,
                (SELECT COUNT(*) FROM songs s WHERE s.album_id = al.id) AS song_count,
                (SELECT s.id FROM songs s WHERE s.album_id = al.id LIMIT 1) AS coverId
         FROM albums al WHERE al.id IN (${placeholders})
      `;
      const extra = await database.all(detailedSql, ids);
      const extraMap = new Map(extra.map(r => [r.id, r]));
      items = items.map(it => {
        const e = extraMap.get(it.id);
        return e ? { ...it, song_count: e.song_count, coverId: e.coverId } : it;
      });
    }
  }

  return {
    items,
    pagination: { offset, limit, total, hasMore: offset + limit < total }
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
    LEFT JOIN song_artists sa ON s.id = sa.song_id AND sa.is_main = 1
    LEFT JOIN artists a ON sa.artist_id = a.id
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

  await attachGenres(database, songs);
  for (const song of songs) {
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

export async function getGenresWithPagination({ userId = null, limit = 100, offset = 0, search = '', minSongs = 0 } = {}) {
  const database = await getDb();

  let total;
  let items;

  if (!search) {
    // Sin búsqueda: paginación directa en SQL (rápido).
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

    if (minSongs > 0) {
      sql += ` AND (SELECT COUNT(*) FROM song_genres sg WHERE sg.genre_id = g.id) >= ?`;
      params.push(minSongs);
    }

    sql += ` ORDER BY g.name LIMIT ? OFFSET ?`;
    items = await database.all(sql, [...params, limit, offset]);

    let countSql = `SELECT COUNT(*) as total FROM genres WHERE 1=1`;
    const countParams = [];
    if (minSongs > 0) {
      countSql += ` AND (SELECT COUNT(*) FROM song_genres sg WHERE sg.genre_id = g.id) >= ?`;
      countParams.push(minSongs);
    }
    const totalResult = await database.get(countSql, countParams);
    total = totalResult.total;
  } else {
    // Búsqueda: query ligero para filtrar en JS con normalización
    const allGenres = await database.all(`SELECT id, name FROM genres ORDER BY name`);
    const normalizedSearch = normalizeText(search);
    const filtered = allGenres.filter(g => normalizeText(g.name).includes(normalizedSearch));

    total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    if (page.length > 0) {
      const ids = page.map(p => p.id);
      const placeholders = ids.map(() => '?').join(',');
      const detailedSql = `
        SELECT
          g.id,
          g.name,
          (SELECT COUNT(*) FROM song_genres sg WHERE sg.genre_id = g.id) AS song_count,
          (SELECT s.id FROM songs s
           JOIN song_genres sg2 ON s.id = sg2.song_id
           WHERE sg2.genre_id = g.id LIMIT 1) AS coverId
        FROM genres g
        WHERE g.id IN (${placeholders})
        ORDER BY g.name
      `;
      items = await database.all(detailedSql, ids);
    } else {
      items = [];
    }
  }

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
    LEFT JOIN song_artists sa ON s.id = sa.song_id AND sa.is_main = 1
    LEFT JOIN artists a ON sa.artist_id = a.id
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

  await attachGenres(database, songs);
  for (const song of songs) {
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
  `;
  const params = [];

  if (userId) {
    sql += ` AND s.id NOT IN (
      SELECT song_id FROM user_song_interactions
      WHERE user_id = ? AND interaction_type = 'HIDE'
    )`;
    params.push(userId);
  }

  if (search) {
    // El filtro DEBE ir en WHERE (antes de GROUP BY); concatenarlo después de
    // "GROUP BY" generaba SQL inválido. Se mueve aquí.
    sql += ` AND CAST(al.year AS TEXT) LIKE ?`;
    params.push(`%${search}%`);
  }

  sql += ` GROUP BY al.year ORDER BY al.year DESC LIMIT ? OFFSET ?`;
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
    LEFT JOIN song_artists sa ON s.id = sa.song_id AND sa.is_main = 1
    LEFT JOIN artists a ON sa.artist_id = a.id
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

  await attachGenres(database, songs);
  for (const song of songs) {
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
// FUNCIONES PARA CANCIONES SIN ALBUM NI ARTISTA
// ============================================================

export async function getSongsWithoutAlbumOrArtist({ userId = null, limit = 100, offset = 0 } = {}) {
  const database = await getDb();

  let sql = `
    SELECT
      s.id,
      s.title,
      s.relPath,
      s.duration,
      s.track,
      s.hasLyrics,
      (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM user_song_interactions usi
        WHERE usi.song_id = s.id
        AND usi.user_id = ?
        AND usi.interaction_type = 'LIKE'
      ) THEN 1 ELSE 0 END) AS liked
    FROM songs s
    WHERE s.album_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM song_artists sa WHERE sa.song_id = s.id
      )
  `;
  const params = [userId || null];

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
    song.genre = [];
    song.liked = !!song.liked;
  }

  let countSql = `
    SELECT COUNT(*) as total
    FROM songs s
    WHERE s.album_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM song_artists sa WHERE sa.song_id = s.id
      )
  `;
  const countParams = [];
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
        s.bpm,
        s.key_name,
        s.hasLyrics,
        a.name AS artist,
        al.name AS album,
        al.year AS year,
        al.cover_path,
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

    await attachGenres(database, songs);
    for (const song of songs) {
      // Asegurar que liked esté en true
      song.liked = true;
      song.hasCover = !!song.cover_path;
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

export async function getLikedSongIds(userId) {
  const database = await getDb();
  const rows = await database.all(
    'SELECT song_id FROM user_song_interactions WHERE user_id = ? AND interaction_type = "LIKE"',
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

export async function setSongHasLyrics(songId) {
  const database = await getDb();
  await database.run('UPDATE songs SET hasLyrics = 1 WHERE id = ?', [songId]);
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
  
  // Buscar coincidencia exacta primero
  const exactRow = await database.get('SELECT id, name FROM artists WHERE name = ?', [name]);
  if (exactRow) return exactRow.id;
  
  // Normalizar el nombre para comparación
  const normalizedInput = normalizeText(name);
  
  // Cargar (una sola vez) la lista de artistas en caché, en vez de recargar
  // toda la tabla `artists` por cada canción del escaneo (evita O(N) repetido).
  if (!artistCache) {
    const rows = await database.all('SELECT id, name FROM artists');
    artistCache = rows.map(r => ({ id: r.id, normalized: normalizeText(r.name) }));
  }
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const artist of artistCache) {
    const normalizedExisting = artist.normalized;
    
    // Coincidencia exacta normalizada
    if (normalizedInput === normalizedExisting) {
      return artist.id;
    }
    
    // Verificar si el nombre coincide con una variación (ej: "AFROJACK" en "AFROJACK & Shermanology")
    const inputWords = normalizedInput.split(/\s+/);
    const existingWords = normalizedExisting.split(/\s+/);
    
    // Si el input es más corto y todas sus palabras están en el nombre existente
    if (inputWords.length <= existingWords.length && inputWords.length <= 2) {
      const allMatch = inputWords.every(w => existingWords.includes(w));
      if (allMatch && inputWords.length > bestScore) {
        bestScore = inputWords.length;
        bestMatch = artist;
      }
    }
    
    // Si el nombre existente es más corto y todas sus palabras están en el input
    if (existingWords.length <= inputWords.length && existingWords.length <= 2) {
      const allMatch = existingWords.every(w => inputWords.includes(w));
      if (allMatch && existingWords.length > bestScore) {
        bestScore = existingWords.length;
        bestMatch = artist;
      }
    }
  }
  
  if (bestMatch) {
    return bestMatch.id;
  }
  
  const result = await database.run('INSERT INTO artists (name) VALUES (?)', [name]);
  // Mantener la caché al día para no tener que recargarla en la siguiente canción.
  artistCache.push({ id: result.lastID, normalized: normalizedInput });
  return result.lastID;
}

export async function getOrCreateAlbum(database, name, mainArtistId, year, coverPath = null) {
  if (!name || name === 'Álbum desconocido') return null;

  const safeYear = year ?? null;

  // Buscar álbum existente por (name, year) — coincide con el UNIQUE(name, year)
  // de la tabla. No incluimos main_artist_id en la búsqueda porque:
  // 1. El constraint UNIQUE es solo (name, year), no (name, year, main_artist_id)
  // 2. main_artist_id puede ser NULL (canciones con artista desconocido) y en SQL
  //    "WHERE col = NULL" nunca devuelve filas (NULL = NULL es desconocido)
  // 3. Varias canciones del mismo álbum pueden tener artistas diferentes
  const findAlbum = async () => {
    if (safeYear === null) {
      return await database.get(
        'SELECT id, cover_path FROM albums WHERE name = ? AND year IS NULL',
        [name]
      );
    }
    return await database.get(
      'SELECT id, cover_path FROM albums WHERE name = ? AND year = ?',
      [name, safeYear]
    );
  };

  let row = await findAlbum();
  if (row) {
    // Si ya existe pero no tiene cover y ahora tenemos uno, actualizarlo
    if (!row.cover_path && coverPath) {
      await database.run(
        'UPDATE albums SET cover_path = ? WHERE id = ?',
        [coverPath, row.id]
      );
    }
    return row.id;
  }

  // No existe — intentar crear. Usamos INSERT OR IGNORE como salvaguarda
  // contra condiciones de carrera o duplicados inesperados.
  const result = await database.run(
    'INSERT OR IGNORE INTO albums (name, main_artist_id, year, cover_path) VALUES (?, ?, ?, ?)',
    [name, mainArtistId, safeYear, coverPath]
  );

  if (result.lastID) {
    return result.lastID;
  }

  // INSERT fue ignorado (carrera o duplicado inesperado) — buscar el álbum existente
  row = await findAlbum();
  if (row) {
    if (!row.cover_path && coverPath) {
      await database.run(
        'UPDATE albums SET cover_path = ? WHERE id = ?',
        [coverPath, row.id]
      );
    }
    return row.id;
  }

  // No debería llegar aquí
  console.warn(`[db] getOrCreateAlbum: estado inesperado para álbum "${name}" (${safeYear})`);
  return null;
}

export async function getOrCreateGenre(database, name) {
  if (!name || name === 'Sin género') return null;
  
  const row = await database.get('SELECT id FROM genres WHERE name = ?', [name]);
  if (row) return row.id;
  
  const result = await database.run('INSERT INTO genres (name) VALUES (?)', [name]);
  return result.lastID;
}

// ============================================================
// INICIALIZACIÓN DEL ESQUEMA
// ============================================================

async function initSchema(database) {
  // Crear tablas si no existen
  await database.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      main_artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      year INTEGER,
      cover_path TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, year)
    );

    CREATE TABLE IF NOT EXISTS album_artists (
      album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      is_main INTEGER DEFAULT 0 CHECK(is_main IN (0,1)),
      PRIMARY KEY (album_id, artist_id)
    );

    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      relPath TEXT NOT NULL,
      duration INTEGER,
      track INTEGER,
      bpm REAL,
      key_name TEXT,
      hasLyrics INTEGER DEFAULT 0 CHECK(hasLyrics IN (0,1)),
      album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS song_artists (
      song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      is_main INTEGER DEFAULT 0 CHECK(is_main IN (0,1)),
      PRIMARY KEY (song_id, artist_id)
    );

    CREATE TABLE IF NOT EXISTS genres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS song_genres (
      song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
      genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
      PRIMARY KEY (song_id, genre_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      session_token TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_song_interactions (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
      interaction_type TEXT CHECK(interaction_type IN ('LIKE', 'HIDE', 'PLAY')),
      play_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, song_id, interaction_type)
    );

    CREATE TABLE IF NOT EXISTS user_artist_interactions (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      interaction_type TEXT CHECK(interaction_type IN ('FAVORITE', 'HIDE')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, artist_id)
    );

    CREATE TABLE IF NOT EXISTS user_favorite_albums (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, album_id)
    );

    CREATE TABLE IF NOT EXISTS user_favorite_genres (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, genre_id)
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlist_id TEXT REFERENCES playlists(id) ON DELETE CASCADE,
      song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (playlist_id, song_id)
    );

    CREATE TABLE IF NOT EXISTS lyrics (
      song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
      text TEXT,
      synced_text TEXT,
      translated_text TEXT,
      language TEXT DEFAULT 'es',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Asegurar que las columnas bpm y key_name existen (migración para bases de datos existentes)
  try {
    await database.exec('ALTER TABLE songs ADD COLUMN bpm REAL');
  } catch (e) { /* Ya existe */ }
  try {
    await database.exec('ALTER TABLE songs ADD COLUMN key_name TEXT');
  } catch (e) { /* Ya existe */ }

  // Índices para las consultas/joins más frecuentes. Se crean con IF NOT
  // EXISTS, así que no rompen un esquema ya existente (solo aceleran).
  await database.exec(`
    CREATE INDEX IF NOT EXISTS idx_usi_user_type ON user_song_interactions(user_id, interaction_type);
    CREATE INDEX IF NOT EXISTS idx_usi_song_type ON user_song_interactions(song_id, interaction_type);
    CREATE INDEX IF NOT EXISTS idx_uai_user_type ON user_artist_interactions(user_id, interaction_type);
    CREATE INDEX IF NOT EXISTS idx_sa_artist ON song_artists(artist_id);
    CREATE INDEX IF NOT EXISTS idx_sa_song ON song_artists(song_id, is_main);
    CREATE INDEX IF NOT EXISTS idx_sg_genre ON song_genres(genre_id);
    CREATE INDEX IF NOT EXISTS idx_sg_song ON song_genres(song_id);
    CREATE INDEX IF NOT EXISTS idx_ps_playlist ON playlist_songs(playlist_id, position);
    CREATE INDEX IF NOT EXISTS idx_song_album ON songs(album_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_user ON playlists(user_id);
  `);

  // Crear vistas
  try {
    // Las vistas pueden traer un esquema desactualizado si fueron creadas por una
    // versión anterior de scripts/build_music_db.py (que omitía bpm/key_name). Como
    // aquí usamos CREATE VIEW IF NOT EXISTS, una vista existente a la que le falten
    // esas columnas no se corregiría sola y rompería las queries que seleccionan
    // v.bpm / v.key_name (p. ej. getSongsWithDetails) con "no such column".
    // Detectamos el esquema y, si falta bpm o key_name, reconstruimos la vista.
    try {
      const cols = await database.all(
        `SELECT name FROM pragma_table_info('v_complete_songs') WHERE name IN ('bpm','key_name')`
      );
      if (cols.length < 2) {
        console.log('[db] 🔧 v_complete_songs sin bpm/key_name; reconstruyendo vistas...');
        await database.exec('DROP VIEW IF EXISTS v_playlist_details');
        await database.exec('DROP VIEW IF EXISTS v_complete_songs');
      }
    } catch { /* La vista aún no existe; el CREATE IF NOT EXISTS de abajo la creará */ }

    await database.exec(`
      CREATE VIEW IF NOT EXISTS v_complete_songs AS
      SELECT
        s.id AS song_id,
        s.title AS song_title,
        s.relPath AS relative_path,
        s.duration,
        s.track,
        s.bpm,
        s.key_name,
        s.hasLyrics,
        al.id AS album_id,
        al.name AS album_name,
        al.year AS album_year,
        al.cover_path,
        GROUP_CONCAT(art.name, ', ') AS artists_names,
        MAX(CASE WHEN sa.is_main = 1 THEN art.id END) AS main_artist_id,
        MAX(CASE WHEN sa.is_main = 1 THEN art.name END) AS main_artist_name
      FROM songs s
      LEFT JOIN albums al ON s.album_id = al.id
      LEFT JOIN song_artists sa ON s.id = sa.song_id
      LEFT JOIN artists art ON sa.artist_id = art.id
      GROUP BY s.id
    `);

    await database.exec(`
      CREATE VIEW IF NOT EXISTS v_playlist_details AS
      SELECT
        ps.playlist_id,
        p.name AS playlist_name,
        p.user_id AS owner_id,
        ps.position,
        vcs.*
      FROM playlist_songs ps
      JOIN playlists p ON ps.playlist_id = p.id
      JOIN v_complete_songs vcs ON ps.song_id = vcs.song_id
      ORDER BY ps.playlist_id, ps.position
    `);
  } catch (err) {
    // Si las vistas ya existen, ignorar error
    console.log('[db] Vistas ya creadas (o error menor):', err.message);
  }

  console.log('[db] ✅ Esquema verificado/creado');
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