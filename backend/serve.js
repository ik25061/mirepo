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

// ====== SPOTIFY CONFIGURACIÓN ======
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';

// Verificar que la API Key de Last.fm esté configurada
if (!LASTFM_API_KEY) {
  console.error('❌ ERROR: LASTFM_API_KEY no está definida en el archivo .env');
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
if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
  console.log(`🔑 Spotify API: ✅ Configurada`);
} else {
  console.log(`🔑 Spotify API: ❌ No configurada (Solo se usará Last.fm + iTunes)`);
}

// ====== CACHE DE TOKEN SPOTIFY ======
let spotifyAccessToken = null;
let spotifyTokenExpiresAt = 0;

/**
 * Obtiene un token de acceso de Spotify (Client Credentials Flow)
 */
async function getSpotifyToken() {
  if (Date.now() < spotifyTokenExpiresAt && spotifyAccessToken) {
    return spotifyAccessToken;
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return null;
  }

  try {
    const response = await axios.post(
      `${SPOTIFY_ACCOUNTS_URL}/api/token`,
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
        },
        timeout: 10000
      }
    );

    if (response.data && response.data.access_token) {
      spotifyAccessToken = response.data.access_token;
      spotifyTokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 min before expiry
      console.log(`✅ Token de Spotify obtenido (expira en ${response.data.expires_in}s)`);
      return spotifyAccessToken;
    }
    return null;
  } catch (error) {
    console.error(`❌ Error al obtener token de Spotify:`, error.message);
    return null;
  }
}

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

// ====== FUNCIONES DE ITUNES SEARCH API ======

/**
 * Busca un álbum en iTunes Search API y devuelve su imagen
 * iTunes no requiere autenticación
 */
async function getAlbumImageFromiTunes(albumName, artistName) {
  try {
    const query = `${encodeURIComponent(artistName)} ${encodeURIComponent(albumName)}`;
    const url = `https://itunes.apple.com/search?term=${query}&entity=album&limit=5`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.results && response.data.results.length > 0) {
      // Buscar el mejor match: priorizar coincidencia exacta de álbum
      const results = response.data.results;
      
      // Primero buscar coincidencia exacta
      let bestMatch = results.find(r => 
        r.collectionName && r.artistName &&
        r.collectionName.toLowerCase() === albumName.toLowerCase() &&
        r.artistName.toLowerCase() === artistName.toLowerCase()
      );

      // Si no hay match exacto, usar el primer resultado
      if (!bestMatch) {
        bestMatch = results[0];
      }

      if (bestMatch && bestMatch.artworkUrl100) {
        // Reemplazar 100x100 por 600x600 para obtener imagen más grande
        const largeImageUrl = bestMatch.artworkUrl100.replace('100x100', '600x600');
        console.log(`✅ iTunes encontrado: "${bestMatch.collectionName}" - ${bestMatch.artistName}`);
        return largeImageUrl;
      }
    }
    return null;
  } catch (error) {
    console.error(`⚠️ iTunes Search falló para "${albumName}" de "${artistName}":`, error.message);
    return null;
  }
}

/**
 * Busca la imagen de un artista en iTunes Search API
 */
