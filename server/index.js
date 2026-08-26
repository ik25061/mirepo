// ============================================================
// server/index.js - SERVIDOR PRINCIPAL (VERSIÓN COMPLETA)
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
// build_music_db.py y este index.js escriben su avance en un archivo JSON.
// El endpoint SSE /api/rescan-stream lo consulta por polling y lo reenvía
// al cliente, de modo que la UI puede mostrar una barra de progreso real.
const RESCAN_PROGRESS_FILE = path.join(__dirname, 'localfy-rescan.json');

function writeRescanProgress(payload) {
    try {
    // fs.writeFileSync (no async/promise) para evitar race conditions en el poller del SSE.
    // El tercer argumento debe ser un objeto options; pasarlo como string ('utf-8') equivale a pasarlo
    // como callback y lanza "The 'cb' argument must be of type function".
    fs.writeFileSync(RESCAN_PROGRESS_FILE, JSON.stringify({ ts: Date.now(), ...payload }), { encoding: 'utf-8' });
  } catch (err) {
    console.error('[rescan] No se pudo escribir estado de progreso:', err.message);
  }
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
    if (songCache.length === 0) {
      console.log('⚠️ Meilisearch: biblioteca vacía, saltando sincronización');
      return;
    }
    console.log(`🔍 Intentando sincronizar ${songCache.length} canciones con Meilisearch...`);

    // Preparar documentos para Meilisearch
    const docs = songCache.map(s => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      album: s.album,
      year: s.year,
      bpm: s.bpm,
      key: s.key_name,
    }));

    const task = await songIndex.updateDocuments(docs);
    console.log('✅ Meilisearch: tarea de sincronización enviada:', task.taskUid);
  } catch (err) {
    console.warn('⚠️ Meilisearch: no se pudo sincronizar (¿está el servicio encendido en el puerto 7700?)');
  }
}

// ============================================================
// VARIABLES GLOBALES
// ============================================================
let libraryReady = false;
let songCache = [];
let songMap = new Map();

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

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

/**
 * Genera un cursor basado en userId y fecha para evitar repeticiones
 * hasta que se agote el catálogo
 */
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

// ============================================================
// CARGAR BIBLIOTECA EN MEMORIA
// ============================================================

async function loadLibrary() {
  try {
    console.log('🔍 Cargando biblioteca desde SQLite...');
    
    const songs = await db.getSongsWithDetails({ limit: 999999, offset: 0 });
    
    songCache = songs;
    songMap = new Map(songs.map(s => [s.id, s]));
    
    console.log(`✅ ${songCache.length} canciones cargadas en memoria`);
    libraryReady = true;
    syncToMeilisearch();
  } catch (err) {
    console.error('❌ Error cargando biblioteca:', err);
    libraryReady = true;
  }
}

loadLibrary();

// ============================================================
// CONSTRUIR BIBLIOTECA CON SHUFFLE Y CURSOR
// ============================================================

async function buildLibrary({ limit = 100, offset = 0, userId = null, likedOnly = false, shuffleSeed = null } = {}) {
  console.log('[buildLibrary] 🏗️ Construyendo...', { limit, offset, userId, likedOnly });

  const effectiveUserId = userId || null;

  try {
    // Usar la biblioteca ya cargada en memoria (songCache) en lugar de
    // volver a consultar SQLite completo (con subconsulta de géneros por
    // canción) en cada petición: esto es lo que causaba la lentitud.
    if (!libraryReady) {
      await loadLibrary();
    }

    // Sets de "me gusta" / "ocultas" del usuario: 2 consultas indexadas
    // rápidas, en vez de una consulta por cada canción del catálogo.
    let likedIds = new Set();
    let hiddenIds = new Set();
    if (effectiveUserId) {
      [likedIds, hiddenIds] = await Promise.all([
        db.getLikedSongIds(effectiveUserId),
        db.getHiddenSongIds(effectiveUserId)
      ]);
    }

    // Clonar solo lo necesario (sin volver a tocar la base de datos) y
    // aplicar el estado de like/hidden específico de este usuario.
    let songs = songCache
      .filter(s => !hiddenIds.has(s.id))
      .map(s => ({
        ...s,
        liked: likedIds.has(s.id),
        hidden: false
      }));

    if (likedOnly) {
      songs = songs.filter(s => s.liked);
    }

    // Generar semilla para shuffle (basada en userId y fecha)
    const seed = shuffleSeed || getCursor(effectiveUserId);
    const shuffled = shuffleArray(songs, seed);

    // Paginación
    const total = shuffled.length;
    const start = offset;
    const end = Math.min(start + limit, total);
    const paged = shuffled.slice(start, end);

    // Obtener conteos
    const trash = await db.getTrashCount(effectiveUserId);

    // Obtener artistas ocultos para el usuario
    let hiddenArtists = [];
    if (effectiveUserId) {
      const hiddenSet = await db.getHiddenArtists(effectiveUserId);
      hiddenArtists = [...hiddenSet];
    }

    const result = {
      songs: paged,
      hiddenArtists: hiddenArtists,
      counts: { total, trash },
      pagination: {
        offset: start,
        limit: limit,
        total: total,
        hasMore: end < total
      }
    };

    console.log(`[buildLibrary] ✅ ${paged.length} canciones devueltas (total: ${total})`);
    return result;

  } catch (err) {
    console.error('[buildLibrary] ❌ Error:', err);
    throw err;
  }
}

