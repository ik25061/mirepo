const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const trash = require('trash');
const axios = require('axios');
const musicMetadata = require('music-metadata');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ====== CONFIGURACIÓN ======
const MUSIC_BASE_PATH = process.env.MUSIC_PATH || path.join(process.env.HOME || process.env.USERPROFILE, 'Music');
const DB_PATH = path.join(__dirname, 'songs_db.json');

console.log(`📂 Ruta de música: ${MUSIC_BASE_PATH}`);
console.log(`💾 Ruta de DB: ${DB_PATH}`);

// ====== MIDDLEWARE ======
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (imágenes y canciones)
app.use('/songs', express.static(MUSIC_BASE_PATH));

// ====== FUNCIONES AUXILIARES ======

// Extraer metadatos de la ruta del archivo
function extractMetadataFromPath(filePath) {
  // Normalizar path (Windows/Linux)
  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  
  // Buscar la parte que está dentro de MUSIC_BASE_PATH
  const musicIndex = normalizedPath.indexOf('Music/');
  let relativePath = normalizedPath;
  if (musicIndex !== -1) {
    relativePath = normalizedPath.substring(musicIndex + 6); // 'Music/'
  }
  
  const relativeParts = relativePath.split('/');
  
  // Si no tiene suficientes partes, usar el nombre del archivo
  if (relativeParts.length < 2) {
    const filename = relativeParts[relativeParts.length - 1] || '';
    const name = filename.replace(/\.[^.]+$/, '');
    return {
      albumArtist: 'Desconocido',
      album: 'Desconocido',
      trackNumber: null,
      title: name,
      artist: 'Artista desconocido',
      filename: filename
    };
  }
  
  const albumArtist = relativeParts[0] || 'Desconocido';
  const album = relativeParts[1] || 'Desconocido';
  const filename = relativeParts[relativeParts.length - 1] || '';
  
  // Extraer track number y título
  const match = filename.match(/^(\d+)\.\s*(.+)$/);
  const trackNumber = match ? parseInt(match[1]) : null;
  const title = match ? match[2].replace(/\.[^.]+$/, '') : filename.replace(/\.[^.]+$/, '');
  
  return {
    albumArtist,
    album,
    trackNumber,
    title,
    artist: albumArtist, // Por defecto el artista es el albumArtist
    filename: relativePath.replace(/\\/g, '/')
  };
}

// Obtener rutas de imágenes
function getImagePaths(albumArtist, album) {
  const artistDir = path.join(MUSIC_BASE_PATH, albumArtist);
  const albumDir = path.join(artistDir, album);
  
  return {
    coverPath: path.join(albumDir, 'cover.jpg'),
    artistPath: path.join(artistDir, 'artist.jpg'),
    coverUrl: `/songs/${encodeURIComponent(albumArtist)}/${encodeURIComponent(album)}/cover.jpg`,
    artistUrl: `/songs/${encodeURIComponent(albumArtist)}/artist.jpg`
  };
}

// Leer la base de datos de canciones
function readSongsDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(data);
      // Asegurar que tenga la propiedad songs
      if (!parsed.songs) {
        parsed.songs = [];
      }
      return parsed;
    }
  } catch (error) {
    console.error('Error reading DB:', error);
  }
  // Si no existe o hay error, devolver estructura vacía
  return { songs: [] };
}

