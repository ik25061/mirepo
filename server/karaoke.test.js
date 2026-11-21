import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mirepo-karaoke-'));
process.env.VITE_KARAOKE_PATH = root;

// Importación dinámica necesaria: karaoke.js lee la carpeta desde el entorno
// durante la inicialización del módulo.
const karaoke = await import('./karaoke.js');
const songPath = path.join(root, 'Artist', 'Album', 'Song.mp3');
fs.mkdirSync(path.dirname(songPath), { recursive: true });
fs.writeFileSync(songPath, Buffer.from([0x49, 0x44, 0x33]));
fs.writeFileSync(path.join(root, 'Other.mp3'), Buffer.from([0x49, 0x44, 0x33]));
fs.writeFileSync(path.join(root, 'not-audio.txt'), 'ignore');

test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('indexa instrumentales y resuelve la ruta relativa', () => {
  karaoke.ensureIndex(true);
  assert.equal(
    karaoke.resolveInstrumental('Artist/Album/Song.mp3'),
    songPath
  );
  assert.equal(karaoke.hasInstrumental('Artist/Album/Song.mp3'), true);
  assert.equal(karaoke.hasInstrumental('Artist/Album/Missing.mp3'), false);
  assert.equal(karaoke.resolveInstrumental('../outside.mp3'), null);
});

test('lista solo los ids con instrumental disponible', () => {
  karaoke.ensureIndex(true);
  const songs = new Map([
    ['song-1', { relPath: 'Artist/Album/Song.mp3' }],
    ['song-2', { relPath: 'Artist/Album/Missing.mp3' }]
  ]);
  assert.deepEqual(karaoke.listInstrumentalIds(songs), ['song-1']);
  assert.equal(karaoke.stats().count, 2);
});
