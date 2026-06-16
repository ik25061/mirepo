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
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());

// ====== CONFIGURACIÓN ======
const PORT = process.env.PORT || 5000;
const MUSIC_DIR = process.env.MUSIC_DIR || path.join('C:', 'Users', 'rafael', 'Music');
const DB_PATH = path.join(__dirname, 'songs_db.json');

// ====== SHAZAM / RAPIDAPI CONFIGURACIÓN ======
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const SHAZAM_API_HOST = 'shazam-core.p.rapidapi.com';

// ====== AUDD.IO CONFIGURACIÓN (fallback gratuito) ======
const AUDD_API_KEY = process.env.AUDD_API_KEY;

// ====== MULTER CONFIGURACIÓN (para uploads de audio) ======
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.originalname.match(/\.(mp3|wav|ogg|m4a|flac|aac|webm)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de audio'));
    }
  }
});

// ====== LAST.FM CONFIGURACIÓN ======
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';

// ====== SPOTIFY CONFIGURACIÓN ======
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';

// ====== MUSICBRAINZ CONFIGURACIÓN ======
const MUSICBRAINZ_API_URL = 'https://musicbrainz.org/ws/2';
const MUSICBRAINZ_USER_AGENT = 'MusicPlayerApp/1.0 (contact@musicplayer.com)';

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
  console.log(`🔑 Spotify API: ❌ No configurada (Solo se usará Last.fm + iTunes + MusicBrainz)`);
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

/**
 * Busca metadatos de una canción en iTunes (título, artista, álbum, año)
 */
async function searchiTunesMetadata(artistName, trackTitle) {
  try {
    const query = `${encodeURIComponent(artistName)} ${encodeURIComponent(trackTitle)}`;
    const url = `https://itunes.apple.com/search?term=${query}&entity=song&limit=5`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.results && response.data.results.length > 0) {
      const results = response.data.results;
      
      // Buscar el mejor match
      let bestMatch = results.find(r => 
        r.trackName && r.artistName &&
        r.trackName.toLowerCase().includes(trackTitle.toLowerCase()) &&
        r.artistName.toLowerCase().includes(artistName.toLowerCase())
      );

      if (!bestMatch) {
        bestMatch = results[0];
      }

      if (bestMatch) {
        const result = {
          title: bestMatch.trackName || trackTitle,
          artist: bestMatch.artistName || artistName,
          album: bestMatch.collectionName || null,
        };
        
        if (bestMatch.releaseDate) {
          const yearMatch = bestMatch.releaseDate.match(/(\d{4})/);
          if (yearMatch) {
            result.year = parseInt(yearMatch[1], 10);
          }
        }
        
        console.log(`✅ iTunes: "${result.title}" - ${result.artist} (${result.album || 'sin álbum'})`);
        return result;
      }
    }
    return null;
  } catch (error) {
    console.error(`⚠️ iTunes Search falló para "${trackTitle}" de "${artistName}":`, error.message);
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
 * Busca metadatos de una canción en Spotify (título, artista, álbum, año)
 */
async function searchSpotifyMetadata(artistName, trackTitle) {
  const token = await getSpotifyToken();
  if (!token) return null;

  try {
    const query = encodeURIComponent(`track:${trackTitle} artist:${artistName}`);
    const url = `${SPOTIFY_API_URL}/search?q=${query}&type=track&limit=5`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 10000
    });

    if (response.data && response.data.tracks && response.data.tracks.items) {
      const tracks = response.data.tracks.items;
      
      // Buscar el mejor match
      let bestMatch = tracks.find(t =>
        t.name && t.artists &&
        t.name.toLowerCase().includes(trackTitle.toLowerCase()) &&
        t.artists.some(a => a.name.toLowerCase().includes(artistName.toLowerCase()))
      );

      if (!bestMatch && tracks.length > 0) {
        bestMatch = tracks[0];
      }

      if (bestMatch) {
        const result = {
          title: bestMatch.name || trackTitle,
          artist: bestMatch.artists?.[0]?.name || artistName,
          album: bestMatch.album?.name || null,
        };
        
        if (bestMatch.album?.release_date) {
          const yearMatch = bestMatch.album.release_date.match(/(\d{4})/);
          if (yearMatch) {
            result.year = parseInt(yearMatch[1], 10);
          }
        }
        
        console.log(`✅ Spotify: "${result.title}" - ${result.artist} (${result.album || 'sin álbum'})`);
        return result;
      }
    }
    return null;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      spotifyAccessToken = null;
    }
    console.error(`⚠️ Spotify Search falló para "${trackTitle}":`, error.message);
    return null;
  }
}

// ====== FUNCIONES DE MUSICBRAINZ API ======

// Rate limiting - MusicBrainz requiere 1 request por segundo
let lastMusicBrainzRequest = 0;

async function musicBrainzRateLimit() {
  const now = Date.now();
  const elapsed = now - lastMusicBrainzRequest;
  if (elapsed < 1500) { // 1.5s para estar seguros
    await new Promise(resolve => setTimeout(resolve, 1500 - elapsed));
  }
  lastMusicBrainzRequest = Date.now();
}