// ============================================================
// RUTAS - TEST Y CONFIG
// ============================================================

app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    libraryReady,
    songCount: songCache.length,
    musicDir: MUSIC_DIR,
    dbReady: true
  });
});

app.get('/api/config/ip', (req, res) => {
  res.json({ 
    ip: LOCAL_IP, 
    port: PORT, 
    serverUrl: `http://${LOCAL_IP}:${PORT}`,
    allIps: LOCAL_IPS
  });
});

// ============================================================
// RUTAS - AUTENTICACIÓN
// ============================================================

app.post('/api/auth/register', async (req, res) => {
  console.log('[auth/register]', req.body.username);
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }
  
  if (username.length < 3 || password.length < 3) {
    return res.status(400).json({ error: 'Usuario y contraseña deben tener al menos 3 caracteres' });
  }

  try {
    const user = await db.createUser(username, password);
    res.json({ 
      success: true, 
      user: { id: user.id, username: user.username },
      message: 'Usuario creado correctamente'
    });
  } catch (err) {
    if (err.message === 'El usuario ya existe') {
      return res.status(409).json({ error: 'El usuario ya existe' });
    }
    console.error('[register]', err);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  console.log('[auth/login]', req.body.username);
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  try {
    const user = await db.findUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    
    const sessionToken = crypto.randomBytes(32).toString('hex');
    await db.updateUserSession(user.id, sessionToken);
    
    res.json({ 
      success: true, 
      user: { id: user.id, username: user.username },
      token: sessionToken
    });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(401).json({ error: 'No hay token' });
  }

  try {
    const user = await db.getUserByToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    res.json({ 
      success: true, 
      user: { id: user.id, username: user.username }
    });
  } catch (err) {
    console.error('[verify]', err);
    res.status(500).json({ error: 'Error al verificar sesión' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const { token } = req.body;
  try {
    if (token) {
      await db.clearUserSession(token);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[logout]', err);
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
});

// ============================================================
// RUTAS - BIBLIOTECA PRINCIPAL (CON SHUFFLE Y CURSOR)
// ============================================================

app.get('/api/library', async (req, res) => {
  console.log('[api/library] 📥 Solicitud recibida');
  
  try {
    if (!libraryReady) {
      return res.status(503).json({ 
        error: 'Biblioteca aún cargando, espera unos segundos' 
      });
    }
    
    const userId = req.query.userId || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const likedOnly = req.query.liked === 'true';
    const shuffleSeed = req.query.shuffleSeed ? parseInt(req.query.shuffleSeed, 10) : null;
    
    console.log('[api/library] 🔍 Parámetros:', { userId, limit, offset, likedOnly, shuffleSeed });
    
    const result = await buildLibrary({ limit, offset, userId, likedOnly, shuffleSeed });
    console.log('[api/library] ✅ Éxito');
    res.json(result);
  } catch (err) {
    console.error('[api/library] ❌ Error:', err);
    res.status(500).json({ 
      error: 'No se pudo cargar la biblioteca',
      message: err.message
    });
  }
});

// ============================================================
// RUTAS - ARTISTAS CON PAGINACIÓN INFINITA
// ============================================================

// ============================================================
// RUTAS - ARTISTAS CON PAGINACIÓN INFINITA
// ============================================================

app.get('/api/artists', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const search = req.query.search || '';
    const minSongs = parseInt(req.query.minSongs, 10) || 0;

    console.log(`[api/artists] 📥 userId=${userId}, limit=${limit}, offset=${offset}, search="${search}", minSongs=${minSongs}`);
    
    const result = await db.getArtistsWithPagination({ 
      userId, 
      limit, 
      offset, 
      search,
      minSongs
    });
    
    console.log(`[api/artists] ✅ ${result.items?.length || 0} artistas devueltos, total ${result.pagination?.total || 0}`);
    
    res.json(result);
  } catch (err) {
    console.error('[api/artists] ❌ Error:', err);
    res.status(500).json({ 
      error: 'Error al obtener artistas',
      details: err.message 
    });
  }
});

app.get('/api/artists/:id/songs', async (req, res) => {
  try {
    const artistId = parseInt(req.params.id, 10);
    const userId = req.query.userId || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    
    const result = await db.getSongsByArtist({
      artistId,
      userId,
      limit,
      offset
    });
    
    res.json(result);
  } catch (err) {
    console.error('[api/artists/:id/songs] Error:', err);
    res.status(500).json({ error: 'Error al obtener canciones del artista' });
  }
});

app.get('/api/albums', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const search = req.query.search || '';
    const minSongs = parseInt(req.query.minSongs, 10) || 0;

    console.log(`[api/albums] 📥 userId=${userId}, limit=${limit}, offset=${offset}, search="${search}", minSongs=${minSongs}`);
    
    const result = await db.getAlbumsWithPagination({
      userId,
      limit,
      offset,
      search,
      minSongs
    });
    
    console.log(`[api/albums] ✅ ${result.items?.length || 0} álbumes devueltos, total ${result.pagination?.total || 0}`);
    
    res.json(result);
  } catch (err) {
    console.error('[api/albums] ❌ Error:', err);
    res.status(500).json({ 
      error: 'Error al obtener álbumes',
      details: err.message 
    });
  }
});

app.get('/api/genres', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const search = req.query.search || '';
    const minSongs = parseInt(req.query.minSongs, 10) || 0;

    console.log(`[api/genres] 📥 userId=${userId}, limit=${limit}, offset=${offset}, search="${search}", minSongs=${minSongs}`);
    
    const result = await db.getGenresWithPagination({
      userId,
      limit,
      offset,
      search,
      minSongs
    });
    
    console.log(`[api/genres] ✅ ${result.items?.length || 0} géneros devueltos, total ${result.pagination?.total || 0}`);
    
    res.json(result);
  } catch (err) {
    console.error('[api/genres] ❌ Error:', err);
    res.status(500).json({ 
      error: 'Error al obtener géneros',
      details: err.message 
    });
  }
});

