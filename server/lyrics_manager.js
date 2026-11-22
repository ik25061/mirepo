import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(DIR, 'lyrics_state.json');
const JOB_FILE = path.join(DIR, 'lyrics_job.json');

const EMPTY = { version: 1, songs: {} };
let job = null;
let cancelRequested = false;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function atomicWrite(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function readState() {
  const raw = readJson(STATE_FILE, EMPTY);
  return raw && raw.songs && typeof raw.songs === 'object' ? raw : EMPTY;
}

export function getLyricsSongState(songId) {
  return readState().songs[String(songId)] || null;
}

export function updateLyricsSongState(songId, patch) {
  const state = readState();
  const id = String(songId);
  const previous = state.songs[id] || { status: 'new', reviewed: false, needsReview: false, attempts: 0 };
  state.songs[id] = { ...previous, ...patch, songId: id, updatedAt: new Date().toISOString() };
  atomicWrite(STATE_FILE, state);
  return state.songs[id];
}

export function getLyricsManagerStatus(songs = []) {
  const state = readState();
  const counts = { total: songs.length, new: 0, pending: 0, generated: 0, reviewed: 0, needsReview: 0, error: 0, instrumental: 0, stale: 0, review: 0, processing: 0, not_found: 0 };
  const items = songs.map(song => {
    const record = state.songs[String(song.id)] || null;
    const fingerprint = [song.title, song.artist, song.relPath].join('|');
    const stale = !!record?.fingerprint && record.fingerprint !== fingerprint;
    const status = stale ? 'stale' : (record?.status || 'new');
    if (status !== 'reviewed') counts[status] = (counts[status] || 0) + 1;
    if (record?.reviewed) counts.reviewed++;
    if (record?.needsReview) counts.needsReview++;
    return { songId: song.id, title: song.title, artist: song.artist, status, reviewed: !!record?.reviewed, needsReview: !!record?.needsReview, hasSynced: !!record?.hasSynced, source: record?.source || null, reviewReason: record?.reviewReason || null, lastAttemptAt: record?.lastAttemptAt || null, error: record?.error || null };
  });
  return { counts, items };
}

function selectSongs(songs, mode, songIds, force) {
  const state = readState();
  const selected = songIds ? new Set(songIds.map(String)) : null;
  return songs.filter(song => {
    const record = state.songs[String(song.id)];
    const fingerprint = [song.title, song.artist, song.relPath].join('|');
    const stale = !!record?.fingerprint && record.fingerprint !== fingerprint;
    if (selected) return selected.has(String(song.id));
    if (mode === 'all') return true;
    if (mode === 'new') return !record || record.status === 'new' || stale;
    if (mode === 'pending') return !record || ['new', 'pending', 'error', 'not_found', 'processing'].includes(record.status) || stale;
    if (mode === 'review') return !!record?.needsReview || record?.status === 'review';
    if (mode === 'stale') return stale;
    return force ? true : (!record || record.status !== 'generated');
  });
}

export function getLyricsJob() {
  if (job) return job;
  const saved = readJson(JOB_FILE, { id: null, status: 'idle', processed: 0, total: 0, currentSong: null, results: {} });
  if (saved.status === 'running') {
    saved.status = 'interrupted';
    saved.currentSong = null;
    saved.finishedAt = new Date().toISOString();
    saved.error = 'El servidor se reinició durante el procesamiento. Las canciones en proceso se pueden reintentar.';
    atomicWrite(JOB_FILE, saved);
  }
  return saved;
}

export function cancelLyricsJob() {
  if (!job || job.status !== 'running') return false;
  cancelRequested = true;
  return true;
}

export async function startLyricsJob({ songs, mode = 'new', songIds = null, force = false, processor, onComplete = null }) {
  if (job?.status === 'running') {
    const error = new Error('Ya hay un trabajo de letras en ejecución');
    error.statusCode = 409;
    throw error;
  }
  const queue = selectSongs(songs, mode, songIds, force);
  if (!queue.length) return { accepted: false, message: 'No hay canciones que procesar', total: 0 };

  cancelRequested = false;
  job = {
    id: `lyrics-${Date.now().toString(36)}`,
    status: 'running',
    mode,
    force: !!force,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    processed: 0,
    total: queue.length,
    succeeded: 0,
    needsReview: 0,
    notFound: 0,
    instrumental: 0,
    failed: 0,
    currentSong: null,
    results: []
  };
  atomicWrite(JOB_FILE, job);

  let cleanupCalled = false;
  const cleanup = async () => {
    if (cleanupCalled) return;
    cleanupCalled = true;
    if (typeof onComplete === 'function') await onComplete();
  };

  (async () => {
    for (const song of queue) {
      if (cancelRequested) break;
      const id = String(song.id);
      const fingerprint = [song.title, song.artist, song.relPath].join('|');
      job.currentSong = { id, title: song.title, artist: song.artist };
      updateLyricsSongState(id, {
        status: 'processing', fingerprint, reviewed: false, needsReview: false,
        attempts: (getLyricsSongState(id)?.attempts || 0) + 1,
        lastAttemptAt: new Date().toISOString(), error: null
      });
      try {
        const result = await processor(song, { force: !!force });
        const lyrics = String(result?.lyrics || '').trim();
        if (result?.instrumental || result?.status === 'instrumental') {
          updateLyricsSongState(id, { status: 'instrumental', fingerprint, source: result?.source || 'whisper', hasSynced: false, needsReview: false, error: null });
          job.instrumental++;
        } else if (!lyrics) {
          updateLyricsSongState(id, { status: 'not_found', fingerprint, source: result?.source || null, hasSynced: false, error: 'No se encontró una letra válida' });
          job.notFound++;
        } else {
          const lines = lyrics.split(/\\r?\\n/).map(x => x.trim()).filter(Boolean);
          const unique = new Set(lines.map(x => x.toLowerCase()));
          const suspicious = lyrics.length < 80 || lines.length < 4 || unique.size < Math.max(2, lines.length * 0.45);
          const translationMissing = !!result.language && result.language !== 'es' && !result.translatedLyrics;
          const needsReview = suspicious || translationMissing || !result.syncedLines?.length;
          updateLyricsSongState(id, {
            status: needsReview ? 'review' : 'generated',
            fingerprint,
            source: result.source || 'external',
            language: result.language || null,
            quality: result.quality || null,
            reviewReason: translationMissing ? 'Falta la traducción al español' : (suspicious ? 'La estructura de la letra requiere comprobación' : (!result.syncedLines?.length ? 'No hay sincronización karaoke' : null)),
            hasSynced: !!result.syncedLines?.length,
            needsReview,
            reviewed: false,
            error: null,
            generatedAt: new Date().toISOString()
          });
          if (needsReview) job.needsReview++;
          else job.succeeded++;
        }
      } catch (error) {
        updateLyricsSongState(id, { status: 'error', fingerprint, error: String(error?.message || error) });
        job.failed++;
      }
      job.processed++;
      atomicWrite(JOB_FILE, job);
    }
    await cleanup();
    job.currentSong = null;
    job.status = cancelRequested ? 'cancelled' : 'completed';
    job.finishedAt = new Date().toISOString();
    atomicWrite(JOB_FILE, job);
  })().catch(async error => {
    try { await cleanup(); } catch (cleanupError) { if (job) job.cleanupError = String(cleanupError?.message || cleanupError); }
    if (job) {
      job.status = 'error';
      job.error = String(error?.message || error);
      job.finishedAt = new Date().toISOString();
      atomicWrite(JOB_FILE, job);
    }
  });

  return { accepted: true, jobId: job.id, total: queue.length };
}

export function markLyricsReviewed(songId, reviewed = true) {
  const current = getLyricsSongState(songId) || {};
  return updateLyricsSongState(songId, {
    reviewed: !!reviewed,
    needsReview: !reviewed,
    status: reviewed ? 'reviewed' : (current.status === 'generated' ? 'review' : current.status)
  });
}
