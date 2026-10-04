// ============================================================
// db_doctor_inspect.mjs — Diagnóstico de la BD localfy.db
// ------------------------------------------------------------
// Detecta:
//   1. Canciones en `songs` cuyo archivo (relPath) YA NO existe en E:/musica
//   2. Filas huérfanas en tablas hijas que apuntan a song_id inexistentes
//   3. Filas huérfanas que apuntan a artist_id / album_id / genre_id inexistentes
//   4. Distintas referencias cruzadas a canciones ya inexistentes
//
// Uso:  node scripts/db_doctor_inspect.mjs
// ============================================================

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = 'C:/Users/wolf/Documents/GitHub/mirepo/server/localfy.db';
const MUSIC_DIR = 'E:/musica';

const db = new DatabaseSync(DB_PATH, { readOnly: true });

function q(sql, ...p) {
  const st = db.prepare(sql);
  return st.all(...p);
}
function one(sql, ...p) {
  const st = db.prepare(sql);
  return st.get(...p);
}

console.log('=== TABLAS ===');
const tables = q(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).map(r => r.name);
console.log(tables.join(', '));

console.log('\n=== CONTEO DE TABLAS PRINCIPALES ===');
for (const t of tables) {
  try {
    const c = one(`SELECT COUNT(*) AS n FROM "${t}"`).n;
    console.log(`${t.padEnd(34)} ${c}`);
  } catch (e) { /* virtual fts */ }
}

console.log('\n=== CANCIONES EN songs CUYO ARCHIVO NO EXISTE EN DISCO ===');
const songs = q(`SELECT id, relPath, title FROM songs`);
let missing = [];
for (const s of songs) {
  const full = path.join(MUSIC_DIR, s.relPath);
  if (!fs.existsSync(full)) missing.push(s);
}
console.log(`Total songs en BD: ${songs.length}`);
console.log(`Songs con archivo AUSENTE: ${missing.length}`);
console.log('Primeras 30:');
for (const s of missing.slice(0, 30)) console.log(`  ${s.id}  ${s.relPath}`);

console.log('\n=== FILAS HUERFANAS (song_id no existe en songs) ===');
const songIdTables = [
  'audio_metadata', 'file_integrity', 'lyrics', 'play_history',
  'playlist_songs', 'song_artists', 'song_genres', 'song_moods',
  'trashed_songs', 'user_song_deferred_deletions', 'user_song_interactions',
];
for (const t of songIdTables) {
  try {
    const r = one(`SELECT COUNT(*) AS n FROM "${t}" WHERE song_id NOT IN (SELECT id FROM songs)`);
    console.log(`${t.padEnd(34)} ${r.n}`);
  } catch (e) { console.log(`${t.padEnd(34)} (no existe o sin song_id)`); }
}

console.log('\n=== FILAS HUERFANAS de artist_id / album_id / genre_id / mood_id ===');
const checks = [
  ['song_artists', 'artist_id', 'artists', 'id'],
  ['album_artists', 'artist_id', 'artists', 'id'],
  ['album_artists', 'album_id', 'albums', 'id'],
  ['song_genres', 'genre_id', 'genres', 'id'],
  ['song_moods', 'mood_id', 'moods', 'id'],
  ['songs', 'album_id', 'albums', 'id'],
  ['user_artist_interactions', 'artist_id', 'artists', 'id'],
  ['user_favorite_albums', 'album_id', 'albums', 'id'],
  ['user_favorite_genres', 'genre_id', 'genres', 'id'],
];
for (const [t, col, refT, refC] of checks) {
  try {
    const r = one(`SELECT COUNT(*) AS n FROM "${t}" WHERE "${col}" IS NOT NULL AND "${col}" NOT IN (SELECT "${refC}" FROM "${refT}")`);
    console.log(`${t}.${col}`.padEnd(40) + `${r.n}`);
  } catch (e) { console.log(`${t}.${col}`.padEnd(40) + `(error: ${e.message})`); }
}

console.log('\n=== ARTISTAS / ALBUMES SIN CANCIONES ===');
console.log('artists sin song_artists:', one(`SELECT COUNT(*) AS n FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM song_artists)`).n);
console.log('albums sin songs:', one(`SELECT COUNT(*) AS n FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM songs WHERE album_id IS NOT NULL)`).n);
console.log('genres sin song_genres:', one(`SELECT COUNT(*) AS n FROM genres WHERE id NOT IN (SELECT DISTINCT genre_id FROM song_genres)`).n);

console.log('\n=== PLAYLIST_SONGS que apuntan a songs inexistentes (detalle) ===');
for (const r of q(`SELECT ps.playlist_id, ps.song_id, s.title FROM playlist_songs ps LEFT JOIN songs s ON s.id = ps.song_id WHERE s.id IS NULL LIMIT 30`)) {
  console.log(`  ${r.playlist_id}  ${r.song_id}  (${r.title ?? 'SIN TÍTULO'})`);
}

db.close();
