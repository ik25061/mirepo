// ============================================================
// scanner.js - ESCANEO DE BIBLIOTECA
// ============================================================
// Modificado para trabajar con SQLite localfy.db
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';
import 'dotenv/config';

// ====== CONFIGURACIÓN ======
export const MUSIC_DIR = process.env.VITE_MUSIC_PATH || 'E:/musica';
export const TRASH_DIR = path.join(MUSIC_DIR, 'trash');

console.log('[scanner] 📂 MUSIC_DIR:', MUSIC_DIR);

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.webm']);

// ====== CACHE EN MEMORIA (solo para uso interno del servidor) ======
let songCache = [];
let songMap = new Map();

// ====== FUNCIONES AUXILIARES ======

function ensureDirs() {
  try {
    if (!fs.existsSync(MUSIC_DIR)) {
      fs.mkdirSync(MUSIC_DIR, { recursive: true });
      console.log(`[scanner] 📁 Directorio creado: ${MUSIC_DIR}`);
    }
    if (!fs.existsSync(TRASH_DIR)) {
      fs.mkdirSync(TRASH_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('[scanner] Error creando directorios:', err);
  }
}

function walk(dir, files = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (path.resolve(full) === path.resolve(TRASH_DIR)) continue;
        walk(full, files);
      } else if (AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) {
        files.push(full);
      }
    }
  } catch (err) {
    console.warn('[scanner] Error walking', dir, err.message);
  }
  return files;
}

function idFor(relPath) {
  return crypto.createHash('sha1').update(relPath).digest('hex').slice(0, 16);
}

function cleanName(file) {
  return path
    .basename(file, path.extname(file))
    .replace(/^\d+\s*[-.]\s*/, '')
    .replace(/_/g, ' ')
    .trim();
}

function extractArtistAlbum(relPath) {
  const parts = relPath.split(path.sep);
  if (parts.length >= 2) {
    return { artist: parts[0], album: parts[1] };
  }
  return { artist: 'Artista desconocido', album: 'Álbum desconocido' };
}

async function readSong(file) {
  const relPath = path.relative(MUSIC_DIR, file);
  const id = idFor(relPath);
  const { artist: pathArtist, album: pathAlbum } = extractArtistAlbum(relPath);
  
  let common = {};
  let format = {};
  try {
    const meta = await parseFile(file, { duration: true });
    common = meta.common || {};
    format = meta.format || {};
  } catch (err) {
    // Silencioso
  }

  const picture = common.picture && common.picture[0];
  
  let genres = ['Sin género'];
  if (common.genre && common.genre[0]) {
    genres = common.genre[0]
      .split(';')
      .map(g => g.trim())
      .filter(g => g.length > 0);
    if (genres.length === 0) genres = ['Sin género'];
  }
  
  const basePath = file.slice(0, -path.extname(file).length);
  const hasLyrics = fs.existsSync(`${basePath}.lrc`);
  
  return {
    id,
    relPath,
    title: common.title || cleanName(file),
    artist: common.artist || common.albumartist || pathArtist || 'Artista desconocido',
    album: common.album || pathAlbum || 'Álbum desconocido',
    genre: genres,
    year: common.year || null,
    track: (common.track && common.track.no) || null,
    duration: format.duration ? Math.round(format.duration) : null,
    hasCover: Boolean(picture),
    hasLyrics,
  };
}

// ====== ESCANEO COMPLETO ======

export async function scanFullLibrary() {
  ensureDirs();
  console.log(`[scanner] 🔍 Escaneando ${MUSIC_DIR}...`);
  
  try {
    fs.statSync(MUSIC_DIR);
  } catch (err) {
    console.error(`[scanner] ❌ Error: ${MUSIC_DIR} no existe o no es accesible`);
    return;
  }
  
  const audioFiles = walk(MUSIC_DIR);
  console.log(`[scanner] 📁 ${audioFiles.length} archivos de audio encontrados`);
  
  const songs = [];
  let processed = 0;
  const total = audioFiles.length;
  
  for (const file of audioFiles) {
    processed++;
    if (processed % 10 === 0 || processed === total) {
      console.log(`[scanner] ⏳ Progreso: ${processed}/${total} archivos procesados`);
    }
    try {
      const song = await readSong(file);
      songs.push(song);
    } catch (err) {
      console.warn('[scanner] Error procesando archivo:', file, err.message);
    }
  }
  
  console.log(`[scanner] ✅ ${songs.length} canciones leídas`);
  
  // Guardar en la base de datos SQLite
  await saveSongsToDatabase(songs);
  
  // Actualizar cache en memoria
  songCache = songs;
  songMap = new Map(songs.map(s => [s.id, s]));
  
  console.log(`[scanner] 💾 ${songs.length} canciones guardadas en SQLite`);
  return { songs, total: songs.length };
}

