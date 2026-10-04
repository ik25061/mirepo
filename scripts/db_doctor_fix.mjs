// ============================================================
// db_doctor_fix.mjs — Corrección de la BD localfy.db
// ------------------------------------------------------------
// 1. Hace backup de localfy.db
// 2. Elimina de `songs` las canciones cuyo archivo ya NO existe en E:/musica
//    (esto limpia de golpe TODAS las referencias: playlists, likes,
//     dislikes, artistas, géneros, letras, features, etc.)
// 3. Limpia artistas/álbumes/géneros que se quedan sin canciones
// 4. Verifica la integridad de las claves foráneas
//
// Uso:
//   node scripts/db_doctor_fix.mjs            -> informe (no toca nada)
//   node scripts/db_doctor_fix.mjs --apply    -> aplica la corrección
// ============================================================

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = 'C:/Users/wolf/Documents/GitHub/mirepo/server/localfy.db';
const MUSIC_DIR = 'E:/musica';
const APPLY = process.argv.includes('--apply');

// ---------- 1. Backup ----------
function backup() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  const dest = `${DB_PATH}.bak-fix-${stamp}`;
  fs.copyFileSync(DB_PATH, dest);
  // copiar WAL/SHM si tuvieran datos
  for (const ext of ['-wal', '-shm']) {
    const f = DB_PATH + ext;
    if (fs.existsSync(f) && fs.statSync(f).size > 0) fs.copyFileSync(f, dest + ext);
  }
  console.log(`💾 Backup: ${dest}`);
  return dest;
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

// ---------- 2. Detectar canciones sin archivo ----------
const songs = db.prepare('SELECT id, relPath, title FROM songs').all();
const missing = songs.filter(s => !fs.existsSync(path.join(MUSIC_DIR, s.relPath)));
console.log(`\nCanciones en BD: ${songs.length}`);
console.log(`Canciones SIN archivo en disco: ${missing.length}`);
if (missing.length === 0) { console.log('✅ Nada que corregir.'); db.close(); process.exit(0); }
for (const m of missing.slice(0, 10)) console.log(`   - ${m.relPath}`);

if (!APPLY) {
  console.log('\n(Modo informe) Ejecuta con --apply para aplicar la corrección.');
  db.close();
  process.exit(0);
}

backup();

// Guardar reporte de lo que se va a eliminar.
const reportPath = path.join(path.dirname(DB_PATH), 'canciones_eliminadas_report.txt');
fs.writeFileSync(reportPath,
  `Canciones eliminadas de la BD (${missing.length}) el ${new Date().toISOString()}\n` +
  missing.map(m => `${m.id}\t${m.relPath}\t${m.title}`).join('\n') + '\n', 'utf8');
console.log(`📝 Reporte: ${reportPath}`);

const ids = missing.map(m => m.id);
const before = {
  songs: songs.length,
  playlist_songs: db.prepare('SELECT COUNT(*) n FROM playlist_songs').get().n,
  user_song_interactions: db.prepare('SELECT COUNT(*) n FROM user_song_interactions').get().n,
  song_features: db.prepare('SELECT COUNT(*) n FROM song_features').get().n,
  trashed_songs: db.prepare('SELECT COUNT(*) n FROM trashed_songs').get().n,
};

db.exec('BEGIN');
try {
  // 2.a Primero las tablas SIN ON DELETE CASCADE (song_features).
  const delFeat = db.prepare('DELETE FROM song_features WHERE song_id = ?');
  let featDeleted = 0;
  for (const id of ids) featDeleted += delFeat.run(id).changes;

  // 2.b Borrar las canciones (el resto cae por CASCADE).
  const delSong = db.prepare('DELETE FROM songs WHERE id = ?');
  let songsDeleted = 0;
  for (const id of ids) songsDeleted += delSong.run(id).changes;

  // 2.c Limpieza de artistas/álbumes/géneros huérfanos.
  const orphanArtists = db.prepare('DELETE FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM song_artists)').run().changes;
  const orphanAlbums = db.prepare('DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM songs WHERE album_id IS NOT NULL)').run().changes;
  const orphanGenres = db.prepare('DELETE FROM genres WHERE id NOT IN (SELECT DISTINCT genre_id FROM song_genres)').run().changes;

  db.exec('COMMIT');
  console.log(`\n✅ Borrados: songs=${songsDeleted}, song_features=${featDeleted}`);
  console.log(`✅ Huérfanos: artists=${orphanArtists}, albums=${orphanAlbums}, genres=${orphanGenres}`);
} catch (err) {
  db.exec('ROLLBACK');
  console.error('❌ Error, cambios revertidos:', err.message);
  db.close();
  process.exit(1);
}

// ---------- 3. Verificación ----------
console.log('\n--- Verificación FK (debe estar vacío) ---');
const fk = db.prepare('PRAGMA foreign_key_check').all();
console.log(fk.length === 0 ? '✅ Sin violaciones de FK' : JSON.stringify(fk.slice(0, 20), null, 2));

console.log('\n--- Referencias huérfanas restantes (deben ser 0) ---');
for (const t of ['playlist_songs', 'user_song_interactions', 'song_artists', 'song_genres', 'song_moods', 'lyrics', 'song_features', 'file_integrity', 'trashed_songs', 'user_song_deferred_deletions', 'comments']) {
  try {
    const n = db.prepare(`SELECT COUNT(*) n FROM "${t}" WHERE song_id NOT IN (SELECT id FROM songs)`).get().n;
    console.log(`  ${t.padEnd(32)} ${n}`);
  } catch (e) { console.log(`  ${t.padEnd(32)} (sin song_id)`); }
}

const after = {
  songs: db.prepare('SELECT COUNT(*) n FROM songs').get().n,
  playlist_songs: db.prepare('SELECT COUNT(*) n FROM playlist_songs').get().n,
  user_song_interactions: db.prepare('SELECT COUNT(*) n FROM user_song_interactions').get().n,
  song_features: db.prepare('SELECT COUNT(*) n FROM song_features').get().n,
  trashed_songs: db.prepare('SELECT COUNT(*) n FROM trashed_songs').get().n,
};
console.log('\n--- Antes -> Después ---');
for (const k of Object.keys(before)) console.log(`  ${k.padEnd(24)} ${before[k]} -> ${after[k]}`);

db.exec('VACUUM');
db.close();
console.log('\n✅ Base de datos corregida.');
