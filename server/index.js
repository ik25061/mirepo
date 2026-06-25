import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import os from 'os';
import crypto from 'node:crypto';
import { 
  scanLibrary, 
  rescanLibrary, 
  getCache, 
  getSongById, 
  absolutePath, 
  MUSIC_DIR, 
  TRASH_DIR,
  removeSongFromCache
} from './scanner.js';
import { getSongPrefs, getHiddenArtists, setSongFlag, setArtistHidden, deleteSongFromPrefs } from './db.js';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Servir archivos estáticos
app.use('/songs', express.static(MUSIC_DIR));

// ====== FUNCIÓN PARA CONSTRUIR BIBLIOTECA ======

async function buildLibrary() {
  const { songs } = getCache();
  const [prefs, hiddenArtists] = await Promise.all([getSongPrefs(), getHiddenArtists()]);

  const visible = [];
  for (const s of songs) {
    const p = prefs[s.id];
    if (p && (p.deleted || p.hidden)) continue;
    if (hiddenArtists.has(s.artist)) continue;
    visible.push({ ...s, liked: Boolean(p && p.liked) });
  }

  let trashCount = 0;
  try {
    trashCount = fs.readdirSync(TRASH_DIR).filter((f) => !f.startsWith('.')).length;
  } catch {}

  return {
    songs: visible,
    hiddenArtists: [...hiddenArtists],
    counts: { total: visible.length, trash: trashCount },
  };
}

// ====== RUTAS API ======

// GET - Obtener biblioteca
app.get('/api/library', async (_req, res) => {
  try {
    res.json(await buildLibrary());
  } catch (err) {
    console.error('[api/library]', err);
    res.status(500).json({ error: 'No se pudo cargar la biblioteca' });
  }
});

// POST - Rescan
app.post('/api/rescan', async (_req, res) => {
  await rescanLibrary();
  res.json(await buildLibrary());
});

