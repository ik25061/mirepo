import sqlite3 from 'sqlite3';
const { Database } = sqlite3;
const db = new Database('localfy.db', { readOnly: true });
const q = (s, p = []) => new Promise((res, rej) => db.all(s, p, (e, x) => e ? rej(e) : res(x)));

const dups = await q(`SELECT relPath, COUNT(*) c, group_concat(id) ids FROM songs GROUP BY relPath HAVING COUNT(*) > 1`);
console.log('relPaths duplicados:', dups.length);
console.log(JSON.stringify(dups.slice(0, 5), null, 2));

const liked = await q(`SELECT s.id, s.relPath, s.title, fi.exists_on_disk
  FROM user_song_interactions usi
  JOIN songs s ON s.id = usi.song_id
  LEFT JOIN file_integrity fi ON fi.song_id = s.id
  WHERE usi.interaction_type = 'LIKE'`);
console.log('likes:', liked.length);
console.log('likes con archivo no existente:', liked.filter(l => l.exists_on_disk === 0).length);
console.log('sample:', JSON.stringify(liked.slice(0, 3), null, 2));

// ¿los ids liked siguen siendo sha1(relPath)?
import crypto from 'crypto';
const idFor = (rel) => crypto.createHash('sha1').update(rel).digest('hex').slice(0, 16);
const mismatch = liked.filter(l => idFor(l.relPath) !== l.id);
console.log('likes con id != sha1(relPath):', mismatch.length);
if (mismatch.length) console.log(JSON.stringify(mismatch.slice(0, 5), null, 2));

// canciones cuyo id no coincide con sha1(relPath) (esquema de id cambiado)
const all = await q('SELECT id, relPath FROM songs');
const mm = all.filter(s => idFor(s.relPath) !== s.id);
console.log('songs con id != sha1(relPath):', mm.length, 'de', all.length);
if (mm.length) console.log(JSON.stringify(mm.slice(0, 5), null, 2));

// interacciones huérfanas
const orphan = await q(`SELECT usi.* FROM user_song_interactions usi LEFT JOIN songs s ON s.id = usi.song_id WHERE s.id IS NULL`);
console.log('interacciones huérfanas:', orphan.length);

db.close();