// Guardar la base de datos de canciones
function writeSongsDB(db) {
  try {
    // Asegurar que db tenga la propiedad songs
    if (!db.songs) {
      db.songs = [];
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing DB:', error);
    return false;
  }
}

// Escanear directorio de música
function scanMusicDirectory() {
  const songs = [];
  
  function scanDir(dirPath, relativePath = '') {
    try {
      if (!fs.existsSync(dirPath)) {
        return;
      }
      
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Si es directorio, escanear recursivamente
          const newRelative = relativePath ? path.join(relativePath, item) : item;
          scanDir(fullPath, newRelative);
        } else if (/\.(mp3|flac|wav|ogg|aac|m4a|opus|wma)$/i.test(item)) {
          // Es un archivo de audio
          const metadata = extractMetadataFromPath(fullPath);
          
          // Verificar si existe cover y artist image
          const { coverPath, artistPath } = getImagePaths(metadata.albumArtist, metadata.album);
          const hasCover = fs.existsSync(coverPath);
          const hasArtistImage = fs.existsSync(artistPath);
          
          // Obtener duración usando music-metadata
          let duration = 0;
          try {
            const fileMetadata = musicMetadata.parseFileSync(fullPath);
            duration = fileMetadata.format.duration || 0;
          } catch (e) {
            // Si no se puede leer, usar 0
          }
          
          songs.push({
            filename: relativePath ? path.join(relativePath, item).replace(/\\/g, '/') : item,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            albumArtist: metadata.albumArtist,
            trackNumber: metadata.trackNumber,
            duration: duration,
            hasCover,
            hasArtistImage,
            genre: 'Desconocido',
            year: null,
            path: fullPath
          });
        }
      }
    } catch (error) {
      console.error(`Error scanning ${dirPath}:`, error);
    }
  }
  
  if (fs.existsSync(MUSIC_BASE_PATH)) {
    console.log('🔍 Escaneando directorio de música...');
    scanDir(MUSIC_BASE_PATH);
    console.log(`✅ Escaneo completado. ${songs.length} canciones encontradas.`);
  } else {
    console.log(`⚠️ El directorio ${MUSIC_BASE_PATH} no existe.`);
  }
  
  return songs;
}

// Sincronizar metadatos desde MusicBrainz
async function syncMetadataFromMusicBrainz(song) {
  try {
    const searchUrl = `https://musicbrainz.org/ws/2/recording?query=artist:"${encodeURIComponent(song.artist)}" AND recording:"${encodeURIComponent(song.title)}"&fmt=json`;
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'MusicPlayer/1.0 (rafael@example.com)'
      },
      timeout: 10000
    });
    const data = response.data;
    
    if (data.recordings && data.recordings.length > 0) {
      const recording = data.recordings[0];
      const release = recording.releases && recording.releases[0];
      
      let hasArtistImage = false;
      let hasCover = false;
      
      if (release) {
        // Obtener portada del álbum
        try {
          const coverUrl = `https://coverartarchive.org/release/${release.id}/front`;
          const coverResponse = await axios.get(coverUrl, { 
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'MusicPlayer/1.0 (rafael@example.com)'
            },
            timeout: 10000
          });
          if (coverResponse.status === 200) {
            const coverPath = path.join(MUSIC_BASE_PATH, song.albumArtist || song.artist, song.album, 'cover.jpg');
            const albumDir = path.dirname(coverPath);
            if (!fs.existsSync(albumDir)) {
              fs.mkdirSync(albumDir, { recursive: true });
            }
            fs.writeFileSync(coverPath, coverResponse.data);
            hasCover = true;
            console.log(`✅ Portada descargada: ${coverPath}`);
          }
        } catch (e) {
          console.log('No se pudo descargar la portada');
        }
        
        // Obtener imagen del artista
        try {
          const artistId = recording['artist-credit']?.[0]?.artist?.id;
          if (artistId) {
            const artistUrl = `https://musicbrainz.org/ws/2/artist/${artistId}?inc=url-relations&fmt=json`;
            const artistResponse = await axios.get(artistUrl, {
              headers: {
                'User-Agent': 'MusicPlayer/1.0 (rafael@example.com)'
              },
              timeout: 10000
            });
            const artistData = artistResponse.data;
            
            for (const rel of (artistData.relations || [])) {
              if (rel.type === 'image' && rel.url?.resource) {
                const imgUrl = rel.url.resource;
                if (imgUrl.includes('last.fm') || imgUrl.includes('fanart.tv')) {
                  try {
                    const imgResponse = await axios.get(imgUrl, { 
                      responseType: 'arraybuffer',
                      headers: {
                        'User-Agent': 'MusicPlayer/1.0 (rafael@example.com)'
                      },
                      timeout: 10000
                    });
                    if (imgResponse.status === 200) {
                      const artistPath = path.join(MUSIC_BASE_PATH, song.albumArtist || song.artist, 'artist.jpg');
                      const artistDir = path.dirname(artistPath);
                      if (!fs.existsSync(artistDir)) {
                        fs.mkdirSync(artistDir, { recursive: true });
                      }
                      fs.writeFileSync(artistPath, imgResponse.data);
                      hasArtistImage = true;
                      console.log(`✅ Imagen del artista descargada: ${artistPath}`);
                      break;
                    }
                  } catch (e) {
                    console.log('No se pudo descargar la imagen del artista');
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log('Error obteniendo imagen del artista');
        }
        
        // Actualizar metadatos
        return {
          title: recording.title || song.title,
          artist: recording['artist-credit']?.[0]?.artist?.name || song.artist,
          album: release.title || song.album,
          albumArtist: recording['artist-credit']?.[0]?.artist?.name || song.albumArtist || song.artist,
          year: release.date ? parseInt(release.date.substring(0, 4)) : song.year,
          hasCover: hasCover || song.hasCover || false,
          hasArtistImage: hasArtistImage || song.hasArtistImage || false
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Error syncing with MusicBrainz:', error);
    return null;
  }
}

// ====== RUTAS API ======

// GET - Obtener todas las canciones
app.get('/api/songs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    let db = readSongsDB();
    
    // Si la DB está vacía o no tiene canciones, escanear el directorio
    let songs = db.songs || [];
    if (songs.length === 0) {
      songs = scanMusicDirectory();
      db.songs = songs;
      writeSongsDB(db);
    }
    
    // Limitar resultados
    const limitedSongs = songs.slice(0, limit);
    
    // Transformar para el frontend
    const transformedSongs = limitedSongs.map(song => {
      const { coverUrl, artistUrl } = getImagePaths(song.albumArtist || song.artist, song.album);
      
      return {
        filename: song.filename,
        title: song.title,
        artist: song.artist,
        album: song.album,
        albumArtist: song.albumArtist || song.artist,
        trackNumber: song.trackNumber,
        year: song.year || null,
        genre: song.genre || 'Desconocido',
        duration: song.duration || 0,
        imageUrl: song.hasCover ? coverUrl : null,
        artistImageUrl: song.hasArtistImage ? artistUrl : null,
        hasCover: song.hasCover || false,
        hasArtistImage: song.hasArtistImage || false
      };
    });
    
    res.json({
      songs: transformedSongs,
      total: songs.length
    });
  } catch (error) {
    console.error('Error in /api/songs:', error);
    res.status(500).json({ error: 'Error al obtener canciones' });
  }
});

// GET - Obtener portada del álbum
app.get('/songs/album_art/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const db = readSongsDB();
    const song = db.songs.find(s => s.filename === filename || s.filename.includes(filename));
    
    if (!song) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }
    
    const { coverPath } = getImagePaths(song.albumArtist || song.artist, song.album);
    
    if (fs.existsSync(coverPath)) {
      res.sendFile(coverPath);
    } else {
      res.status(404).json({ error: 'Portada no encontrada' });
    }
  } catch (error) {
    console.error('Error serving album art:', error);
    res.status(500).json({ error: 'Error al servir la portada' });
  }
});

