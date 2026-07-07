import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';
import 'dotenv/config';

// ====== CONFIGURACIÓN ======
export const MUSIC_DIR = process.env.VITE_MUSIC_PATH || path.join(process.cwd(), 'music');
export const TRASH_DIR = path.join(MUSIC_DIR, 'trash');
export const CACHE_PATH = path.join(process.cwd(), 'server', 'songs_cache.json');

console.log('[scanner] 📂 MUSIC_DIR:', MUSIC_DIR);
console.log('[scanner] 📂 CACHE_PATH:', CACHE_PATH);

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.webm']);

// ====== CACHE EN MEMORIA ======
let cache = { songs: [], byId: new Map(), scannedAt: 0, musicPath: MUSIC_DIR };

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
  return {
    id,
    relPath,
    title: common.title || cleanName(file),
    artist: common.artist || common.albumartist || pathArtist || 'Artista desconocido',
    album: common.album || pathAlbum || 'Álbum desconocido',
    genre: (common.genre && common.genre[0]) || 'Sin género',
    year: common.year || null,
    track: (common.track && common.track.no) || null,
    duration: format.duration ? Math.round(format.duration) : null,
    hasCover: Boolean(picture),
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
    return cache;
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
  
  songs.sort((a, b) => a.title.localeCompare(b.title, 'es'));
  const byId = new Map(songs.map((s) => [s.id, s]));
  cache = { songs, byId, scannedAt: Date.now(), musicPath: MUSIC_DIR };
  
  // Guardar caché
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify({
      songs: cache.songs,
      scannedAt: cache.scannedAt,
      musicPath: MUSIC_DIR
    }, null, 2));
    console.log(`[scanner] 💾 ${cache.songs.length} canciones guardadas en caché.`);
  } catch (err) {
    console.warn('[scanner] Error guardando caché:', err.message);
  }
  
  console.log(`[scanner] ✅ ${songs.length} canciones indexadas.`);
  return cache;
}

// ====== ESCANEO PRINCIPAL ======

export async function scanLibrary() {
  console.log(`[scanner] 🔍 Iniciando escaneo de biblioteca...`);
  
  // Intentar cargar desde caché
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const data = fs.readFileSync(CACHE_PATH, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed.songs && parsed.musicPath === MUSIC_DIR && parsed.songs.length > 0) {
        const byId = new Map(parsed.songs.map((s) => [s.id, s]));
        cache = { 
          songs: parsed.songs, 
          byId, 
          scannedAt: parsed.scannedAt || 0,
          musicPath: parsed.musicPath
        };
        console.log(`[scanner] 📚 ${cache.songs.length} canciones cargadas desde caché.`);
        return cache;
      }
    }
  } catch (err) {
    console.warn('[scanner] Error cargando caché:', err.message);
  }
  
  // Si no hay caché, escanear completo
  return await scanFullLibrary();
}

export async function rescanLibrary() {
  console.log('[scanner] 🔄 Forzando rescan completo...');
  return await scanFullLibrary();
}

export function removeSongFromCache(songId) {
  const songIndex = cache.songs.findIndex(s => s.id === songId);
  if (songIndex !== -1) {
    cache.songs.splice(songIndex, 1);
    cache.byId.delete(songId);
    try {
      fs.writeFileSync(CACHE_PATH, JSON.stringify({
        songs: cache.songs,
        scannedAt: cache.scannedAt,
        musicPath: MUSIC_DIR
      }, null, 2));
    } catch (err) {
      console.warn('[scanner] Error guardando caché:', err.message);
    }
    console.log(`[scanner] 🗑️ Canción ${songId} eliminada del caché`);
    return true;
  }
  return false;
}

// ====== EXPORTACIONES ======

export function getCache() {
  console.log('[scanner] getCache() - Canciones:', cache.songs?.length || 0);
  return cache;
}

export function getSongById(id) {
  return cache.byId.get(id);
}

export function absolutePath(relPath) {
  return path.join(MUSIC_DIR, relPath);
}

// ====== INICIALIZAR ======
// Cargar caché al importar
try {
  if (fs.existsSync(CACHE_PATH)) {
    const data = fs.readFileSync(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(data);
    if (parsed.songs && parsed.musicPath === MUSIC_DIR && parsed.songs.length > 0) {
      const byId = new Map(parsed.songs.map((s) => [s.id, s]));
      cache = { 
        songs: parsed.songs, 
        byId, 
        scannedAt: parsed.scannedAt || 0,
        musicPath: parsed.musicPath
      };
      console.log(`[scanner] 📚 ${cache.songs.length} canciones cargadas desde caché.`);
    }
  }
} catch (err) {
  console.warn('[scanner] Error en inicialización:', err.message);
}