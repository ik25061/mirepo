// ============================================================
// scanner.js - ESCANEO DE BIBLIOTECA
// ============================================================
// Estructura de carpetas:
//   E:/musica/nombrecarpeta/cancion.mp3
//   E:/musica/nombrecarpeta/cancion.lrc
//   E:/musica/nombrecarpeta/artist - nombreartista.jpg  (foto del artista)
//   E:/musica/nombrecarpeta/album - nombrealbum.jpg      (cover del álbum)
// El nombre de la carpeta (nombrecarpeta) NO se usa como dato de la canción;
// todos los datos (titulo, artista, genero, album, año) salen de los metadatos.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';
import 'dotenv/config';

// IMPORTAR FUNCIONES DE DB
import { 
  getDb,
  getOrCreateArtist, 
  getOrCreateAlbum, 
  getOrCreateGenre
} from './db.js';

// ====== CONFIGURACIÓN ======
export const MUSIC_DIR = process.env.VITE_MUSIC_PATH || 'E:/musica';
export const TRASH_DIR = path.join(MUSIC_DIR, 'trash');

console.log('[scanner] 📂 MUSIC_DIR:', MUSIC_DIR);

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.webm']);

// ====== CACHE EN MEMORIA ======
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

/**
 * Extrae artista y álbum de la ruta relativa.
 * NUEVA ESTRUCTURA: E:/musica/nombrecarpeta/cancion.mp3
 * El nombre de la carpeta (nombrecarpeta) NO se toma como dato de la canción:
 * el artista y álbum se obtienen exclusivamente de los metadatos ID3/Vorbis.
 */
function extractArtistAlbum(relPath) {
  // No tomar el nombre de la carpeta como dato de la canción.
  // El artista y álbum se obtienen de los metadatos del archivo de audio.
  return { artist: null, album: null };
}

function extractMainArtist(artistName) {
  if (!artistName) return null;
  
  // Detectar patrones de colaboración
  const patterns = [
    /\s*\(feat\.?[^)]*\)/i,
    /\s*\(ft\.?[^)]*\)/i,
    /\s*\(featuring[^)]*\)/i,
    /\s*feat\.?\s.*/i,
    /\s*ft\.?\s.*/i,
    /\s*featuring\s.*/i,
    /\s*&\s.*/i,
    /\s*con\s.*/i,
    /\s*vs\.?\s.*/i,
    /\s*,\s.*/i,
    /\s*;\s.*/i,
  ];

  let name = artistName.trim();
  for (const p of patterns) {
    const match = name.match(p);
    if (match) {
      name = name.slice(0, match.index).trim();
      break;
    }
  }
  return name || artistName;
}

/**
 * Busca un archivo de cover en el directorio del artista
 * con el formato: "album - nombrealbum.jpg" o "album - nombrealbum.png"
 */