/**
 * Busca metadatos de una canción en MusicBrainz
 * Devuelve: { title, artist, album, year } o null
 * MusicBrainz no requiere autenticación pero tiene rate limiting (1 req/s)
 */
async function searchMusicBrainz(artistName, trackTitle) {
  try {
    await musicBrainzRateLimit();
    
    // Limpiar términos de búsqueda para mejor matching
    const cleanArtist = artistName.replace(/[^a-zA-Z0-9áéíóúñüÁÉÍÓÚÑÜ\s]/g, '').trim();
    const cleanTrack = trackTitle.replace(/[^a-zA-Z0-9áéíóúñüÁÉÍÓÚÑÜ\s]/g, '').trim();
    
    if (!cleanTrack) return null;
    
    const query = `artist:"${encodeURIComponent(cleanArtist)}" AND recording:"${encodeURIComponent(cleanTrack)}"`;
    const url = `${MUSICBRAINZ_API_URL}/recording/?query=${query}&fmt=json&limit=5`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': MUSICBRAINZ_USER_AGENT,
        'Accept': 'application/json'
      },
      timeout: 10000
    });
    
    if (response.data && response.data.recordings && response.data.recordings.length > 0) {
      const recording = response.data.recordings[0];
      const result = {};
      
      // Title from recording
      result.title = recording.title || trackTitle;
      
      // Artist from first artist credit
      if (recording['artist-credit'] && recording['artist-credit'].length > 0) {
        const credit = recording['artist-credit'][0];
        result.artist = credit?.artist?.name || credit?.name || artistName;
        // Manejar " & " joins como "Artist A & Artist B"
        if (recording['artist-credit'].length > 1) {
          const fullName = recording['artist-credit']
            .map(c => c?.artist?.name || c?.name || '')
            .filter(Boolean)
            .join(' ');
          if (fullName) result.artist = fullName;
        }
      }
      
      // Album and year from first release
      if (recording.releases && recording.releases.length > 0) {
        const release = recording.releases[0];
        result.album = release.title || null;
        
        if (release.date) {
          const yearMatch = release.date.match(/(\d{4})/);
          if (yearMatch) {
            result.year = parseInt(yearMatch[1], 10);
          }
        }
        
        // Si no hay fecha en release, revisar release-events
        if (!result.year && release['release-events']) {
          for (const event of release['release-events']) {
            if (event.date) {
              const yearMatch = event.date.match(/(\d{4})/);
              if (yearMatch) {
                result.year = parseInt(yearMatch[1], 10);
                break;
              }
            }
          }
        }
      }
      
      console.log(`✅ MusicBrainz: "${result.title}" - ${result.artist} (${result.album || 'sin álbum'})`);
      return result;
    }
    return null;
  } catch (error) {
    if (error.response && error.response.status === 503) {
      console.error(`⚠️ MusicBrainz: Servicio no disponible (503)`);
    } else {
      console.error(`⚠️ MusicBrainz search falló para "${trackTitle}" de "${artistName}":`, error.message);
    }
    return null;
  }
}

// ====== FUNCIONES DE LAST.FM PARA METADATOS DE CANCIONES ======

/**
 * Busca metadatos de una canción en Last.fm (título, artista, álbum, año)
 */
async function searchLastfmMetadata(artistName, trackTitle) {
  try {
    const url = `${LASTFM_API_URL}?method=track.getInfo&artist=${encodeURIComponent(artistName)}&track=${encodeURIComponent(trackTitle)}&api_key=${LASTFM_API_KEY}&format=json`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.track) {
      const track = response.data.track;
      const result = {
        title: track.name || trackTitle,
        artist: track.artist?.name || artistName,
        album: track.album?.title || null,
      };
      
      // Intentar obtener año de diferentes fuentes
      if (track.wiki?.published) {
        const yearMatch = track.wiki.published.match(/(\d{4})/);
        if (yearMatch) {
          result.year = parseInt(yearMatch[1], 10);
        }
      }
      
      if (!result.year && track.album?.releaseDate) {
        const yearMatch = track.album.releaseDate.match(/(\d{4})/);
        if (yearMatch) {
          result.year = parseInt(yearMatch[1], 10);
        }
      }
      
      console.log(`✅ Last.fm: "${result.title}" - ${result.artist} (${result.album || 'sin álbum'})`);
      return result;
    }
    return null;
  } catch (error) {
    console.error(`⚠️ Last.fm search falló para "${trackTitle}" de "${artistName}":`, error.message);
    return null;
  }
}

// ====== FUNCIÓN UNIFICADA DE BÚSQUEDA DE METADATOS ======

/**
 * Función para buscar metadatos de una canción con cadena de fallbacks:
 * Shazam → AudD.io → iTunes → Spotify → MusicBrainz → Last.fm
 * 
 * Si se proporciona audioBuffer, primero envía el audio a Shazam y AudD.io.
 * Luego busca por nombre en iTunes, Spotify, MusicBrainz y Last.fm.
 * Cada fuente se consulta en orden hasta encontrar datos.
 * Devuelve: { title, artist, album, year }
 */