// ====== GUARDAR EN SQLITE ======

async function saveSongsToDatabase(songs) {
  const { open } = await import('sqlite');
  const sqlite3 = await import('sqlite3');
  const pathModule = await import('node:path');
  const __dirname = pathModule.dirname(new URL(import.meta.url).pathname);
  const DB_PATH = pathModule.join(__dirname, 'localfy.db');
  
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
  
  // Activar claves foráneas
  await db.exec('PRAGMA foreign_keys = ON');
  
  // Usar una transacción para mejor rendimiento
  await db.exec('BEGIN TRANSACTION');
  
  try {
    // Para cada canción, obtener o crear artista, álbum, año, géneros
    for (const song of songs) {
      // 1. Obtener o crear artista
      let artistId = null;
      if (song.artist && song.artist !== 'Artista desconocido') {
        const artistRow = await db.get(
          'SELECT id FROM artists WHERE name = ?',
          [song.artist]
        );
        if (artistRow) {
          artistId = artistRow.id;
        } else {
          const result = await db.run(
            'INSERT INTO artists (name) VALUES (?)',
            [song.artist]
          );
          artistId = result.lastID;
        }
      }
      
      // 2. Obtener o crear año
      let yearId = null;
      if (song.year) {
        const yearRow = await db.get(
          'SELECT id FROM years WHERE year = ?',
          [song.year]
        );
        if (yearRow) {
          yearId = yearRow.id;
        } else {
          const result = await db.run(
            'INSERT INTO years (year) VALUES (?)',
            [song.year]
          );
          yearId = result.lastID;
        }
      }
      
      // 3. Obtener o crear álbum
      let albumId = null;
      if (song.album && song.album !== 'Álbum desconocido') {
        const albumRow = await db.get(
          'SELECT id FROM albums WHERE name = ? AND artist_id = ?',
          [song.album, artistId]
        );
        if (albumRow) {
          albumId = albumRow.id;
        } else {
          const result = await db.run(
            'INSERT INTO albums (name, artist_id, year) VALUES (?, ?, ?)',
            [song.album, artistId, song.year]
          );
          albumId = result.lastID;
        }
      }
      
      // 4. Insertar canción
      await db.run(
        `INSERT OR REPLACE INTO songs
         (id, title, relPath, duration, track, hasLyrics, artist_id, album_id, year_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          song.id,
          song.title,
          song.relPath,
          song.duration,
          song.track,
          song.hasLyrics ? 1 : 0,
          artistId,
          albumId,
          yearId
        ]
      );
      
      // 5. Insertar géneros y relaciones
      for (const genreName of song.genre) {
        if (genreName && genreName !== 'Sin género') {
          let genreId = null;
          const genreRow = await db.get(
            'SELECT id FROM genres WHERE name = ?',
            [genreName]
          );
          if (genreRow) {
            genreId = genreRow.id;
          } else {
            const result = await db.run(
              'INSERT INTO genres (name) VALUES (?)',
              [genreName]
            );
            genreId = result.lastID;
          }
          
          if (genreId) {
            await db.run(
              'INSERT OR IGNORE INTO song_genres (song_id, genre_id) VALUES (?, ?)',
              [song.id, genreId]
            );
          }
        }
      }
    }
    
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    console.error('[scanner] Error en transacción:', err);
    throw err;
  }
  
  await db.close();
}

// ====== ESCANEO INCREMENTAL ======

export async function incrementalScanLibrary() {
  console.log('[scanner] 🔄 Escaneo incremental...');
  return await scanFullLibrary();
}

// ====== ESCANEO PRINCIPAL ======

export async function scanLibrary() {
  console.log(`[scanner] 🔍 Iniciando escaneo de biblioteca...`);
  return await scanFullLibrary();
}

export async function rescanLibrary() {
  console.log('[scanner] 🔄 Forzando rescan completo...');
  return await scanFullLibrary();
}

// ====== EXPORTACIONES ======

export function getCache() {
  return { songs: songCache, byId: songMap };
}

export function getSongById(id) {
  return songMap.get(id);
}

export function absolutePath(relPath) {
  return path.join(MUSIC_DIR, relPath);
}

export function removeSongFromCache(songId) {
  const index = songCache.findIndex(s => s.id === songId);
  if (index !== -1) {
    songCache.splice(index, 1);
    songMap.delete(songId);
    return true;
  }
  return false;
}

export function saveCache(newCache) {
  // Ya no se usa, los datos están en SQLite
  console.log('[scanner] ⚠️ saveCache obsoleto, los datos están en SQLite');
}

// Inicializar
ensureDirs();