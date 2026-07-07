/**
 * ============================================================
 * LYRICS - BÚSQUEDA DE LETRAS DE CANCIONES
 * ============================================================
 * 
 * Busca letras en múltiples fuentes (Genius, AZLyrics, etc.)
 * y almacena en caché para futuras consultas.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LYRICS_CACHE_PATH = path.join(__dirname, 'lyrics_cache.json');
const CACHE_EXPIRY_DAYS = 30;

// ============================================================
// GESTIÓN DE CACHÉ
// ============================================================

function loadCache() {
  try {
    if (fs.existsSync(LYRICS_CACHE_PATH)) {
      const data = fs.readFileSync(LYRICS_CACHE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('[lyrics] Error cargando caché:', err.message);
  }
  return {};
}

function saveCache(cache) {
  try {
    fs.writeFileSync(LYRICS_CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.warn('[lyrics] Error guardando caché:', err.message);
  }
}

// ============================================================
// LIMPIAR CACHÉ ANTIGUO
// ============================================================

function cleanOldCache() {
  const cache = loadCache();
  let cleaned = false;
  const now = Date.now();
  const maxAge = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  
  for (const [key, entry] of Object.entries(cache)) {
    if (now - entry.timestamp > maxAge) {
      delete cache[key];
      cleaned = true;
    }
  }
  
  if (cleaned) {
    saveCache(cache);
    console.log('[lyrics] 🧹 Caché limpiado (entradas expiradas)');
  }
}

// ============================================================
// BUSCAR LETRAS EN API EXTERNAS
// ============================================================

async function searchLyrics(title, artist) {
  console.log('[lyrics] 🔍 Buscando:', artist, '-', title);
  
  // ============================================================
  // FUENTE 1: API de Genius (requiere token)
  // ============================================================
  // Nota: Necesitas registrarte en https://genius.com/api-clients
  // y obtener un token de acceso.
  
  const GENIUS_ACCESS_TOKEN = process.env.GENIUS_ACCESS_TOKEN || '';
  
  if (GENIUS_ACCESS_TOKEN) {
    try {
      // Buscar canción en Genius
      const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(title + ' ' + artist)}`;
      const response = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const hits = data.response?.hits || [];
        
        if (hits.length > 0) {
          // Tomar el primer resultado
          const songPath = hits[0].result?.path;
          if (songPath) {
            // Scrapear la letra de la página de Genius
            const lyrics = await scrapeGeniusLyrics(songPath);
            if (lyrics) {
              return lyrics;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[lyrics] Error en Genius:', err.message);
    }
  }
  
  // ============================================================
  // FUENTE 2: API de Lyrics.ovh (gratuita, sin token)
  // ============================================================
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json();
      if (data.lyrics) {
        return data.lyrics;
      }
    }
  } catch (err) {
    console.warn('[lyrics] Error en Lyrics.ovh:', err.message);
  }
  
  // ============================================================
  // FUENTE 3: API de Musixmatch (requiere token)
  // ============================================================
  const MUSIXMATCH_API_KEY = process.env.MUSIXMATCH_API_KEY || '';
  
  if (MUSIXMATCH_API_KEY) {
    try {
      // Buscar track ID
      const searchUrl = `https://api.musixmatch.com/ws/1.1/track.search?q_track=${encodeURIComponent(title)}&q_artist=${encodeURIComponent(artist)}&apikey=${MUSIXMATCH_API_KEY}&format=json`;
      const response = await fetch(searchUrl);
      
      if (response.ok) {
        const data = await response.json();
        const tracks = data.message?.body?.track_list || [];
        
        if (tracks.length > 0) {
          const trackId = tracks[0].track?.track_id;
          if (trackId) {
            // Obtener letra por track ID
            const lyricsUrl = `https://api.musixmatch.com/ws/1.1/track.lyrics.get?track_id=${trackId}&apikey=${MUSIXMATCH_API_KEY}&format=json`;
            const lyricsResponse = await fetch(lyricsUrl);
            
            if (lyricsResponse.ok) {
              const lyricsData = await lyricsResponse.json();
              const lyrics = lyricsData.message?.body?.lyrics?.lyrics_body;
              if (lyrics && lyrics !== '') {
                return lyrics;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[lyrics] Error en Musixmatch:', err.message);
    }
  }
  
  return null;
}

// ============================================================
// SCRAPEADOR DE GENIUS (simple)
// ============================================================

async function scrapeGeniusLyrics(songPath) {
  try {
    const url = `https://genius.com${songPath}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const html = await response.text();
      
      // Extraer letras usando regex (simple)
      // Buscar el contenedor de letras de Genius
      const match = html.match(/<div[^>]*class="lyrics"[^>]*>([\s\S]*?)<\/div>/);
      if (match) {
        let lyrics = match[1];
        // Limpiar HTML básico
        lyrics = lyrics.replace(/<br\s*\/?>/gi, '\n');
        lyrics = lyrics.replace(/<[^>]+>/g, '');
        lyrics = lyrics.replace(/&quot;/g, '"');
        lyrics = lyrics.replace(/&amp;/g, '&');
        lyrics = lyrics.replace(/&lt;/g, '<');
        lyrics = lyrics.replace(/&gt;/g, '>');
        lyrics = lyrics.trim();
        
        if (lyrics.length > 50) {
          return lyrics;
        }
      }
    }
  } catch (err) {
    console.warn('[lyrics] Error scraping Genius:', err.message);
  }
  return null;
}

// ============================================================
// TRADUCIR LETRAS (usando API gratuita)
// ============================================================

async function translateLyrics(text, targetLang = 'es') {
  try {
    // Usar la API de MyMemory (gratuita)
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json();
      if (data.responseData?.translatedText) {
        return data.responseData.translatedText;
      }
    }
  } catch (err) {
    console.warn('[lyrics] Error traduciendo:', err.message);
  }
  return null;
}

// ============================================================
// FUNCIÓN PRINCIPAL - OBTENER LETRA
// ============================================================

export async function getLyrics(songId, title, artist) {
  // Cargar caché
  const cache = loadCache();
  const cacheKey = songId;
  
  // Verificar si está en caché
  if (cache[cacheKey]) {
    console.log('[lyrics] 📦 Letra desde caché');
    return cache[cacheKey];
  }
  
  // Buscar letras
  let lyrics = await searchLyrics(title, artist);
  let translatedLyrics = null;
  
  // Intentar traducir si hay letras y no están en español
  if (lyrics) {
    // Detectar si el texto parece estar en español (simple)
    const spanishWords = ['el', 'la', 'los', 'las', 'que', 'en', 'y', 'a', 'de', 'por', 'con', 'sin', 'para', 'como', 'más', 'menos', 'sí', 'no', 'yo', 'tú', 'él', 'ella', 'nosotros', 'vosotros', 'ellos'];
    const words = lyrics.toLowerCase().split(/\s+/);
    let spanishCount = 0;
    for (const word of words) {
      if (spanishWords.includes(word)) {
        spanishCount++;
      }
    }
    const spanishRatio = spanishCount / words.length;
    
    // Si el texto no parece español, traducir
    if (spanishRatio < 0.03 && words.length > 10) {
      console.log('[lyrics] 🌐 Traduciendo al español...');
      translatedLyrics = await translateLyrics(lyrics);
    }
  }
  
  // Guardar en caché
  const entry = {
    lyrics,
    translatedLyrics,
    title,
    artist,
    timestamp: Date.now()
  };
  
  cache[cacheKey] = entry;
  saveCache(cache);
  
  console.log('[lyrics] ✅ Letra guardada en caché');
  return entry;
}

// ============================================================
// EXPORTAR
// ============================================================

export { loadCache, saveCache, cleanOldCache };