// Test de idempotencia sobre COPIA de la BD real (no toca produccion).
// Uso: node test_ai_quality_playlists.mjs
// 1) copia localfy.db + playlist_log.json a .tmp-ai-test/
// 2) ejecuta runAiQualityPlaylists 2 veces seguidas con paths aislados
// 3) comprueba: 2a ejecucion no crea listas ni agrega canciones
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(os.tmpdir(), 'ai-quality-test');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

for (const f of ['localfy.db', 'analyze_audio.log', 'playlist_log.json', 'playlists_calidad.md', 'db.js', 'ai_quality_playlists.js', 'package.json']) {
  const src = path.join(serverDir, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tmp, f));
}
// Sin package.json ("type": "module") node trataria los .js como CommonJS.
if (!fs.existsSync(path.join(tmp, 'package.json'))) {
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ type: 'module' }));
}
// sqlite3/sqlite deben resolverse desde el tmp: se enlaza node_modules.
const nmSrc = path.join(serverDir, 'node_modules');
const nmDst = path.join(tmp, 'node_modules');
try {
  if (fs.existsSync(nmSrc) && !fs.existsSync(nmDst)) fs.symlinkSync(nmSrc, nmDst, 'junction');
} catch {}
// db.js resuelve la BD como join(__dirname, 'localfy.db'): al copiar db.js +
// ai_quality_playlists.js al mismo tmp, todo el test corre aislado.
const mod = await import(pathToFileURL(path.join(tmp, 'ai_quality_playlists.js')).href);

const opts = { userId: 1, paths: {
  log: path.join(tmp, 'analyze_audio.log'),
  state: path.join(tmp, 'playlist_log.json'),
  md: path.join(tmp, 'playlists_calidad.md'),
} };
const r1 = await mod.runAiQualityPlaylists(opts);
const r2 = await mod.runAiQualityPlaylists(opts);

let fail = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!cond) fail += 1;
};
check(r1.ok === true, 'primera ejecucion ok');
check(r2.ok === true, 'segunda ejecucion ok');
check(r2.newClassified === 0, `2a ejecucion no clasifica nada (new=${r2.newClassified})`);
check(r2.playlistsCreated === 0, `2a ejecucion no crea listas (created=${r2.playlistsCreated})`);
check(r2.songsAdded === 0, `2a ejecucion no agrega canciones (added=${r2.songsAdded})`);
check(r1.totalPlaylists === 133, `se mantienen las 133 listas del estado (total=${r1.totalPlaylists})`);
check(r1.totalAssigned === 2161, `se mantienen las 2161 asignadas (total=${r1.totalAssigned})`);
const st = JSON.parse(fs.readFileSync(path.join(tmp, 'playlist_log.json'), 'utf8'));
check(Array.isArray(st.assigned_songs) && st.assigned_songs.length === 2161, 'estado sigue con 2161 assigned_songs');
check(st.playlist_ids && Object.keys(st.playlist_ids).length === 133, `playlist_ids cubre las 133 listas (${st.playlist_ids ? Object.keys(st.playlist_ids).length : 0})`);
// Sin duplicados dentro de cada lista del estado
let dups = 0;
for (const [n, ids] of Object.entries(st.playlists)) {
  if (new Set(ids).size !== ids.length) { dups += 1; console.log('  duplicados en', n); }
}
check(dups === 0, 'ninguna lista del estado tiene duplicados');
console.log(fail === 0 ? 'TODO OK' : `FALLOS: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
