// serve.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const NodeID3 = require('node-id3');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const https = require('https');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ====== CONFIGURACIÓN ======
const PORT = process.env.PORT || 5000;
const MUSIC_DIR = process.env.MUSIC_DIR || path.join('C:', 'Users', 'rafael', 'Music');
const DB_PATH = path.join(__dirname, 'songs_db.json');

// ====== LAST.FM CONFIGURACIÓN ======
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';

// Verificar que la API Key esté configurada
if (!LASTFM_API_KEY) {
  console.error('❌ ERROR: LASTFM_API_KEY no está definida en el archivo .env');
  console.error('   Crea un archivo .env con: LASTFM_API_KEY=tu_api_key_aqui');
  process.exit(1);
}

// ====== CARPETAS PARA IMÁGENES ======
const ALBUM_ART_DIR = path.join(MUSIC_DIR, 'album_art');
const ARTIST_ART_DIR = path.join(MUSIC_DIR, 'artist_art');

// Servir archivos estáticos
app.use('/songs', express.static(MUSIC_DIR));
app.use('/songs/album_art', express.static(ALBUM_ART_DIR));
app.use('/songs/artist_art', express.static(ARTIST_ART_DIR));

// ====== VERIFICAR CARPETAS Y PERMISOS ======
console.log('🔍 Verificando configuración...');

if (!fs.existsSync(MUSIC_DIR)) {
  console.error(`❌ La carpeta ${MUSIC_DIR} no existe`);
  process.exit(1);
} else {
  console.log(`✅ Carpeta de música: ${MUSIC_DIR}`);
  try {
    fs.accessSync(MUSIC_DIR, fs.constants.W_OK);
    console.log(`✅ Permisos de escritura OK`);
  } catch (err) {
    console.error(`❌ No hay permisos de escritura en ${MUSIC_DIR}`);
    process.exit(1);
  }
}

// Crear carpetas de imágenes si no existen
if (!fs.existsSync(ALBUM_ART_DIR)) {
  fs.mkdirSync(ALBUM_ART_DIR, { recursive: true });
  console.log(`📁 Creada carpeta: ${ALBUM_ART_DIR}`);
}
if (!fs.existsSync(ARTIST_ART_DIR)) {
  fs.mkdirSync(ARTIST_ART_DIR, { recursive: true });
  console.log(`📁 Creada carpeta: ${ARTIST_ART_DIR}`);
}

console.log(`🔑 Last.fm API Key: ${LASTFM_API_KEY.substring(0, 8)}...✅`);

// ====== FUNCIONES DE LAST.FM ======

/**
 * Obtiene información de un artista de Last.fm
 * Devuelve: { name, imageUrl, bio, tags, similarArtists }
 */
async function getArtistInfo(artistName) {
  try {
    const url = `${LASTFM_API_URL}?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=${LASTFM_API_KEY}&format=json`;
    const response = await axios.get(url, { timeout: 10000 });
    
    if (response.data && response.data.artist) {
      const artist = response.data.artist;
      
      // Obtener la imagen más grande (extralarge)
      let imageUrl = null;
      if (artist.image && artist.image.length > 0) {
        const largestImage = artist.image[artist.image.length - 1];
        if (largestImage && largestImage['#text']) {
          imageUrl = largestImage['#text'];
        }
      }
      
      // Obtener tags/géneros
      let tags = [];
      if (artist.tags && artist.tags.tag) {
        tags = Array.isArray(artist.tags.tag) 
          ? artist.tags.tag.map(t => t.name) 
          : [artist.tags.tag.name];
      }
      
      return {
        name: artist.name,
        imageUrl: imageUrl,
        bio: artist.bio?.content || '',
        tags: tags,
        similarArtists: artist.similar?.artist?.map(a => a.name) || []
      };
    }
    return null;
  } catch (error) {
    console.error(`❌ Error al obtener información de ${artistName} desde Last.fm:`, error.message);
    return null;
  }
}

/**
 * Obtiene información de un álbum de Last.fm
 * Devuelve: { name, artist, imageUrl, tracks, releaseDate }
 */
