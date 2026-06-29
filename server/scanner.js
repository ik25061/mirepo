import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';
import 'dotenv/config';

export const MUSIC_DIR = process.env.VITE_MUSIC_PATH || path.join(process.cwd(), 'music');
export const TRASH_DIR = path.join(MUSIC_DIR, 'trash');
export const CACHE_PATH = path.join(process.cwd(), 'server', 'songs_cache.json');

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.webm']);

// Cache en memoria
let cache = { songs: [], byId: new Map(), scannedAt: 0, musicPath: MUSIC_DIR };

// ====== PERSISTENCIA EN JSON ======

function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const data = fs.readFileSync(CACHE_PATH, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed.songs && parsed.musicPath === MUSIC_DIR) {
        const byId = new Map(parsed.songs.map((s) => [s.id, s]));
        cache = { 
          songs: parsed.songs, 
          byId, 
          scannedAt: parsed.scannedAt || 0,
          musicPath: parsed.musicPath
        };
        console.log(`[scanner] 📚 ${cache.songs.length} canciones cargadas desde caché.`);
        return true;
      }
    }
  } catch (err) {
    console.warn('[scanner] Error cargando caché:', err.message);
  }
  return false;
}

function saveCache() {
  try {
    const data = {
      songs: cache.songs,
      scannedAt: cache.scannedAt,
      musicPath: MUSIC_DIR
    };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2));
    console.log(`[scanner] 💾 ${cache.songs.length} canciones guardadas en caché.`);
  } catch (err) {
    console.warn('[scanner] Error guardando caché:', err.message);
  }
}

// ====== ESCANEO ======

function ensureDirs() {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  fs.mkdirSync(TRASH_DIR, { recursive: true });
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

async function scanFullLibrary() {
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
      process.stdout.write(`\x1b[F\x1b[K`); // Mover cursor arriba y limpiar línea en terminal
    }
    try {
      const song = await readSong(file);
      songs.push(song);
    } catch (err) {
      // Silencioso
    }
  }
  
  songs.sort((a, b) => a.title.localeCompare(b.title, 'es'));
  const byId = new Map(songs.map((s) => [s.id, s]));
  cache = { songs, byId, scannedAt: Date.now(), musicPath: MUSIC_DIR };
  saveCache();
  console.log(`[scanner] ✅ ${songs.length} canciones indexadas.`);
  return cache;
}

// ====== ESCANEO PRINCIPAL (con caché) ======

export async function scanLibrary() {
  console.log(`[scanner] 🔍 Iniciando escaneo de biblioteca...`);
  // Intentar cargar desde caché
  if (loadCache()) {
    try {
      const currentFiles = new Set();
      const files = walk(MUSIC_DIR);
      for (const f of files) {
        const relPath = path.relative(MUSIC_DIR, f);
        currentFiles.add(relPath);
      }
      
      const cachedFiles = new Set(cache.songs.map(s => s.relPath));
      
      const newFiles = [...currentFiles].filter(f => !cachedFiles.has(f));
      const deletedFiles = [...cachedFiles].filter(f => !currentFiles.has(f));
      
      if (newFiles.length === 0 && deletedFiles.length === 0) {
        console.log(`[scanner] ✅ Sin cambios detectados. ${cache.songs.length} canciones cargadas.`);
        console.log(`[scanner] 🎵 Escaneo rápido completado.`);
        return cache;
      }
      
      console.log(`[scanner] 🔄 Cambios detectados: +${newFiles.length} nuevos, -${deletedFiles.length} eliminados`);
      console.log(`[scanner] ⏳ Procesando archivos nuevos...`);
      
      const songs = cache.songs.filter(s => !deletedFiles.includes(s.relPath));
      let processed = 0;
      const total = newFiles.length;
      
      for (const relPath of newFiles) {
        processed++;
        if (processed % 5 === 0 || processed === total) {
          console.log(`[scanner] ⏳ Procesando: ${processed}/${total} archivos nuevos`);
        }
        const fullPath = path.join(MUSIC_DIR, relPath);
        const song = await readSong(fullPath);
        songs.push(song);
      }
      
      songs.sort((a, b) => a.title.localeCompare(b.title, 'es'));
      const byId = new Map(songs.map((s) => [s.id, s]));
      cache = { songs, byId, scannedAt: Date.now(), musicPath: MUSIC_DIR };
      saveCache();
      console.log(`[scanner] ✅ ${songs.length} canciones indexadas.`);
    } catch (err) {
      console.error('[scanner] Error verificando cambios:', err.message);
    }
    return cache;
  }
  
  return await scanFullLibrary();
}

// ====== FORZAR RESCAN ======

export async function rescanLibrary() {
  console.log('[scanner] 🔄 Forzando rescan completo...');
  return await scanFullLibrary();
}

// ====== ELIMINAR CANCIÓN DEL CACHÉ ======

export function removeSongFromCache(songId) {
  const songIndex = cache.songs.findIndex(s => s.id === songId);
  if (songIndex !== -1) {
    cache.songs.splice(songIndex, 1);
    cache.byId.delete(songId);
    saveCache();
    console.log(`[scanner] 🗑️ Canción ${songId} eliminada del caché`);
    return true;
  }
  return false;
}

// ====== EXPORTACIONES ======

export function getCache() {
  return cache;
}

export function getSongById(id) {
  return cache.byId.get(id);
}

export function absolutePath(relPath) {
  return path.join(MUSIC_DIR, relPath);
}

// Inicializar cargando caché al importar
loadCache();