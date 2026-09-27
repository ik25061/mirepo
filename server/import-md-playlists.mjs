#!/usr/bin/env node
// ============================================================
// IMPORTADOR DE LISTAS DESDE MARKDOWN (playlists_localfy.md)
// ------------------------------------------------------------
// Lee un export en markdown tipo:
//
//   ## Alternative - Anos 1990 (114 canciones)
//   - `68c198f964b555fb` — Today My Love — Desconocido (1990)
//
// y crea cada sección como lista de reproducción PUBLICA (is_public = 1)
// en server/localfy.db, enlazando las canciones por su id (songs.id).
//
// Uso (ejecutar desde la carpeta server/):
//   node import-md-playlists.mjs                       importa el doc por defecto
//   node import-md-playlists.mjs --dry-run             informa sin escribir (rollback)
//   node import-md-playlists.mjs --file=RUTA.md        otro archivo markdown
//   node import-md-playlists.mjs --user=1              dueño de las listas creadas
//   node import-md-playlists.mjs --private             crearlas privadas
//   node import-md-playlists.mjs --rebuild             respeta el orden del doc en listas existentes
//   node import-md-playlists.mjs --prefix="Localfy: "  prefijo para el nombre
//
// Es idempotente: si ya existe una lista con el mismo nombre se reutiliza
// (se vuelve publica y solo se agregan las canciones que falten).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(`--${name}=`.length) : def;
};
const has = (name) => args.includes(`--${name}`);

const FILE = path.resolve(argVal('file', 'C:/Users/wolf/Downloads/playlists_localfy.md'));
const DB = path.resolve(argVal('db', 'localfy.db'));
const OWNER = Number(argVal('user', '1'));
const PREFIX = argVal('prefix', '');
const DRY = has('dry-run');
const PRIVATE = has('private');
const REBUILD = has('rebuild');
const PUBLIC = PRIVATE ? 0 : 1;
const SOURCE = path.basename(FILE);

if (!fs.existsSync(FILE)) {
  console.error(`No existe el archivo: ${FILE}`);
  process.exit(1);
}
if (!fs.existsSync(DB)) {
  console.error(`No existe la base de datos: ${DB} (ejecuta el script dentro de server/)`);
  process.exit(1);
}

// ------------------------------------------------------------
// 1) Parseo del markdown
// ------------------------------------------------------------
const cleanName = (raw) =>
  raw
    .replace(/\s*\(\s*[\d.,\s]*canciones?\s*\)\s*$/i, '') // quita " (114 canciones)"
    .replace(/\s+/g, ' ')
    .trim();

const raw = fs.readFileSync(FILE, 'utf8').split(/\r?\n/);
const order = [];            // nombres en el orden del documento
const byName = new Map();    // nombre -> Set(ids) (preserva orden, sin duplicados)
let current = null;
let songLines = 0;

for (const line of raw) {
  if (line.startsWith('## ')) {
    const name = cleanName(line.slice(3));
    if (!name) { current = null; continue; }
    current = name;
    if (!byName.has(name)) { byName.set(name, new Set()); order.push(name); }
    continue;
  }
  const m = line.match(/^\s*[-*]\s*`([0-9a-fA-F]{6,})`\s*(?:[—–-]|:)?/);
  if (m && current) {
    songLines++;
    if (!byName.has(current)) { byName.set(current, new Set()); order.push(current); }
    byName.get(current).add(m[1].toLowerCase());
  }
}
console.log(`Documento: ${FILE}`);
console.log(`secciones: ${order.length} | canciones listadas: ${songLines}`);
if (!order.length) {
  console.error('El documento no contiene listas ("## titulo" + "- `id` — ...").');
  process.exit(1);
}


// ------------------------------------------------------------
// 2) Preparacion de la base de datos
// ------------------------------------------------------------
const db = new sqlite3.Database(DB);
const run = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, (e) => (e ? rej(e) : res())));
const get = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => (e ? rej(e) : res(r))));
const all = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r))));

const knownSongs = new Set((await all('SELECT lower(id) AS id FROM songs')).map((r) => r.id));
const knownPlaylists = new Map(); // nombre en minusculas -> fila de playlists
for (const p of await all(`SELECT p.id, p.name, p.is_public,
    (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) AS n
    FROM playlists p`)) {
  knownPlaylists.set(String(p.name).toLowerCase(), p);
}

