/**
 * ============================================================
 * PLAYER CONTEXT - PROVEEDOR DE REPRODUCCIÓN DE MÚSICA
 * ============================================================
 * 
 * Este archivo maneja toda la lógica de reproducción de audio:
 * - Reproducción, pausa, siguiente, anterior
 * - Crossfade entre canciones
 * - Detección y salto de silencio
 * - Contexto (artista, álbum, género) para reproducción continua
 * - Media Session API para controles en pantalla de bloqueo
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { audioUrl } from '../lib/api.js';
import { useOffline } from './OfflineContext.jsx';
import { getDownloadedSong, removeDownloadedSong } from '../hooks/useDownloads.js';
import { useAutoDeleteDownload } from '../hooks/useAutoDeleteDownload.js';

// ============================================================
// 1. CREACIÓN DEL CONTEXTO
// ============================================================

const PlayerContext = createContext(null);
export const usePlayer = () => useContext(PlayerContext);

// ============================================================
// 2. CONSTANTES DE CONFIGURACIÓN
// ============================================================

const FADE_MS = 16;
const SILENCE_THRESHOLD = 0.01;
const SILENCE_CHECK_DURATION = 5;
const SILENCE_ANALYSE_INTERVAL = 0.1;

// ============================================================
// 3. COMPONENTE PRINCIPAL PlayerProvider
// ============================================================

export function PlayerProvider({ children }) {
  // ============================================================
  // 3.1 HOOKS Y ESTADO (useState primero, luego useRef)
  // ============================================================

  const { enabled: autoDeleteEnabled } = useAutoDeleteDownload();
  const { getLocalSongUrl } = useOffline();

  // Estado
  const [queue, setQueue] = useState([]);
  const [upNextQueue, setUpNextQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [crossfadeSec, setCrossfadeSec] = useState(1.5);
  const [repeatMode, setRepeatMode] = useState(0);

  // ============================================================
  // 3.2 REFERENCIAS (useRef)
  // ============================================================

  const autoDeleteEnabledRef = useRef(false);
  const currentRef = useRef(null);
  const audiosRef = useRef(null);
  const activeRef = useRef(0);
  const fadeTimerRef = useRef(null);
  const crossfadingRef = useRef(false);
  const queueRef = useRef([]);
  const upNextRef = useRef([]);
  const indexRef = useRef(-1);
  const silenceSkipDoneRef = useRef(false);
  const silenceCheckIntervalRef = useRef(null);
  const playedHistoryRef = useRef(new Set());
  const originalQueueRef = useRef([]);
  const contextRef = useRef(null);
  const advancingRef = useRef(false);
  const downloadedObjectUrlRef = useRef(null);

  // Mantener refs sincronizadas con estado (evita closures stale)
  useEffect(() => { autoDeleteEnabledRef.current = autoDeleteEnabled; }, [autoDeleteEnabled]);
  useEffect(() => { currentRef.current = current; }, [current]);

  // ============================================================
  // 3.3 REFERENCIAS PARA VALORES DINÁMICOS
  // ============================================================

  const volumeRef = useRef(volume);
  const crossfadeRef = useRef(crossfadeSec);
  const repeatModeRef = useRef(repeatMode);

  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { crossfadeRef.current = crossfadeSec; }, [crossfadeSec]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);

  useEffect(() => {
    const audios = audiosRef.current;
    if (!audios) return;
    audios.forEach((a) => { if (a.src) a.volume = volume; });
  }, [volume]);

  // Crear elementos de audio
  if (!audiosRef.current && typeof window !== 'undefined') {
    audiosRef.current = [new Audio(), new Audio()];
    audiosRef.current.forEach((a) => { a.preload = 'auto'; a.crossOrigin = 'anonymous'; });
  }

  const getActive = () => audiosRef.current?.[activeRef.current];
  const getIdle = () => audiosRef.current?.[activeRef.current === 0 ? 1 : 0];

  const clearFade = () => {
    if (fadeTimerRef.current) { clearInterval(fadeTimerRef.current); fadeTimerRef.current = null; }
  };

  const detectAndSkipSilence = useCallback((audio) => {
    if (!audio || !audio.src || silenceSkipDoneRef.current) return;
    const checkSilence = () => {
      if (!audio || audio.paused || audio.ended || !audio.src) { clearInterval(silenceCheckIntervalRef.current); return; }
      if (audio.currentTime > SILENCE_CHECK_DURATION) { clearInterval(silenceCheckIntervalRef.current); silenceSkipDoneRef.current = true; return; }
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length / 255;
        if (average > SILENCE_THRESHOLD) { silenceSkipDoneRef.current = true; clearInterval(silenceCheckIntervalRef.current); }
        else if (audio.currentTime > 1.5) { audio.currentTime = Math.min(audio.currentTime + 0.5, audio.duration || 0); silenceSkipDoneRef.current = true; clearInterval(silenceCheckIntervalRef.current); }
      } catch { silenceSkipDoneRef.current = true; clearInterval(silenceCheckIntervalRef.current); }
    };
    silenceCheckIntervalRef.current = setInterval(checkSilence, SILENCE_ANALYSE_INTERVAL * 1000);
  }, []);

  const playIndex = useCallback(async (idx, { crossfade = true } = {}) => {
    const q = queueRef.current;
    if (idx < 0 || idx >= q.length) return;
    const song = q[idx];
    indexRef.current = idx;
    setCurrent(song);
    setDuration(0);
    setProgress(0);
    silenceSkipDoneRef.current = false;
    advancingRef.current = false;

    const incoming = getIdle();
    const outgoing = getActive();
    const target = volumeRef.current;
    const fadeTime = crossfade ? crossfadeRef.current : 0.1;

    clearFade();
    if (silenceCheckIntervalRef.current) { clearInterval(silenceCheckIntervalRef.current); silenceCheckIntervalRef.current = null; }
    crossfadingRef.current = true;

    let sourceUrl = audioUrl(song.id);

    if (song.local) {
      try { const localUrl = await getLocalSongUrl(song); if (localUrl) sourceUrl = localUrl; }
      catch { console.warn('[Player] No se pudo cargar canción local'); }
    } else {
      try {
        const downloaded = await getDownloadedSong(song.id);
        if (downloaded?.audioBlob instanceof Blob) {
          if (downloadedObjectUrlRef.current) { URL.revokeObjectURL(downloadedObjectUrlRef.current); downloadedObjectUrlRef.current = null; }
          const blobUrl = URL.createObjectURL(downloaded.audioBlob);
          downloadedObjectUrlRef.current = blobUrl;
          sourceUrl = blobUrl;
        }
      } catch { console.warn('[Player] Error accediendo a descarga local:'); }
    }

    incoming.src = sourceUrl;
    incoming.currentTime = 0;
    incoming.volume = 0;

    const onLoadedMetadata = () => { setDuration(incoming.duration || 0); incoming.removeEventListener('loadedmetadata', onLoadedMetadata); };
    incoming.addEventListener('loadedmetadata', onLoadedMetadata);
    const onPlay = () => { detectAndSkipSilence(incoming); incoming.removeEventListener('play', onPlay); };
    incoming.addEventListener('play', onPlay);

    const playPromise = incoming.play();
    if (playPromise) playPromise.catch(() => {});
    setIsPlaying(true);

    const steps = Math.max(1, Math.round((fadeTime * 1000) / FADE_MS));
    let step = 0;
    fadeTimerRef.current = setInterval(() => {
      step++;
      const ratio = Math.min(1, step / steps);
      incoming.volume = Math.min(1, target * ratio);
      if (outgoing) outgoing.volume = Math.max(0, target * (1 - ratio));
      if (ratio >= 1) {
        clearFade();
        if (outgoing && outgoing !== incoming) {
          const outgoingSrc = outgoing.src;
          outgoing.pause();
          outgoing.currentTime = 0;
          outgoing.removeAttribute('src');
          if (outgoingSrc?.startsWith('blob:')) URL.revokeObjectURL(outgoingSrc);
        }
        activeRef.current = activeRef.current === 0 ? 1 : 0;
        crossfadingRef.current = false;
      }
    }, FADE_MS);
  }, [detectAndSkipSilence]);

  const play = useCallback((song, songs, context = null) => {
    if (!song) return;
    let list = songs && songs.length ? [...songs] : [song];
    let idx = list.findIndex((s) => s.id === song.id);
    if (idx === -1) { list = [song, ...list]; idx = 0; }
    queueRef.current = list;
    setQueue(list);
    contextRef.current = context;
    playIndex(idx, { crossfade: getActive() && !getActive().paused });
  }, [playIndex]);

  const shufflePlay = useCallback((songs) => {
    if (!songs || songs.length === 0) return;
    const list = [...songs];
    if (playedHistoryRef.current.size >= list.length) playedHistoryRef.current = new Set();
    const unplayed = list.filter((s) => !playedHistoryRef.current.has(s.id));
    for (let i = unplayed.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [unplayed[i], unplayed[j]] = [unplayed[j], unplayed[i]]; }
    unplayed.forEach((s) => playedHistoryRef.current.add(s.id));
    originalQueueRef.current = list;
    queueRef.current = list;
    setQueue(list);
    contextRef.current = null;
    const firstSong = unplayed[0];
    const firstIndex = list.findIndex((s) => s.id === firstSong.id);
    playIndex(firstIndex, { crossfade: getActive() && !getActive().paused });
  }, [playIndex]);

  // ============================================================
  // 3.12 FUNCIÓN - getNextContextTrack
  // ============================================================

  const getNextContextTrack = useCallback((currentSong, currentQueue, contextType, contextValue) => {
    if (!contextType || !contextValue || !currentSong) return null;
    const allSongs = currentQueue;
    let contextSongs = [];
    const filterFn = contextType === 'artist' ? s => s.artist === contextValue
      : contextType === 'album' ? s => s.album === contextValue
      : contextType === 'genre' ? s => { const g = Array.isArray(s.genre) ? s.genre : [s.genre || '']; return g.includes(contextValue); }
      : contextType === 'year' ? s => String(s.year) === String(contextValue)
      : null;
    if (!filterFn) return null;
    contextSongs = allSongs.filter(filterFn);
    if (contextSongs.length === 0) return null;

    const currentIndexInContext = contextSongs.findIndex(s => s.id === currentSong.id);
    if (currentIndexInContext !== -1 && currentIndexInContext < contextSongs.length - 1) return contextSongs[currentIndexInContext + 1];

    const uniqueContexts = []; const seen = new Set();
    for (const s of allSongs) {
      let v = '';
      if (contextType === 'artist') v = s.artist || '';
      else if (contextType === 'album') v = s.album || '';
      else if (contextType === 'genre') v = Array.isArray(s.genre) ? s.genre[0] : (s.genre || '');
      else if (contextType === 'year') v = String(s.year || '');
      const norm = v.toLowerCase().trim();
      if (norm && !seen.has(norm)) { seen.add(norm); uniqueContexts.push(v); }
    }

    const currentNorm = String(contextValue).toLowerCase().trim();
    let ctxIdx = -1;
    for (let i = 0; i < uniqueContexts.length; i++) { if (String(uniqueContexts[i]).toLowerCase().trim() === currentNorm) { ctxIdx = i; break; } }

    let nextCtx = null;
    for (let i = (ctxIdx + 1) % uniqueContexts.length; i !== ctxIdx; i = (i + 1) % uniqueContexts.length) {
      if (String(uniqueContexts[i]).toLowerCase().trim() !== currentNorm && uniqueContexts[i]) { nextCtx = uniqueContexts[i]; break; }
    }

    if (nextCtx) {
      const nextSongs = allSongs.filter(filterFn);
      if (nextSongs.length > 0) {
        contextRef.current = { type: contextType, value: nextCtx };
        return nextSongs[0];
      }
    }
    return null;
  }, []);

  const prev = useCallback(() => {
    const a = getActive();
    if (a && a.currentTime > 3) { a.currentTime = 0; setProgress(0); return; }
    if (indexRef.current > 0) playIndex(indexRef.current - 1);
  }, [playIndex]);

  const next = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    if (repeatModeRef.current === 2 && indexRef.current >= 0 && indexRef.current < q.length) { playIndex(indexRef.current); return; }
    const upNext = upNextRef.current;
    if (upNext.length > 0) {
      const nextSong = upNext[0];
      upNextRef.current = upNext.slice(1);
      setUpNextQueue(upNextRef.current);
      const nextIndex = q.findIndex(s => s.id === nextSong.id);
      if (nextIndex !== -1) { playIndex(nextIndex); return; }
      else { const newQueue = [...q, nextSong]; queueRef.current = newQueue; setQueue(newQueue); playIndex(newQueue.length - 1); return; }
    }
    const currentSong = q[indexRef.current];
    if (!currentSong) return;
    const context = contextRef.current;
    if (context?.type && context?.value) {
      const nextTrack = getNextContextTrack(currentSong, q, context.type, context.value);
      if (nextTrack) {
        const nextIndex = q.findIndex(s => s.id === nextTrack.id);
        if (nextIndex !== -1 && nextIndex !== indexRef.current) { playIndex(nextIndex); return; }
      }
    }
    if (indexRef.current < q.length - 1) { playIndex(indexRef.current + 1); }
    else {
      if (repeatModeRef.current === 1) { playIndex(0); }
      else { setIsPlaying(false); const a = getActive(); if (a) { a.currentTime = 0; setProgress(0); } }
    }
  }, [playIndex, getNextContextTrack]);

  const togglePlay = useCallback(() => {
    const a = getActive();
    if (!a || !a.src) return;
    if (a.paused) { a.play(); setIsPlaying(true); } else { a.pause(); setIsPlaying(false); }
  }, []);

  const seek = useCallback((time) => {
    const a = getActive();
    if (a && a.duration) { a.currentTime = time; setProgress(time); }
  }, []);

  const stop = useCallback(() => {
    clearFade();
    if (silenceCheckIntervalRef.current) { clearInterval(silenceCheckIntervalRef.current); silenceCheckIntervalRef.current = null; }
    audiosRef.current?.forEach((a) => { a.pause(); a.removeAttribute('src'); a.currentTime = 0; });
    setIsPlaying(false); setCurrent(null); setProgress(0); setDuration(0);
    queueRef.current = []; setQueue([]); upNextRef.current = []; setUpNextQueue([]);
    indexRef.current = -1; activeRef.current = 0; contextRef.current = null;
  }, []);

  const addToQueue = useCallback((song, position = 'next') => {
    if (!song) return;
    const currentQueue = queueRef.current;
    if (currentQueue.length === 0 || indexRef.current === -1) { play(song, [song]); return; }
    const newUpNext = [...upNextRef.current];
    if (position === 'next') newUpNext.splice(0, 0, song);
    else newUpNext.push(song);
    upNextRef.current = newUpNext;
    setUpNextQueue(newUpNext);
  }, [play]);

  const removeFromQueue = useCallback((songId) => {
    const currentQueue = queueRef.current;
    const currentIndex = indexRef.current;
    const songIndex = currentQueue.findIndex(s => s.id === songId);
    if (songIndex === -1) return false;
    const newQueue = currentQueue.filter(s => s.id !== songId);
    queueRef.current = newQueue; setQueue(newQueue);
    if (newQueue.length === 0) { stop(); return true; }
    if (songIndex === currentIndex) {
      const nextSong = newQueue[songIndex] || newQueue[0];
      if (nextSong) {
        const active = getActive();
        if (active) { active.pause(); active.removeAttribute('src'); active.currentTime = 0; }
        queueRef.current = newQueue; setQueue(newQueue);
        const nextIdx = newQueue.findIndex(s => s.id === nextSong.id);
        if (nextIdx !== -1) playIndex(nextIdx, { crossfade: false });
        return true;
      } else { stop(); return true; }
    } else if (songIndex < currentIndex) {
      const newIndex = currentIndex - 1;
      indexRef.current = newIndex;
      setCurrent(newQueue[newIndex] || newQueue[newQueue.length - 1] || null);
    }
    return true;
  }, [playIndex, play, stop]);

  // ============================================================
  // 3.19 EFFECT - Actualizar progreso y manejar fin de canción
  // ============================================================

  useEffect(() => {
    const audios = audiosRef.current;
    if (!audios) return;
    let intervalId = null;

    const advanceTrack = async () => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      // Eliminar descarga si auto-delete está activo
      const songId = currentRef.current?.id;
      const songTitle = currentRef.current?.title;
      if (autoDeleteEnabledRef.current && songId) {
        try {
          const downloaded = await getDownloadedSong(songId);
          if (downloaded?.id) {
            console.log('[Player] autoDelete: eliminando descarga de', songTitle);
            await removeDownloadedSong(songId);
            try { window.dispatchEvent(new CustomEvent('mirepo-reload-downloads')); } catch {}
          }
        } catch (err) {
          console.warn('[Player] autoDelete: error al eliminar descarga', err);
        }
      }
      next();
    };

    const updateProgress = () => {
      const a = getActive();
      if (!a) return;
      if (a.duration && a.duration > 0) {
        setProgress(a.currentTime);
        setDuration(a.duration);
        if (a.duration - a.currentTime < 0.3 && a.duration - a.currentTime > 0 && !crossfadingRef.current) advanceTrack();
      }
    };

    const onTimeUpdate = () => {
      const a = getActive();
      if (a && a.duration && a.duration > 0) { setProgress(a.currentTime); setDuration(a.duration); }
    };

    const onEnded = async () => {
      if (!crossfadingRef.current && !advancingRef.current) {
        const songId = currentRef.current?.id;
        const songTitle = currentRef.current?.title;
        if (autoDeleteEnabledRef.current && songId) {
          try {
            const downloaded = await getDownloadedSong(songId);
            if (downloaded?.id) {
              console.log('[Player] onEnded autoDelete: eliminando descarga de', songTitle);
              await removeDownloadedSong(songId);
              try { window.dispatchEvent(new CustomEvent('mirepo-reload-downloads')); } catch {}
            }
          } catch (err) { console.warn('[Player] autoDelete: error', err); }
        }
        setTimeout(() => advanceTrack(), 100);
      }
    };

    audios.forEach((a) => {
      a.addEventListener('timeupdate', onTimeUpdate);
      a.addEventListener('ended', onEnded);
      a.addEventListener('loadedmetadata', () => { setDuration(a.duration || 0); });
    });
    intervalId = setInterval(updateProgress, 100);

    return () => {
      audios.forEach((a) => {
        a.removeEventListener('timeupdate', onTimeUpdate);
        a.removeEventListener('ended', onEnded);
      });
      if (intervalId) clearInterval(intervalId);
    };
  }, [next]);

  useEffect(() => {
    return () => {
      if (downloadedObjectUrlRef.current) { URL.revokeObjectURL(downloadedObjectUrlRef.current); downloadedObjectUrlRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (current) { const a = getActive(); if (a && a.duration) setDuration(a.duration); }
  }, [current]);

  // Media Session API
  useEffect(() => {
    const a = getActive();
    if (!a || !current) return;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title || 'Desconocido',
        artist: current.artist || 'Artista desconocido',
        album: current.album || '',
      });
      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
      navigator.mediaSession.setActionHandler('previoustrack', prev);
      navigator.mediaSession.setActionHandler('nexttrack', next);
    }
  }, [current, isPlaying, togglePlay, prev, next]);

  const getActiveAudio = useCallback(() => getActive(), []);

  const value = {
    queue, upNextQueue, current, isPlaying, progress, duration, volume, crossfadeSec, repeatMode,
    setVolume, setCrossfadeSec, setRepeatMode,
    play, shufflePlay, next, prev, togglePlay, seek, stop, addToQueue, removeFromQueue, getActiveAudio,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}