app.get('/api/years', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const search = req.query.search || '';
    
    console.log(`[api/years] 📥 userId=${userId}, limit=${limit}, offset=${offset}, search="${search}"`);
    
    const result = await db.getYearsWithPagination({
      userId,
      limit,
      offset,
      search
    });
    
    console.log(`[api/years] ✅ ${result.items?.length || 0} años devueltos, total ${result.pagination?.total || 0}`);
    
    res.json(result);
  } catch (err) {
    console.error('[api/years] ❌ Error:', err);
    res.status(500).json({ 
      error: 'Error al obtener años',
      details: err.message 
    });
  }
});

app.get('/api/albums/:id/songs', async (req, res) => {
  try {
    const albumId = parseInt(req.params.id, 10);
    const userId = req.query.userId || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    
    const result = await db.getSongsByAlbum({
      albumId,
      userId,
      limit,
      offset
    });
    
    res.json(result);
  } catch (err) {
    console.error('[api/albums/:id/songs] Error:', err);
    res.status(500).json({ error: 'Error al obtener canciones del álbum' });
  }
});

app.get('/api/genres/:id/songs', async (req, res) => {
  try {
    const genreId = parseInt(req.params.id, 10);
    const userId = req.query.userId || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    
    const result = await db.getSongsByGenre({
      genreId,
      userId,
      limit,
      offset
    });
    
    res.json(result);
  } catch (err) {
    console.error('[api/genres/:id/songs] Error:', err);
    res.status(500).json({ error: 'Error al obtener canciones del género' });
  }
});

app.get('/api/years/:year/songs', async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    const userId = req.query.userId || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    
    const result = await db.getSongsByYear({
      year,
      userId,
      limit,
      offset
    });
    
    res.json(result);
  } catch (err) {
    console.error('[api/years/:year/songs] Error:', err);
    res.status(500).json({ error: 'Error al obtener canciones del año' });
  }
});

// ============================================================
// RUTA - CANCIONES SIN ÁLBUM NI ARTISTA
// ============================================================

app.get('/api/songs/no-album-no-artist', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    
    const result = await db.getSongsWithoutAlbumOrArtist({
      userId,
      limit,
      offset
    });
    
    res.json(result);
  } catch (err) {
    console.error('[api/songs/no-album-no-artist] Error:', err);
    res.status(500).json({ error: 'Error al obtener canciones sin álbum ni artista' });
  }
});

// ============================================================
// RUTA - CANCIONES QUE ME GUSTAN (CORREGIDO)
// ============================================================
app.get('/api/liked-songs', async (req, res) => {
  try {
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'Se requiere userId' });
    }
    
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    
    console.log(`[api/liked-songs] 📥 userId=${userId}, limit=${limit}, offset=${offset}`);
    
    const songs = await db.getLikedSongs(parseInt(userId), limit, offset);
    const total = await db.getLikedSongsCount(parseInt(userId));
    
    console.log(`[api/liked-songs] ✅ Encontradas ${songs.length} canciones, total ${total}`);
    
    res.json({
      songs: songs || [],
      pagination: {
        offset,
        limit,
        total: total || 0,
        hasMore: (offset + limit) < (total || 0)
      }
    });
  } catch (err) {
    console.error('[api/liked-songs] ❌ Error:', err);
    res.status(500).json({ 
      error: 'Error al obtener canciones que me gustan',
      details: err.message 
    });
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
    
    const result = await db.getSongsWithoutAlbumOrArtist({
      userId,
      limit,
      offset
    });
    
    res.json(result);
  } catch (err) {
    console.error('[api/songs/no-album-no-artist] Error:', err);
    res.status(500).json({ error: 'Error al obtener canciones sin album ni artista' });
  }
});

// ============================================================
// RUTAS - ARTISTAS FAVORITOS

app.get('/api/favorite-artists', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const artists = await db.getFavoriteArtists(userId);
    res.json({ artists });
  } catch (err) {
    console.error('[api/favorite-artists]', err);
    res.status(500).json({ error: 'Error al obtener artistas favoritos' });
  }
});