function findCoverForAlbum(artistDir, albumName) {
  if (!albumName || albumName === 'Álbum desconocido') return null;
  
  try {
    const entries = fs.readdirSync(artistDir, { withFileTypes: true });
    const coverExts = ['.jpg', '.jpeg', '.png', '.webp'];
    
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (coverExts.includes(ext)) {
          // El formato esperado es: "album - nombrealbum.ext"
          // Buscamos archivos que contengan el nombre del álbum
          const nameWithoutExt = path.basename(entry.name, ext);
          // Normalizar para comparación: quitar espacios extra, lowercase
          const normalizedName = nameWithoutExt.replace(/\s+/g, ' ').trim().toLowerCase();
          const normalizedAlbum = albumName.replace(/\s+/g, ' ').trim().toLowerCase();
          
          // El nombre del archivo debe contener el nombre del álbum
          // y tener un guión (separador album - nombre) o coincidir directamente
          if (normalizedName.includes(normalizedAlbum) || 
              normalizedName.endsWith(normalizedAlbum)) {
            return path.join(artistDir, entry.name);
          }
        }
      }
    }
  } catch (err) {
    // Si no existe el directorio o no se puede leer, ignorar silenciosamente
  }
  return null;
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
  
  let genres = [];
  if (common.genre) {
    // Procesar todos los elementos del array (music-metadata puede devolver varios)
    for (const rawGenre of common.genre) {
      if (!rawGenre) continue;
      // Dividir por los separadores más comunes: ; / , y |
      const parts = rawGenre.split(/[;/\|]/).map(g => g.trim()).filter(g => g.length > 0);
      genres.push(...parts);
    }
  }
  // Eliminar duplicados y normalizar
  genres = [...new Set(genres)];
  if (genres.length === 0) genres = ['Sin género'];

  // Detectar letra .lrc al lado del archivo de audio
  const basePath = file.slice(0, -path.extname(file).length);
  const hasLyrics = fs.existsSync(`${basePath}.lrc`);
  
  // Extraer artista principal (sin colaboradores)
  const rawArtist = common.artist || common.albumartist || pathArtist || 'Artista desconocido';
  const mainArtist = extractMainArtist(rawArtist);
  
  // Obtener nombre del álbum (solo de metadatos, ya no de la ruta)
  const albumName = common.album || 'Álbum desconocido';
  
  // Buscar cover en el directorio donde vive la canción con el nuevo formato
  // El cover está en: E:/musica/nombrecarpeta/album - nombrealbum.jpg
  let coverPath = null;
  if (albumName && albumName !== 'Álbum desconocido') {
    const songDir = path.dirname(file); // E:/musica/nombrecarpeta
    const foundCover = findCoverForAlbum(songDir, albumName);
    if (foundCover) {
      coverPath = path.relative(MUSIC_DIR, foundCover);
    }
  }
  
  // Fallback: si no se encontró cover por nombre de álbum,
  // priorizar archivos con prefijo "album - ..." y excluir "artist - ..."
  if (!coverPath) {
    const songDir = path.dirname(file);
    try {
      const entries = fs.readdirSync(songDir, { withFileTypes: true });
      const coverExts = ['.jpg', '.jpeg', '.png', '.webp'];
      const imageFiles = entries
        .filter(e => e.isFile() && coverExts.includes(path.extname(e.name).toLowerCase()))
        .map(e => e.name);
      // 1. Preferir el archivo de portada de álbum: "album - nombrealbum.jpg"
      const albumFile = imageFiles.find(name => /^album[\s\-_]*/i.test(name));
      // 2. Si no hay, tomar cualquier imagen que NO sea la del artista
      const firstNonArtist = albumFile
        ? null
        : imageFiles.find(name => !/^artist[\s\-_]*/i.test(name));
      const chosen = albumFile || firstNonArtist;
      if (chosen) {
        coverPath = path.relative(MUSIC_DIR, path.join(songDir, chosen));
      }
    } catch (err) {
      // ignorar
    }
  }

  return {
    id,
    relPath,
    title: common.title || cleanName(file),
    artist: mainArtist,
    rawArtist: rawArtist,
    album: albumName,
    genre: genres,
    year: common.year || null,
    track: (common.track && common.track.no) || null,
    bpm: common.bpm || null,
    key_name: common.key || null,
    duration: format.duration ? Math.round(format.duration) : null,
    hasCover: Boolean(picture) || Boolean(coverPath),
    hasLyrics,
    coverPath, // Guardamos para insertar en albums.cover_path
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
  
  // Guardar en la base de datos SQLite (con limpieza de registros obsoletos)
  await saveSongsToDatabase(songs);
  
  // Limpiar registros huérfanos (canciones que ya no existen en el filesystem)
  await cleanupDatabase(audioFiles.map(f => path.relative(MUSIC_DIR, f)));
  
  // Actualizar cache en memoria
  songCache = songs;
  songMap = new Map(songs.map(s => [s.id, s]));
  
  console.log(`[scanner] 💾 ${songs.length} canciones guardadas en SQLite`);
  return { songs, total: songs.length };
}

// ====== GUARDAR EN SQLITE ======