async function getAlbumInfo(albumName, artistName) {
  try {
    const url = `${LASTFM_API_URL}?method=album.getinfo&artist=${encodeURIComponent(artistName)}&album=${encodeURIComponent(albumName)}&api_key=${LASTFM_API_KEY}&format=json`;
    const response = await axios.get(url, { timeout: 10000 });
    
    if (response.data && response.data.album) {
      const album = response.data.album;
      
      let imageUrl = null;
      if (album.image && album.image.length > 0) {
        const largestImage = album.image[album.image.length - 1];
        if (largestImage && largestImage['#text']) {
          imageUrl = largestImage['#text'];
        }
      }
      
      return {
        name: album.name,
        artist: album.artist,
        imageUrl: imageUrl,
        tracks: album.tracks?.track?.map(t => t.name) || [],
        releaseDate: album.releasedate || '',
        playcount: album.playcount || 0
      };
    }
    return null;
  } catch (error) {
    console.error(`❌ Error al obtener información del álbum ${albumName} desde Last.fm:`, error.message);
    return null;
  }
}

/**
 * Busca artistas similares para obtener más géneros
 */
async function getArtistTags(artistName) {
  try {
    const url = `${LASTFM_API_URL}?method=artist.gettoptags&artist=${encodeURIComponent(artistName)}&api_key=${LASTFM_API_KEY}&format=json`;
    const response = await axios.get(url, { timeout: 10000 });
    
    if (response.data && response.data.toptags && response.data.toptags.tag) {
      const tags = Array.isArray(response.data.toptags.tag) 
        ? response.data.toptags.tag.slice(0, 5).map(t => t.name)
        : [response.data.toptags.tag.name];
      return tags.filter(t => t && t !== "");
    }
    return [];
  } catch (error) {
    console.error(`❌ Error al obtener tags de ${artistName}:`, error.message);
    return [];
  }
}

// ====== FUNCIÓN DE DESCARGA DE IMÁGENES ======