app.post('/api/favorite-artists/toggle', async (req, res) => {
  try {
    const { artist, userId } = req.body;
    if (!artist) return res.status(400).json({ error: 'Falta el artista' });
    
    const artistId = await db.getArtistIdByName(artist);
    if (!artistId) {
      return res.status(404).json({ error: 'Artista no encontrado' });
    }
    
    const isFavorite = await db.toggleFavoriteArtist(artistId, userId);
    const artists = await db.getFavoriteArtists(userId);
    res.json({ artists, isFavorite });
  } catch (err) {
    console.error('[api/favorite-artists/toggle]', err);
    res.status(500).json({ error: 'Error al cambiar artista favorito' });
  }
});

// ============================================================
// RUTAS - OCULTAR ARTISTAS
// ============================================================

app.post('/api/artists/hide', async (req, res) => {
  try {
    const { artist, userId } = req.body;
    if (!artist) return res.status(400).json({ error: 'Falta el artista' });
    
    const artistId = await db.getArtistIdByName(artist);
    if (!artistId) {
      return res.status(404).json({ error: 'Artista no encontrado' });
    }
    
    await db.setArtistHidden(artistId, true, userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/artists/hide] Error:', err);
    res.status(500).json({ error: 'Error al ocultar artista' });
  }
});

app.post('/api/artists/unhide', async (req, res) => {
  try {
    const { artist, userId } = req.body;
    if (!artist) return res.status(400).json({ error: 'Falta el artista' });
    
    const artistId = await db.getArtistIdByName(artist);
    if (!artistId) {
      return res.status(404).json({ error: 'Artista no encontrado' });
    }
    
    await db.setArtistHidden(artistId, false, userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/artists/unhide] Error:', err);
    res.status(500).json({ error: 'Error al mostrar artista' });
  }
});

// ============================================================
// RUTAS - LIKES Y HIDES DE CANCIONES
// ============================================================

app.post('/api/songs/:id/like', async (req, res) => {
  const { id } = req.params;
  const userId = req.body.userId || null;
  const liked = Boolean(req.body.liked);

  // Buscar en cache o DB como respaldo
  let song = songMap.get(id);
  if (!song) {
    const songs = await db.getSongsByIds(id, userId);
    song = songs[0];
  }

  if (!song) return res.status(404).json({ error: 'Canción no encontrada' });

  try {
    await db.setSongLiked(song.id, liked, userId);
    // Actualizar cache si existe
    if (songMap.has(id)) {
      songMap.get(id).liked = liked;
    }
    console.log(`[api/songs/:id/like] ✅ Like ${liked ? 'agregado' : 'quitado'}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/songs/:id/like] Error:', err);
    res.status(500).json({ error: 'Error al actualizar like' });
  }
});

app.post('/api/songs/:id/hide', async (req, res) => {
  const { id } = req.params;
  const userId = req.body.userId || null;

  let song = songMap.get(id);
  if (!song) {
    const songs = await db.getSongsByIds(id, userId);
    song = songs[0];
  }
  if (!song) return res.status(404).json({ error: 'Canción no encontrada' });

  try {
    await db.setSongHidden(song.id, true, userId);
    console.log(`[api/songs/:id/hide] ✅ Ocultada`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/songs/:id/hide] Error:', err);
    res.status(500).json({ error: 'Error al ocultar canción' });
  }
});

// ============================================================
// RUTAS - ELIMINAR CANCIÓN
// ============================================================

app.delete('/api/songs', async (req, res) => {
  try {
    const { id, userId } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Se requiere id' });
    }

    let song = songMap.get(id);
    if (!song) {
      const songs = await db.getSongsByIds(id, userId);
      song = songs[0];
    }

    if (!song) {
      console.log(`[api/songs DELETE] ❌ Canción ${id} no encontrada`);
      return res.status(404).json({ error: 'Canción no encontrada en el catálogo' });
    }

    const fullPath = absolutePath(song.relPath);
    console.log(`[api/songs DELETE] 🗑️ Intentando eliminar: ${fullPath}`);

    if (fs.existsSync(fullPath)) {
      try {
        if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });
        
        const now = new Date();
        const trashSubDir = path.join(TRASH_DIR, 
          `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        );
        if (!fs.existsSync(trashSubDir)) fs.mkdirSync(trashSubDir, { recursive: true });
        
        const trashName = `${Date.now()}_${path.basename(fullPath)}`;
        const trashPath = path.join(trashSubDir, trashName);
        
        fs.copyFileSync(fullPath, trashPath);
        fs.unlinkSync(fullPath);
        console.log(`[api/songs DELETE] ✅ Archivo movido a papelera: ${trashPath}`);
      } catch (err) {
        console.error('[api/songs DELETE] ❌ Error moviendo archivo:', err.message);
        return res.status(500).json({ error: 'Error físico al eliminar el archivo', details: err.message });
      }
    } else {
      console.warn(`[api/songs DELETE] ⚠️ El archivo no existe en disco: ${fullPath}`);
    }

    if (userId) {
      await db.setSongHidden(song.id, true, userId);
    }

    // Quitar de la memoria
    songMap.delete(id);
    songCache = songCache.filter(s => s.id !== id);

    res.json({ message: 'Canción eliminada correctamente' });
  } catch (error) {
    console.error('[api/songs DELETE] ❌ Error general:', error);
    res.status(500).json({ error: 'Error interno al procesar eliminación', details: error.message });
  }
});

// ============================================================
// RUTAS - RESCAN
// ============================================================

