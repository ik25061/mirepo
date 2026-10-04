// ============================================================
// karaoke_orphans.mjs — Detecta instrumentales huérfanos
// ------------------------------------------------------------
// Los instrumentales de E:/karaoke espejan la MISMA ruta relativa
// que las canciones de E:/musica. Si la canción ya no existe en
// E:/musica, el instrumental queda huérfano y debe ir a la papelera
// (E:/musica/trash/AAAA-MM).
//
// Criterios de "huérfano":
//   1. La ruta relativa NO existe en E:/musica  (coincidencia exacta), Y
//   2. Ningún archivo de E:/musica tiene el mismo nombre base
//      (por si karaoke.py hubiese aplanado/reorganizado).
//
// Uso:
//   node scripts/karaoke_orphans.mjs           -> solo informe (dry-run)
//   node scripts/karaoke_orphans.mjs --apply   -> mueve a la papelera
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const MUSIC_DIR = 'E:/musica';
const KARAOKE_DIR = 'E:/karaoke';
const TRASH_DIR = path.join(MUSIC_DIR, 'trash');
const EXCLUDE_DIRS = new Set(['modelos']);       // caché de modelos Demucs
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.opus', '.aac']);
const APPLY = process.argv.includes('--apply');

const norm = (p) => p.replace(/\\/g, '/').toLowerCase();

// --- Índice de la música (relpaths exactos y nombres base) ---
const musicRel = new Set();
const musicBase = new Set();
function walkMusic(dir, base) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (path.resolve(full) === path.resolve(TRASH_DIR)) continue;
      walkMusic(full, base);
    } else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) {
      musicRel.add(norm(path.relative(base, full)));
      musicBase.add(norm(path.basename(e.name)));
    }
  }
}
console.log('Indexando E:/musica ...');
walkMusic(MUSIC_DIR, MUSIC_DIR);
console.log(`  ${musicRel.size} canciones (relpaths), ${musicBase.size} nombres base`);

// --- Recorrer karaoke ---
const orphans = [];
let totalKaraoke = 0;
function walkKaraoke(dir, base) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name.toLowerCase())) continue;
      walkKaraoke(full, base);
      continue;
    }
    if (!AUDIO_EXT.has(path.extname(e.name).toLowerCase())) continue;
    totalKaraoke++;
    const rel = norm(path.relative(base, full));
    const baseName = norm(path.basename(e.name));
    if (musicRel.has(rel)) continue;           // existe en su ruta exacta
    if (musicBase.has(baseName)) continue;     // existe con otro nombre/ruta
    orphans.push({ full, rel });
  }
}
console.log('Recorriendo E:/karaoke ...');
walkKaraoke(KARAOKE_DIR, KARAOKE_DIR);
console.log(`  ${totalKaraoke} instrumentales en total`);
console.log(`  ${orphans.length} huérfanos (sin canción en E:/musica)\n`);

for (const o of orphans.slice(0, 60)) console.log('  ' + o.rel);
if (orphans.length > 60) console.log(`  ... y ${orphans.length - 60} más`);

if (!APPLY) {
  console.log('\n(Modo informe) Ejecuta con --apply para mover a la papelera.');
} else {
  const now = new Date();
  const sub = path.join(TRASH_DIR, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  fs.mkdirSync(sub, { recursive: true });
  let moved = 0;
  for (const o of orphans) {
    try {
      const dest = path.join(sub, `${Date.now()}_${Math.random().toString(16).slice(2, 8)}_${path.basename(o.full)}`);
      fs.renameSync(o.full, dest);
      moved++;
    } catch (err) {
      try {
        fs.copyFileSync(o.full, path.join(sub, path.basename(o.full)));
        fs.unlinkSync(o.full);
        moved++;
      } catch (e2) { console.error('  ⚠️ No se pudo mover', o.rel, e2.message); }
    }
  }
  console.log(`\n✅ ${moved}/${orphans.length} instrumentales movidos a ${sub}`);
}