async function getSongMetadataWithFallback(artistName, trackTitle, albumName, audioBuffer, originalFilename) {
  console.log(`\n🔍 Buscando metadatos para "${trackTitle}" de "${artistName}"...`);
  
  // Metadata inicial (lo que ya tenemos)
  let metadata = {
    title: trackTitle || null,
    artist: artistName || null,
    album: albumName || null,
    year: null
  };

  // ====== 1. INTENTAR CON SHAZAM (envío de audio) ======
  if (audioBuffer && RAPIDAPI_KEY) {
    console.log(`\n🎵 1. ✅ Enviando audio a Shazam (RapidAPI) para identificar la canción...`);
    console.log(`   📤 Tamaño del audio: ${(audioBuffer.length / 1024).toFixed(1)} KB`);
    try {
      const shazamResponse = await axios({
        method: 'POST',
        url: `https://${SHAZAM_API_HOST}/v1/records/auto`,
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': SHAZAM_API_HOST,
          'Content-Type': 'application/octet-stream',
        },
        data: audioBuffer,
        timeout: 15000,
      });

      if (shazamResponse.data && shazamResponse.data.track) {
        const track = shazamResponse.data.track;
        const shazamResult = {
          title: track.title || trackTitle,
          artist: track.subtitle || artistName,
          album: null,
          year: null
        };

        // Intentar obtener año de la sección de release
        if (track.sections) {
          const releaseSection = track.sections.find(s => s.type === 'RELEASE');
          if (releaseSection && releaseSection.metapages) {
            const yearMeta = releaseSection.metapages.find(m => m.title === 'Released');
            if (yearMeta && yearMeta.text) {
              const yearMatch = yearMeta.text.match(/(\d{4})/);
              if (yearMatch) shazamResult.year = parseInt(yearMatch[1], 10);
            }
          }
        }

        console.log(`   ✅ Shazam reconoció: "${shazamResult.title}" - ${shazamResult.artist}`);
        return { ...metadata, ...shazamResult };
      } else {
        console.log(`   ⚠️ Shazam no reconoció la canción`);
      }
    } catch (err) {
      console.error(`   ⚠️ Error con Shazam API:`, err.response?.data?.message || err.message);
    }
  } else if (!RAPIDAPI_KEY) {
    console.log(`\n🎵 1. ⚠️ RAPIDAPI_KEY no configurada, saltando Shazam`);
  } else if (!audioBuffer) {
    console.log(`\n🎵 1. ⚠️ No hay buffer de audio disponible, saltando Shazam`);
  }

  // ====== 2. INTENTAR CON AUDD.IO (envío de audio) ======
  if (audioBuffer && AUDD_API_KEY) {
    console.log(`\n🎶 2. ✅ Enviando audio a AudD.io para identificar la canción...`);
    console.log(`   📤 Tamaño del audio: ${(audioBuffer.length / 1024).toFixed(1)} KB`);
    try {
      const FormData = require('form-data');
      const form = new FormData();
      form.append('api_token', AUDD_API_KEY);
      form.append('audio', audioBuffer, {
        filename: originalFilename || 'audio.mp3',
        contentType: 'audio/mpeg',
      });
      form.append('return', 'spotify,apple_music');

      const auddResponse = await axios({
        method: 'POST',
        url: 'https://api.audd.io/',
        headers: form.getHeaders(),
        data: form,
        timeout: 15000,
      });

      if (auddResponse.data && auddResponse.data.result) {
        const result = auddResponse.data.result;
        const auddResult = {
          title: result.title || trackTitle,
          artist: result.artist || artistName,
          album: result.album || null,
          year: result.release_date ? parseInt(result.release_date.match(/(\d{4})/)?.[1], 10) || null : null
        };
        console.log(`   ✅ AudD reconoció: "${auddResult.title}" - ${auddResult.artist}`);
        return { ...metadata, ...auddResult };
      } else {
        console.log(`   ⚠️ AudD no reconoció la canción`);
      }
    } catch (err) {
      console.error(`   ⚠️ Error con AudD API:`, err.response?.data?.message || err.message);
    }
  } else if (!AUDD_API_KEY) {
    console.log(`\n🎶 2. ⚠️ AUDD_API_KEY no configurada, saltando AudD.io`);
  } else if (!audioBuffer) {
    console.log(`\n🎶 2. ⚠️ No hay buffer de audio disponible, saltando AudD.io`);
  }

  // ====== 3. INTENTAR CON ITUNES (búsqueda por nombre) ======
  console.log(`\n📱 3. Buscando en iTunes...`);
  const itunes = await searchiTunesMetadata(artistName, trackTitle);
  if (itunes && itunes.title) {
    metadata = { ...metadata, ...itunes };
    console.log(`✅ Metadatos encontrados en iTunes`);
    return metadata;
  }
  console.log(`⚠️ No encontrado en iTunes`);

  // ====== 4. INTENTAR CON SPOTIFY (búsqueda por nombre) ======
  console.log(`\n🟢 4. Buscando en Spotify...`);
  const spotify = await searchSpotifyMetadata(artistName, trackTitle);
  if (spotify && spotify.title) {
    metadata = { ...metadata, ...spotify };
    console.log(`✅ Metadatos encontrados en Spotify`);
    return metadata;
  }
  console.log(`⚠️ No encontrado en Spotify`);

  // ====== 5. INTENTAR CON MUSICBRAINZ (búsqueda por nombre) ======
  console.log(`\n🧠 5. Buscando en MusicBrainz...`);
  const musicbrainz = await searchMusicBrainz(artistName, trackTitle);
  if (musicbrainz && musicbrainz.title) {
    metadata = { ...metadata, ...musicbrainz };
    console.log(`✅ Metadatos encontrados en MusicBrainz`);
    return metadata;
  }
  console.log(`⚠️ No encontrado en MusicBrainz`);

  // ====== 6. INTENTAR CON LAST.FM (búsqueda por nombre, último recurso) ======
  console.log(`\n🎵 6. Buscando en Last.fm...`);
  const lastfm = await searchLastfmMetadata(artistName, trackTitle);
  if (lastfm && lastfm.title) {
    metadata = { ...metadata, ...lastfm };
    console.log(`✅ Metadatos encontrados en Last.fm`);
    return metadata;
  }

  console.log(`❌ No se encontraron metadatos en ninguna fuente`);
  return metadata;
}

