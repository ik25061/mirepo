// ============================================================
// server/index.js - SERVIDOR PRINCIPAL (VERSION RESTAURADA COMPLETA)
// ============================================================

import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import * as db from './db.js';
import { Meilisearch } from 'meilisearch';
import { MUSIC_DIR, TRASH_DIR, absolutePath } from './scanner.js';
import * as pods from './podcasts.js';
import { getLyrics as getLyricsFromService } from './lyrics.js';
import { runBuildDbPython } from './rescan-python.js';

const app = express();
const PORT = process.env.VITE_SERVER_PORT || process.env.PORT || 5002;

console.log('🚀 Iniciando servidor...');
console.log(`🔧 Puerto configurado: ${PORT}`);
console.log(`📂 MUSIC_DIR: ${MUSIC_DIR}`);

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Origin', 'Accept'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges'],
  credentials: true
}));
app.use(express.json());
app.use('/songs', express.static(MUSIC_DIR));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

// ============================================================
// PROGRESO DE RESCAN (archivo JSON + SSE)
// ============================================================
const RESCAN_PROGRESS_FILE = path.join(__dirname, 'localfy-rescan.json');

try {
  fs.writeFileSync(RESCAN_PROGRESS_FILE, JSON.stringify({ phase: 'idle', pct: 0, processed: 0, total: 0, ts: Date.now() }), 'utf-8');
} catch (err) {}

function writeRescanProgress(payload) {
    try {
    fs.writeFileSync(RESCAN_PROGRESS_FILE, JSON.stringify({ ts: Date.now(), ...payload }), { encoding: 'utf-8' });
  } catch (err) {}
}

// ============================================================
// MEILISEARCH SETUP
// ============================================================
const meiliClient = new Meilisearch({
  host: process.env.MEILI_HOST || 'http://127.0.0.1:7700',
  apiKey: process.env.MEILI_MASTER_KEY || 'masterKey',
});

const songIndex = meiliClient.index('songs');

async function syncToMeilisearch() {
  try {
    if (!libraryReady) await loadLibrary();
    if (songCache.length === 0) return;

    const docs = songCache.map(s => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      album: s.album,
      year: s.year,
      bpm: s.bpm,
      key: s.key_name,
    }));

    await songIndex.updateDocuments(docs);
    console.log('✅ Meilisearch: Sincronización enviada');
  } catch (err) {
    console.warn('⚠️ Meilisearch: no se pudo sincronizar');
  }
}

// ============================================================
// VARIABLES GLOBALES
// ============================================================
let libraryReady = false;
let songCache = [];
let songMap = new Map();

function getLocalLanIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('127.')) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

const LOCAL_IPS = getLocalLanIps();
const LOCAL_IP = LOCAL_IPS[0] || 'localhost';

// ============================================================
// SHUFFLE CON SEMILLA Y CURSOR
// ============================================================

