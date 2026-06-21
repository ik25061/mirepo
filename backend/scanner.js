import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseFile } from "music-metadata";

// Configuración desde .env
const MUSIC_PATH = process.env.MUSIC_PATH || path.join(process.env.HOME || process.env.USERPROFILE, "Music");
export const MUSIC_DIR = MUSIC_PATH;
export const TRASH_DIR = path.join(MUSIC_DIR, ".trash");

const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".opus", ".webm"]);

// Cache en memoria
let cache = { songs: [], byId: new Map(), scannedAt: 0 };

function ensureDirs() {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  fs.mkdirSync(TRASH_DIR, { recursive: true });
}

function walk(dir, files = []) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      // Nunca incluir la carpeta trash en la biblioteca
      if (entry.isDirectory()) {
        if (path.resolve(full) === path.resolve(TRASH_DIR)) continue;
        walk(full, files);
      } else if (AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) {
        files.push(full);
      }
    }
  } catch (err) {
    console.warn("[scanner] Error al escanear directorio:", err.message);
  }
  return files;
}

function idFor(relPath) {
  return crypto.createHash("sha1").update(relPath).digest("hex").slice(0, 16);
}

function cleanName(file) {
  const basename = path.basename(file, path.extname(file));
  return basename
    .replace(/^\d+\s*[-.]\s*/, "")
    .replace(/_/g, " ")
    .trim() || basename;
}

async function readSong(file) {
  const relPath = path.relative(MUSIC_DIR, file);
  const id = idFor(relPath);
  let common = {};
  let format = {};

  try {
    const meta = await parseFile(file, { duration: true });
    common = meta.common || {};
    format = meta.format || {};
  } catch (err) {
    console.warn("[scanner] No se pudieron leer metadatos de", relPath, err.message);
  }

  const picture = common.picture && common.picture[0];
  const title = common.title || cleanName(file);
  const artist = common.artist || common.albumartist || "Artista desconocido";
  const album = common.album || "Álbum desconocido";
  const genre = (common.genre && common.genre[0]) || "Sin género";
  const year = common.year || null;
  const track = (common.track && common.track.no) || null;
  const duration = format.duration ? Math.round(format.duration) : null;

  return {
    id,
    relPath,
    title,
    artist,
    album,
    albumArtist: common.albumartist || common.artist || "Artista desconocido",
    genre,
    year,
    track,
    duration,
    hasCover: Boolean(picture),
    path: file
  };
}

/**
 * Escanea la carpeta de música y refresca el cache
 */
export async function scanLibrary() {
  ensureDirs();
  console.log("[scanner] Escaneando directorio:", MUSIC_DIR);
  const files = walk(MUSIC_DIR);
  const songs = [];

  for (const file of files) {
    songs.push(await readSong(file));
  }

  songs.sort((a, b) => a.title.localeCompare(b.title, "es"));
  const byId = new Map(songs.map((s) => [s.id, s]));

  cache = { songs, byId, scannedAt: Date.now() };
  console.log(`[scanner] ${songs.length} canciones indexadas.`);
  return cache;
}

export function getCache() {
  return cache;
}

export function getSongById(id) {
  return cache.byId.get(id);
}

export function absolutePath(relPath) {
  return path.join(MUSIC_DIR, relPath);
}

// Función para forzar rescan
export async function forceRescan() {
  console.log("[scanner] Forzando rescan...");
  return await scanLibrary();
}