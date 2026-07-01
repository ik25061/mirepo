import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FPCALC_PATH = path.join(__dirname, '..', 'bin', 'chromaprint-fpcalc-1.5.1-windows-x86_64', 'fpcalc.exe');
const ACOUSTID_API_KEY = '8XaBELgH';
const ACOUSTID_API_URL = 'https://api.acoustid.org/v2/lookup';

export function computeFingerprint(filePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(FPCALC_PATH)) {
      console.warn(`[acoustid] fpcalc no encontrado en: ${FPCALC_PATH}`);
      resolve(null);
      return;
    }

    const args = ['-raw', '-length', '120', filePath];
    const cp = spawn(FPCALC_PATH, args);
    
    let stdout = '';
    let stderr = '';

    cp.stdout.on('data', (data) => { stdout += data.toString(); });
    cp.stderr.on('data', (data) => { stderr += data.toString(); });

    cp.on('close', (code) => {
      const hasErrorStderr = stderr && stderr.trim().toUpperCase().startsWith('ERROR:');
      
      if ((code !== 0 || !stdout) && hasErrorStderr) {
        resolve(null);
        return;
      }

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

export function fingerprintSimilarity(fp1, fp2) {
  if (!fp1 || !fp2) return 0;
  
  const arr1 = fp1.split(',').map(Number);
  const arr2 = fp2.split(',').map(Number);
  
  if (arr1.length === 0 || arr2.length === 0) return 0;
  
  const minLen = Math.min(arr1.length, arr2.length);
  if (minLen < 10) return 0;
  
  let matches = 0;
  const compareLen = Math.min(minLen, 1000);
  
  for (let i = 0; i < compareLen; i++) {
    if (Math.abs(arr1[i] - arr2[i]) <= 1) {
      matches++;
    }
  }
  
  return matches / compareLen;
}

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