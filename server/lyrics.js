/**
 * ============================================================
 * LYRICS - BÚSQUEDA DE LETRAS DE CANCIONES
 * ============================================================
 * 
 * Busca letras en múltiples fuentes gratuitas:
 * - Genius (requiere token)
 * - Lyrics.ovh (gratuita)
 * - LRCLib.net (gratuita, sincronizadas con timestamps)
 * - AZLyrics (scraping gratuito)
 * - Lyrics.com (scraping gratuito)
 * 
 * Las letras se guardan como archivos .lrc junto a la canción
 * y se cachean en memoria para acceso rápido.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LYRICS_CACHE_PATH = path.join(__dirname, 'lyrics_cache.json');
const CACHE_EXPIRY_DAYS = 30;

// ============================================================
// GESTIÓN DE CACHÉ JSON (caché secundario)
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
// ARCHIVOS .lrc JUNTO A LA CANCIÓN
// ============================================================

/**
 * Obtiene la ruta del archivo .lrc a partir de la ruta de la canción.
 */
function getLrcPath(songPath) {
  const dir = path.dirname(songPath);
  const basename = path.basename(songPath, path.extname(songPath));
  return path.join(dir, basename + '.lrc');
}

/**
 * Lee un archivo .lrc existente junto a la canción.
 * Retorna null si no existe.
 */
function readLrcFile(songPath) {
  try {
    const lrcPath = getLrcPath(songPath);
    if (fs.existsSync(lrcPath)) {
      const content = fs.readFileSync(lrcPath, 'utf8');
      return content;
    }
  } catch (err) {
    console.warn('[lyrics] Error leyendo .lrc:', err.message);
  }
  return null;
}

/**
 * Guarda un archivo .lrc junto a la canción.
 * Guarda tanto la letra plana como la sincronizada.
 */
function saveLrcFile(songPath, plainLyrics, syncedContent) {
  try {
    const lrcPath = getLrcPath(songPath);
    let content = '';
    
    // Si hay letras sincronizadas (formato LRC de LRCLib), guardarlas directamente
    if (syncedContent) {
      content = syncedContent;
    } else if (plainLyrics) {
      // Si solo hay letra plana, guardarla línea por línea sin timestamps
      content = plainLyrics;
    } else {
      return;
    }
    
    // Añadir metadatos al principio
    const metadataLines = [];
    if (content.startsWith('[')) {
      // Ya está en formato LRC, no añadir cabeceras extra
    } else {
      content = content;
    }
    
    fs.writeFileSync(lrcPath, content, 'utf8');
    console.log('[lyrics] 💾 .lrc guardado:', lrcPath);
  } catch (err) {
    console.warn('[lyrics] Error guardando .lrc:', err.message);
  }
}

// ============================================================
// PARSEAR LETRAS SINCRONIZADAS (formato LRC)
// ============================================================
// Convierte [00:12.34]Line 1 a { time: 12.34, text: "Line 1" }

function parseSyncedLyrics(syncedText) {
  if (!syncedText) return null;
  
  const lines = syncedText.split('\n').filter(line => line.trim() !== '');
  const synced = [];
  const plainLines = [];
  
  const lrcRegex = /^\[(\d{1,3}):(\d{2})\.(\d{2,3})\](.*)/;
  
  for (const line of lines) {
    const match = line.match(lrcRegex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fraction = parseInt(match[3], 10);
      const text = match[4].trim();
      
      // Convertir a segundos
      let timeInSeconds;
      if (match[3].length === 3) {
        timeInSeconds = minutes * 60 + seconds + fraction / 1000;
      } else {
        timeInSeconds = minutes * 60 + seconds + fraction / 100;
      }
      
      if (text) {
        synced.push({ time: timeInSeconds, text });
        plainLines.push(text);
      }
    } else if (line.trim()) {
      plainLines.push(line.trim());
    }
  }
  
  return {
    synced: synced.length > 0 ? synced : null,
    plain: plainLines.length > 0 ? plainLines.join('\n') : null
  };
}

// ============================================================
// UTILIDAD: limpiar HTML
// ============================================================

function stripHtml(text) {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<br\s*\/?>\n?/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/"/g, '"')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/'/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .trim();
}

// ============================================================
// BUSCAR LETRAS EN API EXTERNAS
// ============================================================

