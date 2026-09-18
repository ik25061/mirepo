/**
 * ============================================================
 * KARAOKE - INSTRUMENTALES GENERADOS POR DEMUCS
 * ============================================================
 *
 * El script `E:/musica/karaoke.py` separa la voz de cada canción con Demucs y
 * escribe el instrumental en una carpeta paralela conservando la estructura de
 * subcarpetas de la música:
 *
 *     E:/musica/T/Breaking Free (Karaoke Version).mp3
 *     E:/karaoke/T/Breaking Free (Karaoke Version).mp3
 *
 * Este módulo indexa esa carpeta (en memoria y con refresco periódico, porque
 * los instrumentales se van generando poco a poco) y resuelve, para cada
 * canción de la biblioteca, si tiene instrumental disponible y dónde está.
 *
 * La carpeta se configura con VITE_KARAOKE_PATH en el .env; si no existe esa
 * variable se usa E:/karaoke.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Carpeta con los instrumentales (misma estructura que MUSIC_DIR). */
export const KARAOKE_DIR = process.env.VITE_KARAOKE_PATH || 'E:/karaoke';

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.opus', '.aac']);

/** El índice se reconstruye como máximo cada 30 s: la carpeta va creciendo. */
const INDEX_TTL_MS = 30_000;

/** ruta relativa normalizada -> ruta absoluta del instrumental */
let byRelPath = new Map();
/** nombre de archivo normalizado -> ruta absoluta (karaoke.py puede aplanar) */
let byName = new Map();

let indexedAt = 0;
let indexed = false;

/** Normaliza una ruta para comparar (separadores y mayúsculas). */
function norm(p) {
  return String(p).replace(/\\/g, '/').toLowerCase();
}

/** Recorre KARAOKE_DIR recursivamente guardando los audios en el índice. */
function walk(dir, base, byRel, byNameMap) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, byRel, byNameMap);
      continue;
    }
    if (!AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    const relative = path.relative(base, full);
    byRel.set(norm(relative), full);
    const nameKey = norm(path.basename(relative));
    if (!byNameMap.has(nameKey)) byNameMap.set(nameKey, full);
  }
}

/** (Re)construye el índice de instrumentales si toca. */
export function ensureIndex(force = false) {
  if (!force && indexed && Date.now() - indexedAt < INDEX_TTL_MS) return;
  byRelPath = new Map();
  byName = new Map();
  indexedAt = Date.now();
  indexed = true;
  try {
    fs.statSync(KARAOKE_DIR);
  } catch (err) {
    console.warn(`[karaoke] ⚠️ Carpeta de instrumentales no accesible: ${KARAOKE_DIR}`);
    return;
  }
  walk(KARAOKE_DIR, KARAOKE_DIR, byRelPath, byName);
  console.log(`[karaoke] ✅ ${byRelPath.size} instrumentales indexados en ${KARAOKE_DIR}`);
}

/**
 * Rutas candidatas para localizar el instrumental de una canción, en orden de
 * preferencia. `relPath` es la ruta relativa de la canción dentro de MUSIC_DIR
 * (p. ej. "Troy & Gabriella/High School Musical/Tema.mp3").
 */
function candidateKeys(relPath) {
  const rel = path.posix.normalize(String(relPath).replace(/\\/g, '/'));
  const ext = path.posix.extname(rel);
  const base = path.posix.basename(rel, ext);
  const firstFolder = rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '';
  const keys = [
    rel,                                     // misma ruta relativa y extensión
    `${firstFolder}/${base}.mp3`.replace(/^\//, ''), // aplanada en su carpeta raíz
    `${base}.mp3`,                           // solo el nombre (estructura distinta)
    base                                     // nombre sin extensión (por si acaso)
  ];
  return keys.filter(Boolean).map(norm);
}

/**
 * Devuelve la ruta absoluta del instrumental de la canción, o null si esa
 * canción todavía no ha sido procesada por karaoke.py.
 */
export function resolveInstrumental(relPath) {
  if (!relPath) return null;
  ensureIndex();
  for (const key of candidateKeys(relPath)) {
    const hit = byRelPath.get(key) || byName.get(key);
    if (hit && fs.existsSync(hit)) return hit;
  }
  return null;
}

/** true si la canción (por ruta relativa) tiene instrumental disponible. */
export function hasInstrumental(relPath) {
  return resolveInstrumental(relPath) !== null;
}

/** Caché de ids disponibles: se invalida al reconstruir el índice. */
let idsCache = null;
let idsCacheAt = 0;

/**
 * Ids de las canciones de la biblioteca que YA tienen instrumental. `songMap`
 * es el Map(id -> canción) que mantiene index.js en memoria.
 */
export function listInstrumentalIds(songMap) {
  ensureIndex();
  if (idsCache && idsCacheAt === indexedAt) return idsCache;
  const ids = [];
  for (const [id, song] of songMap) {
    if (hasInstrumental(song.relPath)) ids.push(id);
  }
  idsCache = ids;
  idsCacheAt = indexedAt;
  return ids;
}

/** Datos para diagnóstico (/api/test). */
export function stats() {
  ensureIndex();
  return { dir: KARAOKE_DIR, count: byRelPath.size };
}