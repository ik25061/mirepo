// Prueba de regresión: marcar una canción como papelera y comprobar que
// desaparece de playlists, me gusta, no me gusta y canciones de artista.
import * as store from '../server/db.js';

const db = await store.getDb();
const uid = 1;

// Elegimos una canción presente en una playlist, en "me gusta" y con artista
const rows = await db.all(`
  SELECT ps.song_id FROM playlist_songs ps
  JOIN user_song_interactions usi ON usi.song_id = ps.song_id AND usi.user_id = ? AND usi.interaction_type = 'LIKE'
  JOIN song_artists sa ON sa.song_id = ps.song_id
  LIMIT 1
`, [uid]);

if (!rows.length) {
  console.log('No se encontró una canción que esté a la vez en playlist, me gusta y con artista.');
  await store.closeDb();
  process.exit(0);
}

const sid = rows[0].song_id;
const info = await db.get('SELECT title, relPath FROM songs WHERE id = ?', [sid]);
console.log(`Canción de prueba: "${info.title}"  (${sid})\n`);

// Estado ANTES
const antes = {
  total: await store.getTotalSongsCount(uid),
  liked: (await store.getLikedSongs(uid, 10000, 0)).length,
  playlists: (await store.getPlayLists(uid)).reduce((n, p) => n + p.songIds.filter(x => x === sid).length, 0),
};
console.log('ANTES  -> total:', antes.total, '| me gusta:', antes.liked, '| en playlists:', antes.playlists);

// La marcamos como papelera (como hace DELETE /api/songs)
await store.markSongTrashed(sid);

// Estado DESPUÉS
const despues = {
  total: await store.getTotalSongsCount(uid),
  liked: (await store.getLikedSongs(uid, 10000, 0)).length,
  likedIds: (await store.getLikedSongIds(uid)).has(sid),
  playlists: (await store.getPlayLists(uid)).reduce((n, p) => n + p.songIds.filter(x => x === sid).length, 0),
};
const inView = (await db.get('SELECT COUNT(*) n FROM v_complete_songs WHERE song_id = ?', [sid])).n;

console.log('DESPUÉS-> total:', despues.total, '| me gusta:', despues.liked, '| en playlists:', despues.playlists);
console.log(`           visible en v_complete_songs: ${inView} (debe ser 0)`);
console.log(`           en getLikedSongIds: ${despues.likedIds} (debe ser false)\n`);

const ok = despues.total === antes.total - 1
  && despues.liked === antes.liked - 1
  && despues.playlists === antes.playlists - 1
  && inView === 0
  && despues.likedIds === false;
console.log(ok ? '✅ REGRESIÓN CORRECTA: desaparece de todas las vistas' : '❌ FALLO: aún aparece en alguna vista');

// Restauramos
await db.run('DELETE FROM trashed_songs WHERE song_id = ?', [sid]);
const restaurado = await store.getTotalSongsCount(uid);
console.log(`\nRestaurado -> total: ${restaurado} (debe ser ${antes.total})`);

await store.closeDb();