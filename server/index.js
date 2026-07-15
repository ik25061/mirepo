import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scanLibrary, rescanLibrary, getCache, getSongById, absolutePath, MUSIC_DIR, TRASH_DIR, removeSongFromCache, saveCache } from './scanner.js';
import * as db from './db.js';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 5001;

console.log('🚀 Iniciando servidor...');
console.log(`📂 MUSIC_DIR: ${MUSIC_DIR}`);
console.log(`🗑️ TRASH_DIR: ${TRASH_DIR}`);

// ============================================================
// DETECTAR IP LOCAL
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

console.log('🌐 Todas las IPs del servidor:', LOCAL_IPS);
console.log('🌐 IP principal:', LOCAL_IP);

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

// Servir archivos estáticos
app.use('/songs', express.static(MUSIC_DIR));

// ============================================================
// INICIALIZAR DB
// ============================================================
let dbReady = false;

async function ensureDb() {
  if (!dbReady) {
    try {
      console.log('🔧 Inicializando base de datos...');
      await db.initDatabase();
      dbReady = true;
      console.log('✅ Base de datos lista');
    } catch (err) {
      console.error('❌ Error inicializando DB:', err);
      dbReady = true;
    }
  }
}

// Inicializar DB al arrancar
ensureDb();

// ============================================================
// SHUFFLE CON SEMILLA
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

// ============================================================
// CONSTRUIR BIBLIOTECA
// ============================================================
async function buildLibrary({ limit, offset, userId, likedOnly = false } = {}) {
  console.log('[buildLibrary] 🏗️ Construyendo...', { likedOnly, limit, offset, userId });
  
  let songs = [];
  let prefs = {};
  let hiddenArtists = new Set();
  
  try {
    const cache = getCache();
    songs = cache.songs || [];
    console.log(`[buildLibrary] 📚 ${songs.length} canciones en caché`);
  } catch (err) {
    console.error('[buildLibrary] Error obteniendo caché:', err);
    songs = [];
  }
  
  try {
    prefs = await db.getSongPrefs(userId);
  } catch (err) {
    console.warn('[buildLibrary] ⚠️ Error obteniendo prefs:', err.message);
    prefs = {};
  }
  
  try {
    hiddenArtists = await db.getHiddenArtists(userId);
  } catch (err) {
    console.warn('[buildLibrary] ⚠️ Error obteniendo artistas ocultos:', err.message);
    hiddenArtists = new Set();
  }

  // Filtrar canciones visibles
  const visible = [];
  for (const s of songs) {
    try {
      const p = prefs[s.id];
      if (p && (p.deleted || p.hidden)) continue;
      if (hiddenArtists.has(extractMainArtist(s.artist))) continue;
      const liked = Boolean(p && p.liked);
      if (likedOnly && !liked) continue;
      visible.push({ ...s, liked });
    } catch (err) {
      console.warn('[buildLibrary] Error procesando canción:', s?.id);
    }
  }

  console.log(`[buildLibrary] 📊 ${visible.length} canciones visibles`);

  if (likedOnly) {
    return {
      songs: visible,
      hiddenArtists: [...hiddenArtists],
      counts: { total: visible.length, trash: 0 },
      pagination: { offset: 0, limit: visible.length, total: visible.length },
    };
  }

  // Generar semilla para shuffle
  const today = new Date().toISOString().slice(0, 10);
  const seedBase = `${userId || 'anon'}-${today}`;
  let seed = 0;
  for (let i = 0; i < seedBase.length; i++) {
    seed = ((seed << 5) - seed) + seedBase.charCodeAt(i);
    seed = seed & seed;
  }
  seed = Math.abs(seed) || 1;
  
  const shuffled = shuffleArray(visible, seed);
  console.log(`[buildLibrary] 🔀 ${shuffled.length} canciones mezcladas`);

  let trashCount = 0;
  try {
    if (fs.existsSync(TRASH_DIR)) {
      trashCount = fs.readdirSync(TRASH_DIR).filter((f) => !f.startsWith('.')).length;
    }
  } catch {}

  const total = shuffled.length;
  const start = typeof offset === 'number' ? offset : 0;
  const end = typeof limit === 'number' ? Math.min(start + limit, total) : total;
  const paged = shuffled.slice(start, end);

  console.log(`[buildLibrary] ✅ ${paged.length} canciones devueltas (offset: ${start}, limit: ${limit})`);
  
  return {
    songs: paged,
    hiddenArtists: [...hiddenArtists],
    counts: { total, trash: trashCount },
    pagination: { offset: start, limit: typeof limit === 'number' ? limit : total, total },
  };
}

