// ============================================================
// server/index.js - SERVIDOR PRINCIPAL
// ============================================================

import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

// IMPORTAR NUEVO DB Y SCANNER MODIFICADO
import * as db from './db.js';
import { MUSIC_DIR, TRASH_DIR, absolutePath, scanLibrary } from './scanner.js';
import { getLyrics as getLyricsFromService } from './lyrics.js';

const app = express();
const PORT = process.env.VITE_SERVER_PORT || process.env.PORT || 5002;

console.log('🚀 Iniciando servidor...');
console.log(`🔧 Puerto configurado: ${PORT}`);
console.log(`📂 MUSIC_DIR: ${MUSIC_DIR}`);
console.log(`📂 TRASH_DIR: ${TRASH_DIR}`);

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
  } catch (err) {
    console.error('❌ Error cargando biblioteca:', err);
    libraryReady = true;
  }
}

// Cargar al iniciar
loadLibrary();

// ============================================================
// CONSTRUIR BIBLIOTECA PARA EL FRONTEND
// ============================================================
async function buildLibrary({ limit, offset, userId, likedOnly = false } = {}) {
  console.log('[buildLibrary] 🏗️ Construyendo...', { likedOnly, limit, offset, userId });
  
  const effectiveUserId = userId || null;
  
  try {
    let songs = await db.getSongsWithDetails({
      limit: limit || 100,
      offset: offset || 0,
      userId: effectiveUserId
    });
    
    if (likedOnly) {
      songs = songs.filter(s => s.liked);
    }
    
    const total = await db.getTotalSongsCount(effectiveUserId);
    const trash = await db.getTrashCount(effectiveUserId);
    
    let hiddenArtists = [];
    if (effectiveUserId) {
      const hiddenSet = await db.getHiddenArtists(effectiveUserId);
      hiddenArtists = [...hiddenSet];
    }
    
    let shuffledSongs = songs;
    if (!likedOnly) {
      const today = new Date().toISOString().slice(0, 10);
      const seedBase = `${userId || 'anon'}-${today}`;
      let seed = 0;
      for (let i = 0; i < seedBase.length; i++) {
        seed = ((seed << 5) - seed) + seedBase.charCodeAt(i);
        seed = seed & seed;
      }
      seed = Math.abs(seed) || 1;
      shuffledSongs = shuffleArray(songs, seed);
    }
    
    const result = {
      songs: shuffledSongs,
      hiddenArtists: hiddenArtists,
      counts: { total, trash },
      pagination: {
        offset: offset || 0,
        limit: limit || 100,
        total
      }
    };
    
    console.log(`[buildLibrary] ✅ ${shuffledSongs.length} canciones devueltas`);
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
  console.log('[auth/register]', req.body);
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
    
    const { open } = await import('sqlite');
    const sqlite3 = await import('sqlite3');
    const dbInstance = await open({
      filename: path.join(__dirname, 'localfy.db'),
      driver: sqlite3.Database
    });
    
    const artistRow = await dbInstance.get(
      'SELECT id FROM artists WHERE name = ?',
      [artist]
    );
    
    await dbInstance.close();
    
    if (!artistRow) {
      return res.status(404).json({ error: 'Artista no encontrado' });
    }
    
    const isFavorite = await db.toggleFavoriteArtist(artistRow.id, userId);
    const artists = await db.getFavoriteArtists(userId);
    res.json({ artists, isFavorite });
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
// RUTAS - ARTISTAS, ÁLBUMES, GÉNEROS, AÑOS
// ============================================================
app.get('/api/artists', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const artists = await db.getArtistsWithSongs(userId);
    res.json({ artists, count: artists.length });
  } catch (err) {
    console.error('[api/artists] Error:', err);
    res.status(500).json({ error: 'Error al obtener artistas' });
  }
});

app.get('/api/albums', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const albums = await db.getAlbumsWithSongs(userId);
    res.json({ albums, count: albums.length });
  } catch (err) {
    console.error('[api/albums] Error:', err);
    res.status(500).json({ error: 'Error al obtener álbumes' });
  }
});

app.get('/api/genres', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const genres = await db.getGenresWithSongs(userId);
    res.json({ genres, count: genres.length });
  } catch (err) {
    console.error('[api/genres] Error:', err);
    res.status(500).json({ error: 'Error al obtener géneros' });
  }
});