function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function shuffleArray(array, seed) {
  const rng = seededRandom(seed);
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getCursor(userId) {
  const today = new Date().toISOString().slice(0, 10);
  let seed = 0;
  const base = `${userId || 'anon'}-${today}`;
  for (let i = 0; i < base.length; i++) {
    seed = ((seed << 5) - seed) + base.charCodeAt(i);
    seed = seed & seed;
  }
  return Math.abs(seed) || 1;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// CARGAR BIBLIOTECA
// ============================================================

async function loadLibrary() {
  try {
    console.log('🔍 Cargando biblioteca desde SQLite...');
    const songs = await db.getSongsWithDetails({ limit: 999999, offset: 0 });
    songCache = songs;
    songMap = new Map(songs.map(s => [s.id, s]));
    console.log(`✅ ${songCache.length} canciones cargadas`);
    libraryReady = true;
    syncToMeilisearch();
  } catch (err) {
    console.error('❌ Error cargando biblioteca:', err);
    libraryReady = true;
  }
}

pods.scanPods();
loadLibrary();

// ============================================================
// CONSTRUIR BIBLIOTECA
// ============================================================

async function buildLibrary({ limit = 100, offset = 0, userId = null, likedOnly = false, shuffleSeed = null } = {}) {
  if (!libraryReady) await loadLibrary();

  let likedIds = new Set();
  let hiddenIds = new Set();
  if (userId) {
    [likedIds, hiddenIds] = await Promise.all([
      db.getLikedSongIds(userId),
      db.getHiddenSongIds(userId)
    ]);
  }

  let songs = songCache
    .filter(s => !hiddenIds.has(s.id))
    .map(s => ({
      ...s,
      liked: likedIds.has(s.id),
      hidden: false
    }));

  if (likedOnly) songs = songs.filter(s => s.liked);

  const seed = shuffleSeed || getCursor(userId);
  const shuffled = shuffleArray(songs, seed);

  return {
    songs: shuffled.slice(offset, offset + limit),
    counts: { total: shuffled.length, trash: await db.getTrashCount(userId) },
    pagination: { offset, limit, total: shuffled.length, hasMore: (offset + limit) < shuffled.length }
  };
}

// ============================================================
// RUTAS - AUTH & CONFIG
// ============================================================

app.get('/api/test', (req, res) => {
  res.json({ success: true, libraryReady, songCount: songCache.length, podcastCount: pods.getCache().podcastCache?.length || 0, episodeCount: pods.getCache().episodeCache?.length || 0, musicDir: MUSIC_DIR, podcastDir: pods.PODCAST_DIR });
});

app.get('/api/config/ip', (req, res) => {
  res.json({ ip: LOCAL_IP, port: PORT, serverUrl: `http://${LOCAL_IP}:${PORT}`, allIps: LOCAL_IPS });
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.createUser(username, password);
    res.json({ success: true, user });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.findUser(username, password);
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
    const token = crypto.randomBytes(32).toString('hex');
    await db.updateUserSession(user.id, token);
    res.json({ success: true, user: { id: user.id, username: user.username }, token });
  } catch (err) { res.status(500).json({ error: 'Error en login' }); }
});

app.get('/api/auth/verify', async (req, res) => {
  const token = req.query.token || req.query.userId;
  try {
    const user = await db.getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'Token inválido' });
    res.json({ success: true, user: { id: user.id, username: user.username } });
  } catch (err) { res.status(500).json({ error: 'Error verify' }); }
});

app.post('/api/auth/verify', async (req, res) => {
  const token = (req.body && req.body.token) || req.query.token;
  if (!token) return res.status(401).json({ error: 'No hay token' });
  try {
    const user = await db.getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'Token invalido' });
    res.json({ success: true, user: { id: user.id, username: user.username } });
  } catch (err) { res.status(500).json({ error: 'Error verify' }); }
});

app.post('/api/auth/logout', async (req, res) => {
  if (req.body.token) await db.clearUserSession(req.body.token);
  res.json({ success: true });
});

// ============================================================
// RUTAS - BIBLIOTECA
// ============================================================