// ============================================================
// ESCANEAR BIBLIOTECA
// ============================================================
let libraryReady = false;

async function loadLibrary() {
  try {
    console.log('🔍 Escaneando biblioteca...');
    await scanLibrary();
    libraryReady = true;
    console.log('✅ Biblioteca lista');
  } catch (err) {
    console.error('❌ Error escaneando:', err);
    libraryReady = true;
  }
}

loadLibrary();

// ============================================================
// FUNCIONES PARA AGRUPAR (Artistas, Álbumes, Géneros)
// ============================================================
// Extrae el artista principal de un string que puede incluir colaboradores
// (feat, ft, &, con, vs, comas, paréntesis, etc.). Así "A.B feat X" y
// "A.B & Y" se agrupan bajo el mismo artista "A.B".
function extractMainArtist(artistName) {
  if (!artistName) return 'Artista desconocido';
  let name = String(artistName).trim();
  if (!name) return 'Artista desconocido';

  const patterns = [
    /\s*\(feat\.?[^)]*\)/i,
    /\s*\(ft\.?[^)]*\)/i,
    /\s*\(featuring[^)]*\)/i,
    /\s*feat\.?\s.*/i,
    /\s*ft\.?\s.*/i,
    /\s*featuring\s.*/i,
    /\s*&\s.*/,
    /\s*con\s.*/i,
    /\s*vs\.?\s.*/i,
    /\s*,\s.*/,
    /\s*;\s.*/,
  ];

  for (const p of patterns) {
    const match = name.match(p);
    if (match) {
      name = name.slice(0, match.index).trim();
      break;
    }
  }
  return name || 'Artista desconocido';
}