// ====== IMAGEN DE FALLBACK (ESTRELLA) ======

/**
 * Nombre del archivo de imagen de fallback (estrella)
 * Debe existir en las carpetas album_art y artist_art
 */
const FALLBACK_IMAGE_FILENAME = 'estrella.jpg';

/**
 * Ruta completa a la imagen de fallback para álbum
 */
function getFallbackAlbumImagePath() {
  return path.join(ALBUM_ART_DIR, FALLBACK_IMAGE_FILENAME);
}

/**
 * Ruta completa a la imagen de fallback para artista
 */
function getFallbackArtistImagePath() {
  return path.join(ARTIST_ART_DIR, FALLBACK_IMAGE_FILENAME);
}

/**
 * URL pública de la imagen de fallback para álbum
 */
function getFallbackAlbumImageUrl() {
  return `/songs/album_art/${encodeURIComponent(FALLBACK_IMAGE_FILENAME)}`;
}

/**
 * URL pública de la imagen de fallback para artista
 */
function getFallbackArtistImageUrl() {
  return `/songs/artist_art/${encodeURIComponent(FALLBACK_IMAGE_FILENAME)}`;
}

/**
 * Verifica si un valor de metadata es válido (no es "Desconocido" ni está vacío)
 */
function isValidMetadata(value) {
  return value && value !== "Desconocido" && value !== "" && value !== null;
}

/**
 * Obtiene el nombre de archivo normalizado para la imagen de un artista
 * Ej: "Bad Bunny" → "bad_bunny_artist.jpg"
 */
function getArtistImageFilename(artistName) {
  const sanitized = sanitizeFilename(artistName.toLowerCase());
  return `${sanitized}_artist.jpg`;
}

/**
 * Obtiene la ruta completa a la imagen de un artista por nombre
 */
function getArtistImagePath(artistName) {
  return path.join(ARTIST_ART_DIR, getArtistImageFilename(artistName));
}

/**
 * Obtiene la URL pública de la imagen de un artista por nombre
 */
function getArtistImageUrl(artistName) {
  return `/songs/artist_art/${encodeURIComponent(getArtistImageFilename(artistName))}`;
}

// ====== FUNCIÓN UNIFICADA DE BÚSQUEDA DE IMÁGENES ======

/**
 * Función para obtener imagen de álbum con cadena de fallbacks:
 * iTunes → Spotify → estrella.jpg
 * 
 * Si el álbum o artista son "Desconocido", salta directamente a estrella.jpg
 * NOTA: Last.fm solo se usa para búsqueda de metadatos, no para imágenes
 */
async function getAlbumImageWithFallback(albumName, artistName) {
  // Si los datos no son válidos, no buscar en APIs externas
  if (!isValidMetadata(albumName) || !isValidMetadata(artistName)) {
    console.log(`⚠️ Datos de álbum/artista no válidos ("${albumName}" / "${artistName}"), usando imagen de fallback`);
    if (fs.existsSync(getFallbackAlbumImagePath())) {
      return { imageUrl: getFallbackAlbumImageUrl(), source: 'fallback' };
    }
    return { imageUrl: null, source: null };
  }

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

  // 3. Fallback a estrella.jpg
  console.log(`❌ No se encontró portada en APIs, usando imagen de fallback...`);
  if (fs.existsSync(getFallbackAlbumImagePath())) {
    console.log(`✅ Usando imagen de fallback: ${FALLBACK_IMAGE_FILENAME}`);
    return { imageUrl: getFallbackAlbumImageUrl(), source: 'fallback' };
  }

  console.log(`❌ No se encontró imagen de fallback (${FALLBACK_IMAGE_FILENAME})`);
  return { imageUrl: null, source: null };
}