// GET - Portada (con imagen por defecto en la raíz de música)
app.get('/cover/:id', async (req, res) => {
  const song = getSongById(req.params.id);
  if (!song) {
    console.log(`[cover] Canción no encontrada: ${req.params.id}`);
    return res.status(404).end();
  }

  // 1. Buscar cover.jpg en la carpeta del álbum
  const albumDir = path.dirname(absolutePath(song.relPath));
  const coverPath = path.join(albumDir, 'cover.jpg');
  
  if (fs.existsSync(coverPath)) {
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(coverPath);
    return;
  }

  // 2. Buscar cover.png en la carpeta del álbum
  const coverPngPath = path.join(albumDir, 'cover.png');
  if (fs.existsSync(coverPngPath)) {
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(coverPngPath);
    return;
  }

  // 3. Buscar folder.jpg en la carpeta del álbum
  const folderJpgPath = path.join(albumDir, 'folder.jpg');
  if (fs.existsSync(folderJpgPath)) {
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(folderJpgPath);
    return;
  }

  // 4. Buscar portada embebida en el archivo de audio
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
  } catch (err) {
    // Silencioso - continuar con fallback
  }

  // 5. IMAGEN POR DEFECTO en la raíz de música
  const defaultCoverJpg = path.join(MUSIC_DIR, 'cover.jpg');
  const defaultCoverPng = path.join(MUSIC_DIR, 'cover.png');
  
  if (fs.existsSync(defaultCoverJpg)) {
    console.log(`[cover] 📷 Usando imagen por defecto: ${defaultCoverJpg}`);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.sendFile(defaultCoverJpg);
    return;
  }
  
  if (fs.existsSync(defaultCoverPng)) {
    console.log(`[cover] 📷 Usando imagen por defecto: ${defaultCoverPng}`);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.sendFile(defaultCoverPng);
    return;
  }

  // 6. Último recurso: SVG generado dinámicamente
  console.log(`[cover] ❌ No se encontró portada para: ${song.title}, usando SVG por defecto`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="#1a1a2e"/>
    <text x="100" y="90" font-family="Arial" font-size="60" text-anchor="middle" fill="#1db954">♫</text>
    <text x="100" y="120" font-family="Arial" font-size="12" text-anchor="middle" fill="#a7a7a7" max-width="180">${song.artist}</text>
    <text x="100" y="140" font-family="Arial" font-size="10" text-anchor="middle" fill="#535353" max-width="180">${song.album}</text>
  </svg>`;

  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(svg);
});

// GET - Portada del artista
app.get('/artist-cover/:artist', async (req, res) => {
  const artistName = decodeURIComponent(req.params.artist);
  const artistDir = path.join(MUSIC_DIR, artistName);
  const artistImagePath = path.join(artistDir, 'artist.jpg');

  if (fs.existsSync(artistImagePath)) {
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(artistImagePath);
  } else {
    res.status(404).end();
  }
});

// GET - Audio streaming
app.get('/audio/:id', (req, res) => {
  const song = getSongById(req.params.id);
  if (!song) return res.status(404).end();

  const filePath = absolutePath(song.relPath);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.mp3' ? 'audio/mpeg' :
    ext === '.flac' ? 'audio/flac' :
    ext === '.wav' ? 'audio/wav' :
    ext === '.ogg' || ext === '.opus' ? 'audio/ogg' :
    'audio/mp4';

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

// POST - Like
app.post('/api/songs/:id/like', async (req, res) => {
  const song = getSongById(req.params.id);
  if (!song) return res.status(404).json({ error: 'Canción no encontrada' });
  await setSongFlag(song, 'liked', Boolean(req.body.liked));
  res.json({ ok: true });
});

// POST - Hide (No me gusta)
app.post('/api/songs/:id/hide', async (req, res) => {
  const song = getSongById(req.params.id);
  if (!song) return res.status(404).json({ error: 'Canción no encontrada' });
  await setSongFlag(song, 'hidden', true);
  res.json({ ok: true });
});

// DELETE - Eliminar canción (mover a papelera)
app.delete('/api/songs', async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'Filename es requerido' });
    }

    const song = getSongById(filename);
    if (!song) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }

    const fullPath = absolutePath(song.relPath);
    console.log(`[delete] Eliminando: ${fullPath}`);

    if (fs.existsSync(fullPath)) {
      try {
        // Crear directorio .trash si no existe
        if (!fs.existsSync(TRASH_DIR)) {
          fs.mkdirSync(TRASH_DIR, { recursive: true });
        }

        // Crear subdirectorio con año/mes
        const now = new Date();
        const trashSubDir = path.join(TRASH_DIR, 
          `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        );
        if (!fs.existsSync(trashSubDir)) {
          fs.mkdirSync(trashSubDir, { recursive: true });
        }

        const trashName = `${Date.now()}_${path.basename(fullPath)}`;
        const trashPath = path.join(trashSubDir, trashName);

        // Copiar a papelera
        try {
          fs.copyFileSync(fullPath, trashPath);
          console.log(`📋 Archivo copiado a papelera: ${trashPath}`);
          fs.unlinkSync(fullPath);
          console.log(`🗑️ Archivo original eliminado: ${fullPath}`);
        } catch (copyError) {
          console.error('Error al copiar archivo, intentando método alternativo:', copyError);
          try {
            fs.renameSync(fullPath, trashPath);
            console.log(`🗑️ Archivo movido a papelera: ${fullPath} → ${trashPath}`);
          } catch (renameError) {
            console.log('⚠️ No se pudo mover a papelera, eliminando permanentemente...');
            fs.unlinkSync(fullPath);
            console.log(`🗑️ Archivo eliminado permanentemente: ${fullPath}`);
          }
        }
      } catch (error) {
        console.error('Error al mover archivo a papelera:', error);
        try {
          fs.unlinkSync(fullPath);
          console.log(`🗑️ Archivo eliminado permanentemente (fallback): ${fullPath}`);
        } catch (unlinkError) {
          console.error('❌ No se pudo eliminar el archivo:', unlinkError);
        }
      }
    }

    // Marcar como eliminado en preferencias
    await setSongFlag(song, 'deleted', true);
    
    // Eliminar del caché
    removeSongFromCache(song.id);
    
    // Eliminar de preferencias
    await deleteSongFromPrefs(song.id);

    res.json({ 
      message: 'Canción eliminada correctamente',
      songId: song.id,
      filename: song.relPath
    });
  } catch (error) {
    console.error('Error deleting song:', error);
    res.status(500).json({ error: 'Error al eliminar la canción' });
  }
});