function buildArtistsFromCache(songs, hiddenArtists = new Set()) {
  const map = new Map();
  const pref = (str) => String(str || '').trim();
  
  for (const s of songs) {
    // Ocultar por artista principal para que ocultar "A.B" oculte también sus colaboraciones
    const mainArtist = extractMainArtist(s.artist);
    if (hiddenArtists.has(mainArtist)) continue;
    const raw = pref(mainArtist) || 'Artista desconocido';
    const key = raw.toLowerCase();
    let entry = map.get(key);
    if (!entry) {
      entry = { name: raw, songs: [] };
      map.set(key, entry);
    }
    entry.songs.push(s);
  }
  
  return [...map.values()]
    .map((g) => ({
      name: g.name,
      songs: g.songs,
      coverId: g.songs.find((s) => s.hasCover)?.id || g.songs[0]?.id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function buildAlbumsFromCache(songs) {
  const map = new Map();
  const pref = (str) => String(str || '').trim();
  
  for (const s of songs) {
    const raw = pref(s.album) || 'Sin álbum';
    const key = `${raw.toLowerCase()}-${s.artist || 'desconocido'}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { name: raw, artist: s.artist || 'Desconocido', songs: [] };
      map.set(key, entry);
    }
    entry.songs.push(s);
  }
  
  return [...map.values()]
    .map((g) => ({
      name: g.name,
      artist: g.artist,
      songs: g.songs,
      coverId: g.songs.find((s) => s.hasCover)?.id || g.songs[0]?.id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function buildGenresFromCache(songs) {
  const map = new Map();
  const pref = (str) => String(str || '').trim();
  
  for (const s of songs) {
    const genres = Array.isArray(s.genre) ? s.genre : [pref(s.genre) || 'Sin género'];
    for (const raw of genres) {
      const trimmed = pref(raw) || 'Sin género';
      const key = trimmed.toLowerCase();
      let entry = map.get(key);
      if (!entry) {
        entry = { name: trimmed, songs: [] };
        map.set(key, entry);
      }
      entry.songs.push(s);
    }
  }
  
  return [...map.values()]
    .map((g) => ({
      name: g.name,
      songs: g.songs,
      coverId: g.songs.find((s) => s.hasCover)?.id || g.songs[0]?.id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// ============================================================
// RUTAS - TEST Y CONFIG
// ============================================================
app.get('/api/test', (req, res) => {
  const cache = getCache();
  res.json({ 
    success: true, 
    libraryReady,
    songCount: cache?.songs?.length || 0,
    musicDir: MUSIC_DIR,
    dbReady
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
  console.log('[auth/register]', req.body);
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }
  
  if (username.length < 3 || password.length < 3) {
    return res.status(400).json({ error: 'Usuario y contraseña deben tener al menos 3 caracteres' });
  }

  try {
    await ensureDb();
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
    await ensureDb();
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
    await ensureDb();
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
    await ensureDb();
    if (token) {
      await db.clearUserSession(token);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[logout]', err);
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
});

//=========================================================
// RUTAS - ARTISTAS FAVORITOS
// ============================================================

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
    const artists = await db.toggleFavoriteArtist(artist, userId);
    res.json({ artists });
  } catch (err) {
    console.error('[api/favorite-artists/toggle]', err);
    res.status(500).json({ error: 'Error al cambiar artista favorito' });
  }
});

// ============================================================
// RUTA - BIBLIOTECA
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
    const limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : 100;
    const offset = req.query.offset !== undefined ? parseInt(req.query.offset, 10) : 0;
    const likedOnly = req.query.liked === 'true';
    
    console.log('[api/library] 🔍 Parámetros:', { userId, limit, offset, likedOnly });
    
    const result = await buildLibrary({ limit, offset, userId, likedOnly });
    console.log('[api/library] ✅ Éxito');
    res.json(result);
  } catch (err) {
    console.error('[api/library] ❌ Error:', err);
    console.error('[api/library] Stack:', err.stack);
    res.status(500).json({ 
      error: 'No se pudo cargar la biblioteca',
      message: err.message
    });
  }
});

// ============================================================
// RUTAS - ARTISTAS, ÁLBUMES, GÉNEROS
// ============================================================
app.get('/api/artists', async (req, res) => {
  try {
    const cache = getCache();
    const userId = req.query.userId || null;
    let hiddenArtists = new Set();
    let prefs = {};
    
    try {
      hiddenArtists = await db.getHiddenArtists(userId);
      prefs = await db.getSongPrefs(userId);
    } catch {}

    const visibleSongs = cache.songs.filter(s => {
      if (hiddenArtists.has(extractMainArtist(s.artist))) return false;
      const p = prefs[s.id];
      if (p && (p.deleted || p.hidden)) return false;
      return true;
    });

    const artists = buildArtistsFromCache(visibleSongs);
    res.json({ artists, count: artists.length });
  } catch (err) {
    console.error('[api/artists] Error:', err);
    res.status(500).json({ error: 'Error al obtener artistas' });
  }
});

app.get('/api/albums', async (req, res) => {
  try {
    const cache = getCache();
    const userId = req.query.userId || null;
    let hiddenArtists = new Set();
    let prefs = {};
    
    try {
      hiddenArtists = await db.getHiddenArtists(userId);
      prefs = await db.getSongPrefs(userId);
    } catch {}

    const visibleSongs = cache.songs.filter(s => {
      if (hiddenArtists.has(extractMainArtist(s.artist))) return false;
      const p = prefs[s.id];
      if (p && (p.deleted || p.hidden)) return false;
      return true;
    });

    const albums = buildAlbumsFromCache(visibleSongs);
    res.json({ albums, count: albums.length });
  } catch (err) {
    console.error('[api/albums] Error:', err);
    res.status(500).json({ error: 'Error al obtener álbumes' });
  }
});

app.get('/api/genres', async (req, res) => {
  try {
    const cache = getCache();
    const userId = req.query.userId || null;
    let hiddenArtists = new Set();
    let prefs = {};
    
    try {
      hiddenArtists = await db.getHiddenArtists(userId);
      prefs = await db.getSongPrefs(userId);
    } catch {}

    const visibleSongs = cache.songs.filter(s => {
      if (hiddenArtists.has(extractMainArtist(s.artist))) return false;
      const p = prefs[s.id];
      if (p && (p.deleted || p.hidden)) return false;
      return true;
    });

    const genres = buildGenresFromCache(visibleSongs);
    res.json({ genres, count: genres.length });
  } catch (err) {
    console.error('[api/genres] Error:', err);
    res.status(500).json({ error: 'Error al obtener géneros' });
  }
});

app.post('/api/artists/hide', async (req, res) => {
  const { artist, userId } = req.body;
  if (!artist) return res.status(400).json({ error: 'Falta el artista' });
  await db.setArtistHidden(artist, true, userId);
  res.json({ ok: true });
});

app.post('/api/artists/unhide', async (req, res) => {
  const { artist, userId } = req.body;
  if (!artist) return res.status(400).json({ error: 'Falta el artista' });
  await db.setArtistHidden(artist, false, userId);
  res.json({ ok: true });
});

// ============================================================
// RUTAS - RESCAN
// ============================================================
app.post('/api/rescan', async (_req, res) => {
  await rescanLibrary();
  res.json(await buildLibrary());
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

    const cache = getCache();
    const songIndex = cache.songs.findIndex(s => s.relPath === filePath || s.id === path.basename(absPath, path.extname(absPath)));
    
    let newPath = null;
    if (songIndex !== -1) {
      const oldRelPath = cache.songs[songIndex].relPath;
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
            cache.songs[songIndex].relPath = newPath;
          }
        } catch (err) {
          console.error('[fix-metadata] Error renombrando:', err);
        }
      }
      
      cache.songs[songIndex].artist = newArtist;
      cache.songs[songIndex].title = newTitle;
      saveCache(cache);
    }

    res.json({ success: true, message: `Metadatos corregidos: ${newArtist} - ${newTitle}`, newPath, artist: newArtist, title: newTitle });
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
    
    // Limpiar corchetes y otros caracteres especiales del nombre
    const cleanName = artistName.replace(/[\[\]\(\)]/g, '').trim();
    
    const cache = getCache();

    // Buscar canción del artista (con o sin corchetes)
    let song = cache.songs.find(s => s.artist === artistName);
    if (!song && cleanName !== artistName) {
      song = cache.songs.find(s => s.artist === cleanName);
    }
    // También buscar si el artista en la BD tiene corchetes
    if (!song) {
      const withBrackets = `[${cleanName}]`;
      song = cache.songs.find(s => s.artist === withBrackets);
    }
    // Buscar por artista principal (ignora colaboradores: "A.B feat X")
    if (!song) {
      const requestedMain = extractMainArtist(cleanName);
      song = cache.songs.find(s => extractMainArtist(s.artist) === requestedMain);
    }

    if (!song) return res.status(404).send('Artista no encontrado');

    const albumDir = path.dirname(absolutePath(song.relPath));
    const coverPath = path.join(albumDir, 'cover.jpg');
    if (fs.existsSync(coverPath)) {
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400');
      res.sendFile(coverPath);
      return;
    }

    const coverPngPath = path.join(albumDir, 'cover.png');
    if (fs.existsSync(coverPngPath)) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=86400');
      res.sendFile(coverPngPath);
      return;
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
  const song = getSongById(req.params.id);
  if (!song) return res.status(404).end();

  const albumDir = path.dirname(absolutePath(song.relPath));
  const coverPath = path.join(albumDir, 'cover.jpg');
  
  if (fs.existsSync(coverPath)) {
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(coverPath);
    return;
  }

  const coverPngPath = path.join(albumDir, 'cover.png');
  if (fs.existsSync(coverPngPath)) {
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(coverPngPath);
    return;
  }

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
  const song = getSongById(req.params.id);
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
// RUTAS - LIKES, HIDES Y ELIMINAR
// ============================================================
app.post('/api/songs/:id/like', async (req, res) => {
  const song = getSongById(req.params.id);
  if (!song) return res.status(404).json({ error: 'Canción no encontrada' });
  const userId = req.body.userId || null;
  await db.setSongFlag(song, 'liked', Boolean(req.body.liked), userId);
  res.json({ ok: true });
});

app.post('/api/songs/:id/hide', async (req, res) => {
  const song = getSongById(req.params.id);
  if (!song) return res.status(404).json({ error: 'Canción no encontrada' });
  const userId = req.body.userId || null;
  await db.setSongFlag(song, 'hidden', true, userId);
  res.json({ ok: true });
});

app.delete('/api/songs', async (req, res) => {
  try {
    const { id, filename, userId } = req.body;
    if (!id && !filename) {
      return res.status(400).json({ error: 'Se requiere id o filename' });
    }

    const song = id ? getSongById(id) : getSongById(filename);
    if (!song) return res.status(404).json({ error: 'Canción no encontrada' });

    const fullPath = absolutePath(song.relPath);
    
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
        
        try {
          fs.copyFileSync(fullPath, trashPath);
          fs.unlinkSync(fullPath);
        } catch {
          try { fs.renameSync(fullPath, trashPath); } catch { fs.unlinkSync(fullPath); }
        }
      } catch {}
    }

    await db.setSongFlag(song, 'deleted', true, userId);
    removeSongFromCache(song.id);
    await db.deleteSongFromPrefs(song.id, userId);

    res.json({ message: 'Canción eliminada correctamente' });
  } catch (error) {
    console.error('Error deleting song:', error);
    res.status(500).json({ error: 'Error al eliminar la canción' });
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

// ============================================================
// RUTAS - LETRAS DE CANCIONES
// ============================================================

import { getLyrics } from './lyrics.js';

// GET - Obtener letra de una canción
app.get('/api/lyrics/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const song = getSongById(id);
    
    if (!song) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }
    
    const songPath = absolutePath(song.relPath);
    const result = await getLyrics(id, song.title, song.artist, songPath);
    
    if (!result.lyrics) {
      return res.json({ 
        success: false, 
        message: 'No se encontraron letras para esta canción',
        hasLyrics: false
      });
    }
    
    res.json({
      success: true,
      hasLyrics: true,
      lyrics: result.lyrics,
      syncedLines: result.syncedLines || null,
      translatedLyrics: result.translatedLyrics,
      title: song.title,
      artist: song.artist
    });
  } catch (err) {
    console.error('[api/lyrics] Error:', err);
    res.status(500).json({ error: 'Error al obtener la letra' });
  }
});

// POST - Forzar búsqueda de letra (refrescar caché)
app.post('/api/lyrics/:id/refresh', async (req, res) => {
  try {
    const { id } = req.params;
    const song = getSongById(id);
    
    if (!song) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }
    
    // Eliminar del caché
    const { loadCache, saveCache } = await import('./lyrics.js');
    const cache = loadCache();
    if (cache[id]) {
      delete cache[id];
      saveCache(cache);
    }
    
    // Buscar de nuevo
    const songPath = absolutePath(song.relPath);
    const result = await getLyrics(id, song.title, song.artist, songPath);
    
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