/**
 * Función para obtener imagen de artista con cadena de fallbacks:
 * iTunes → Spotify → estrella.jpg
 * 
 * Reutiliza imágenes ya descargadas del artista (por nombre).
 * Si el artista es "Desconocido", salta directamente a estrella.jpg
 * NOTA: Last.fm solo se usa para búsqueda de metadatos, no para imágenes
 */
async function getArtistImageWithFallback(artistName) {
  // Si los datos no son válidos, no buscar en APIs externas
  if (!isValidMetadata(artistName)) {
    console.log(`⚠️ Artista no válido ("${artistName}"), usando imagen de fallback`);
    if (fs.existsSync(getFallbackArtistImagePath())) {
      return { imageUrl: getFallbackArtistImageUrl(), source: 'fallback' };
    }
    return { imageUrl: null, source: null };
  }

  // Verificar si ya existe una imagen para este artista (reutilizar)
  const existingArtistImagePath = getArtistImagePath(artistName);
  if (fs.existsSync(existingArtistImagePath)) {
    console.log(`✅ Imagen de artista reutilizada: "${artistName}"`);
    return { imageUrl: getArtistImageUrl(artistName), source: 'cached' };
  }

  console.log(`🔍 Buscando imagen del artista "${artistName}"...`);

  // 1. Intentar iTunes (no requiere autenticación, rápido)
  const itunesImage = await getArtistImageFromiTunes(artistName);
  if (itunesImage) {
    console.log(`✅ Imagen de artista encontrada en iTunes`);
    return { imageUrl: itunesImage, source: 'itunes', cacheAsArtistImage: artistName };
  }

  // 2. Intentar Spotify
  console.log(`⚠️ No encontrado en iTunes, probando Spotify...`);
  const spotifyImage = await getArtistImageFromSpotify(artistName);
  if (spotifyImage) {
    console.log(`✅ Imagen de artista encontrada en Spotify`);
    return { imageUrl: spotifyImage, source: 'spotify', cacheAsArtistImage: artistName };
  }

  // 3. Fallback a estrella.jpg
  console.log(`❌ No se encontró imagen del artista en APIs, usando imagen de fallback...`);
  if (fs.existsSync(getFallbackArtistImagePath())) {
    console.log(`✅ Usando imagen de fallback: ${FALLBACK_IMAGE_FILENAME}`);
    return { imageUrl: getFallbackArtistImageUrl(), source: 'fallback' };
  }
  
  console.log(`❌ No se encontró imagen de fallback (${FALLBACK_IMAGE_FILENAME})`);
  return { imageUrl: null, source: null };
}

// ====== FUNCIÓN DE DESCARGA DE IMÁGENES ======

/**
 * Descarga una imagen desde una URL y la guarda en el destino especificado.
 * Usa axios para manejar redirects automáticamente.
 * Verifica que el contenido descargado sea una imagen válida.
 */
const downloadImageToFolder = async (imageUrl, destFolder, filename) => {
  if (!imageUrl) {
    throw new Error('URL de imagen vacía');
  }
  
  if (!fs.existsSync(destFolder)) {
    fs.mkdirSync(destFolder, { recursive: true });
  }
  
  const dest = path.join(destFolder, filename);
  
  try {
    // Usar axios con responseType stream para manejar redirects automáticamente
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'stream',
      timeout: 20000,
      headers: {
        'User-Agent': 'MusicPlayer/1.0',
        'Accept': 'image/webp,image/jpeg,image/png,image/gif,*/*'
      }
    });

    // Verificar que el content-type sea una imagen
    const contentType = response.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) {
      // Consumir el stream para liberar la conexión
      response.data.resume();
      throw new Error(`El contenido no es una imagen: ${contentType}`);
    }

    const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
    let downloadedBytes = 0;

    const writer = fs.createWriteStream(dest);
    
    response.data.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      if (totalBytes > 0 && downloadedBytes % Math.max(1, Math.floor(totalBytes / 10)) < chunk.length) {
        const progress = Math.min(100, ((downloadedBytes / totalBytes) * 100).toFixed(0));
        console.log(`📥 Descargando ${filename}: ${progress}%`);
      }
    });

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', () => {
        writer.close();
        
        // Verificar que el archivo no esté vacío y tenga al menos algunos bytes
        const stats = fs.statSync(dest);
        if (stats.size < 100) {
          fs.unlinkSync(dest);
          reject(new Error(`Archivo descargado demasiado pequeño (${stats.size} bytes), posiblemente inválido`));
          return;
        }
        
        console.log(`✅ Imagen guardada: ${filename} (${(downloadedBytes / 1024).toFixed(1)} KB)`);
        resolve(dest);
      });
      writer.on('error', (err) => {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
    });

    return dest;
  } catch (error) {
    // Limpiar archivo si existe
    if (fs.existsSync(dest)) {
      try { fs.unlinkSync(dest); } catch (e) { /* ignore */ }
    }
    throw new Error(`Error al descargar imagen: ${error.message}`);
  }
};

// ====== FUNCIÓN AUXILIAR ======