app.get('/api/years', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const years = await db.getYearsWithSongs(userId);
    res.json({ years, count: years.length });
  } catch (err) {
    console.error('[api/years] Error:', err);
    res.status(500).json({ error: 'Error al obtener años' });
  }
});

app.post('/api/artists/hide', async (req, res) => {
  try {
    const { artist, userId } = req.body;
    if (!artist) return res.status(400).json({ error: 'Falta el artista' });
    
    const { open } = await import('sqlite');
    const sqlite3 = await import('sqlite3');
    const dbInstance = await open({
      filename: path.join(__dirname, 'localfy.db'),
      driver: sqlite3.Database
    });
    
    const artistRow = await dbInstance.get(
      'SELECT id FROM artists WHERE name = ?',
      [artist]
    );
    
    await dbInstance.close();
    
    if (!artistRow) {
      return res.status(404).json({ error: 'Artista no encontrado' });
    }
    
    await db.setArtistHidden(artistRow.id, true, userId);
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
    
    const { open } = await import('sqlite');
    const sqlite3 = await import('sqlite3');
    const dbInstance = await open({
      filename: path.join(__dirname, 'localfy.db'),
      driver: sqlite3.Database
    });
    
    const artistRow = await dbInstance.get(
      'SELECT id FROM artists WHERE name = ?',
      [artist]
    );
    
    await dbInstance.close();
    
    if (!artistRow) {
      return res.status(404).json({ error: 'Artista no encontrado' });
    }
    
    await db.setArtistHidden(artistRow.id, false, userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/artists/unhide] Error:', err);
    res.status(500).json({ error: 'Error al mostrar artista' });
  }
});

// ============================================================
// RUTAS - RESCAN
// ============================================================
app.post('/api/rescan', async (_req, res) => {
  try {
    await scanLibrary();
    await loadLibrary();
    const result = await buildLibrary({ limit: 100, offset: 0 });
    res.json(result);
  } catch (err) {
    console.error('[api/rescan] Error:', err);
    res.status(500).json({ error: 'Error al rescanejar' });
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
            const { open } = await import('sqlite');
            const sqlite3 = await import('sqlite3');
            const dbInstance = await open({
              filename: path.join(__dirname, 'localfy.db'),
              driver: sqlite3.Database
            });
            await dbInstance.run(
              'UPDATE songs SET relPath = ?, title = ? WHERE id = ?',
              [newPath, newTitle, song.id]
            );
            await dbInstance.close();
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
  const song = songMap.get(req.params.id);
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
// RUTAS - LIKES, HIDES Y ELIMINAR
// ============================================================
app.post('/api/songs/:id/like', async (req, res) => {
  const song = songMap.get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Canción no encontrada' });
  const userId = req.body.userId || null;
  const liked = Boolean(req.body.liked);
  
  try {
    await db.setSongLiked(song.id, liked, userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/songs/:id/like] Error:', err);
    res.status(500).json({ error: 'Error al actualizar like' });
  }
});

app.post('/api/songs/:id/hide', async (req, res) => {
  const song = songMap.get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Canción no encontrada' });
  const userId = req.body.userId || null;
  
  try {
    await db.setSongHidden(song.id, true, userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/songs/:id/hide] Error:', err);
    res.status(500).json({ error: 'Error al ocultar canción' });
  }
});

app.delete('/api/songs', async (req, res) => {
  try {
    const { id, userId } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Se requiere id' });
    }

    const song = songMap.get(id);
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

    if (userId) {
      await db.setSongHidden(song.id, true, userId);
    }

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
    
    const { open } = await import('sqlite');
    const sqlite3 = await import('sqlite3');
    const dbInstance = await open({
      filename: path.join(__dirname, 'localfy.db'),
      driver: sqlite3.Database
    });
    await dbInstance.run('DELETE FROM lyrics WHERE song_id = ?', [id]);
    await dbInstance.close();
    
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
// RUTA - CANCIONES QUE ME GUSTAN
// ============================================================
app.get('/api/liked-songs', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    if (!userId) {
      return res.status(400).json({ error: 'Se requiere userId' });
    }
    const songs = await db.getLikedSongs(userId);
    res.json({ songs, count: songs.length });
  } catch (err) {
    console.error('[api/liked-songs] Error:', err);
    res.status(500).json({ error: 'Error al obtener canciones que me gustan' });
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