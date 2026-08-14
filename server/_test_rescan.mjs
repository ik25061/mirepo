// Verificación DIRECTA de la función reescanear (scanFullLibrary -> SQLite)
// Usa un directorio de música de prueba pequeño (3 archivos) para rapidez.
import fs from 'node:fs';
import path from 'node:path';

// Apuntar el escáner al directorio de prueba ANTES de importarlo
process.env.VITE_MUSIC_PATH = 'C:\\temp\\test_music';

console.log('[test] VITE_MUSIC_PATH (env) =', process.env.VITE_MUSIC_PATH);

const { scanFullLibrary, MUSIC_DIR } = await import('./scanner.js');
const { getDb, getSongsWithDetails, getTotalSongsCount } = await import('./db.js');

console.log('[test] MUSIC_DIR resuelto por scanner =', MUSIC_DIR);
console.log('[test] DB_PATH resuelto por db = (server/localfy.db via __dirname)');

if (!fs.existsSync(MUSIC_DIR)) {
  console.error('[test] ❌ El directorio de música de prueba no existe:', MUSIC_DIR);
  process.exit(1);
}

console.log('[test] Iniciando scanFullLibrary()...');
const t0 = Date.now();
const result = await scanFullLibrary();
const dt = Date.now() - t0;
console.log(`[test] scanFullLibrary completado en ${dt} ms`);
console.log('[test] result.total =', result?.total);
console.log('[test] result.songs.length =', result?.songs?.length);
if (result?.songs?.length) {
  for (const s of result.songs) {
    console.log(`[test]   - "${s.title}" | artista: ${s.artist} | álbum: ${s.album || 'N/A'} | relPath: ${s.relPath}`);
  }
}

// Verificar que quedó persistido en la base de datos real (server/localfy.db)
const db = await getDb();
const total = await getTotalSongsCount();
console.log('[test] DB getTotalSongsCount() =', total);
const details = await getSongsWithDetails({ limit: 999, offset: 0 });
console.log('[test] DB getSongsWithDetails() count =', details.length);
for (const s of details) {
  console.log(`[test]   db: id=${s.id} title="${s.title}" artist="${s.artist}"`);
}

await db.close();
if (details.length === result.songs.length && details.length === total) {
  console.log('[test] ✅ VERIFICATION PASSED: reescanear funcionando (scan -> SQLite) correctamente');
} else {
  console.log('[test] ❌ VERIFICATION FAILED: conteos no coinciden');
  process.exit(2);
}