// GET - Obtener imagen del artista
app.get('/songs/artist_art/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const db = readSongsDB();
    const song = db.songs.find(s => s.filename === filename || s.filename.includes(filename));
    
    if (!song) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }
    
    const { artistPath } = getImagePaths(song.albumArtist || song.artist, song.album);
    
    if (fs.existsSync(artistPath)) {
      res.sendFile(artistPath);
    } else {
      res.status(404).json({ error: 'Imagen del artista no encontrada' });
    }
  } catch (error) {
    console.error('Error serving artist art:', error);
    res.status(500).json({ error: 'Error al servir la imagen del artista' });
  }
});

// PUT - Sincronizar metadatos
app.put('/api/songs/sync-metadata', async (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ error: 'Filename es requerido' });
    }
    
    const db = readSongsDB();
    const songIndex = db.songs.findIndex(s => s.filename === filename);
    
    if (songIndex === -1) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }
    
    const song = db.songs[songIndex];
    
    // Sincronizar con MusicBrainz
    const metadata = await syncMetadataFromMusicBrainz(song);
    
    if (metadata) {
      // Actualizar la canción en la DB
      db.songs[songIndex] = {
        ...db.songs[songIndex],
        ...metadata
      };
      
      writeSongsDB(db);
      
      const updatedSong = db.songs[songIndex];
      const { coverUrl, artistUrl } = getImagePaths(updatedSong.albumArtist || updatedSong.artist, updatedSong.album);
      
      res.json({
        message: 'Metadatos sincronizados correctamente',
        updatedSong: {
          ...updatedSong,
          imageUrl: updatedSong.hasCover ? coverUrl : null,
          artistImageUrl: updatedSong.hasArtistImage ? artistUrl : null
        }
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

// DELETE - Eliminar canción (mover a papelera)
app.delete('/api/songs', async (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ error: 'Filename es requerido' });
    }
    
    const db = readSongsDB();
    const songIndex = db.songs.findIndex(s => s.filename === filename);
    
    if (songIndex === -1) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }
    
    const song = db.songs[songIndex];
    const fullPath = path.join(MUSIC_BASE_PATH, song.filename);
    
    // Mover a la papelera
    if (fs.existsSync(fullPath)) {
      await trash(fullPath);
      console.log(`🗑️ Canción movida a la papelera: ${fullPath}`);
    }
    
    // Eliminar de la DB
    db.songs.splice(songIndex, 1);
    writeSongsDB(db);
    
    res.json({ message: 'Canción movida a la papelera correctamente' });
  } catch (error) {
    console.error('Error deleting song:', error);
    res.status(500).json({ error: 'Error al eliminar la canción' });
  }
});