async function getArtistImageFromiTunes(artistName) {
  try {
    const query = encodeURIComponent(artistName);
    const url = `https://itunes.apple.com/search?term=${query}&entity=musicArtist&limit=1`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.results && response.data.results.length > 0) {
      const artist = response.data.results[0];
      if (artist.artistLinkUrl) {
        // iTunes no da imagen directa del artista, pero podemos buscar el álbum más popular
        // Buscar álbumes del artista
        const albumUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=album&limit=1`;
        const albumResponse = await axios.get(albumUrl, { timeout: 10000 });
        
        if (albumResponse.data && albumResponse.data.results && albumResponse.data.results.length > 0) {
          const album = albumResponse.data.results[0];
          if (album.artworkUrl100) {
            const largeImageUrl = album.artworkUrl100.replace('100x100', '600x600');
            console.log(`✅ iTunes: imagen de "${artistName}" obtenida de su álbum "${album.collectionName}"`);
            return largeImageUrl;
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error(`⚠️ iTunes Search falló para artista "${artistName}":`, error.message);
    return null;
  }
}

// ====== FUNCIONES DE SPOTIFY API ======

/**
 * Busca un álbum en Spotify y devuelve su imagen
 */
async function getAlbumImageFromSpotify(albumName, artistName) {
  const token = await getSpotifyToken();
  if (!token) return null;

  try {
    const query = encodeURIComponent(`album:${albumName} artist:${artistName}`);
    const url = `${SPOTIFY_API_URL}/search?q=${query}&type=album&limit=5`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 10000
    });

    if (response.data && response.data.albums && response.data.albums.items) {
      const albums = response.data.albums.items;
      
      // Buscar match exacto
      let bestMatch = albums.find(a =>
        a.name && a.artists &&
        a.name.toLowerCase() === albumName.toLowerCase() &&
        a.artists.some(ar => ar.name.toLowerCase() === artistName.toLowerCase())
      );

      if (!bestMatch && albums.length > 0) {
        bestMatch = albums[0];
      }

      if (bestMatch && bestMatch.images && bestMatch.images.length > 0) {
        // Usar la imagen más grande disponible
        const largestImage = bestMatch.images[0];
        console.log(`✅ Spotify encontrado: "${bestMatch.name}"`);
        return largestImage.url;
      }
    }
    return null;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      // Token expirado, forzar renovación en el próximo intento
      spotifyAccessToken = null;
    }
    console.error(`⚠️ Spotify Search falló para álbum "${albumName}":`, error.message);
    return null;
  }
}

/**
 * Busca la imagen de un artista en Spotify
 */
async function getArtistImageFromSpotify(artistName) {
  const token = await getSpotifyToken();
  if (!token) return null;

  try {
    const query = encodeURIComponent(artistName);
    const url = `${SPOTIFY_API_URL}/search?q=${query}&type=artist&limit=1`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 10000
    });

    if (response.data && response.data.artists && response.data.artists.items) {
      const artists = response.data.artists.items;
      if (artists.length > 0 && artists[0].images && artists[0].images.length > 0) {
        const largestImage = artists[0].images[0];
        console.log(`✅ Spotify: imagen del artista "${artistName}" encontrada`);
        return largestImage.url;
      }
    }
    return null;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      spotifyAccessToken = null;
    }
    console.error(`⚠️ Spotify Search falló para artista "${artistName}":`, error.message);
    return null;
  }
}

/**
 * Función para obtener imagen de álbum con cadena de fallbacks:
 * iTunes → Spotify → Last.fm
 */
async function getAlbumImageWithFallback(albumName, artistName) {
  console.log(`🔍 Buscando portada del álbum "${albumName}" de "${artistName}"...`);

  // 1. Intentar iTunes (no requiere autenticación, rápido)
  const itunesImage = await getAlbumImageFromiTunes(albumName, artistName);
  if (itunesImage) {
    console.log(`✅ Portada encontrada en iTunes`);
    return { imageUrl: itunesImage, source: 'itunes' };
  }

  // 2. Intentar Spotify
  console.log(`⚠️ No encontrado en iTunes, probando Spotify...`);
  const spotifyImage = await getAlbumImageFromSpotify(albumName, artistName);
  if (spotifyImage) {
    console.log(`✅ Portada encontrada en Spotify`);
    return { imageUrl: spotifyImage, source: 'spotify' };
  }

  // 3. Intentar Last.fm (último recurso)
  console.log(`⚠️ No encontrado en Spotify, probando Last.fm...`);
  const albumInfo = albumName !== "Desconocido" ? await getAlbumInfo(albumName, artistName) : null;
  if (albumInfo && albumInfo.imageUrl) {
    console.log(`✅ Portada encontrada en Last.fm`);
    return { imageUrl: albumInfo.imageUrl, source: 'lastfm' };
  }

  console.log(`❌ No se encontró portada del álbum en ninguna fuente`);
  return { imageUrl: null, source: null };
}

/**
 * Función para obtener imagen de artista con cadena de fallbacks:
 * iTunes → Spotify → Last.fm
 */
async function getArtistImageWithFallback(artistName) {
  console.log(`🔍 Buscando imagen del artista "${artistName}"...`);

  // 1. Intentar iTunes (no requiere autenticación, rápido)
  const itunesImage = await getArtistImageFromiTunes(artistName);
  if (itunesImage) {
    console.log(`✅ Imagen de artista encontrada en iTunes`);
    return { imageUrl: itunesImage, source: 'itunes' };
  }

  // 2. Intentar Spotify
  console.log(`⚠️ No encontrado en iTunes, probando Spotify...`);
  const spotifyImage = await getArtistImageFromSpotify(artistName);
  if (spotifyImage) {
    console.log(`✅ Imagen de artista encontrada en Spotify`);
    return { imageUrl: spotifyImage, source: 'spotify' };
  }

  // 3. Intentar Last.fm (último recurso)
  console.log(`⚠️ No encontrado en Spotify, probando Last.fm...`);
  const artistInfo = await getArtistInfo(artistName);
  if (artistInfo && artistInfo.imageUrl) {
    console.log(`✅ Imagen de artista encontrada en Last.fm`);
    return { imageUrl: artistInfo.imageUrl, source: 'lastfm' };
  }

  console.log(`❌ No se encontró imagen del artista en ninguna fuente`);
  return { imageUrl: null, source: null };
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

// PUT: Sincronizar metadatos con Last.fm (con fallback a iTunes y Spotify)
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

    console.log(`\n🔍 Sincronizando: "${artist} - ${title}"`);
    console.log(`📀 Álbum: "${albumName}"`);

    // 1. Obtener información del artista (Last.fm para nombre y tags)
    const artistInfo = await getArtistInfo(artist);
    let newArtist = artist;
    let tags = [];

    if (artistInfo) {
      newArtist = artistInfo.name || artist;
      tags = artistInfo.tags || [];
      console.log(`✅ Artista (Last.fm): ${newArtist} (${tags.slice(0, 3).join(', ')})`);
    } else {
      console.log(`⚠️ Artista no encontrado en Last.fm: ${artist}`);
    }

    // 2. Si no hay tags, obtener top tags del artista
    if (tags.length === 0) {
      tags = await getArtistTags(newArtist);
      console.log(`🏷️ Tags obtenidos: ${tags.slice(0, 3).join(', ')}`);
    }

    // 3. Determinar géneros
    let genres = tags.length > 0 ? tags : ["Urbano"];
    if (genres.length === 0) genres = ["Urbano"];

    console.log(`📀 Géneros finales: ${genres.join(", ")}`);

    // 4. Preparar tags ID3 básicos
    const baseName = path.parse(filename).name;
    const tagsID3 = {
      title: title,
      artist: newArtist,
      genre: genres.join(" / "),
      album: albumName
    };

    // 5. Obtener imágenes con cadena de fallback
    let hasAlbumImage = false;
    let hasArtistImage = false;
    let albumImageSource = null;
    let artistImageSource = null;

    // 5a. Buscar portada del álbum (Last.fm → iTunes → Spotify)
    const albumResult = await getAlbumImageWithFallback(albumName, artist);
    let albumImageUrl = albumResult.imageUrl;
    albumImageSource = albumResult.source;

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
            description: `Album Cover (${albumImageSource})`,
            imageBuffer: imageBuffer
          };
        }
        console.log(`✅ Portada guardada desde ${albumImageSource}`);
      } catch (imgErr) {
        console.log(`⚠️ No se pudo descargar portada:`, imgErr.message);
      }
    }

    // 5b. Si no hay portada, buscar imagen del artista como fallback (Last.fm → iTunes → Spotify)
    if (!hasAlbumImage) {
      console.log(`🔍 No hay portada, buscando imagen del artista como alternativa...`);
      const artistResult = await getArtistImageWithFallback(newArtist || artist);
      const artistImageUrl = artistResult.imageUrl;
      artistImageSource = artistResult.source;

      if (artistImageUrl) {
        try {
          const artistFilename = `${baseName}_artist.jpg`;
          await downloadImageToFolder(artistImageUrl, ARTIST_ART_DIR, artistFilename);
          hasArtistImage = true;
          console.log(`✅ Foto del artista guardada desde ${artistImageSource}`);
          
          // Incrustar imagen del artista en el MP3 como portada
          const artistImagePath = path.join(ARTIST_ART_DIR, artistFilename);
          if (fs.existsSync(artistImagePath)) {
            const imageBuffer = fs.readFileSync(artistImagePath);
            tagsID3.image = {
              mime: "image/jpeg",
              type: { id: 3, name: 'front cover' },
              description: `Artist Image (${artistImageSource})`,
              imageBuffer: imageBuffer
            };
          }
        } catch (imgErr) {
          console.log("⚠️ No se pudo descargar foto del artista:", imgErr.message);
        }
      }
    }

    // 6. Obtener el año del álbum (desde Last.fm)
    let albumYear = null;
    if (albumName !== "Desconocido") {
      const albumInfo = await getAlbumInfo(albumName, artist);
      if (albumInfo && albumInfo.releaseDate) {
        const yearMatch = albumInfo.releaseDate.match(/(\d{4})/);
        if (yearMatch) {
          albumYear = parseInt(yearMatch[1], 10);
          tagsID3.year = albumYear;
          console.log(`📅 Año del álbum: ${albumYear}`);
        }
      }
    }

    // 7. Escribir tags en el archivo
    const success = NodeID3.write(tagsID3, filePath);
    if (!success) {
      return res.status(500).json({ error: 'Error al escribir tags.' });
    }

    // 8. Sincronizar base de datos
    await syncDatabase();

    res.json({
      message: 'Sincronización completada con Last.fm',
      updatedSong: {
        filename: convertedFilename,
        title: title,
        artist: newArtist,
        album: albumName,
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
  if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
    console.log(`🔑 Spotify API: ✅ Configurada`);
  } else {
    console.log(`🔑 Spotify API: ❌ No configurada`);
  }
  console.log(`\n📋 Endpoints disponibles:`);
  console.log(`   GET  /api/songs        - Listar canciones`);
  console.log(`   GET  /api/genres       - Listar géneros`);
  console.log(`   GET  /api/albums       - Listar álbumes`);
  console.log(`   GET  /api/artists      - Listar artistas`);
  console.log(`   POST /api/sync-db      - Sincronizar base de datos`);
  console.log(`   PUT  /api/songs/sync-metadata - Sincronizar con Last.fm + iTunes + Spotify`);
  console.log(`   PUT  /api/songs/local-metadata - Editar metadatos`);
  console.log(`   DELETE /api/songs      - Eliminar canción`);
  console.log(`\n✅ Servidor listo! 🚀`);
});