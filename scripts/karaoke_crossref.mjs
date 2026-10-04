// Cruce: canciones ausentes en disco vs karaoke espejo presente.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = 'C:/Users/wolf/Documents/GitHub/mirepo/server/localfy.db';
const MUSIC_DIR = 'E:/musica';
const KARAOKE_DIR = 'E:/karaoke';
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.opus', '.aac']);

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const songs = db.prepare('SELECT id, relPath FROM songs').all();
const missing = songs.filter(s => !fs.existsSync(path.join(MUSIC_DIR, s.relPath)));
console.log('Canciones ausentes:', missing.length);

let withKaraoke = 0;
for (const s of missing) {
  const kara = path.join(KARAOKE_DIR, s.relPath);
  if (fs.existsSync(kara)) { withKaraoke++; console.log('  KARAOKE EXISTE ->', s.relPath); }
}
console.log('Ausentes con karaoke espejo presente:', withKaraoke);

// Conteo de PROCESADO_OK en el log
const log = fs.readFileSync(path.join(KARAOKE_DIR, 'karaoke_proceso.log'), 'utf8');
console.log('PROCESADO_OK en log:', (log.match(/PROCESADO_OK \|/g) || []).length);
console.log('Primeras líneas del log:');
console.log(log.split(/\r?\n/).slice(0, 6).join('\n'));

// Recuento estricto de karaoke sin relpath exacto en música
const musicRel = new Set();
(function walk(dir, base) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (path.resolve(full) === path.resolve(path.join(MUSIC_DIR, 'trash'))) continue; walk(full, base); }
    else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) musicRel.add(path.relative(base, full).replace(/\\/g, '/').toLowerCase());
  }
})(MUSIC_DIR, MUSIC_DIR);

let strictOrphans = [];
(function walk(dir, base) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name.toLowerCase() === 'modelos') continue; walk(full, base); }
    else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) {
      const rel = path.relative(base, full).replace(/\\/g, '/').toLowerCase();
      if (!musicRel.has(rel)) strictOrphans.push(rel);
    }
  }
})(KARAOKE_DIR, KARAOKE_DIR);
console.log('\nKaraoke SIN relpath exacto en música (estricto):', strictOrphans.length);
for (const o of strictOrphans) console.log('  ' + o);
db.close();
