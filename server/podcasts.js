// podcasts.js - Biblioteca E:/podcast (con soporte para carpetas/series)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';
import 'dotenv/config';

export const PODCAST_DIR = process.env.VITE_PODCAST_PATH || 'E:/podcast';

const AUDIO_EXT = new Set(['.mp3','.m4a','.aac','.flac','.wav','.ogg','.opus','.webm']);
let podcastCache = []; // List of Podcasts (series)
let episodeCache = []; // All episodes
let byId = new Map(); // id -> episode

function ensureDir() {
  try {
    if (!fs.existsSync(PODCAST_DIR)) fs.mkdirSync(PODCAST_DIR, { recursive: true });
  } catch (e) { console.error('[podcasts]', e.message); }
}

export function podId(rel) { return 'pod_' + crypto.createHash('sha1').update(rel).digest('hex').slice(0, 16); }

async function scanDir(dir, seriesName = null) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) { return []; }

  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Entrar en subcarpeta. El nombre de la carpeta es el nombre de la serie si no estamos ya en una.
      const subResults = await scanDir(fullPath, seriesName || entry.name);
      results.push(...subResults);
    } else if (entry.isFile() && AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) {
      const relPath = path.relative(PODCAST_DIR, fullPath);
      const st = fs.statSync(fullPath);
      const base = path.basename(entry.name, path.extname(entry.name));

      let title = base.replace(/_/g, ' ').trim();
      let author = seriesName || 'Podcast';
      let dur = 0;
      let pic = false;

      try {
        const m = await parseFile(fullPath, { duration: true });
        if (m.common?.title) title = m.common.title;
        if (m.common?.artist) author = m.common.artist || author;
        if (m.common?.picture?.length) pic = true;
        if (m.format?.duration) dur = Math.round(m.format.duration);
      } catch (e) {}

      results.push({
        id: podId(relPath),
        type: 'podcast',
        series: seriesName || 'Independientes',
        title,
        author,
        duration: dur,
        hasPicture: pic,
        relPath,
        size: st.size
      });
    }
  }
  return results;
}

export async function scanPods() {
  ensureDir();
  console.log('[podcasts] Escaneando...');
  const allEpisodes = await scanDir(PODCAST_DIR);
  episodeCache = allEpisodes;
  byId = new Map(allEpisodes.map(e => [e.id, e]));

  // Agrupar por serie para el listado de Podcasts
  const seriesMap = new Map();
  for (const ep of allEpisodes) {
    if (!seriesMap.has(ep.series)) {
      seriesMap.set(ep.series, {
        id: 'ser_' + crypto.createHash('sha1').update(ep.series).digest('hex').slice(0, 16),
        title: ep.series,
        author: ep.author,
        episode_count: 0,
        episodes: []
      });
    }
    const s = seriesMap.get(ep.series);
    s.episode_count++;
    s.episodes.push(ep);
  }

  podcastCache = Array.from(seriesMap.values()).map(s => ({
    id: s.id,
    title: s.title,
    author: s.author,
    episode_count: s.episode_count
  }));

  console.log(`[podcasts] OK: ${podcastCache.length} series, ${episodeCache.length} episodios`);
  return podcastCache;
}

export function listPodcasts(o = {}) {
  return { podcasts: podcastCache };
}

export function getPodcastDetail(seriesId) {
  const series = podcastCache.find(s => s.id === seriesId);
  if (!series) return null;
  const episodes = episodeCache.filter(e => e.series === series.title);
  return { podcast: series, episodes };
}

export function getEpisode(id) {
  return byId.get(id) || null;
}

export function getCache() { return { podcastCache, episodeCache }; }
ensureDir();