async function searchLyrics(title, artist) {
  console.log('[lyrics] 🔍 Buscando:', artist, '-', title);
  
  // ============================================================
  // FUENTE 1: API de Genius (requiere token)
  // ============================================================
  const GENIUS_ACCESS_TOKEN = process.env.GENIUS_ACCESS_TOKEN || '';
  
  if (GENIUS_ACCESS_TOKEN) {
    try {
      const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(title + ' ' + artist)}`;
      const response = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const hits = data.response?.hits || [];
        
        if (hits.length > 0) {
          const songPath = hits[0].result?.path;
          if (songPath) {
            const result = await scrapeGeniusLyrics(songPath);
            if (result) {
              return result;
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
        console.log('[lyrics] ✅ Letra encontrada en Lyrics.ovh');
        return { lyrics: data.lyrics, syncedLyrics: null };
      }
    }
  } catch (err) {
    console.warn('[lyrics] Error en Lyrics.ovh:', err.message);
  }
  
  // ============================================================
  // FUENTE 3: LRCLib.net (gratuita, sincronizadas, sin token)
  // ============================================================
  try {
    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MirepoMusicApp/2.0 (github.com/ik25061/mirepo)',
        'Accept': 'application/json',
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const plainLyrics = data.plainLyrics || null;
      const syncedLyrics = data.syncedLyrics || null;
      const lyrics = plainLyrics || syncedLyrics || null;
      if (lyrics) {
        console.log('[lyrics] ✅ Letra encontrada en LRCLib.net' + (syncedLyrics ? ' (con timestamps)' : ''));
        return { lyrics, syncedLyrics: syncedLyrics || null };
      }
    }
  } catch (err) {
    console.warn('[lyrics] Error en LRCLib.net:', err.message);
  }
  
  // ============================================================
  // FUENTE 4: AZLyrics (scraping gratuito)
  // ============================================================
  try {
    const azArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');
    const azTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (azArtist && azTitle && azArtist.length > 1 && azTitle.length > 1) {
      const url = `https://www.azlyrics.com/lyrics/${azArtist}/${azTitle}.html`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        }
      });
      
      if (response.ok) {
        const html = await response.text();
        const lyricsMatch = html.match(/<div[^>]*class="lyrics"[^>]*>([\s\S]*?)<\/div>/i);
        if (lyricsMatch) {
          const lyrics = stripHtml(lyricsMatch[1]);
          if (lyrics.length > 50) {
            console.log('[lyrics] ✅ Letra encontrada en AZLyrics');
            return { lyrics, syncedLyrics: null };
          }
        }
        
        const ringtoneMatch = html.match(/class="ringtone">[\s\S]*?<\/div>([\s\S]*?)<!--/);
        if (ringtoneMatch) {
          const lyrics = stripHtml(ringtoneMatch[1]);
          if (lyrics.length > 50) {
            console.log('[lyrics] ✅ Letra encontrada en AZLyrics (fallback)');
            return { lyrics, syncedLyrics: null };
          }
        }
      }
    }
  } catch (err) {
    console.warn('[lyrics] Error en AZLyrics:', err.message);
  }
  
  // ============================================================
  // FUENTE 5: Lyrics.com (scraping gratuito)
  // ============================================================
  try {
    const searchQuery = encodeURIComponent(`${artist} ${title}`);
    const searchUrl = `https://www.lyrics.com/lyrics/${searchQuery}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      }
    });
    
    if (response.ok) {
      const html = await response.text();
      const linkMatch = html.match(/href="(\/lyric\/[^"]+)"/);
      if (linkMatch) {
        const lyricUrl = `https://www.lyrics.com${linkMatch[1]}`;
        const lyricResponse = await fetch(lyricUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
          }
        });
        
        if (lyricResponse.ok) {
          const lyricHtml = await lyricResponse.text();
          const preMatch = lyricHtml.match(/<pre[^>]*id="lyric-body-text"[^>]*>([\s\S]*?)<\/pre>/i);
          if (preMatch) {
            const lyrics = stripHtml(preMatch[1]);
            if (lyrics.length > 30) {
              console.log('[lyrics] ✅ Letra encontrada en Lyrics.com');
              return { lyrics, syncedLyrics: null };
            }
          }
          
          const fallbackMatch = lyricHtml.match(/<pre[^>]*class="lyric-body"[^>]*>([\s\S]*?)<\/pre>/i);
          if (fallbackMatch) {
            const lyrics = stripHtml(fallbackMatch[1]);
            if (lyrics.length > 30) {
              console.log('[lyrics] ✅ Letra encontrada en Lyrics.com (fallback)');
              return { lyrics, syncedLyrics: null };
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[lyrics] Error en Lyrics.com:', err.message);
  }
  
  return null;
}

// ============================================================
// SCRAPEADOR DE GENIUS
// ============================================================

async function scrapeGeniusLyrics(songPath) {
  try {
    const url = `https://genius.com${songPath}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    
    if (response.ok) {
      const html = await response.text();
      
      // Nuevo formato (data-lyrics-container)
      const match = html.match(/<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/i);
      if (match) {
        let lyrics = match[1];
        lyrics = lyrics.replace(/<br\s*\/?>\n?/gi, '\n');
        lyrics = lyrics.replace(/<a[^>]*>[\s\S]*?<\/a>/g, '');
        lyrics = lyrics.replace(/<[^>]+>/g, '');
        lyrics = lyrics.replace(/&/g, '&');
        lyrics = lyrics.replace(/"/g, '"');
        lyrics = lyrics.replace(/&#x27;/g, "'");
        lyrics = lyrics.trim();
        if (lyrics.length > 50) return { lyrics, syncedLyrics: null };
      }
      
      // Formato antiguo (class="lyrics")
      const oldMatch = html.match(/<div[^>]*class="lyrics"[^>]*>([\s\S]*?)<\/div>/);
      if (oldMatch) {
        let lyrics = oldMatch[1];
        lyrics = lyrics.replace(/<br\s*\/?>/gi, '\n');
        lyrics = lyrics.replace(/<[^>]+>/g, '');
        lyrics = lyrics.replace(/"/g, '"');
        lyrics = lyrics.replace(/&/g, '&');
        lyrics = lyrics.replace(/</g, '<');
        lyrics = lyrics.replace(/>/g, '>');
        lyrics = lyrics.trim();
        if (lyrics.length > 50) return { lyrics, syncedLyrics: null };
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

export async function getLyrics(songId, title, artist, songPath) {
  // 1. Intentar leer desde archivo .lrc junto a la canción
  if (songPath) {
    const lrcContent = readLrcFile(songPath);
    if (lrcContent) {
      console.log('[lyrics] 📂 Letra desde .lrc local');
      const parsed = parseSyncedLyrics(lrcContent);
      // Determinar si el .lrc está en formato LRC (con timestamps) o es texto plano
      const hasTimestamps = parsed && parsed.synced && parsed.synced.length > 1;
      const plain = parsed ? parsed.plain : lrcContent;
      
      const entry = {
        lyrics: plain,
        syncedLines: hasTimestamps ? parsed.synced : null,
        translatedLyrics: null,
        title,
        artist,
        timestamp: Date.now()
      };
      return entry;
    }
  }
  
  // 2. Intentar desde caché JSON
  const cache = loadCache();
  const cacheKey = songId;
  if (cache[cacheKey]) {
    console.log('[lyrics] 📦 Letra desde caché');
    return cache[cacheKey];
  }
  
  // 3. Buscar en APIs externas
  const result = await searchLyrics(title, artist);
  let lyrics = result?.lyrics || null;
  const rawSyncedLyrics = result?.syncedLyrics || null;
  let translatedLyrics = null;
  let syncedLines = null;
  
  if (rawSyncedLyrics) {
    const parsed = parseSyncedLyrics(rawSyncedLyrics);
    if (parsed) {
      syncedLines = parsed.synced;
      if (parsed.plain && lyrics === rawSyncedLyrics) {
        lyrics = parsed.plain;
      }
    }
  }
  
  // Traducir si no parece español
  if (lyrics) {
    const spanishWords = ['el', 'la', 'los', 'las', 'que', 'en', 'y', 'a', 'de', 'por', 'con', 'sin', 'para', 'como', 'más', 'menos', 'sí', 'no', 'yo', 'tú', 'él', 'ella', 'nosotros', 'vosotros', 'ellos'];
    const words = lyrics.toLowerCase().split(/\s+/);
    let spanishCount = 0;
    for (const word of words) {
      if (spanishWords.includes(word)) {
        spanishCount++;
      }
    }
    const spanishRatio = spanishCount / words.length;
    
    if (spanishRatio < 0.03 && words.length > 10) {
      console.log('[lyrics] 🌐 Traduciendo al español...');
      translatedLyrics = await translateLyrics(lyrics);
    }
  }
  
  // 4. Guardar archivo .lrc junto a la canción
  if (lyrics && songPath) {
    saveLrcFile(songPath, lyrics, rawSyncedLyrics);
  }
  
  // 5. Guardar en caché JSON
  const entry = {
    lyrics,
    syncedLines,
    translatedLyrics,
    title,
    artist,
    timestamp: Date.now()
  };
  
  cache[cacheKey] = entry;
  saveCache(cache);
  
  console.log('[lyrics] ✅ Letra guardada' + (syncedLines ? ' (con timestamps karaoke)' : ''));
  return entry;
}

export { loadCache, saveCache, cleanOldCache };