let owner = OWNER;
if (!(await get('SELECT id FROM users WHERE id = ?', [OWNER]))) {
  const first = await get('SELECT id FROM users ORDER BY id LIMIT 1');
  owner = first ? first.id : null;
  console.log(`el usuario ${OWNER} no existe -> se usara ${owner ?? 'NULL (sin dueno)'}`);
}
console.log(`canciones en BD: ${knownSongs.size} | listas existentes: ${knownPlaylists.size} | dueno: ${owner ?? 'NULL'}`);
console.log(`modo: ${DRY ? 'DRY-RUN (sin escribir)' : 'ESCRITURA'} | visibilidad: ${PUBLIC ? 'PUBLICA' : 'PRIVADA'} | rebuild: ${REBUILD ? 'si' : 'no'}\n`);

// ------------------------------------------------------------
// 3) Importacion (en una sola transaccion)
// ------------------------------------------------------------
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const stats = { created: 0, reused: 0, added: 0, already: 0, unknown: 0, empty: 0 };
const details = [];
let newIdx = 0;

await run('BEGIN IMMEDIATE');
try {
  for (const name of order) {
    const fullName = `${PREFIX}${name}`;
    const ids = [...byName.get(name)];
    const valid = ids.filter((id) => knownSongs.has(id));
    stats.unknown += ids.length - valid.length;

    const prev = knownPlaylists.get(fullName.toLowerCase());
    let id;

    if (prev) {
      // Lista ya existente: se reutiliza, se marca publica y se completan canciones
      stats.reused++;
      id = prev.id;
      await run(`UPDATE playlists SET is_public = ?, updated_at = datetime('now') WHERE id = ?`, [PUBLIC, id]);
      const have = new Set(
        (await all('SELECT lower(song_id) AS sid FROM playlist_songs WHERE playlist_id = ?', [id])).map((r) => r.sid),
      );
      if (REBUILD) {
        await run('DELETE FROM playlist_songs WHERE playlist_id = ?', [id]);
        let pos = 0;
        for (const sid of valid) {
          await run(`INSERT INTO playlist_songs (playlist_id, song_id, position, added_at)
                     VALUES (?, ?, ?, datetime('now'))`, [id, sid, pos++]);
          stats.added++;
          if (have.has(sid)) stats.already++;
        }
        details.push(`reconstruida: ${fullName} (${valid.length} canciones en el orden del doc)`);
      } else {
        let pos = have.size;
        let added = 0;
        for (const sid of valid) {
          if (have.has(sid)) { stats.already++; continue; }
          await run(`INSERT INTO playlist_songs (playlist_id, song_id, position, added_at)
                     VALUES (?, ?, ?, datetime('now'))`, [id, sid, pos++]);
          stats.added++;
          added++;
        }
        details.push(`${prev.is_public ? 'ya era publica' : 'ahora es publica'}: ${fullName} (+${added} nuevas, ${have.size} que ya tenia)`);
      }
      continue;
    }

    if (!valid.length) { stats.empty++; continue; }

    // Lista nueva: dueno = usuario, publica, y created_at escalonado para que
    // el orden del documento se conserve en la app (ORDER BY created_at DESC)
    stats.created++;
    id = newId() + newIdx;
    const offset = `-${order.length - newIdx++} seconds`;
    await run(`INSERT INTO playlists (id, name, description, user_id, is_public, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))`,
      [id, fullName, `Importada de ${SOURCE}`, owner, PUBLIC, offset, offset]);
    let pos = 0;
    for (const sid of valid) {
      await run(`INSERT INTO playlist_songs (playlist_id, song_id, position, added_at)
                 VALUES (?, ?, ?, datetime('now'))`, [id, sid, pos++]);
      stats.added++;
    }
    details.push(`nueva ${PUBLIC ? 'publica' : 'privada'}: ${fullName} (${valid.length} canciones)`);
  }
  await run(DRY ? 'ROLLBACK' : 'COMMIT');
} catch (err) {
  await run('ROLLBACK');
  console.error('Error al importar, se hizo rollback:', err.message);
  db.close();
  process.exit(1);
}

console.log(`\nListas: creadas ${stats.created} | reutilizadas ${stats.reused} | sin canciones validas ${stats.empty}`);
console.log(`Canciones enlazadas: ${stats.added} | ya estaban ${stats.already} | id inexistente en BD ${stats.unknown}`);
if (process.env.VERBOSE) for (const d of details) console.log('  ' + d);
console.log(`\n${DRY ? 'dry-run: no se guardo ningun cambio' : `Importacion completada en ${DB}`}`);
db.close();