// POST - Ocultar artista
app.post('/api/artists/hide', async (req, res) => {
  const { artist } = req.body;
  if (!artist) return res.status(400).json({ error: 'Falta el artista' });
  await setArtistHidden(artist, true);
  res.json({ ok: true });
});

// POST - Mostrar artista
app.post('/api/artists/unhide', async (req, res) => {
  const { artist } = req.body;
  if (!artist) return res.status(400).json({ error: 'Falta el artista' });
  await setArtistHidden(artist, false);
  res.json({ ok: true });
});

// POST - Reconocimiento de música
app.post('/api/recognize', async (req, res) => {
  const { songs } = getCache();
  let matched = null;
  if (songs.length > 0) {
    matched = songs[Math.floor(Math.random() * Math.min(songs.length, 5))];
  }
  const result = {
    recognized: {
      title: matched ? matched.title : 'Canción desconocida',
      artist: matched ? matched.artist : 'Artista desconocido',
      album: matched ? matched.album : 'Álbum desconocido',
      imageUrl: matched ? `/cover/${matched.id}` : null
    },
    matchedTrack: matched ? {
      id: matched.id,
      title: matched.title,
      artist: matched.artist,
      album: matched.album,
      cover: `/cover/${matched.id}`,
      duration: matched.duration,
      relPath: matched.relPath
    } : null
  };
  res.json(result);
});

// PUT - Sincronizar metadatos
app.put('/api/songs/sync-metadata', async (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ error: 'Filename es requerido' });
  }

  const song = getSongById(filename);
  if (!song) {
    return res.status(404).json({ error: 'Canción no encontrada' });
  }

  try {
    const axios = (await import('axios')).default;
    const searchUrl = `https://musicbrainz.org/ws/2/recording?query=artist:"${encodeURIComponent(song.artist)}" AND recording:"${encodeURIComponent(song.title)}"&fmt=json`;
    const response = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'MusicPlayer/1.0 (contact@example.com)' },
      timeout: 10000
    });

    const data = response.data;
    if (data.recordings && data.recordings.length > 0) {
      const recording = data.recordings[0];
      const release = recording.releases && recording.releases[0];
      
      let newMetadata = {
        title: recording.title || song.title,
        artist: recording['artist-credit']?.[0]?.artist?.name || song.artist,
        album: release?.title || song.album,
        year: release?.date ? parseInt(release.date.substring(0, 4)) : song.year,
      };

      const { songs } = getCache();
      const idx = songs.findIndex(s => s.id === song.id);
      if (idx !== -1) {
        songs[idx] = { ...songs[idx], ...newMetadata };
      }

      res.json({
        message: 'Metadatos sincronizados correctamente',
        updatedSong: { ...song, ...newMetadata }
      });
    } else {
      res.json({
        message: 'No se encontraron metadatos adicionales',
        updatedSong: song
      });
    }
  } catch (error) {
    console.error('Error syncing metadata:', error);
    res.status(500).json({ error: 'Error al sincronizar metadatos' });
  }
});

// ====== RUTAS PARA BUSCAR DUPLICADOS CON PROGRESO EN VIVO ======

const audioExtensions = new Set(['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.opus']);
const scanSessions = new Map(); // scanId -> { clients: Set<res>, processed, total, duplicates, done }

