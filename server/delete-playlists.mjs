#!/usr/bin/env node
// ============================================================
// ELIMINADOR DE LISTAS DE REPRODUCCION (server/localfy.db)
// ------------------------------------------------------------
// Borra playlists y, por cascada, sus canciones (playlist_songs) y su
// historial de visibilidad (playlist_visibility_log).
//
// Uso (ejecutar desde la carpeta server/):
//   node delete-playlists.mjs                 solo informa (no borra nada)
//   node delete-playlists.mjs --all --yes     borra TODAS las listas
//   node delete-playlists.mjs --user=1 --yes  solo las del usuario 1
//   node delete-playlists.mjs --public --yes  solo las publicas
//   node delete-playlists.mjs --private --yes solo las privadas
//   node delete-playlists.mjs --name="Rock"   filtro por nombre (LIKE %Rock%)
//   node delete-playlists.mjs --all --yes --no-backup  omite la copia de seguridad
//
// Seguridad: sin --yes es dry-run, y antes de borrar se crea
// localfy.db.bak-delplaylists-<fecha-hora> (anterior a la operacion).
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

const DB = path.resolve(argVal('db', 'localfy.db'));
const YES = has('yes') || has('force');
const NO_BACKUP = has('no-backup');
const USER = args.some((x) => x.startsWith('--user=')) ? Number(argVal('user', 'null')) : null;
const NAME = argVal('name', null);
const ONLY_PUBLIC = has('public');
const ONLY_PRIVATE = has('private');
const ALL = has('all');

if (!fs.existsSync(DB)) {
  console.error(`No existe la base de datos: ${DB} (ejecuta el script dentro de server/)`);
  process.exit(1);
}
if (ONLY_PUBLIC && ONLY_PRIVATE) {
  console.error('No se puede usar --public y --private a la vez.');
  process.exit(1);
}
if (!ALL && USER === null && !NAME) {
  console.log('Sin filtros: se mostrara el inventario sin borrar. Usa --all (o --user/--name) para seleccionar.\n');
}

let db = new sqlite3.Database(DB);
const run = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, (e) => (e ? rej(e) : res())));
const all = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, x) => (e ? rej(e) : res(x))));
const get = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, x) => (e ? rej(e) : res(x))));

await run('PRAGMA foreign_keys = ON');

// ------------------------------------------------------------
// 1) Inventario actual
// ------------------------------------------------------------
const where = [];
const params = [];
if (USER !== null) { where.push('p.user_id = ?'); params.push(USER); }
if (ONLY_PUBLIC) where.push('p.is_public = 1');
if (ONLY_PRIVATE) where.push('p.is_public = 0');
if (NAME) { where.push('p.name LIKE ?'); params.push(`%${NAME}%`); }
const WHERE = where.length ? `WHERE ${where.join(' AND ')}` : '';

const targets = await all(
  `SELECT p.id, p.name, p.user_id, p.is_public, p.created_at,
          (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) AS n
     FROM playlists p ${WHERE}
    ORDER BY p.created_at DESC`,
  params,
);
const totalPlaylists = (await get('SELECT COUNT(*) AS n FROM playlists')).n;
const totalLinks = (await get('SELECT COUNT(*) AS n FROM playlist_songs')).n;

console.log(`Base de datos: ${DB}`);
console.log(`Listas en total: ${totalPlaylists} | canciones en listas: ${totalLinks}`);
console.log(`Listas que coinciden con el filtro: ${targets.length} ` +
  `(canciones a eliminar: ${targets.reduce((s, t) => s + t.n, 0)})\n`);

for (const t of targets) {
  console.log(`  ${String(t.n).padStart(4)}  ${t.is_public ? '[publica] ' : '[privada] '} ${t.name}` +
    `  (id=${t.id}, user=${t.user_id ?? 'null'}, creada=${t.created_at})`);
}

// ------------------------------------------------------------
// 2) Copia de seguridad (checkpoint + close + copy + reopen)
// ------------------------------------------------------------
if (!targets.length) {
  console.log('\nNo hay listas que borrar con ese filtro.');
  db.close();
  process.exit(0);
}
if (!YES) {
  console.log('\nDry-run: no se borro nada. Repite con --yes para confirmar.');
  db.close();
  process.exit(0);
}

if (!NO_BACKUP) {
  await run('PRAGMA wal_checkpoint(TRUNCATE)');
  await new Promise((res, rej) => db.close((e) => (e ? rej(e) : res())));
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const backup = `${DB}.bak-delplaylists-${stamp}`;
  fs.copyFileSync(DB, backup);
  console.log(`\nCopia de seguridad: ${backup}`);
  db = new sqlite3.Database(DB);
  await run('PRAGMA foreign_keys = ON');
}

// ------------------------------------------------------------
// 3) Borrado en transaccion
// ------------------------------------------------------------
const ids = targets.map((t) => t.id);
try {
  await run('BEGIN IMMEDIATE');
  // playlist_songs tiene ON DELETE CASCADE, pero se borra tambien a mano por
  // si la BD se creo sin external keys activas.
  for (const id of ids) {
    await run('DELETE FROM playlist_songs WHERE playlist_id = ?', [id]);
    await run('DELETE FROM playlist_visibility_log WHERE playlist_id = ?', [id]);
    await run('DELETE FROM playlists WHERE id = ?', [id]);
  }
  await run('COMMIT');
} catch (err) {
  await run('ROLLBACK');
  console.error('Error al borrar, se hizo rollback:', err.message);
  db.close();
  process.exit(1);
}

const left = (await get('SELECT COUNT(*) AS n FROM playlists')).n;
const leftLinks = (await get('SELECT COUNT(*) AS n FROM playlist_songs')).n;
console.log(`\nBorradas: ${ids.length} listas y ${targets.reduce((s, t) => s + t.n, 0)} canciones enlazadas`);
console.log(`Quedan: ${left} listas | canciones en listas: ${leftLinks}`);
const orphans = (await get(
  'SELECT COUNT(*) AS n FROM playlist_songs ps LEFT JOIN playlists p ON p.id = ps.playlist_id WHERE p.id IS NULL',
)).n;
console.log(`Canciones de lista huerfanas: ${orphans}`);
if (!NO_BACKUP) console.log('\nPara revertir: copia el .bak-delplaylists sobre localfy.db (con el servidor parado).');
db.close();
