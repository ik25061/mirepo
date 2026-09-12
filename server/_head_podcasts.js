// podcasts.js - Biblioteca E:/podcast (carpeta plana, separada de musica)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';
import 'dotenv/config';

export const PODCAST_DIR = process.env.VITE_PODCAST_PATH || 'E:/podcast';
console.log('[podcasts] PODCAST_DIR:', PODCAST_DIR);

const AUDIO_EXT = new Set(['.mp3','.m4a','.aac','.flac','.wav','.ogg','.opus','.webm']);
let cache = [];
let byId = new Map();

function ensureDir() {
  try {
    if (!fs.existsSync(PODCAST_DIR)) fs.mkdirSync(PODCAST_DIR, { recursive: true });
  } catch (e) { console.error('[podcasts]', e.message); }
}
function isImgFor(base, name) {
  const low = name.toLowerCase();
  const okExt = low.endsWith('.jpg') || low.endsWith('.jpeg') || low.endsWith('.png') || low.endsWith('.webp');
  if (!okExt) return -1;
  if (!name.startsWith(base + '.')) return -1;
  const mid = name.slice(base.length + 1, name.lastIndexOf('.'));
  if (!/^\d+$/.test(mid)) return -1;
  return parseInt(mid, 10);
}
export function podId(rel) { return 'pod_' + crypto.createHash('sha1').update(rel).digest('hex').slice(0, 16); }
export function absPod(relOrFile) { return path.join(PODCAST_DIR, path.basename(relOrFile)); }

// Ficheros relacionados a un BASE: BASE.en.lrc / BASE.es.lrc / BASE.en.vtt / BASE.<N>.jpg|webp
export function relatedFiles(baseName) {
  let entries = [];
  try { entries = fs.readdirSync(PODCAST_DIR); } catch { return { transcripts: {}, images: [], cover: null }; }
  const t = {};
  for (const lang of ['en','es']) for (const ext of ['lrc','vtt']) {
    const n = `${baseName}.${lang}.${ext}`;
    if (entries.includes(n)) {
      t[lang] = t[lang] || {};
      try { t[lang][ext] = { file: n, size: fs.statSync(path.join(PODCAST_DIR, n)).size }; } catch { t[lang][ext] = { file: n }; }
    }
  }
  if (entries.includes(`${baseName}.lrc`)) t.plain = { lrc: { file: `${baseName}.lrc` } };
  const imgs = [];
  for (const e of entries) { const idx = isImgFor(baseName, e); if (idx >= 0) imgs.push({ file: e, index: idx }); }
  imgs.sort((a,b) => a.index - b.index);
  return { transcripts: t, images: imgs, cover: imgs.length ? imgs[0].file : null };
}
export async function scanPods() {
  ensureDir();
  let names = [];
  try {
    names = fs.readdirSync(PODCAST_DIR, { withFileTypes: true })
      .filter(e => e.isFile() && AUDIO_EXT.has(path.extname(e.name).toLowerCase()))
      .map(e => e.name).sort();
  } catch (e) { console.error('[podcasts] no dir:', e.message); cache = []; byId = new Map(); return cache; }
  console.log(`[podcasts] ${names.length} audios`);
  const out = [];
  let i = 0;
  for (const n of names) {
    i++;
    if (i % 25 === 0 || i === names.length) console.log(`[podcasts] ${i}/${names.length}`);
    const full = path.join(PODCAST_DIR, n);
    let st = null;
    try { st = fs.statSync(full); } catch { continue; }
    const base = path.basename(n, path.extname(n));
    const rel = relatedFiles(base);
    let title = base.replace(/_/g, ' ').trim(), artist = 'Podcast', genre = [], year = null, dur = 0, pic = false;
    try {
      const m = await parseFile(full, { duration: true });
      if (m.common?.title) title = m.common.title;
      if (m.common?.artist) artist = m.common.artist;
      if (m.common?.genre) genre = m.common.genre;
      if (m.common?.year) year = m.common.year;
      if (m.common?.picture?.length) pic = true;
      if (m.format?.duration) dur = Math.round(m.format.duration);
    } catch (e) { console.warn('[podcasts] sin tags', n); }
    const id = podId(n);
    out.push({ id, type: 'podcast', title, artist, genre, year, duration: dur, hasPicture: pic, fileName: n, size: st.size, hasEn: !!(rel.transcripts.en?.lrc || rel.transcripts.en?.vtt), hasEs: !!(rel.transcripts.es?.lrc || rel.transcripts.es?.vtt), coverFile: rel.cover, imageCount: rel.images.length });
  }
  cache = out; byId = new Map(out.map(p => [p.id, p]));
  console.log(`[podcasts] OK ${out.length} episodios`);
  return cache;
}
export function listPods(o = {}) {
  const lim = Math.min(+o.limit || 100, 500), off = +o.offset || 0, q = (o.search || '').toLowerCase();
  let a = cache;
  if (q) a = a.filter(p => (p.title || '').toLowerCase().includes(q) || (p.artist || '').toLowerCase().includes(q));
  return { total: a.length, items: a.slice(off, off + lim) };
}
export function getPod(id) { return byId.get(id) || null; }
export function detailPod(id) {
  const ep = byId.get(id);
  if (!ep) return null;
  const rel = relatedFiles(path.basename(ep.fileName, path.extname(ep.fileName)));
  return { ...ep, transcripts: rel.transcripts, images: rel.images };
}
export function readTx(id, lang = 'es') {
  const ep = byId.get(id);
  if (!ep) return { found: false };
  const base = path.basename(ep.fileName, path.extname(ep.fileName));
  for (const c of [`${base}.${lang}.lrc`, `${base}.${lang}.vtt`, `${base}.lrc`]) {
    const f = path.join(PODCAST_DIR, c);
    if (fs.existsSync(f)) {
      try { return { found: true, file: c, content: fs.readFileSync(f, 'utf8') }; } catch (e) { return { found: false, error: e.message }; }
    }
  }
  return { found: false };
}
export function getCache() { return cache; }
ensureDir();