const downloadImageToFolder = async (imageUrl, destFolder, filename) => {
  return new Promise((resolve, reject) => {
    if (!imageUrl) {
      reject(new Error('URL de imagen vacía'));
      return;
    }
    
    if (!fs.existsSync(destFolder)) {
      fs.mkdirSync(destFolder, { recursive: true });
    }
    
    const dest = path.join(destFolder, filename);
    const file = fs.createWriteStream(dest);
    
    https.get(imageUrl, { 
      headers: { 
        'User-Agent': 'MusicPlayer/1.0',
        'Accept': 'image/*'
      } 
    }, (res) => {
      if (res.statusCode !== 200) {
        fs.unlink(dest, () => {});
        reject(new Error(`Error al descargar: ${res.statusCode}`));
        return;
      }

      let downloadedBytes = 0;
      const totalBytes = parseInt(res.headers['content-length'], 10);

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes && downloadedBytes % (totalBytes / 10) < chunk.length) {
          const progress = ((downloadedBytes / totalBytes) * 100).toFixed(0);
          console.log(`📥 Descargando ${path.basename(dest)}: ${progress}%`);
        }
      });

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✅ Imagen guardada: ${path.basename(dest)} (${(downloadedBytes / 1024).toFixed(1)} KB)`);
        resolve(dest);
      });
      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

// ====== FUNCIÓN DE CONVERSIÓN A MP3 ======

const convertToMp3 = async (sourcePath) => {
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === '.mp3') return sourcePath;

  const outputPath = sourcePath.replace(ext, '.mp3');
  return new Promise((resolve, reject) => {
    ffmpeg(sourcePath)
      .setFfmpegPath(ffmpegStatic)
      .format('mp3')
      .audioCodec('libmp3lame')
      .audioBitrate(192)
      .on('end', () => {
        try {
          fs.unlinkSync(sourcePath);
        } catch (err) {
          console.warn('No se pudo borrar original:', err.message);
        }
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(err);
      })
      .save(outputPath);
  });
};

// ====== SINCORNIZAR BASE DE DATOS ======

const syncDatabase = async () => {
  console.log("🔄 Sincronizando base de datos de canciones...");
  const { parseFile } = await import('music-metadata');
  
  let files;
  try {
    files = fs.readdirSync(MUSIC_DIR);
  } catch (err) {
    console.error(`❌ Error al leer la carpeta ${MUSIC_DIR}:`, err.message);
    return [];
  }
  
  const musicFiles = files.filter(file => 
    ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac'].includes(path.extname(file).toLowerCase())
  );

  console.log(`📂 Encontrados ${musicFiles.length} archivos de audio`);

  const songsList = [];

  for (const file of musicFiles) {
    const filePath = path.join(MUSIC_DIR, file);
    const baseName = path.parse(file).name;
    
    const albumImagePath = path.join(ALBUM_ART_DIR, `${baseName}.jpg`);
    const artistImagePath = path.join(ARTIST_ART_DIR, `${baseName}_artist.jpg`);

    const hasAlbumImage = fs.existsSync(albumImagePath);
    const hasArtistImage = fs.existsSync(artistImagePath);
    
    let imageUrl = null;
    if (hasAlbumImage) {
      imageUrl = `/songs/album_art/${encodeURIComponent(baseName)}.jpg`;
    } else if (hasArtistImage) {
      imageUrl = `/songs/artist_art/${encodeURIComponent(baseName)}_artist.jpg`;
    }

    try {
      const metadata = await parseFile(filePath, { skipCovers: true });
      
      let genresArray = ["Desconocido"];
      if (metadata.common.genre) {
        if (Array.isArray(metadata.common.genre)) {
          genresArray = metadata.common.genre;
        } else if (typeof metadata.common.genre === 'string') {
          genresArray = metadata.common.genre.split(/[\/,]/).map(g => g.trim());
        }
      }
      genresArray = genresArray.filter(g => g && g !== "");
      if (genresArray.length === 0) genresArray = ["Desconocido"];

      songsList.push({
        filename: file,
        title: metadata.common.title || baseName,
        artist: metadata.common.artist || "Desconocido",
        album: metadata.common.album || "Desconocido",
        year: metadata.common.year || null,
        genre: genresArray,
        duration: metadata.format.duration || 0,
        imageUrl: imageUrl,
        lastUpdated: new Date().toISOString()
      });
    } catch (err) {
      songsList.push({
        filename: file,
        title: baseName,
        artist: "Desconocido",
        album: "Desconocido",
        year: null,
        genre: ["Desconocido"],
        duration: 0,
        imageUrl: imageUrl,
        lastUpdated: new Date().toISOString()
      });
    }
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(songsList, null, 2));
  console.log(`✅ Base de datos sincronizada: ${songsList.length} canciones`);
  return songsList;
};

// ====== ENDPOINTS ======

// GET: Listar canciones con filtros
app.get('/api/songs', async (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  const offset = parseInt(req.query.offset) || 0;
  const genre = req.query.genre;
  const album = req.query.album;
  const artist = req.query.artist;

  if (!fs.existsSync(DB_PATH)) {
    await syncDatabase();
  }

  let songs = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

  if (genre) {
    songs = songs.filter(s => {
      if (Array.isArray(s.genre)) {
        return s.genre.some(g => g.toLowerCase() === genre.toLowerCase());
      } else if (typeof s.genre === 'string') {
        return s.genre.toLowerCase().split(/[\/,]/).map(g => g.trim()).includes(genre.toLowerCase());
      }
      return false;
    });
  }
  
  if (album) {
    songs = songs.filter(s => s.album.toLowerCase() === album.toLowerCase());
  }
  
  if (artist) {
    songs = songs.filter(s => s.artist.toLowerCase() === artist.toLowerCase());
  }

  const total = songs.length;
  const sliced = songs.slice(offset, offset + limit);
  
  res.json({
    songs: sliced,
    total: total,
    hasMore: offset + limit < total
  });
});

// POST: Forzar sincronización manual
app.post('/api/sync-db', async (req, res) => {
  try {
    const songs = await syncDatabase();
    res.json({ message: `Sincronizado: ${songs.length} canciones`, songs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Lista de géneros
app.get('/api/genres', (req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.json([]);
  const songs = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  const genreSet = new Set();
  songs.forEach(song => {
    let genres = [];
    if (Array.isArray(song.genre)) {
      genres = song.genre;
    } else if (typeof song.genre === 'string') {
      genres = song.genre.split(/[\/,]/).map(g => g.trim());
    }
    genres.forEach(g => {
      if (g && g !== "Desconocido") {
        genreSet.add(g.charAt(0).toUpperCase() + g.slice(1).toLowerCase());
      }
    });
  });
  res.json([...genreSet]);
});

// GET: Lista de álbumes
app.get('/api/albums', (req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.json([]);
  const songs = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  const albums = [...new Set(songs.map(s => s.album).filter(a => a !== "Desconocido"))];
  res.json(albums);
});

// GET: Lista de artistas
app.get('/api/artists', (req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.json([]);
  const songs = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  const artists = [...new Set(songs.map(s => s.artist).filter(a => a !== "Desconocido"))];
  res.json(artists);
});

// PUT: Sincronizar metadatos con Last.fm
app.put('/api/songs/sync-metadata', async (req, res) => {
  const { filename } = req.body;
  const originalFilePath = path.join(MUSIC_DIR, filename);

  if (!fs.existsSync(originalFilePath)) {
    return res.status(404).json({ error: 'El archivo no existe.' });
  }

  try {
    const filePath = await convertToMp3(originalFilePath);
    const convertedFilename = path.basename(filePath);
    const { parseFile } = await import('music-metadata');
    const currentMetadata = await parseFile(filePath);
    
    const title = currentMetadata.common.title || path.parse(convertedFilename).name;
    const artist = currentMetadata.common.artist || "Desconocido";
    const albumName = currentMetadata.common.album || "Desconocido";

    console.log(`🔍 Buscando en Last.fm: "${artist} - ${title}"`);

    // 1. Obtener información del artista
    const artistInfo = await getArtistInfo(artist);
    let artistImageUrl = null;
    let newArtist = artist;
    let tags = [];

    if (artistInfo) {
      newArtist = artistInfo.name || artist;
      artistImageUrl = artistInfo.imageUrl;
      tags = artistInfo.tags || [];
      console.log(`✅ Artista encontrado: ${newArtist} (${tags.slice(0, 3).join(', ')})`);
    } else {
      console.log(`⚠️ No se encontró información para el artista: ${artist}`);
    }

    // 2. Obtener información del álbum
    let albumImageUrl = null;
    let newAlbum = albumName;

    if (albumName !== "Desconocido") {
      const albumInfo = await getAlbumInfo(albumName, artist);
      if (albumInfo) {
        newAlbum = albumInfo.name || albumName;
        albumImageUrl = albumInfo.imageUrl;
        console.log(`✅ Álbum encontrado: ${newAlbum}`);
      } else {
        console.log(`⚠️ No se encontró información para el álbum: ${albumName}`);
      }
    }

    // 3. Si no hay tags, obtener top tags del artista
    if (tags.length === 0) {
      tags = await getArtistTags(newArtist);
      console.log(`🏷️ Tags obtenidos: ${tags.slice(0, 3).join(', ')}`);
    }

    // 4. Determinar géneros
    let genres = tags.length > 0 ? tags : ["Urbano"];
    if (genres.length === 0) genres = ["Urbano"];

    console.log(`📀 Géneros finales: ${genres.join(", ")}`);

    // 5. Preparar tags ID3
    const baseName = path.parse(filename).name;
    const tagsID3 = {
      title: title,
      artist: newArtist,
      genre: genres.join(" / "),
      album: newAlbum
    };

    // 6. Descargar imágenes
    let hasAlbumImage = false;
    let hasArtistImage = false;

    // Si tenemos imagen del álbum, usarla (prioridad)
    if (albumImageUrl) {
      try {
        const albumFilename = `${baseName}.jpg`;
        await downloadImageToFolder(albumImageUrl, ALBUM_ART_DIR, albumFilename);
        hasAlbumImage = true;
        
        // Incrustar imagen en el archivo MP3
        const albumImagePath = path.join(ALBUM_ART_DIR, albumFilename);
        if (fs.existsSync(albumImagePath)) {
          const imageBuffer = fs.readFileSync(albumImagePath);
          tagsID3.image = {
            mime: "image/jpeg",
            type: { id: 3, name: 'front cover' },
            description: 'Album Cover',
            imageBuffer: imageBuffer
          };
        }
        console.log(`✅ Portada del álbum guardada`);
      } catch (imgErr) {
        console.log("⚠️ No se pudo descargar portada del álbum:", imgErr.message);
      }
    }

    // Si NO tenemos imagen del álbum, usar la del artista como fallback
    if (!hasAlbumImage && artistImageUrl) {
      try {
        const artistFilename = `${baseName}_artist.jpg`;
        await downloadImageToFolder(artistImageUrl, ARTIST_ART_DIR, artistFilename);
        hasArtistImage = true;
        console.log(`✅ Foto del artista guardada (usada como portada)`);
        
        // Incrustar imagen del artista en el MP3
        const artistImagePath = path.join(ARTIST_ART_DIR, artistFilename);
        if (fs.existsSync(artistImagePath)) {
          const imageBuffer = fs.readFileSync(artistImagePath);
          tagsID3.image = {
            mime: "image/jpeg",
            type: { id: 3, name: 'front cover' },
            description: 'Artist Image',
            imageBuffer: imageBuffer
          };
        }
      } catch (imgErr) {
        console.log("⚠️ No se pudo descargar foto del artista:", imgErr.message);
      }
    }

    // 7. Obtener el año del álbum desde Last.fm
    let albumYear = null;
    if (albumName !== "Desconocido") {
      const albumInfo = await getAlbumInfo(albumName, artist);
      if (albumInfo && albumInfo.releaseDate) {
        // Parsear año del releaseDate
        const yearMatch = albumInfo.releaseDate.match(/(\d{4})/);
        if (yearMatch) {
          albumYear = parseInt(yearMatch[1], 10);
          tagsID3.year = albumYear;
          console.log(`📅 Año del álbum: ${albumYear}`);
        }
      }
    }

    // 8. Escribir tags en el archivo
    const success = NodeID3.write(tagsID3, filePath);
    if (!success) {
      return res.status(500).json({ error: 'Error al escribir tags.' });
    }

    // 9. Sincronizar base de datos
    await syncDatabase();

    res.json({
      message: 'Sincronización completada con Last.fm',
      updatedSong: {
        filename: convertedFilename,
        title: title,
        artist: newArtist,
        album: newAlbum,
        year: albumYear,
        genre: genres,
        hasAlbumImage: hasAlbumImage,
        hasArtistImage: hasArtistImage
      }
    });

  } catch (error) {
    console.error("Error en sincronización:", error);
    res.status(500).json({ error: 'Error interno en sincronización.' });
  }
});

// PUT: Editar metadatos localmente
app.put('/api/songs/local-metadata', async (req, res) => {
  const { filename, title, artist, genre, album } = req.body;
  const filePath = path.join(MUSIC_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'El archivo no existe.' });
  }

  try {
    const cleanTitle = title ? String(title).trim() : "Título desconocido";
    const cleanArtist = artist ? String(artist).trim() : "Artista desconocido";
    const cleanAlbum = album ? String(album).trim() : "Desconocido";
    
    let cleanGenre = "Desconocido";
    if (genre) {
      if (Array.isArray(genre)) {
        cleanGenre = genre.join(" / ");
      } else {
        cleanGenre = String(genre).trim();
      }
    }

    const tags = {
      title: cleanTitle,
      artist: cleanArtist,
      genre: cleanGenre,
      album: cleanAlbum
    };

    const success = NodeID3.write(tags, filePath);
    
    if (!success) {
      return res.status(500).json({ error: 'Error al escribir los tags ID3.' });
    }

    await syncDatabase();

    res.json({ 
      message: '✅ Metadatos actualizados correctamente',
      updatedSong: { 
        filename, 
        title: cleanTitle, 
        artist: cleanArtist, 
        genre: cleanGenre.split(" / "),
        album: cleanAlbum
      } 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al actualizar metadatos.' });
  }
});

// PUT: Actualizar metadatos manualmente (legacy)
app.put('/api/songs/update-metadata', async (req, res) => {
  const { filename, title, artist, genre, imageUrl } = req.body;
  const filePath = path.join(MUSIC_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'El archivo no existe.' });
  }

  try {
    let cleanGenre = "Urbano";
    if (genre) {
      if (Array.isArray(genre)) {
        cleanGenre = genre.join(" / ");
      } else {
        cleanGenre = String(genre).trim();
      }
    }

    const tags = {
      title: String(title).trim(),
      artist: String(artist).trim(),
      genre: cleanGenre
    };

    if (imageUrl) {
      const baseName = path.parse(filename).name;
      const albumImagePath = path.join(ALBUM_ART_DIR, `${baseName}.jpg`);
      try {
        await downloadImageToFolder(imageUrl, ALBUM_ART_DIR, `${baseName}.jpg`);
        const imageBuffer = fs.readFileSync(albumImagePath);
        tags.image = {
          mime: "image/jpeg",
          type: { id: 3, name: 'front cover' },
          description: 'Cover',
          imageBuffer: imageBuffer
        };
      } catch (imgError) {
        console.log("No se pudo incrustar la imagen.");
      }
    }

    const success = NodeID3.write(tags, filePath);
    
    if (!success) {
      return res.status(500).json({ error: 'Error al escribir tags.' });
    }

    await syncDatabase();

    res.json({ 
      message: 'Guardado', 
      updatedSong: { 
        filename, 
        title: tags.title, 
        artist: tags.artist, 
        genre: cleanGenre.split(" / "),
        duration: 0
      } 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// DELETE: Eliminar canción
app.delete('/api/songs', async (req, res) => {
  const { filename } = req.body;
  const filePath = path.join(MUSIC_DIR, filename);
  
  if (!filePath.startsWith(MUSIC_DIR)) {
    return res.status(403).json({ error: 'Denegado' });
  }

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    const baseName = path.parse(filename).name;
    
    const albumImagePath = path.join(ALBUM_ART_DIR, `${baseName}.jpg`);
    const artistImagePath = path.join(ARTIST_ART_DIR, `${baseName}_artist.jpg`);
    
    if (fs.existsSync(albumImagePath)) fs.unlinkSync(albumImagePath);
    if (fs.existsSync(artistImagePath)) fs.unlinkSync(artistImagePath);
    
    await syncDatabase();
    
    res.json({ message: 'Eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo borrar: ' + err.message });
  }
});

// ====== INICIAR SERVIDOR ======

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎵 Servidor de música corriendo en puerto ${PORT}`);
  console.log(`📁 Carpeta de música: ${MUSIC_DIR}`);
  console.log(`📁 Carpetas de imágenes:`);
  console.log(`   - Álbumes: ${ALBUM_ART_DIR}`);
  console.log(`   - Artistas: ${ARTIST_ART_DIR}`);
  console.log(`🔑 Last.fm API Key: ${LASTFM_API_KEY ? '✅ Configurada' : '❌ No configurada'}`);
  console.log(`\n📋 Endpoints disponibles:`);
  console.log(`   GET  /api/songs        - Listar canciones`);
  console.log(`   GET  /api/genres       - Listar géneros`);
  console.log(`   GET  /api/albums       - Listar álbumes`);
  console.log(`   GET  /api/artists      - Listar artistas`);
  console.log(`   POST /api/sync-db      - Sincronizar base de datos`);
  console.log(`   PUT  /api/songs/sync-metadata - Sincronizar con Last.fm`);
  console.log(`   PUT  /api/songs/local-metadata - Editar metadatos`);
  console.log(`   DELETE /api/songs      - Eliminar canción`);
  console.log(`\n✅ Servidor listo! 🚀`);
});