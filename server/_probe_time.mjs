console.log('paso 1: importar db');
const dbm = await import('./db.js');
console.log('paso 2: import listo');

const t0 = Date.now();
const database = await dbm.getDb();
console.log(`paso 3: getDb listo en ${Date.now() - t0}ms`);

const t1 = Date.now();
const r = await database.get('SELECT COUNT(*) as n FROM artists');
console.log(`paso 4: count artists = ${r.n} en ${Date.now() - t1}ms`);

const t2 = Date.now();
const rows = await database.all('SELECT al.id, al.name, a.name AS artist, al.year, al.cover_path FROM albums al LEFT JOIN artists a ON al.main_artist_id = a.id');
console.log(`paso 5: lightRows albums = ${rows.length} en ${Date.now() - t2}ms`);

await dbm.closeDb();
console.log('FIN');