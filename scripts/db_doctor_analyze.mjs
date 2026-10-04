// ============================================================
// db_doctor_analyze.mjs — Análisis detallado de canciones huérfanas
// Muestra, para las canciones con archivo ausente, en qué tablas
// aparecen (playlists, likes, dislikes, artistas, etc.)
// Uso:  node scripts/db_doctor_analyze.mjs
// ============================================================

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = 'C:/Users/wolf/Documents/GitHub/mirepo/server/localfy.db';
const MUSIC_DIR = 'E:/musica';

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);

console.log('PRAGMA foreign_keys =', get('PRAGMA foreign_keys'));

const songs = all(`SELECT id, relPath, title FROM songs`);
const missing = songs.filter(s => !fs.existsSync(path.join(MUSIC_DIR, s.relPath)));
const missingIds = new Set(missing.map(s => s.id));
console.log(`\nTotal canciones: ${songs.length} | Ausentes en disco: ${missing.length}`);

const trashed = all('SELECT song_id FROM trashed_songs');
const trashedIds = new Set(trashed.map(r => r.song_id));
console.log(`trashed_songs: ${trashed.length} | de esas, ausentes: ${[...trashedIds].filter(id => missingIds.has(id)).length}`);

// ¿Cuántas ausentes aparecen en cada tabla?
const refTables = ['playlist_songs', 'user_song_interactions', 'user_song_deferred_deletions', 'song_artists', 'song_genres', 'lyrics', 'song_features', 'file_integrity'];
console.log('\n--- Referencias a canciones AUSENTES por tabla ---');
for (const t of refTables) {
  try {
    const rows = all(`SELECT song_id FROM "${t}"`);
    const n = rows.filter(r => missingIds.has(r.song_id)).length;
    console.log(`${t.padEnd(32)} ${n}`);
  } catch (e) { console.log(`${t.padEnd(32)} (error)`); }
}

// Likes / Hides sobre ausentes
console.log('\n--- Interacciones sobre canciones ausentes ---');
for (const tipo of ['LIKE', 'HIDE']) {
  const rows = all(`SELECT song_id, user_id FROM user_song_interactions WHERE interaction_type = ?`, tipo);
  const hit = rows.filter(r => missingIds.has(r.song_id));
  console.log(`${tipo}: ${hit.length}`);
}

// Playlists afectadas
console.log('\n--- Playlists que contienen canciones ausentes ---');
const ps = all(`SELECT playlist_id, song_id, position FROM playlist_songs ORDER BY playlist_id, position`);
const byPl = new Map();
for (const r of ps) {
  if (missingIds.has(r.song_id)) {
    if (!byPl.has(r.playlist_id)) byPl.set(r.playlist_id, []);
    byPl.get(r.playlist_id).push(r.song_id);
  }
}
for (const [pl, ids] of byPl) {
  const name = get(`SELECT name FROM playlists WHERE id = ?`, pl)?.name ?? '(sin nombre)';
  console.log(`  ${pl}  "${name}"  -> ${ids.length} ausentes`);
}

// Artistas afectados (aparecerán en la vista del artista)
console.log('\n--- Artistas con canciones ausentes ---');
const sa = all(`SELECT song_id, artist_id FROM song_artists`);
const missArtists = new Set();
for (const r of sa) if (missingIds.has(r.song_id)) missArtists.add(r.artist_id);
for (const aid of [...missArtists].slice(0, 40)) {
  const a = get(`SELECT name FROM artists WHERE id = ?`, aid);
  const cnt = sa.filter(r => r.artist_id === aid && missingIds.has(r.song_id)).length;
  console.log(`  id=${aid}  ${a?.name}  (${cnt} ausentes)`);
}
console.log(`Total artistas afectados: ${missArtists.size}`);

// Trashed con archivo aún presente (falsos positivos)
console.log('\n--- trashed_songs cuyo archivo AÚN EXISTE en disco ---');
for (const r of trashed) {
  const s = get('SELECT relPath FROM songs WHERE id = ?', r.song_id);
  if (s && fs.existsSync(path.join(MUSIC_DIR, s.relPath))) console.log(`  ${r.song_id}  ${s.relPath}`);
}

// Songs ausentes que NO están en trashed_songs
const notTrashed = missing.filter(s => !trashedIds.has(s.id));
console.log(`\n--- Ausentes que NO están marcados como trashed: ${notTrashed.length} ---`);

db.close();
