import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import { registerKaraokeRoute, resolveKaraokePath } from './karaoke.js';

const root = 'E:/karaoke';
const examples = [
  '0/03 Dame un Beso y Dime Adiós.mp3',
  '2/2 Of Amerikaz Most Wanted (feat. Snoop Dogg).mp3'
];
const relPath = examples[0];
const app = express();
registerKaraokeRoute(app, id => ({ real: { relPath }, second: { relPath: examples[1] }, missing: { relPath: 'A/not-processed.mp3' } })[id], root);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}/karaoke`;
  const file = resolveKaraokePath(root, relPath);
  assert.ok(file);
  const head = await fetch(`${base}/real`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers.get('content-length')), fs.statSync(file).size);
  const range = await fetch(`${base}/real`, { headers: { Range: 'bytes=0-31' } });
  assert.equal(range.status, 206);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), fs.readFileSync(file).subarray(0, 32));
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  assert.equal((await fetch(`${base}/unknown`)).status, 404);
  assert.equal(resolveKaraokePath(root, '../musica/0/03 Dame un Beso y Dime Adiós.mp3'), null);
  for (const [index, id] of ['real', 'second'].entries()) {
    const filePath = resolveKaraokePath(root, examples[index]);
    assert.ok(filePath);
    const response = await fetch(`${base}/${id}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /audio/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(filePath));
    console.log(`PASS: HTTP full file matches ${examples[index]}`);
  }
  console.log('PASS: real MP3, HEAD, Range bytes match, missing/unknown 404, path containment');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