app.get('/api/library', async (req, res) => {
  try {
    const result = await buildLibrary({
      userId: req.query.userId,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0,
      likedOnly: req.query.liked === 'true',
      shuffleSeed: req.query.shuffleSeed ? parseInt(req.query.shuffleSeed) : null
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/liked-songs', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requerido' });
  try {
    const songs = await db.getLikedSongs(parseInt(userId), parseInt(req.query.limit) || 100, parseInt(req.query.offset) || 0);
    const total = await db.getLikedSongsCount(parseInt(userId));
    res.json({ songs, pagination: { total } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/hidden-songs', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requerido' });
  try {
    const songs = await db.getHiddenSongs(parseInt(userId), parseInt(req.query.limit) || 100, parseInt(req.query.offset) || 0);
    const total = await db.getHiddenSongsCount(parseInt(userId));
    res.json({ songs, pagination: { total } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/songs/:id/like', async (req, res) => {
  try {
    await db.setSongLiked(req.params.id, req.body.liked, req.body.userId);
    if (songMap.has(req.params.id)) songMap.get(req.params.id).liked = !!req.body.liked;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/songs/:id/hide', async (req, res) => {
  try {
    await db.setSongHidden(req.params.id, true, req.body.userId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// RUTAS - ELIMINAR CANCION (mueve el archivo a la papelera)
// ============================================================

app.delete('/api/songs', async (req, res) => {
  try {
    const { id, userId } = req.body;
    if (!id) return res.status(400).json({ error: 'Se requiere id' });

    let song = songMap.get(id);
    if (!song) {
      const songs = await db.getSongsByIds(id, userId);
      song = songs[0];
    }
    if (!song) return res.status(404).json({ error: 'Cancion no encontrada en el catalogo' });

    const fullPath = absolutePath(song.relPath);
    if (fs.existsSync(fullPath)) {
      try {
        if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });
        const now = new Date();
        const trashSubDir = path.join(TRASH_DIR, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
        if (!fs.existsSync(trashSubDir)) fs.mkdirSync(trashSubDir, { recursive: true });
        const trashPath = path.join(trashSubDir, `${Date.now()}_${path.basename(fullPath)}`);
        fs.copyFileSync(fullPath, trashPath);
        fs.unlinkSync(fullPath);
      } catch (err) {
        return res.status(500).json({ error: 'Error fisico al eliminar el archivo', details: err.message });
      }
    }

    if (userId) await db.setSongHidden(song.id, true, userId);
    songMap.delete(id);
    songCache = songCache.filter(s => s.id !== id);
    res.json({ message: 'Cancion eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error interno al procesar eliminacion', details: error.message });
  }
});

// ============================================================
// RUTA - ACTUALIZAR METADATOS DE CANCION
// ============================================================

app.put('/api/songs/:id', async (req, res) => {
  try {
    const { title, artist, album, year, track, genres, moods, writeId3 } = req.body || {};
    await db.updateSongMetadata(req.params.id, { title, artist, album, year, track, genres, moods });
    if (writeId3) {
      try {
        const { default: NodeID3 } = await import('node-id3');
        const row = await db.getDb().then(d => d.get('SELECT relPath FROM songs WHERE id = ?', [req.params.id]));
        if (row) {
          const full = absolutePath(row.relPath);
          const tags = {};
          if (title) tags.title = String(title);
          if (artist) tags.artist = String(artist);
          if (album) tags.album = String(album);
          if (year) tags.year = String(year);
          if (track) tags.trackNumber = String(track);
          if (Array.isArray(genres) && genres.length) tags.genre = genres.join('; ');
          if (Object.keys(tags).length) NodeID3.update(tags, full);
        }
      } catch (e) { console.warn('[api/songs PUT id3]', e.message); }
    }
    const songs = await db.getSongsByIds([req.params.id], req.query.userId || req.body?.userId || null);
    res.json({ success: true, song: songs[0] || null });
  } catch (err) {
    res.status(500).json({ error: String(err.message || 'Error') });
  }
});

// ============================================================
// RUTA - CANCIONES SIN ALBUM NI ARTISTA
// ============================================================

app.get('/api/songs/no-album-no-artist', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const result = await db.getSongsWithoutAlbumOrArtist({ userId, limit, offset });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener canciones sin album ni artista' });
  }
});

// ============================================================
// RUTAS - OCULTAR / MOSTRAR ARTISTAS
// ============================================================

app.post('/api/artists/hide', async (req, res) => {
  try {
    const { artist, userId, artistId } = req.body || {};
    const targetArtistId = artistId ? Number(artistId) : await db.getArtistIdByName(artist);
    if (!targetArtistId) return res.status(404).json({ error: 'Artista no encontrado' });
    await db.setArtistHidden(targetArtistId, true, userId);
    res.json({ ok: true, artistId: targetArtistId });
  } catch (err) { res.status(500).json({ error: 'Error al ocultar artista' }); }
});

app.post('/api/artists/:id/hide', async (req, res) => {
  try {
    const artistId = Number(req.params.id);
    const { userId } = req.body || {};
    if (!artistId) return res.status(400).json({ error: 'Falta el id del artista' });
    await db.setArtistHidden(artistId, true, userId);
    res.json({ ok: true, artistId });
  } catch (err) { res.status(500).json({ error: 'Error al ocultar artista' }); }
});

app.post('/api/artists/unhide', async (req, res) => {
  try {
    const { artist, userId, artistId } = req.body || {};
    const targetArtistId = artistId ? Number(artistId) : await db.getArtistIdByName(artist);
    if (!targetArtistId) return res.status(404).json({ error: 'Artista no encontrado' });
    await db.setArtistHidden(targetArtistId, false, userId);
    res.json({ ok: true, artistId: targetArtistId });
  } catch (err) { res.status(500).json({ error: 'Error al mostrar artista' }); }
});

app.post('/api/artists/:id/unhide', async (req, res) => {
  try {
    const artistId = Number(req.params.id);
    const { userId } = req.body || {};
    if (!artistId) return res.status(400).json({ error: 'Falta el id del artista' });
    await db.setArtistHidden(artistId, false, userId);
    res.json({ ok: true, artistId });
  } catch (err) { res.status(500).json({ error: 'Error al mostrar artista' }); }
});

app.get('/api/songs/by-ids', async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').filter(Boolean);
    const userId = req.query.userId;
    let likedIds = new Set();
    if (userId) likedIds = await db.getLikedSongIds(userId);
    if (!libraryReady) await loadLibrary();
    const songs = ids.map(id => {
      const s = songMap.get(id);
      return s ? { ...s, liked: likedIds.has(s.id) } : null;
    }).filter(Boolean);
    res.json({ songs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// RUTAS - COLECCIONES
// ============================================================

app.get('/api/artists', async (req, res) => {
  const r = await db.getArtistsWithPagination({ userId: req.query.userId, limit: parseInt(req.query.limit) || 20, offset: parseInt(req.query.offset) || 0, search: req.query.search, minSongs: parseInt(req.query.minSongs) || 0 });
  res.json(r);
});
app.get('/api/artists/:id/songs', async (req, res) => {
  const r = await db.getSongsByArtist({ artistId: req.params.id, userId: req.query.userId, limit: parseInt(req.query.limit) || 100, offset: parseInt(req.query.offset) || 0 });
  res.json(r);
});
app.get('/api/albums', async (req, res) => {
  const r = await db.getAlbumsWithPagination({ userId: req.query.userId, limit: parseInt(req.query.limit) || 20, offset: parseInt(req.query.offset) || 0, search: req.query.search });
  res.json(r);
});
app.get('/api/albums/:id/songs', async (req, res) => {
  const r = await db.getSongsByAlbum({ albumId: req.params.id, userId: req.query.userId, limit: parseInt(req.query.limit) || 100, offset: parseInt(req.query.offset) || 0 });
  res.json(r);
});
app.get('/api/genres', async (req, res) => {
  const r = await db.getGenresWithPagination({ userId: req.query.userId, limit: parseInt(req.query.limit) || 20, offset: parseInt(req.query.offset) || 0, search: req.query.search });
  res.json(r);
});
app.get('/api/genres/:id/songs', async (req, res) => {
  const r = await db.getSongsByGenre({ genreId: req.params.id, userId: req.query.userId, limit: parseInt(req.query.limit) || 100, offset: parseInt(req.query.offset) || 0 });
  res.json(r);
});
app.get('/api/years', async (req, res) => {
  const r = await db.getYearsWithPagination({ userId: req.query.userId, limit: parseInt(req.query.limit) || 20, offset: parseInt(req.query.offset) || 0, search: req.query.search });
  res.json(r);
});
app.get('/api/years/:year/songs', async (req, res) => {
  const r = await db.getSongsByYear({ year: req.params.year, userId: req.query.userId, limit: parseInt(req.query.limit) || 100, offset: parseInt(req.query.offset) || 0 });
  res.json(r);
});

// ============================================================
// RUTAS - CRUD DE GENEROS Y GENEROS POR CANCION
// ============================================================

app.post('/api/genres', async (req, res) => {
  try { res.json({ genre: await db.createGenre(req.body?.name) }); }
  catch (err) { res.status(400).json({ error: String(err.message || 'Error') }); }
});
app.put('/api/genres/:id', async (req, res) => {
  try { res.json({ genre: await db.renameGenre(req.params.id, req.body?.name) }); }
  catch (err) { res.status(400).json({ error: String(err.message || 'Error') }); }
});
app.delete('/api/genres/:id', async (req, res) => {
  try { res.json(await db.deleteGenre(req.params.id)); }
  catch (err) { res.status(500).json({ error: String(err.message || 'Error') }); }
});
app.put('/api/songs/:id/genres', async (req, res) => {
  try { res.json({ success: true, genres: await db.setSongGenres(req.params.id, req.body?.genres || []) }); }
  catch (err) { res.status(500).json({ error: String(err.message || 'Error') }); }
});

// ============================================================
// RUTAS - CRUD DE MOODS Y MOODS POR CANCION
// ============================================================

app.post('/api/moods', async (req, res) => {
  try { res.json({ mood: await db.createMood(req.body?.name, req.body?.color) }); }
  catch (err) { res.status(400).json({ error: String(err.message || 'Error') }); }
});
app.put('/api/moods/:id', async (req, res) => {
  try { res.json({ mood: await db.renameMood(req.params.id, req.body?.name, req.body?.color) }); }
  catch (err) { res.status(400).json({ error: String(err.message || 'Error') }); }
});
app.delete('/api/moods/:id', async (req, res) => {
  try { res.json(await db.deleteMood(req.params.id)); }
  catch (err) { res.status(500).json({ error: String(err.message || 'Error') }); }
});
app.get('/api/moods/:id/songs', async (req, res) => {
  try {
    const r = await db.getSongsByMood({ moodId: req.params.id, userId: req.query.userId || null, limit: +req.query.limit || 100, offset: +req.query.offset || 0 });
    res.json({ songs: r.songs, pagination: r.pagination });
  } catch (err) { res.status(500).json({ error: String(err.message || 'Error') }); }
});
app.put('/api/songs/:id/moods', async (req, res) => {
  try { res.json({ success: true, moods: await db.setSongMoods(req.params.id, req.body?.moods || []) }); }
  catch (err) { res.status(500).json({ error: String(err.message || 'Error') }); }
});

// ============================================================
// RUTAS - AJUSTES DE USUARIO (TEMA Y PREFERENCIAS)
// ============================================================

app.get('/api/users/:id/settings', async (req, res) => {
  try { res.json({ settings: await db.getUserSettings(req.params.id) }); }
  catch (err) { res.status(500).json({ error: String(err.message || 'Error') }); }
});
app.put('/api/users/:id/settings', async (req, res) => {
  try { res.json({ settings: await db.updateUserSettings(req.params.id, req.body || {}) }); }
  catch (err) { res.status(400).json({ error: String(err.message || 'Error') }); }
});

// ============================================================
// RUTAS - PLAYLISTS
// ============================================================

app.get('/api/playlists', async (req, res) => {
  const playlists = await db.getPlayLists(req.query.userId);
  res.json({ playlists: playlists.map(p => ({ ...p, is_public: !!p.is_public })) });
});
app.get('/api/playlists/public', async (_req, res) => {
  const playlists = await db.getPlayLists(null);
  res.json({ playlists: playlists.filter(p => !!p.is_public) });
});
app.get('/api/playlists/:id', async (req, res) => {
  const pl = await db.getPlayList(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Lista no encontrada' });
  res.json({ playlist: pl });
});
app.post('/api/playlists', async (req, res) => {
  const pl = await db.createPlayList(req.body.name, req.body.description, req.body.userId, req.body.isPublic);
  res.json({ playlist: pl });
});
app.patch('/api/playlists/:id', async (req, res) => {
  const pl = await db.updatePlayList(req.params.id, req.body);
  res.json({ playlist: pl });
});
app.post('/api/playlists/:id/songs', async (req, res) => {
  const pl = await db.addSongToPlayList(req.params.id, req.body.songId);
  res.json({ playlist: pl });
});
app.post('/api/playlists/:id/songs/bulk', async (req, res) => {
  const ids = req.body.songIds || [];
  let pl = null;
  for (const sid of ids) {
    try { pl = await db.addSongToPlayList(req.params.id, sid); } catch (e) {}
  }
  if (!pl) pl = await db.getPlayList(req.params.id);
  res.json({ playlist: pl });
});
app.delete('/api/playlists/:id/songs', async (req, res) => {
  const pl = await db.removeSongFromPlayList(req.params.id, req.body.songId);
  res.json({ playlist: pl });
});
app.delete('/api/playlists/:id', async (req, res) => {
  await db.deletePlayList(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// RUTAS - SEARCH & METADATA
// ============================================================

app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ songs: [] });
  try {
    const searchResult = await songIndex.search(q, { limit: 50 });
    const songs = searchResult.hits.map(h => songMap.get(h.id)).filter(Boolean);
    res.json({ songs });
  } catch (err) {
    const lowQ = q.toLowerCase();
    const fallback = songCache.filter(s => s.title.toLowerCase().includes(lowQ) || (s.artist && s.artist.toLowerCase().includes(lowQ))).slice(0, 50);
    res.json({ songs: fallback });
  }
});

app.post('/api/fix-metadata', async (req, res) => {
  try {
    const { filePath } = req.body;
    const absPath = absolutePath(filePath);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Archivo no encontrado' });
    const fileName = path.basename(absPath, path.extname(absPath));
    let artist = 'Artista desconocido', title = fileName;
    const match = fileName.match(/^(.+?)[\-_](.+)$/);
    if (match) { artist = match[1].trim(); title = match[2].trim(); }
    const song = songCache.find(s => s.relPath === filePath);
    if (song) {
      const newFileName = `${artist.replace(/[<>:"/\\|?*]/g, ' ')} - ${title.replace(/[<>:"/\\|?*]/g, ' ')}${path.extname(absPath)}`;
      const newPath = path.join(path.dirname(filePath), newFileName);
      fs.renameSync(absPath, absolutePath(newPath));
      await db.updateSongPath(song.id, newPath, title);
    }
    res.json({ success: true, artist, title });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// RUTAS - PODCASTS (SERIES)
// ============================================================

app.get('/api/podcasts', (req, res) => {
  const r = pods.listPodcasts();
  res.json({ success: true, total: r.podcasts.length, podcasts: r.podcasts.map(p => ({ ...p, cover_url: `/podcast-series-cover/${p.id}` })) });
});

app.get('/api/podcasts/:id', async (req, res) => {
  const d = pods.getPodcastDetail(req.params.id);
  if (!d) return res.status(404).json({ error: 'Podcast no encontrado' });
  const userId = req.query.userId;
  const episodes = await Promise.all(d.episodes.map(async (e, idx) => ({
    id: e.id, podcastId: d.podcast.id, title: e.title, duration: e.duration, audio_url: `/podcast-audio/${e.id}`,
    last_position_ms: await db.getEpisodeProgress(userId, e.id), order_index: idx, is_episode: true, hasPicture: !!e.hasPicture
  })));
  res.json({ success: true, podcast: { ...d.podcast, cover_url: `/podcast-series-cover/${d.podcast.id}` }, episodes });
});

app.post('/api/podcasts/progress', async (req, res) => {
  await db.setEpisodeProgress(req.body.userId, req.body.episodeId, req.body.positionMs);
  res.json({ success: true });
});

app.get('/api/songs/:id/comments', async (req, res) => {
  try {
    const data = await db.getCommentsBySong(req.params.id);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/comments', async (req, res) => {
  try {
    const { userId, songId, text, rating } = req.body;
    const comment = await db.addComment(userId, songId, text, rating);
    res.json(comment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// RUTAS - DJ MODE
// ============================================================

let activeDJRoom = null; // Simplificado: solo una sala global por ahora

app.post('/api/dj/broadcast', (req, res) => {
  activeDJRoom = {
    djId: req.body.userId,
    djName: req.body.username,
    songId: req.body.songId,
    positionMs: req.body.positionMs,
    isPlaying: req.body.isPlaying,
    updatedAt: Date.now()
  };
  res.json({ success: true });
});

app.get('/api/dj/room', (req, res) => {
  if (!activeDJRoom || Date.now() - activeDJRoom.updatedAt > 10000) {
    return res.json({ active: false });
  }
  res.json({ active: true, room: activeDJRoom });
});

app.post('/api/podcasts/rescan', async (req, res) => {
  await pods.scanPods();
  res.json({ success: true });
});

app.get('/api/podcasts/:id/transcript', (req, res) => {
  const lang = (req.query.lang || 'es').toLowerCase();
  const ep = pods.getEpisode(req.params.id);
  if (!ep) return res.status(404).end();
  const base = absolutePath(path.join(pods.PODCAST_DIR, ep.relPath)).replace(/\.[^/.]+$/, "");
  const paths = [ `${base}.${lang}.lrc`, `${base}.${lang}.vtt`, `${base}.lrc`, `${base}.vtt` ];
  for (const p of paths) {
    if (fs.existsSync(p)) return res.json({ success: true, content: fs.readFileSync(p, 'utf8'), file: p });
  }
  res.status(404).end();
});

// ============================================================
// RUTAS - MULTIMEDIA & COVERS
// ============================================================

app.get('/artist-cover/:artistName', async (req, res) => {
  const artistName = decodeURIComponent(req.params.artistName);
  const song = songCache.find(s => s.artist === artistName);
  if (!song) return res.status(404).end();
  const dir = path.dirname(absolutePath(song.relPath));
  const files = fs.readdirSync(dir);
  const cover = files.find(f => f.toLowerCase().startsWith('artist') && /\.(jpe?g|png|webp)$/i.test(f));
  if (cover) return res.sendFile(path.join(dir, cover));
  res.status(404).end();
});

app.get('/cover/:id', async (req, res) => {
  const song = songMap.get(req.params.id);
  if (!song) {
    const ep = pods.getEpisode(req.params.id);
    if (ep) return res.redirect(`/podcast-cover/${ep.id}`);
    return res.status(404).end();
  }
  if (song.cover_path && fs.existsSync(absolutePath(song.cover_path))) return res.sendFile(absolutePath(song.cover_path));
  const dir = path.dirname(absolutePath(song.relPath));
  const files = fs.readdirSync(dir);
  const cover = files.find(f => f.toLowerCase().startsWith('album') && /\.(jpe?g|png|webp)$/i.test(f));
  if (cover) return res.sendFile(path.join(dir, cover));

  try {
    const { parseFile } = await import('music-metadata');
    const m = await parseFile(absolutePath(song.relPath));
    const pic = m.common?.picture?.[0];
    if (pic) { res.set('Content-Type', pic.format || 'image/jpeg'); return res.send(pic.data); }
  } catch (e) {}
  res.status(404).end();
});

app.get('/audio/:id', (req, res) => {
  const song = songMap.get(req.params.id);
  if (!song) return res.status(404).end();
  const f = absolutePath(song.relPath);
  if (!fs.existsSync(f)) return res.status(404).end();
  const st = fs.statSync(f);
  const range = req.headers.range;
  const mime = path.extname(f).toLowerCase() === '.mp3' ? 'audio/mpeg' : 'audio/mp4';
  if (range) {
    const [start, end] = range.replace(/bytes=/, "").split("-").map(Number);
    const realEnd = end || st.size - 1;
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${realEnd}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': realEnd - start + 1, 'Content-Type': mime });
    fs.createReadStream(f, { start, end: realEnd }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': st.size, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(f).pipe(res);
  }
});

app.get('/podcast-audio/:id', (req, res) => {
  const ep = pods.getEpisode(req.params.id);
  if (!ep) return res.status(404).end();
  const f = path.join(pods.PODCAST_DIR, ep.relPath);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.writeHead(200, { 'Content-Length': fs.statSync(f).size, 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes' });
  fs.createReadStream(f).pipe(res);
});

app.get('/podcast-series-cover/:id', async (req, res) => {
  const d = pods.getPodcastDetail(req.params.id);
  if (!d || !d.episodes.length) return res.status(404).end();
  res.redirect(`/podcast-cover/${d.episodes[0].id}`);
});

app.get('/podcast-cover/:id', async (req, res) => {
  const ep = pods.getEpisode(req.params.id);
  if (!ep) return res.status(404).end();
  const f = path.join(pods.PODCAST_DIR, ep.relPath);
  try {
    const { parseFile } = await import('music-metadata');
    const m = await parseFile(f);
    const pic = m.common?.picture?.[0];
    if (pic) { res.set('Content-Type', pic.format || 'image/jpeg'); return res.send(pic.data); }
  } catch (e) {}
  res.status(404).end();
});

// ============================================================
// LYRICS
// ============================================================

app.get('/api/lyrics/:id', async (req, res) => {
  try {
    const song = songMap.get(req.params.id);
    if (!song) return res.status(404).end();
    const dbLyrics = await db.getLyrics(song.id);
    if (dbLyrics) return res.json({ success: true, lyrics: dbLyrics.text, syncedLines: dbLyrics.synced_text ? parseSyncedLines(dbLyrics.synced_text) : null });
    const result = await getLyricsFromService(song.id, song.title, song.artist, absolutePath(song.relPath));
    if (result.lyrics) await db.saveLyrics(song.id, { text: result.lyrics, syncedText: result.syncedLines?.map(l => `[${l.time}] ${l.text}`).join('\n') });
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/lyrics/:id/save-file', async (req, res) => {
  const song = songMap.get(req.params.id);
  if (!song) return res.status(404).end();
  const lrcPath = absolutePath(song.relPath).replace(/\.[^/.]+$/, ".lrc");
  fs.writeFileSync(lrcPath, req.body.content, 'utf8');
  await db.setSongHasLyrics(song.id);
  res.json({ ok: true });
});

app.post('/api/lyrics/:id/refresh', async (req, res) => {
  try {
    const { id } = req.params;
    const song = songMap.get(id);
    if (!song) return res.status(404).json({ error: 'Cancion no encontrada' });

    await db.deleteLyrics(id);
    const songPath = absolutePath(song.relPath);
    const result = await getLyricsFromService(id, song.title, song.artist, songPath);

    if (result.lyrics) {
      await db.saveLyrics(id, {
        text: result.lyrics,
        syncedText: result.syncedLines ? result.syncedLines.map(l => `[${l.time}] ${l.text}`).join('\n') : null,
        translatedText: result.translatedLyrics || null
      });
    }

    res.json({
      success: true,
      hasLyrics: !!result.lyrics,
      lyrics: result.lyrics || null,
      syncedLines: result.syncedLines || null,
      translatedLyrics: result.translatedLyrics || null
    });
  } catch (err) {
    console.error('[api/lyrics/refresh] Error:', err);
    res.status(500).json({ error: 'Error al refrescar la letra' });
  }
});

// ============================================================
// RESCAN & SSE
// ============================================================

app.get('/api/rescan-stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  const interval = setInterval(() => {
    try {
      const state = JSON.parse(fs.readFileSync(RESCAN_PROGRESS_FILE, 'utf-8'));
      res.write(`data: ${JSON.stringify({ type: 'progress', ...state })}\n\n`);
      if (state.phase === 'done' || state.phase === 'error') {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        clearInterval(interval);
        res.end();
      }
    } catch (e) {}
  }, 1000);
  req.on('close', () => clearInterval(interval));
});

app.post('/api/rescan', async (req, res) => {
  res.status(202).json({ success: true });
  try {
    db.setRescanning(true);
    await db.closeDb();
    await runBuildDbPython({ musicDir: MUSIC_DIR, progressPath: RESCAN_PROGRESS_FILE });
    db.setRescanning(false);
    await loadLibrary();
  } catch (err) {
    db.setRescanning(false);
    writeRescanProgress({ phase: 'error', message: err.message });
  }
});

// ============================================================
// FAVORITE ARTISTS & MOODS
// ============================================================

app.get('/api/favorite-artists', async (req, res) => {
  try { res.json({ items: (await db.getFavoriteArtists(req.query.userId)).map(n => ({ name: n })) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/favorite-artists/toggle', async (req, res) => {
  try {
    const { artistId, userId, liked } = req.body;
    await db.toggleFavoriteArtist(artistId, userId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/moods', async (_req, res) => {
  try { res.json({ moods: await db.listMoods() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// START
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎵 Servidor completo restaurado en http://${LOCAL_IP}:${PORT}\n`);
});