// POST - Reconocimiento de música (simulado)
app.post('/api/recognize', async (req, res) => {
  try {
    const db = readSongsDB();
    const songs = db.songs || [];
    
    // Simular reconocimiento (en producción usarías una API real como Shazam)
    let matched = null;
    if (songs.length > 0) {
      // Buscar por similitud (simplificado)
      matched = songs[Math.floor(Math.random() * Math.min(songs.length, 5))];
    }
    
    const result = {
      recognized: {
        title: matched ? matched.title : 'Canción desconocida',
        artist: matched ? matched.artist : 'Artista desconocido',
        album: matched ? matched.album : 'Álbum desconocido',
        imageUrl: matched && matched.hasCover ? `/songs/${matched.albumArtist}/${matched.album}/cover.jpg` : null
      },
      matchedTrack: matched ? {
        id: matched.filename,
        title: matched.title,
        artist: matched.artist,
        album: matched.album,
        cover: matched.hasCover ? `/songs/${matched.albumArtist}/${matched.album}/cover.jpg` : null,
        duration: matched.duration,
        filename: matched.filename
      } : null
    };
    
    res.json(result);
    
  } catch (error) {
    console.error('Error recognizing song:', error);
    res.status(500).json({ error: 'Error al reconocer la canción' });
  }
});

// ====== INICIALIZAR SERVIDOR ======

// Verificar y crear estructura de directorios
function initializeDirectories() {
  if (!fs.existsSync(MUSIC_BASE_PATH)) {
    fs.mkdirSync(MUSIC_BASE_PATH, { recursive: true });
    console.log(`📁 Directorio creado: ${MUSIC_BASE_PATH}`);
  }
  
  // Crear DB si no existe o está corrupta
  if (!fs.existsSync(DB_PATH)) {
    writeSongsDB({ songs: [] });
    console.log(`💾 Base de datos creada: ${DB_PATH}`);
  } else {
    // Verificar que la DB sea válida
    try {
      const db = readSongsDB();
      if (!db.songs) {
        writeSongsDB({ songs: [] });
        console.log(`🔄 Base de datos corregida: ${DB_PATH}`);
      }
    } catch (e) {
      writeSongsDB({ songs: [] });
      console.log(`🔄 Base de datos recreada: ${DB_PATH}`);
    }
  }
  
  console.log(`📂 Ruta de música: ${MUSIC_BASE_PATH}`);
}

initializeDirectories();

// Escanear música al iniciar si la DB está vacía
const db = readSongsDB();
if (!db.songs || db.songs.length === 0) {
  console.log('🔍 Escaneando directorio de música...');
  const songs = scanMusicDirectory();
  if (songs.length > 0) {
    db.songs = songs;
    writeSongsDB(db);
    console.log(`✅ ${songs.length} canciones encontradas y guardadas en la base de datos.`);
  } else {
    console.log('⚠️ No se encontraron canciones en el directorio.');
  }
} else {
  console.log(`📚 ${db.songs.length} canciones cargadas desde la base de datos.`);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎵 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📂 Directorio de música: ${MUSIC_BASE_PATH}`);
  console.log(`💾 Base de datos: ${DB_PATH}`);
  console.log('\n✅ Servidor listo para recibir peticiones\n');
});