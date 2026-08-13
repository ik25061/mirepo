const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('C:/Users/wolf/Documents/GitHub/mirepo/server/localfy.db', sqlite3.OPEN_READONLY);
const q = (sql, params) => new Promise((res, rej) => db.all(sql, params || [], (e, r) => e ? rej(e) : res(r)));

(async () => {
  // Arroja: artistas de la BD para carpetas de colaboración típicas
  for (const pat of ['Daddy Yankee%', 'Wisin%', 'Marc Anthony%', 'Alejandro Fernández%', 'Christian Nodal%', 'Feid%']) {
    const rows = await q(`SELECT id, name FROM artists WHERE name LIKE ?`, [pat]);
    console.log(pat, '->', rows.length);
    rows.slice(0, 12).forEach(r => console.log('   ', r.id, '|', JSON.stringify(r.name)));
  }

  // Cómo se ve un artista con colaboración "con" o "feat" en la vista principal
  const rows = await q(`
    SELECT v.song_id, v.relative_path, v.artists_names, v.main_artist_name
    FROM v_complete_songs v
    WHERE v.song_id IN (SELECT song_id FROM song_artists WHERE artist_id IN
      (SELECT id FROM artists WHERE name LIKE 'Wisin %' OR name LIKE 'Don Omar %'))
    LIMIT 6
  `);
  console.log('\nvista para Wisin/Don Omar:');
  rows.forEach(r => console.log('  ', r.song_id, '|', JSON.stringify(r.relative_path), '| artists:', JSON.stringify(r.artists_names), '| main:', JSON.stringify(r.main_artist_name)));

  console.log('\nTipos de datos y esquema real (PRAGMA):');
  const schema = await q(`SELECT name, sql FROM sqlite_master WHERE type IN ('table','index') AND name IN ('songs','artists','albums','songs_fts')`);
  schema.forEach(r => console.log('--', r.name, r.sql ? r.sql.replace(/\s+/g, ' ').slice(0, 400) : '(index)'));
  const idx = await q(`PRAGMA index_list('songs')`);
  console.log('indexes songs:', idx.map(i => i.name).join(', '));

  // ¿Hay canciones con id sha1 (16 hex) y con UUID mezclados?
  const fmt = await q(`SELECT
      SUM(CASE WHEN length(id)=36 THEN 1 ELSE 0 END) uuids,
      SUM(CASE WHEN length(id)=16 THEN 1 ELSE 0 END) hex16,
      SUM(CASE WHEN length(id) NOT IN (16,36) THEN 1 ELSE 0 END) other
    FROM songs`);
  console.log('ids por formato:', JSON.stringify(fmt[0]));

  db.close();
})().catch(e => { console.error('FALLO:', e.message); db.close(); process.exit(1); });