/**
 * Limpia un string para usarlo como nombre de archivo
 * Reemplaza caracteres no válidos en Windows: <>:"/\\|?*
 */
function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'unknown';
  // Reemplazar caracteres no permitidos en nombres de archivo
  let clean = name.replace(/[<>:"/\\|?*]/g, '_');
  // Reemplazar múltiples guiones bajos por uno solo
  clean = clean.replace(/_+/g, '_');
  // Eliminar espacios al inicio y final
  clean = clean.trim();
  // Si queda vacío, retornar 'unknown'
  if (!clean || clean.length === 0) return 'unknown';
  // Limitar longitud máxima (60 chars para mantener nombre legible)
  if (clean.length > 60) {
    clean = clean.substring(0, 60).trim();
  }
  return clean;
}

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
    } else if (fs.existsSync(getFallbackAlbumImagePath())) {
      imageUrl = getFallbackAlbumImageUrl();
    } else if (fs.existsSync(getFallbackArtistImagePath())) {
      imageUrl = getFallbackArtistImageUrl();
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

// PUT: Sincronizar metadatos con Shazam → AudD.io → iTunes → Spotify → MusicBrainz → Last.fm
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

    // ====== 1. BUSCAR METADATOS con cadena de fallback: Shazam → AudD.io → iTunes → Spotify → MusicBrainz → Last.fm ======
    // Leer el buffer del archivo convertido para enviarlo a Shazam y AudD.io
    const audioBuffer = fs.readFileSync(filePath);
    console.log(`\n📤 Audio cargado: ${(audioBuffer.length / 1024).toFixed(1)} KB`);
    const metadata = await getSongMetadataWithFallback(artist, title, albumName, audioBuffer, convertedFilename);
    
    const newTitle = metadata.title || title;
    const newArtist = metadata.artist || artist;
    const newAlbum = metadata.album || albumName;
    const newYear = metadata.year || currentMetadata.common.year || null;

    console.log(`\n📝 Metadatos encontrados:`);
    console.log(`   Título:  "${newTitle}"${newTitle !== title ? ' (actualizado)' : ''}`);
    console.log(`   Artista: "${newArtist}"${newArtist !== artist ? ' (actualizado)' : ''}`);
    console.log(`   Álbum:   "${newAlbum}"${newAlbum !== albumName ? ' (actualizado)' : ''}`);
    console.log(`   Año:     ${newYear || '❌ No disponible'}`);

    // ====== 2. OBTENER INFORMACIÓN DEL ARTISTA (Last.fm para tags) ======
    const artistInfo = await getArtistInfo(newArtist);
    let tags = [];

    if (artistInfo) {
      tags = artistInfo.tags || [];
      console.log(`✅ Artista (Last.fm): ${newArtist} (${tags.slice(0, 3).join(', ')})`);
    } else {
      console.log(`⚠️ Artista no encontrado en Last.fm: ${newArtist}`);
    }

    // Si no hay tags, obtener top tags del artista
    if (tags.length === 0) {
      tags = await getArtistTags(newArtist);
      console.log(`🏷️ Tags obtenidos: ${tags.slice(0, 3).join(', ')}`);
    }

    // ====== 3. DETERMINAR GÉNEROS ======
    let genres = tags.length > 0 ? tags : ["Urbano"];
    if (genres.length === 0) genres = ["Urbano"];
    console.log(`📀 Géneros finales: ${genres.join(", ")}`);

    // ====== 4. RENOMBRAR ARCHIVO si el título cambió ======
    let renamedFilename = convertedFilename;
    if (newTitle && newTitle !== title) {
      const ext = path.extname(convertedFilename);
      const sanitizedTitle = sanitizeFilename(newTitle);
      const newFilename = `${sanitizedTitle}${ext}`;
      const newFilePath = path.join(MUSIC_DIR, newFilename);
      
      console.log(`\n📝 Renombrando archivo:`);
      console.log(`   Antes: "${convertedFilename}"`);
      console.log(`   Ahora: "${newFilename}"`);
      
      // Renombrar también las imágenes asociadas si existen
      const oldBaseName = path.parse(convertedFilename).name;
      const newBaseName = path.parse(newFilename).name;
      
      const oldAlbumImagePath = path.join(ALBUM_ART_DIR, `${oldBaseName}.jpg`);
      const newAlbumImagePath = path.join(ALBUM_ART_DIR, `${newBaseName}.jpg`);
      const oldArtistImagePath = path.join(ARTIST_ART_DIR, `${oldBaseName}_artist.jpg`);
      const newArtistImagePath = path.join(ARTIST_ART_DIR, `${newBaseName}_artist.jpg`);
      
      // Renombrar imágenes de álbum
      if (fs.existsSync(oldAlbumImagePath)) {
        fs.renameSync(oldAlbumImagePath, newAlbumImagePath);
        console.log(`   🖼️  Imagen de álbum renombrada`);
      }
      
      // Renombrar imágenes de artista
      if (fs.existsSync(oldArtistImagePath)) {
        fs.renameSync(oldArtistImagePath, newArtistImagePath);
        console.log(`   🖼️  Imagen de artista renombrada`);
      }
      
      // Renombrar el archivo de música
      fs.renameSync(filePath, newFilePath);
      console.log(`   ✅ Archivo renombrado correctamente`);
      
      renamedFilename = newFilename;
    }

    // ====== 5. PREPARAR TAGS ID3 ======
    const currentBaseName = path.parse(renamedFilename).name;
    const tagsID3 = {
      title: newTitle,
      artist: newArtist,
      genre: genres.join(" / "),
      album: newAlbum
    };
    
    if (newYear) {
      tagsID3.year = newYear;
    }

    // ====== 6. OBTENER IMÁGENES CON CADENA DE FALLBACK ======
    let hasAlbumImage = false;
    let hasArtistImage = false;
    let albumImageSource = null;
    let artistImageSource = null;

    // 6a. Buscar portada del álbum (iTunes → Spotify → Last.fm)
    const albumResult = await getAlbumImageWithFallback(newAlbum, newArtist);
    let albumImageUrl = albumResult.imageUrl;
    albumImageSource = albumResult.source;

    if (albumImageUrl) {
      try {
        const albumFilename = `${currentBaseName}.jpg`;
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

    // 6b. Si no hay portada, buscar imagen del artista como fallback
    if (!hasAlbumImage) {
      console.log(`🔍 No hay portada, buscando imagen del artista como alternativa...`);
      const artistResult = await getArtistImageWithFallback(newArtist);
      const artistImageUrl = artistResult.imageUrl;
      artistImageSource = artistResult.source;

      if (artistImageUrl) {
        try {
          // Guardar la imagen con el nombre normalizado del artista para reutilizarla
          const normalizedFilename = getArtistImageFilename(newArtist);
          await downloadImageToFolder(artistImageUrl, ARTIST_ART_DIR, normalizedFilename);
          hasArtistImage = true;
          console.log(`✅ Foto del artista guardada como "${normalizedFilename}" desde ${artistImageSource}`);
          
          // También guardar una copia con el nombre del archivo actual para compatibilidad
          const localFilename = `${currentBaseName}_artist.jpg`;
          if (localFilename !== normalizedFilename) {
            const normalizedPath = path.join(ARTIST_ART_DIR, normalizedFilename);
            const localPath = path.join(ARTIST_ART_DIR, localFilename);
            if (fs.existsSync(normalizedPath)) {
              fs.copyFileSync(normalizedPath, localPath);
            }
          }
          
          // Incrustar imagen del artista en el MP3 como portada
          const artistImagePath = path.join(ARTIST_ART_DIR, normalizedFilename);
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

    // ====== 7. ESCRIBIR TAGS EN EL ARCHIVO ======
    const success = NodeID3.write(tagsID3, path.join(MUSIC_DIR, renamedFilename));
    if (!success) {
      return res.status(500).json({ error: 'Error al escribir tags.' });
    }

    // ====== 8. SINCRONIZAR BASE DE DATOS ======
    await syncDatabase();

    res.json({
      message: '✅ Sincronización completada (Shazam → AudD.io → iTunes → Spotify → MusicBrainz → Last.fm)',
      updatedSong: {
        filename: renamedFilename,
        title: newTitle,
        artist: newArtist,
        album: newAlbum,
        year: newYear,
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

// ====== ENDPOINT: RECONOCIMIENTO DE MÚSICA (SHAZAM) ======

/**
 * POST /api/recognize
 * Recibe un fragmento de audio y lo envía a Shazam/AudD para identificar la canción.
 * Luego busca una coincidencia en la biblioteca local.
 * 
 * Body: multipart/form-data con campo "audio"
 * Response: { recognized: { title, artist, album, imageUrl }, matchedTrack: {...} | null }
 */
app.post('/api/recognize', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se envió ningún archivo de audio.' });
  }

  console.log(`\n🎤 Reconocimiento de audio: ${req.file.originalname} (${(req.file.buffer.length / 1024).toFixed(1)} KB, mimetype: ${req.file.mimetype})`);

  let recognized = null;

  // ====== 1. INTENTAR CON SHAZAM (RapidAPI) ======
  if (RAPIDAPI_KEY) {
    try {
      console.log(`\n🔍 Intentando reconocer con Shazam (RapidAPI)...`);
      const shazamResponse = await axios({
        method: 'POST',
        url: `https://${SHAZAM_API_HOST}/v1/records/auto`,
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': SHAZAM_API_HOST,
          'Content-Type': 'application/octet-stream',
        },
        data: req.file.buffer,
        timeout: 15000,
      });

      if (shazamResponse.data && shazamResponse.data.track) {
        const track = shazamResponse.data.track;
        const title = track.title || null;
        const artist = track.subtitle || null;
        let imageUrl = null;
        if (track.images && track.images.coverart) {
          imageUrl = track.images.coverart;
        } else if (track.sections) {
          const imageSection = track.sections.find(s => s.type === 'SONG' || s.type === 'SPOTIFY');
          if (imageSection && imageSection.metaurl) {
            imageUrl = imageSection.metaurl;
          }
        }

        recognized = { title, artist, album: null, imageUrl };
        console.log(`✅ Shazam reconoció: "${title}" - ${artist}`);
      } else {
        console.log(`⚠️ Shazam no reconoció la canción`);
      }
    } catch (err) {
      console.error(`⚠️ Error con Shazam API:`, err.response?.data || err.message);
    }
  } else {
    console.log(`⚠️ RAPIDAPI_KEY no configurada, saltando Shazam`);
  }

  // ====== 2. INTENTAR CON AUDD.IO (fallback) ======
  if (!recognized && AUDD_API_KEY) {
    try {
      console.log(`\n🔍 Intentando reconocer con AudD.io...`);
      const FormData = require('form-data');
      const form = new FormData();
      form.append('api_token', AUDD_API_KEY);
      form.append('audio', req.file.buffer, {
        filename: req.file.originalname || 'audio.webm',
        contentType: req.file.mimetype || 'audio/webm',
      });
      form.append('return', 'spotify,apple_music');

      const auddResponse = await axios({
        method: 'POST',
        url: 'https://api.audd.io/',
        headers: form.getHeaders(),
        data: form,
        timeout: 15000,
      });

      if (auddResponse.data && auddResponse.data.result) {
        const result = auddResponse.data.result;
        recognized = {
          title: result.title || null,
          artist: result.artist || null,
          album: result.album || null,
          imageUrl: result.spotify?.album?.images?.[0]?.url || result.apple_music?.artwork?.url?.replace('{w}', '600').replace('{h}', '600') || null,
        };
        console.log(`✅ AudD reconoció: "${recognized.title}" - ${recognized.artist}`);
      } else {
        console.log(`⚠️ AudD no reconoció la canción`);
      }
    } catch (err) {
      console.error(`⚠️ Error con AudD API:`, err.response?.data || err.message);
    }
  } else if (!recognized) {
    console.log(`⚠️ AUDD_API_KEY no configurada, saltando AudD`);
  }

  // ====== 3. BUSCAR COINCIDENCIA EN BIBLIOTECA LOCAL ======
  let matchedTrack = null;
  if (recognized && recognized.title) {
    try {
      if (!fs.existsSync(DB_PATH)) {
        await syncDatabase();
      }
      const songs = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      
      const normalize = (str) => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const recTitle = normalize(recognized.title);
      const recArtist = normalize(recognized.artist);

      // Buscar por título y artista
      matchedTrack = songs.find(s => {
        const sTitle = normalize(s.title);
        const sArtist = normalize(s.artist);
        return (sTitle.includes(recTitle) || recTitle.includes(sTitle)) &&
               (sArtist.includes(recArtist) || recArtist.includes(sArtist));
      });

      // Si no hay match exacto, buscar solo por título
      if (!matchedTrack) {
        matchedTrack = songs.find(s => {
          const sTitle = normalize(s.title);
          return sTitle.includes(recTitle) || recTitle.includes(sTitle);
        });
      }

      if (matchedTrack) {
        console.log(`✅ Coincidencia encontrada en biblioteca: "${matchedTrack.title}" - ${matchedTrack.artist}`);
      } else {
        console.log(`ℹ️ No se encontró coincidencia en la biblioteca local`);
      }
    } catch (err) {
      console.error(`Error buscando en biblioteca:`, err.message);
    }
  }

  res.json({
    recognized,
    matchedTrack: matchedTrack ? {
      id: matchedTrack.filename,
      title: matchedTrack.title,
      artist: matchedTrack.artist,
      album: matchedTrack.album,
      filename: matchedTrack.filename,
      cover: matchedTrack.imageUrl ? `${req.protocol}://${req.get('host')}${matchedTrack.imageUrl}` : undefined,
    } : null,
  });
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
  console.log(`🧠 MusicBrainz API: ✅ Sin autenticación requerida`);
  console.log(`\n📋 Endpoints disponibles:`);
  console.log(`   GET  /api/songs        - Listar canciones`);
  console.log(`   GET  /api/genres       - Listar géneros`);
  console.log(`   GET  /api/albums       - Listar álbumes`);
  console.log(`   GET  /api/artists      - Listar artistas`);
  console.log(`   POST /api/sync-db      - Sincronizar base de datos`);
  console.log(`   PUT  /api/songs/sync-metadata - Sincronizar con Shazam → AudD.io → iTunes → Spotify → MusicBrainz → Last.fm`);
  console.log(`   PUT  /api/songs/local-metadata - Editar metadatos`);
  console.log(`   DELETE /api/songs      - Eliminar canción`);
  console.log(`   POST /api/recognize    - Reconocer canción (Shazam/AudD)`);
  console.log(`🔑 Shazam API: ${RAPIDAPI_KEY ? '✅ Configurada' : '❌ No configurada'}`);
  console.log(`🔑 AudD.io API: ${AUDD_API_KEY ? '✅ Configurada' : '❌ No configurada'}`);
  console.log(`\n✅ Servidor listo! 🚀`);
});