app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ songs: [] });

    console.log(`[api/search] 🔍 Buscando: "${q}"`);

    let ids = [];
    try {
      const searchResult = await songIndex.search(q, {
        limit: 50,
      });
      console.log(`[api/search] 🎯 Meilisearch devolvió ${searchResult.hits.length} hits`);
      ids = searchResult.hits.map(h => h.id);
    } catch (meiliErr) {
      console.error('[api/search] ❌ Meilisearch falló (¿está encendido?):', meiliErr.message);
      // Fallback: búsqueda simple en el cache de memoria para no dejar al usuario sin nada
      const normalizedQ = q.toLowerCase();
      ids = songCache
        .filter(s =>
          s.title.toLowerCase().includes(normalizedQ) ||
          (s.artist && s.artist.toLowerCase().includes(normalizedQ))
        )
        .slice(0, 50)
        .map(s => s.id);
      console.log(`[api/search] 💡 Usando fallback de memoria: ${ids.length} resultados`);
    }

    const songs = ids.map(id => songMap.get(id)).filter(Boolean);

    console.log(`[api/search] ✅ Devolviendo ${songs.length} canciones encontradas en el catálogo`);
    res.json({ songs });
  } catch (err) {
    console.error('[api/search] ❌ Error general:', err.message);
    res.status(500).json({ error: 'Error en la búsqueda', details: err.message });
  }
});

