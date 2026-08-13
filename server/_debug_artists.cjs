const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('C:/Users/wolf/Documents/GitHub/mirepo/server/localfy.db', sqlite3.OPEN_READONLY);

const count = (sql, params) => new Promise((res, rej) =>
  db.get(sql, params || [], (e, r) => e ? rej(e) : res(r)));

const all = (sql, params) => new Promise((res, rej) =>
  db.all(sql, params || [], (e, r) => e ? rej(e) : res(r)));

(async () => {
  let r;
  r = await count('SELECT COUNT(*) c FROM songs');
  console.log('TOTAL canciones en BD:', r.c);

  r = await count(`SELECT COUNT(DISTINCT trim(substr(relPath, 1, instr(relPath || '/', '/') - 1))) c FROM songs`);
  console.log('Carpetas top-level distintas en relPath:', r.c);

  r = await count(`SELECT COUNT(*) c FROM songs WHERE relPath LIKE '%Man%' OR relPath LIKE '%Mana%'`);
  console.log('Canciones con "Man"/"Mana" en relPath:', r.c);

  // Prueba exacta de la consulta del buscador de artistas vs datos reales
  const searchQuery = (term) => {
    const n = term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return all(
      `SELECT id, name FROM artists WHERE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(name,'á','a'),'é','e'),'í','i'),'ó','o'),'ú','u')) LIKE LOWER(?)`,
      [`%${n}%`]
    );
  };

  for (const term of ['mana', 'maná', 'Man', 'á', 'n']) {
    const rows = await searchQuery(term);
    console.log(`buscador("${term}") ->`, rows.length, 'resultados');
    for (const x of rows.slice(0, 8)) console.log('   ', x.id, '|', x.name);
  }

  // Ver con qué slash están los relPath y si el id es sha1(16 hex) o UUID
  r = await all('SELECT id, relPath FROM songs LIMIT 5');
  console.log('\nMuestra de ids/relPath:');
  r.forEach(x => console.log('  ', x.id, '|', JSON.stringify(x.relPath)));

  // ¿Maná en algún sitio de la BD?
  r = await all(`SELECT id, name FROM artists WHERE REPLACE(name,'á','a') LIKE '%mana%'`);
  console.log('\nArtistas cuyo nombre sin la á == *mana*:', r.length);
  r.forEach(x => console.log('  ', x.id, JSON.stringify(x.name)));

  // Albums
  r = await count(`SELECT COUNT(*) c FROM albums WHERE name LIKE '%ana%'`);
  console.log('Albums con "ana":', r.c);

  db.close();
})().catch(e => { console.error('FALLO:', e.message); db.close(); process.exit(1); });