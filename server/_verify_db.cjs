// Verificación temporal del DB real (server/localfy.db)
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'localfy.db');

(async () => {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log('=== TABLAS ===');
  console.log(tables.map(t => t.name));

  for (const t of tables) {
    const cnt = await db.get(`SELECT COUNT(*) AS c FROM "${t.name}"`);
    console.log(`  ${t.name}: ${cnt.c} filas`);
  }

  // Verificar vistas
  const views = await db.all("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name");
  console.log('\n=== VISTAS ===');
  console.log(views.map(v => v.name));

  await db.close();
  console.log('\n=== DB válida y operativa ===');
})();