// POST - Iniciar escaneo (streaming SSE)
app.post('/api/scan', async (req, res) => {
  const { folderPath } = req.body;

  if (!folderPath) {
    return res.status(400).json({ error: 'Falta especificar el parámetro folderPath en el cuerpo de la petición.' });
  }

  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ error: 'La ruta de la carpeta especificada no existe en la PC.' });
  }

  try {
    const files = fs.readdirSync(folderPath, { recursive: true });
    const totalAudio = files.filter(f => audioExtensions.has(path.extname(f).toLowerCase())).length;

    const scanId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const session = {
      clients: new Set(),
      processed: 0,
      total: totalAudio,
      duplicates: [],
      done: false,
      error: null
    };
    scanSessions.set(scanId, session);

    // Responder inmediatamente con el scanId
    res.json({ success: true, scanId, total: totalAudio });

    // Iniciar escaneo en segundo plano
    scanLibraryInBackground(folderPath, files, session, scanId);
  } catch (error) {
    console.error('[scan] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function scanLibraryInBackground(folderPath, files, session, scanId) {
  const musicDatabase = {};

  for (const relativePath of files) {
    const ext = path.extname(relativePath).toLowerCase();
    if (!audioExtensions.has(ext)) continue;

    const fullPath = path.join(folderPath, relativePath);
    
    let stats;
    try { stats = fs.statSync(fullPath); } catch { continue; }
    if (!stats.isFile()) continue;

    let title, artist, bitrateKbps = 0;
    try {
      const { parseFile } = await import('music-metadata');
      const metadata = await parseFile(fullPath, { duration: false, skipCovers: true, skipPostHeaders: true });
      title = metadata.common.title || path.basename(relativePath);
      artist = metadata.common.artist || 'Desconocido';
      const bitrate = metadata.format.bitrate || 0;
      bitrateKbps = Math.round(bitrate / 1000);
    } catch {
      title = path.basename(relativePath);
      artist = 'Desconocido';
    }

    const uniqueKey = `${artist}-${title}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const currentFileInfo = {
      name: path.basename(relativePath),
      path: fullPath,
      relativePath: relativePath,
      bitrate: bitrateKbps
    };

    if (musicDatabase[uniqueKey]) {
      const existingFile = musicDatabase[uniqueKey];
      let duplicate;

      if (currentFileInfo.bitrate > existingFile.bitrate) {
        duplicate = {
          title,
          artist,
          reason: `Calidad inferior (${existingFile.bitrate} kbps vs ${currentFileInfo.bitrate} kbps)`,
          original: currentFileInfo, 
          duplicate: existingFile     
        };
        musicDatabase[uniqueKey] = currentFileInfo;
      } else {
        duplicate = {
          title,
          artist,
          reason: `Calidad inferior o igual (${existingFile.bitrate} kbps vs ${currentFileInfo.bitrate} kbps)`,
          original: existingFile,    
          duplicate: currentFileInfo 
        };
      }

      session.duplicates.push(duplicate);
      // Notificar a todos los clientes SSE del nuevo duplicado
      broadcastToClients(session, { type: 'duplicate', data: duplicate });
    } else {
      musicDatabase[uniqueKey] = currentFileInfo;
    }

    session.processed++;
    // Notificar progreso cada 10 archivos
    if (session.processed % 10 === 0 || session.processed === session.total) {
      broadcastToClients(session, {
        type: 'progress',
        processed: session.processed,
        total: session.total
      });
    }
  }

  session.done = true;
  broadcastToClients(session, { type: 'complete', duplicates: session.duplicates });
  console.log(`[scan] Escaneo completado: ${session.processed} archivos, ${session.duplicates.length} duplicados.`);

  // Limpiar sesión después de 30 segundos
  setTimeout(() => scanSessions.delete(scanId), 30000);
}

function broadcastToClients(session, data) {
  const message = JSON.stringify(data);
  for (const client of session.clients) {
    try {
      client.write(`data: ${message}\n\n`);
    } catch {}
  }
}

// SSE - Stream de progreso del escaneo
app.get('/api/scan-stream/:scanId', (req, res) => {
  const { scanId } = req.params;
  const session = scanSessions.get(scanId);
  
  if (!session) {
    res.status(404).json({ error: 'Sesión de escaneo no encontrada o expirada.' });
    return;
  }

  // Configurar headers SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Enviar estado actual inmediatamente
  const initialState = {
    type: 'init',
    processed: session.processed,
    total: session.total,
    done: session.done
  };
  res.write(`data: ${JSON.stringify(initialState)}\n\n`);

  // Si ya terminó, enviar todos los duplicados
  if (session.done) {
    res.write(`data: ${JSON.stringify({ type: 'complete', duplicates: session.duplicates })}\n\n`);
    res.end();
    return;
  }

  // Registrar cliente
  session.clients.add(res);

  // Limpiar cuando el cliente se desconecte
  req.on('close', () => {
    session.clients.delete(res);
  });
});

// DELETE - Eliminar archivo duplicado (lo mueve a la misma papelera que las otras canciones)
app.delete('/api/delete-duplicate', async (req, res) => {
  const { filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: 'Falta especificar el parámetro filePath en la petición.' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'El archivo seleccionado ya no existe en el disco duro.' });
  }

  try {
    // Usar el mismo mecanismo de papelera que delete normal
    if (!fs.existsSync(TRASH_DIR)) {
      fs.mkdirSync(TRASH_DIR, { recursive: true });
    }

    const now = new Date();
    const trashSubDir = path.join(TRASH_DIR, 
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    );
    if (!fs.existsSync(trashSubDir)) {
      fs.mkdirSync(trashSubDir, { recursive: true });
    }

    const trashName = `${Date.now()}_${path.basename(filePath)}`;
    const trashPath = path.join(trashSubDir, trashName);

    try {
      fs.copyFileSync(filePath, trashPath);
      console.log(`📋 Duplicado copiado a papelera: ${trashPath}`);
      fs.unlinkSync(filePath);
      console.log(`🗑️ Duplicado eliminado: ${filePath}`);
    } catch (copyError) {
      console.error('Error al copiar duplicado, intentando método alternativo:', copyError);
      try {
        fs.renameSync(filePath, trashPath);
        console.log(`🗑️ Duplicado movido a papelera: ${filePath} → ${trashPath}`);
      } catch (renameError) {
        console.log('⚠️ No se pudo mover a papelera, eliminando permanentemente...');
        fs.unlinkSync(filePath);
        console.log(`🗑️ Duplicado eliminado permanentemente: ${filePath}`);
      }
    }

    res.json({ success: true, message: 'El archivo duplicado ha sido eliminado y movido a la papelera del sistema.' });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo eliminar el archivo. Verifica los permisos del sistema.' });
  }
});

// ====== INICIAR SERVIDOR ======

async function start() {
  // Iniciar servidor inmediatamente, escaneo en segundo plano
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎵 ==========================================`);
    console.log(`   🎵 MIREPO - SERVIDOR DE MÚSICA`);
    console.log(`   ==========================================`);
    console.log(`   📡 Local:    http://localhost:${PORT}`);
    ips.forEach(ip => {
      console.log(`   📡 Red:      http://${ip}:${PORT}`);
    });
    console.log(`   📂 Música:   ${MUSIC_DIR}`);
    console.log(`   🗑️ Papelera: ${TRASH_DIR}`);
    console.log(`   ==========================================\n`);
    console.log(`   🔄 Escaneando biblioteca en segundo plano...`);
    console.log(`   ⚠️  La biblioteca estará disponible cuando termine el escaneo.\n`);
  });

  // Escanear en segundo plano
  scanLibrary().then(() => {
    console.log(`\n✅ Escaneo completado. Servidor listo.`);
  }).catch(err => {
    console.error(`\n❌ Error en escaneo:`, err);
  });
}

start();