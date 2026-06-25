import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ruta al binario fpcalc descargado
const FPCALC_PATH = path.join(__dirname, '..', 'bin', 'chromaprint-fpcalc-1.5.1-windows-x86_64', 'fpcalc.exe');

// API key pública de AcoustID (para uso personal/desarrollo)
// Para producción, registra tu propia API key en https://acoustid.org/
const ACOUSTID_API_KEY = '8XaBELgH';
const ACOUSTID_API_URL = 'https://api.acoustid.org/v2/lookup';

/**
 * Calcula la huella digital de un archivo de audio usando fpcalc.
 * @param {string} filePath - Ruta absoluta al archivo de audio
 * @returns {Promise<{fingerprint: string, duration: number} | null>}
 */
export function computeFingerprint(filePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(FPCALC_PATH)) {
      console.warn(`[acoustid] fpcalc no encontrado en: ${FPCALC_PATH}`);
      resolve(null);
      return;
    }

    // -length 100 es suficiente para fingerprinting y evita errores en archivos cortos
    const args = ['-raw', '-length', '120', filePath];
    const cp = spawn(FPCALC_PATH, args);
    
    let stdout = '';
    let stderr = '';

    cp.stdout.on('data', (data) => { stdout += data.toString(); });
    cp.stderr.on('data', (data) => { stderr += data.toString(); });

    cp.on('close', (code) => {
      // Si hay stderr con ERROR: pero exit code 0, algunos binarios de fpcalc 
      // reportan así (chromaprint bug conocido). Verificamos stdout de todas formas.
      const hasErrorStderr = stderr && stderr.trim().toUpperCase().startsWith('ERROR:');
      
      if ((code !== 0 || !stdout) && hasErrorStderr) {
        // Error real - no se pudo calcular fingerprint
        resolve(null);
        return;
      }

      // Parsear la salida de fpcalc
      const result = {};
      for (const line of stdout.trim().split('\n')) {
        const idx = line.indexOf('=');
        if (idx !== -1) {
          const key = line.slice(0, idx).toLowerCase();
          const value = line.slice(idx + 1);
          result[key] = value;
        }
      }

      if (!result.fingerprint || !result.duration) {
        resolve(null);
        return;
      }

      resolve({
        fingerprint: result.fingerprint,
        duration: parseInt(result.duration, 10),
      });
    });

    cp.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Consulta la API de AcoustID para identificar una canción por su huella digital.
 * @param {string} fingerprint - Huella digital de AcoustID
 * @param {number} duration - Duración en segundos
 * @returns {Promise<Array<{id: string, title: string, artist: string, album: string, score: number}>>}
 */
export async function lookupAcoustId(fingerprint, duration) {
  try {
    const params = new URLSearchParams({
      format: 'json',
      client: ACOUSTID_API_KEY,
      meta: 'recordings releasegroups releases artists',
      duration: String(duration),
      fingerprint,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${ACOUSTID_API_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mirepo/2.0 (music-player)' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[acoustid] API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (data.status !== 'ok' || !data.results) {
      return [];
    }

    const matches = [];
    for (const result of data.results) {
      if (!result.recordings) continue;
      for (const recording of result.recordings) {
        const artistCredit = recording['artist-credit']?.[0]?.artist?.name || 'Desconocido';
        const release = recording.releases?.[0];
        const album = release?.title || 'Álbum desconocido';
        
        matches.push({
          id: recording.id,
          title: recording.title || 'Sin título',
          artist: artistCredit,
          album: album,
          score: result.score || 0,
        });
      }
    }

    // Ordenar por score descendente
    matches.sort((a, b) => b.score - a.score);
    return matches;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[acoustid] Timeout al consultar API');
    } else {
      console.warn(`[acoustid] Error consultando API: ${err.message}`);
    }
    return [];
  }
}

/**
 * Calcula la similitud entre dos huellas digitales (strings de fingerprint raw).
 * Compara los valores de los fingerprints y devuelve un score entre 0 y 1.
 * @param {string} fp1 - Primera huella digital
 * @param {string} fp2 - Segunda huella digital
 * @returns {number}
 */
export function fingerprintSimilarity(fp1, fp2) {
  if (!fp1 || !fp2) return 0;
  
  const arr1 = fp1.split(',').map(Number);
  const arr2 = fp2.split(',').map(Number);
  
  if (arr1.length === 0 || arr2.length === 0) return 0;
  
  // Alinear por el más corto
  const minLen = Math.min(arr1.length, arr2.length);
  if (minLen < 10) return 0;
  
  let matches = 0;
  const compareLen = Math.min(minLen, 1000); // Limitar a 1000 valores para performance
  
  for (let i = 0; i < compareLen; i++) {
    if (Math.abs(arr1[i] - arr2[i]) <= 1) {
      matches++;
    }
  }
  
  return matches / compareLen;
}

/**
 * Calcula la huella digital de un archivo y la compara con la API de AcoustID.
 * @param {string} filePath - Ruta absoluta al archivo de audio
 * @returns {Promise<{fingerprint: string|null, duration: number|null, acoustIdResults: Array}>}
 */
export async function identifyTrack(filePath) {
  const fp = await computeFingerprint(filePath);
  if (!fp) {
    return { fingerprint: null, duration: null, acoustIdResults: [] };
  }

  const results = await lookupAcoustId(fp.fingerprint, fp.duration);
  return {
    fingerprint: fp.fingerprint,
    duration: fp.duration,
    acoustIdResults: results,
  };
}