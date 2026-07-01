import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scanLibrary, rescanLibrary, getCache, getSongById, absolutePath, MUSIC_DIR, TRASH_DIR, removeSongFromCache } from './scanner.js';
import { 
  getSongPrefs, 
  getHiddenArtists, 
  setSongFlag, 
  setArtistHidden, 
  deleteSongFromPrefs, 
  initDatabase,
  createUser,
  findUser,
  updateUserSession,
  getUserByToken,
  clearUserSession
} from './db.js';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 5001;

console.log('🚀 Iniciando servidor...');
console.log(`📂 MUSIC_DIR: ${MUSIC_DIR}`);

// ====== DETECTAR IP LOCAL ======
function getLocalLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('127.')) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalLanIp();

// ====== MIDDLEWARE ======
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Servir archivos estáticos
app.use('/songs', express.static(MUSIC_DIR));

// ====== INICIALIZAR DB ======
let dbReady = false;

async function ensureDb() {
  if (!dbReady) {
    try {
      console.log('🔧 Inicializando base de datos...');
      await initDatabase();
      dbReady = true;
      console.log('✅ Base de datos lista');
    } catch (err) {
      console.error('❌ Error inicializando DB:', err);
      // No detener el servidor, solo usar modo sin DB
      dbReady = true;
    }
  }
}

// ====== FUNCIÓN PARA CONSTRUIR BIBLIOTECA ======
async function buildLibrary({ limit, offset, userId } = {}) {
  console.log('[buildLibrary] 🏗️ Construyendo...');
  
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
    prefs = await getSongPrefs(userId);
    console.log('[buildLibrary] ✅ Prefs obtenidas');
  } catch (err) {
    console.warn('[buildLibrary] ⚠️ Error obteniendo prefs, usando vacías:', err.message);
    prefs = {};
  }
  
  try {
    hiddenArtists = await getHiddenArtists(userId);
    console.log('[buildLibrary] ✅ Artistas ocultos obtenidos');
  } catch (err) {
    console.warn('[buildLibrary] ⚠️ Error obteniendo artistas ocultos:', err.message);
    hiddenArtists = new Set();
  }

  const visible = [];
  for (const s of songs) {
    try {
      const p = prefs[s.id];
      if (p && (p.deleted || p.hidden)) continue;
      if (hiddenArtists.has(s.artist)) continue;
      visible.push({ ...s, liked: Boolean(p && p.liked) });
    } catch (err) {
      console.warn('[buildLibrary] Error procesando canción:', s?.id);
    }
  }

  let trashCount = 0;
  try {
    if (fs.existsSync(TRASH_DIR)) {
      trashCount = fs.readdirSync(TRASH_DIR).filter((f) => !f.startsWith('.')).length;
    }
  } catch {}

  const total = visible.length;
  const start = typeof offset === 'number' ? offset : 0;
  const end = typeof limit === 'number' ? start + limit : total;
  const paged = visible.slice(start, end);

  console.log(`[buildLibrary] ✅ ${paged.length} canciones devueltas`);
  
  return {
    songs: paged,
    hiddenArtists: [...hiddenArtists],
    counts: { total, trash: trashCount },
    pagination: { offset: start, limit: typeof limit === 'number' ? limit : total, total },
  };
}

// ====== ESCANEAR BIBLIOTECA AL INICIAR ======
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

// Cargar biblioteca en segundo plano
loadLibrary();

// ====== RUTAS ======

// Test
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

// Config IP
app.get('/api/config/ip', (req, res) => {
  res.json({ 
    ip: LOCAL_IP, 
    port: PORT, 
    serverUrl: `http://${LOCAL_IP}:${PORT}`
  });
});

// ====== RUTAS DE AUTENTICACIÓN ======

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
    const user = await createUser(username, password);
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
    const user = await findUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    
    const sessionToken = crypto.randomBytes(32).toString('hex');
    await updateUserSession(user.id, sessionToken);
    
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
    const user = await getUserByToken(token);
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
      await clearUserSession(token);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[logout]', err);
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
});

// ====== RUTA PRINCIPAL - LIBRARY ======
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
    
    console.log('[api/library] 🔍 Parámetros:', { userId, limit, offset });
    
    const result = await buildLibrary({ limit, offset, userId });
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

// ====== RUTAS DE MÚSICA ======

app.post('/api/rescan', async (_req, res) => {
  await rescanLibrary();
  res.json(await buildLibrary());
});

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

app.post('/api/songs/:id/like', async (req, res) => {
  const song = getSongById(req.params.id);
  if (!song) return res.status(404).json({ error: 'Canción no encontrada' });
  const userId = req.body.userId || null;
  await setSongFlag(song, 'liked', Boolean(req.body.liked), userId);
  res.json({ ok: true });
});

app.post('/api/songs/:id/hide', async (req, res) => {
  const song = getSongById(req.params.id);
  if (!song) return res.status(404).json({ error: 'Canción no encontrada' });
  const userId = req.body.userId || null;
  await setSongFlag(song, 'hidden', true, userId);
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

    await setSongFlag(song, 'deleted', true, userId);
    removeSongFromCache(song.id);
    await deleteSongFromPrefs(song.id, userId);

    res.json({ message: 'Canción eliminada correctamente' });
  } catch (error) {
    console.error('Error deleting song:', error);
    res.status(500).json({ error: 'Error al eliminar la canción' });
  }
});

app.post('/api/artists/hide', async (req, res) => {
  const { artist, userId } = req.body;
  if (!artist) return res.status(400).json({ error: 'Falta el artista' });
  await setArtistHidden(artist, true, userId);
  res.json({ ok: true });
});

app.post('/api/artists/unhide', async (req, res) => {
  const { artist, userId } = req.body;
  if (!artist) return res.status(400).json({ error: 'Falta el artista' });
  await setArtistHidden(artist, false, userId);
  res.json({ ok: true });
});

// ====== INICIAR SERVIDOR ======
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎵 ==========================================`);
  console.log(`   🎵 MIREPO - SERVIDOR COMPLETO`);
  console.log(`   ==========================================`);
  console.log(`   📡 Local:    http://localhost:${PORT}`);
  console.log(`   📡 Red:      http://${LOCAL_IP}:${PORT}`);
  console.log(`   📂 Música:   ${MUSIC_DIR}`);
  console.log(`   ==========================================`);
  console.log(`   ✅ Servidor listo`);
  console.log(`   ==========================================\n`);
});