async function saveSongsToDatabase(songs) {
  const database = await getDb();
  
  await database.exec('BEGIN TRANSACTION');
  
  try {
    for (const song of songs) {
      // 1. Obtener o crear artista principal
      let mainArtistId = null;
      if (song.artist && song.artist !== 'Artista desconocido') {
        mainArtistId = await getOrCreateArtist(database, song.artist);
      }

      // 2. Obtener o crear álbum (ahora con cover_path)
      let albumId = null;
      if (song.album && song.album !== 'Álbum desconocido') {
        albumId = await getOrCreateAlbum(database, song.album, mainArtistId, song.year, song.coverPath);
      }

      // 3. Insertar canción
      await database.run(
        `INSERT OR REPLACE INTO songs
         (id, title, relPath, duration, track, bpm, key_name, hasLyrics, album_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          song.id,
          song.title,
          song.relPath,
          song.duration,
          song.track,
          song.bpm,
          song.key_name,
          song.hasLyrics ? 1 : 0,
          albumId
        ]
      );
      
      // 4. Insertar relación canción-artista principal
      if (mainArtistId) {
        await database.run(
          `INSERT OR IGNORE INTO song_artists (song_id, artist_id, is_main)
           VALUES (?, ?, 1)`,
          [song.id, mainArtistId]
        );
      }

      // 4.5. Insertar relación álbum-artista principal
      if (albumId && mainArtistId) {
        await database.run(
          `INSERT OR IGNORE INTO album_artists (album_id, artist_id, is_main)
           VALUES (?, ?, 1)`,
          [albumId, mainArtistId]
        );
      }

      // 5. Insertar géneros y relaciones
      for (const genreName of song.genre) {
        if (genreName && genreName !== 'Sin género') {
          const genreId = await getOrCreateGenre(database, genreName);
          if (genreId) {
            await database.run(
              `INSERT OR IGNORE INTO song_genres (song_id, genre_id)
               VALUES (?, ?)`,
              [song.id, genreId]
            );
          }
        }
      }
    }
    
    await database.exec('COMMIT');
  } catch (err) {
    await database.exec('ROLLBACK');
    console.error('[scanner] Error en transacción:', err);
    throw err;
  }
}

// ====== LIMPIEZA DE REGISTROS OBSOLETOS ======

async function cleanupDatabase(currentFiles) {
  const database = await getDb();
  const currentFilesSet = new Set(currentFiles);
  
  console.log('[scanner] 🧹 Limpiando registros obsoletos...');
  
  try {
    // Obtener todas las canciones de la BD
    const allSongs = await database.all('SELECT id, relPath FROM songs');
    
    let deletedSongs = 0;
    let deletedArtists = 0;
    let deletedAlbums = 0;
    
    for (const song of allSongs) {
      // Si la canción ya no existe en el filesystem, eliminarla
      if (!currentFilesSet.has(song.relPath)) {
        await database.run('DELETE FROM songs WHERE id = ?', [song.id]);
        deletedSongs++;
      }
    }
    
    console.log(`[scanner] ✅ ${deletedSongs} canciones eliminadas`);
    
    // Limpiar artistas sin canciones
    await database.exec(`
      DELETE FROM artists 
      WHERE id NOT IN (SELECT DISTINCT artist_id FROM song_artists)
    `);
    const artistsResult = await database.get('SELECT changes() as count');
    deletedArtists = artistsResult.count;
    
    // Limpiar álbumes sin canciones
    await database.exec(`
      DELETE FROM albums 
      WHERE id NOT IN (SELECT DISTINCT album_id FROM songs WHERE album_id IS NOT NULL)
    `);
    const albumsResult = await database.get('SELECT changes() as count');
    deletedAlbums = albumsResult.count;
    
    console.log(`[scanner] ✅ ${deletedArtists} artistas eliminados`);
    console.log(`[scanner] ✅ ${deletedAlbums} álbumes eliminados`);
    
    // Limpiar géneros sin canciones
    await database.exec(`
      DELETE FROM genres 
      WHERE id NOT IN (SELECT DISTINCT genre_id FROM song_genres)
    `);
    const genresResult = await database.get('SELECT changes() as count');
    console.log(`[scanner] ✅ ${genresResult.count} géneros eliminados`);
    
  } catch (err) {
    console.error('[scanner] Error en limpieza:', err);
  }
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
  console.log('[scanner] ⚠️ saveCache obsoleto, los datos están en SQLite');
}

// Inicializar
ensureDirs();