// SSE: emite el avance del rescan en vivo (la UI abre este stream antes del POST).
app.get('/api/rescan-stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('retry: 2000\n\n');

  const send = (type, payload = {}) => {
    try { res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`); } catch {}
  };

  const started = Date.now();
  const TIMEOUT = 5 * 60 * 1000; // 5 min máximo (evita conexiones que nunca terminan)
  let lastDone = false;
  let clientClosed = false;
  req.on('close', () => { clientClosed = true; });

  try {
    while (!lastDone && !clientClosed) {
      let state = null;
      try {
        state = JSON.parse(fs.readFileSync(RESCAN_PROGRESS_FILE, 'utf-8'));
      } catch {
        state = null; // aún no hay rescan en curso
      }

            const safe = state || { phase: 'idle', pct: 0, processed: 0, total: 0 };
      send('progress', safe);
      if (state && (state.phase === 'done' || state.phase === 'error')) lastDone = true;

      if (Date.now() - started > TIMEOUT) break;
      await new Promise(r => setTimeout(r, 400));
    }
  } catch (err) {
    console.error('[rescan-stream] ❌ Error:', err);
  } finally {
    send('done');
    try { res.end(); } catch {}
  }
});

app.post('/api/rescan', async (_req, res) => {
  try {
    console.log('[api/rescan] 🔄 Liberando conexión SQLite y reconstruyendo BD con build_music_db.py...');

    writeRescanProgress({ phase: 'start', pct: 2, processed: 0, total: 0, message: 'Preparando rescan...' });

    // 1. Cerrar la BD del server para que Python pueda reescribir el esquema
    //    sin conflictos de WAL/locking.
    await db.closeDb();

    writeRescanProgress({ phase: 'building', pct: 5, processed: 0, total: 0, message: 'Reconstruyendo la base de datos...' });

    // 2. Ejecutar scripts/build_music_db.py (reconstruye server/localfy.db desde
    //    la música). El propio script escribe progreso en RESCAN_PROGRESS_FILE.
    const { stdout, stderr } = await runBuildDbPython({
      musicDir: MUSIC_DIR,
      progressPath: RESCAN_PROGRESS_FILE,
    });
    if (stdout) console.log('[api/rescan]', String(stdout).trim());
    if (stderr) console.warn('[api/rescan] (stderr)', String(stderr).trim());

    writeRescanProgress({ phase: 'loading', pct: 95, processed: 0, total: 0, message: 'Recargando la biblioteca en memoria...' });

    // 3. Reabrir la BD: getDb() vuelve a ejecutar initSchema (tablas de usuario,
    //    vistas, etc. que el script Python no toca).
    await db.getDb();

    // 4. Recargar la biblioteca en memoria con los datos nuevos.
    await loadLibrary();

    // 5. Responder con la biblioteca reconstruida (mismo contrato que antes).
    const result = await buildLibrary({ limit: 100, offset: 0 });
    writeRescanProgress({ phase: 'done', pct: 100, message: `Rescan completado (${result.counts?.total ?? 0} canciones)` });
    res.json(result);
  } catch (err) {
    console.error('[api/rescan] Error:', err);
    writeRescanProgress({ phase: 'error', pct: 100, message: err.message });

    // Recargar aunque falle: evita servir datos viejos si la BD quedó a medias.
    try {
      await db.getDb();
      await loadLibrary();
    } catch (reloadErr) {
      console.error('[api/rescan] No se pudo recargar la biblioteca tras el error:', reloadErr);
    }

    res.status(500).json({ error: `Error al rescanejar: ${err.message}` });
  }
});

// ============================================================
// RUTA - CORREGIR METADATOS
// ============================================================

app.post('/api/fix-metadata', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Se requiere filePath' });

    const absPath = absolutePath(filePath);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Archivo no encontrado' });

    const fileName = path.basename(absPath, path.extname(absPath));
    let newArtist = 'Artista desconocido';
    let newTitle = fileName;

    const match = fileName.match(/^(.+?)[\-_](.+)$/);
    if (match) {
      newArtist = match[1].trim();
      newTitle = match[2].trim();
    }

    if (!newArtist || newArtist.toLowerCase().includes('anónimo')) newArtist = 'Artista desconocido';
    if (!newTitle || newTitle.toLowerCase().includes('[track') || newTitle.toLowerCase().includes('[untitled]')) newTitle = fileName;

    const song = songCache.find(s => s.relPath === filePath);
    
    let newPath = null;
    if (song) {
      const oldRelPath = song.relPath;
      const oldDir = path.dirname(oldRelPath);
      const ext = path.extname(absPath);
      const safeArtist = newArtist.replace(/[<>:"/\\|?*]/g, ' ').trim();
      const safeTitle = newTitle.replace(/[<>:"/\\|?*]/g, ' ').trim();
      const newFileName = `${safeArtist} - ${safeTitle}${ext}`;

      if (path.basename(oldRelPath) !== newFileName) {
        newPath = path.join(oldDir, newFileName);
        const newFullPath = absolutePath(newPath);
        try {
          if (fs.existsSync(absPath)) {
            fs.renameSync(absPath, newFullPath);
            await db.updateSongPath(song.id, newPath, newTitle);
          }
        } catch (err) {
          console.error('[fix-metadata] Error renombrando:', err);
        }
      }
      
      song.title = newTitle;
      song.artist = newArtist;
    }

    res.json({ 
      success: true, 
      message: `Metadatos corregidos: ${newArtist} - ${newTitle}`, 
      newPath, 
      artist: newArtist, 
      title: newTitle 
    });
  } catch (error) {
    console.error('[fix-metadata] Error:', error);
    res.status(500).json({ error: 'Error al corregir metadatos: ' + error.message });
  }
});

// ============================================================
// RUTA - PORTADA DE ARTISTA
// ============================================================

app.get('/artist-cover/:artistName', async (req, res) => {
  try {
    const encodedName = req.params.artistName;
    let artistName = decodeURIComponent(encodedName);
    
    const cleanName = artistName.replace(/[\[\]\(\)]/g, '').trim();
    
    let song = songCache.find(s => s.artist === artistName);
    if (!song && cleanName !== artistName) {
      song = songCache.find(s => s.artist === cleanName);
    }
    if (!song) {
      const withBrackets = `[${cleanName}]`;
      song = songCache.find(s => s.artist === withBrackets);
    }

    if (!song) return res.status(404).send('Artista no encontrado');

    // Buscar en el directorio del artista la imagen del artista.
    // NUEVA ESTRUCTURA: en la misma carpeta hay dos imágenes:
    //   "artist - nombreartista.jpg" (foto del artista)
    //   "album - nombrealbum.jpg"    (portada del álbum)
    // Aquí siempre priorizamos el archivo con prefijo "artist".
    const artistDir = path.dirname(absolutePath(song.relPath));
    const coverExts = ['.jpg', '.jpeg', '.png', '.webp'];

    try {
      const entries = fs.readdirSync(artistDir, { withFileTypes: true });
      const imageFiles = entries
        .filter(e => e.isFile() && coverExts.includes(path.extname(e.name).toLowerCase()))
        .map(e => e.name);

      // 1. Prioridad: archivo cuyo nombre empieza con "artist" (artist - nombreartista.jpg)
      const artistImage = imageFiles.find(name => /^artist[\s\-_]*/i.test(name));

      // 2. Fallback: archivo que contenga el nombre del artista normalizado
      const normalizedArtist = cleanName.replace(/\s+/g, ' ').trim();
      const artistImageByName = !artistImage
        ? imageFiles.find(name => {
            const normalized = path.basename(name, path.extname(name)).replace(/\s+/g, ' ').trim().toLowerCase();
            return normalized.includes(normalizedArtist.toLowerCase()) &&
                   !/^album[\s\-_]*/i.test(name);
          })
        : null;

      const chosenName = artistImage || artistImageByName;
      if (chosenName) {
        const coverFullPath = path.join(artistDir, chosenName);
        const ext = path.extname(coverFullPath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        res.set('Content-Type', mimeType);
        res.set('Cache-Control', 'public, max-age=86400');
        res.sendFile(coverFullPath);
        return;
      }
    } catch (err) {
      // ignorar
    }

    res.status(404).send('No cover');
  } catch (error) {
    console.error('[artist-cover] Error:', error);
    res.status(500).send('Error');
  }
});

// ============================================================
// RUTAS - PORTADAS Y AUDIO
// ============================================================

app.get('/cover/:id', async (req, res) => {
  const song = songMap.get(req.params.id);
  if (!song) return res.status(404).end();

  // 1. Intentar con cover_path de la BD (nueva estructura)
  if (song.cover_path) {
    const coverFullPath = absolutePath(song.cover_path);
    if (fs.existsSync(coverFullPath)) {
      const ext = path.extname(coverFullPath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      res.set('Content-Type', mimeType);
      res.set('Cache-Control', 'public, max-age=86400');
      res.sendFile(coverFullPath);
      return;
    }
  }

  // 2. Buscar imagen en el directorio de la canción (nueva estructura)
  const songDir = path.dirname(absolutePath(song.relPath));
  const coverExts = ['.jpg', '.jpeg', '.png', '.webp'];

  try {
    const entries = fs.readdirSync(songDir, { withFileTypes: true });
    const imageFiles = entries
      .filter(e => e.isFile() && coverExts.includes(path.extname(e.name).toLowerCase()))
      .map(e => e.name);

    // 2a. Prioridad: portada del álbum ("album - nombrealbum.jpg")
    const albumCover = imageFiles.find(name => /^album[\s\-_]*/i.test(name));

    // 2b. Fallback: imagen cuyo nombre contenga el álbum de la canción
    const songAlbumCover = !albumCover
      ? imageFiles.find(name => {
          const normalized = path.basename(name, path.extname(name)).replace(/\s+/g, ' ').trim().toLowerCase();
          const album = (song.album || '').replace(/\s+/g, ' ').trim().toLowerCase();
          return album && normalized.includes(album) && !/^artist[\s\-_]*/i.test(name);
        })
      : null;

    const chosenCover = albumCover || songAlbumCover;
    if (chosenCover) {
      const coverFullPath = path.join(songDir, chosenCover);
      const ext = path.extname(coverFullPath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      res.set('Content-Type', mimeType);
      res.set('Cache-Control', 'public, max-age=86400');
      res.sendFile(coverFullPath);
      return;
    }
  } catch (err) {
    // ignorar
  }

  // 3. Fallback: extraer portada embebida del archivo de audio
  try {
    const { parseFile } = await import('music-metadata');
    const filePath = absolutePath(song.relPath);
    const meta = await parseFile(filePath, { duration: true });
    const pic = meta.common.picture && meta.common.picture[0];
    
    if (pic) {
      const mimeType = pic.format || 'image/jpeg';
      res.set('Content-Type', mimeType);
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(pic.data));
      return;
    }
  } catch (err) {}

  res.status(404).send('No cover');
});

app.get('/audio/:id', (req, res) => {
  const song = songMap.get(req.params.id);
  if (!song) return res.status(404).end();

  const filePath = absolutePath(song.relPath);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.mp3' ? 'audio/mpeg' : 'audio/mp4';

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mime,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ============================================================
// RUTAS - PLAYLISTS
// ============================================================

app.get('/api/playlists', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const playlists = await db.getPlayLists(userId);
    res.json({ playlists });
  } catch (err) {
    console.error('[api/playlists] Error:', err);
    res.status(500).json({ error: 'Error al obtener listas de reproducción' });
  }
});

app.get('/api/playlists/:id', async (req, res) => {
  try {
    const playlist = await db.getPlayList(req.params.id);
    if (!playlist) return res.status(404).json({ error: 'Lista no encontrada' });
    res.json({ playlist });
  } catch (err) {
    console.error('[api/playlists/:id] Error:', err);
    res.status(500).json({ error: 'Error al obtener la lista' });
  }
});

app.post('/api/playlists', async (req, res) => {
  try {
    const { name, description, userId } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es requerido' });
    const playlist = await db.createPlayList(name, description, userId);
    res.json({ playlist });
  } catch (err) {
    console.error('[api/playlists POST] Error:', err);
    res.status(500).json({ error: 'Error al crear lista' });
  }
});

app.post('/api/playlists/:id/songs', async (req, res) => {
  try {
    const { songId } = req.body;
    if (!songId) return res.status(400).json({ error: 'songId requerido' });
    const playlist = await db.addSongToPlayList(req.params.id, songId);
    if (!playlist) return res.status(404).json({ error: 'Lista no encontrada' });
    res.json({ playlist });
  } catch (err) {
    console.error('[api/playlists/:id/songs POST] Error:', err);
    res.status(500).json({ error: 'Error al agregar canción' });
  }
});

app.delete('/api/playlists/:id/songs', async (req, res) => {
  try {
    const { songId } = req.body;
    if (!songId) return res.status(400).json({ error: 'songId requerido' });
    const playlist = await db.removeSongFromPlayList(req.params.id, songId);
    if (!playlist) return res.status(404).json({ error: 'Lista no encontrada' });
    res.json({ playlist });
  } catch (err) {
    console.error('[api/playlists/:id/songs DELETE] Error:', err);
    res.status(500).json({ error: 'Error al eliminar canción' });
  }
});

app.delete('/api/playlists/:id', async (req, res) => {
  try {
    await db.deletePlayList(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/playlists/:id DELETE] Error:', err);
    res.status(500).json({ error: 'Error al eliminar lista' });
  }
});

// Resuelve un lote de IDs de canción a sus datos completos (título, artista,
// duración, etc.), en el mismo orden en que se piden. Pensado para clientes
// (como la app Android) que guardan playlists como listas de songIds y no
// quieren descargar toda la biblioteca solo para mostrar unas pocas canciones.
app.get('/api/songs/by-ids', async (req, res) => {
  try {
    const idsParam = (req.query.ids || '').toString();
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);

    if (ids.length === 0) {
      return res.json({ songs: [] });
    }

    if (!libraryReady) {
      await loadLibrary();
    }

    const userId = req.query.userId || null;
    let likedIds = new Set();
    let hiddenIds = new Set();
    if (userId) {
      [likedIds, hiddenIds] = await Promise.all([
        db.getLikedSongIds(userId),
        db.getHiddenSongIds(userId)
      ]);
    }

    const idSet = new Set(ids);
    const byId = new Map(
      songCache
        .filter(s => idSet.has(s.id) && !hiddenIds.has(s.id))
        .map(s => [s.id, { ...s, liked: likedIds.has(s.id), hidden: false }])
    );

    // Mantener el orden pedido (el orden de la playlist) y omitir IDs que ya
    // no existan en la biblioteca (canción borrada/movida).
    const songs = ids.map(id => byId.get(id)).filter(Boolean);

    res.json({ songs });
  } catch (err) {
    console.error('[api/songs/by-ids] Error:', err);
    res.status(500).json({ error: 'Error al obtener canciones' });
  }
});
// ============================================================
// RUTAS - LETRAS DE CANCIONES
// ============================================================

app.get('/api/lyrics/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const song = songMap.get(id);
    
    if (!song) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }
    
    const dbLyrics = await db.getLyrics(id);
    
    if (dbLyrics) {
      return res.json({
        success: true,
        hasLyrics: true,
        lyrics: dbLyrics.text,
        syncedLines: dbLyrics.synced_text ? parseSyncedLines(dbLyrics.synced_text) : null,
        translatedLyrics: dbLyrics.translated_text || null,
        title: song.title,
        artist: song.artist
      });
    }
    
    const songPath = absolutePath(song.relPath);
    const result = await getLyricsFromService(id, song.title, song.artist, songPath);
    
    if (!result.lyrics) {
      return res.json({ 
        success: false, 
        message: 'No se encontraron letras para esta canción',
        hasLyrics: false
      });
    }
    
    await db.saveLyrics(id, {
      text: result.lyrics,
      syncedText: result.syncedLines ? result.syncedLines.map(l => `[${l.time}] ${l.text}`).join('\n') : null,
      translatedText: result.translatedLyrics || null
    });
    
    res.json({
      success: true,
      hasLyrics: true,
      lyrics: result.lyrics,
      syncedLines: result.syncedLines || null,
      translatedLyrics: result.translatedLyrics || null,
      title: song.title,
      artist: song.artist
    });
  } catch (err) {
    console.error('[api/lyrics] Error:', err);
    res.status(500).json({ error: 'Error al obtener la letra' });
  }
});

// Guarda una letra encontrada por el cliente (p.ej. vía LRCLIB directo
// cuando el servidor no estaba disponible) como archivo .lrc físico junto
// al archivo de audio, con el mismo nombre base — el mismo patrón que
// scanner.js usa para detectar hasLyrics al escanear.
app.post('/api/lyrics/:id/save-file', async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Falta el contenido de la letra' });
    }

    const song = songMap.get(id) || songCache.find(s => s.id === id);
    if (!song || !song.relPath) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }

    const audioAbsPath = absolutePath(song.relPath);
    const ext = path.extname(audioAbsPath);
    const lrcPath = audioAbsPath.slice(0, -ext.length) + '.lrc';

    await fs.promises.writeFile(lrcPath, content, 'utf-8');

    await db.setSongHasLyrics(id);
    song.hasLyrics = true; // reflejar el cambio en memoria sin esperar a un rescan

    res.json({ ok: true, path: lrcPath });
  } catch (err) {
    console.error('[api/lyrics/:id/save-file] Error:', err);
    res.status(500).json({ error: 'Error al guardar la letra' });
  }
});

function parseSyncedLines(syncedText) {
  if (!syncedText) return null;
  const lines = syncedText.split('\n').filter(line => line.trim() !== '');
  const result = [];
  const lrcRegex = /^\[(\d{1,3}):(\d{2})\.(\d{2,3})\](.*)/;
  
  for (const line of lines) {
    const match = line.match(lrcRegex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fraction = parseInt(match[3], 10);
      const text = match[4].trim();
      let timeInSeconds;
      if (match[3].length === 3) {
        timeInSeconds = minutes * 60 + seconds + fraction / 1000;
      } else {
        timeInSeconds = minutes * 60 + seconds + fraction / 100;
      }
      if (text) {
        result.push({ time: timeInSeconds, text });
      }
    }
  }
  return result.length > 0 ? result : null;
}

app.post('/api/lyrics/:id/refresh', async (req, res) => {
  try {
    const { id } = req.params;
    const song = songMap.get(id);
    
    if (!song) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }
    
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
// CIERRE GRACEFUL
// ============================================================

process.on('SIGINT', async () => {
  console.log('\n🛑 Cerrando servidor...');
  await db.closeDb();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Cerrando servidor...');
  await db.closeDb();
  process.exit(0);
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎵 ==========================================`);
  console.log(`   🎵 MIREPO - SERVIDOR COMPLETO`);
  console.log(`   ==========================================`);
  console.log(`   📡 Local:    http://localhost:${PORT}`);
  LOCAL_IPS.forEach(ip => {
    console.log(`   📡 Red:      http://${ip}:${PORT}`);
  });
  console.log(`   📂 Música:   ${MUSIC_DIR}`);
  console.log(`   ==========================================`);
  console.log(`   ✅ Servidor listo`);
  console.log(`   ==========================================\n`);
});