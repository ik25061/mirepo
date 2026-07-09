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

import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { audioUrl } from '../lib/api.js';
import { useOffline } from './OfflineContext.jsx';

// ============================================================
// 1. CREACIÓN DEL CONTEXTO
// ============================================================

const PlayerContext = createContext(null);
export const usePlayer = () => useContext(PlayerContext);

// ============================================================
// 2. CONSTANTES DE CONFIGURACIÓN
// ============================================================

const FADE_MS = 16; // Intervalo del fade en milisegundos
const SILENCE_THRESHOLD = 0.01; // Umbral para detectar silencio
const SILENCE_CHECK_DURATION = 5; // Segundos a revisar para silencio
const SILENCE_ANALYSE_INTERVAL = 0.1; // Intervalo de análisis de silencio

// ============================================================
// 3. COMPONENTE PRINCIPAL PlayerProvider
// ============================================================

export function PlayerProvider({ children }) {
  // ============================================================
  // 3.1 REFERENCIAS (useRef)
  // ============================================================

  // Elementos de audio (2 para crossfade)
  const audiosRef = useRef(null);
  const activeRef = useRef(0); // Índice del audio activo (0 o 1)
  const fadeTimerRef = useRef(null); // Timer para el fade
  const crossfadingRef = useRef(false); // Indica si está en crossfade
  const queueRef = useRef([]); // Cola de canciones actual
  const upNextRef = useRef([]); // Cola de canciones añadidas manualmente
  const indexRef = useRef(-1); // Índice de la canción actual
  const silenceSkipDoneRef = useRef(false); // Ya se saltó el silencio
  const silenceCheckIntervalRef = useRef(null); // Intervalo para check de silencio
  const playedHistoryRef = useRef(new Set()); // Historial de canciones reproducidas (shuffle)
  const originalQueueRef = useRef([]); // Cola original (para shuffle)
  const contextRef = useRef(null); // Contexto actual (artista, álbum, género)
  const advancingRef = useRef(false); // Flag para evitar avances múltiples

  // ============================================================
  // 3.2 ESTADO (useState)
  // ============================================================

  const [queue, setQueue] = useState([]); // Cola visible
  const [upNextQueue, setUpNextQueue] = useState([]); // Cola "up next" visible
  const [current, setCurrent] = useState(null); // Canción actual
  const [isPlaying, setIsPlaying] = useState(false); // Estado de reproducción
  const [progress, setProgress] = useState(0); // Progreso en segundos
  const [duration, setDuration] = useState(0); // Duración total
  const [volume, setVolume] = useState(0.9); // Volumen (0-1)
  const [crossfadeSec, setCrossfadeSec] = useState(1.5); // Duración del fade (segundos)
  const [repeatMode, setRepeatMode] = useState(0); // 0=none, 1=all, 2=one
  const { getLocalSongUrl } = useOffline();

  // ============================================================
  // 3.3 REFERENCIAS PARA VALORES DINÁMICOS (useRef)
  // ============================================================

  const volumeRef = useRef(volume);
  const crossfadeRef = useRef(crossfadeSec);
  const repeatModeRef = useRef(repeatMode);

  // Sincronizar refs con el estado
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { crossfadeRef.current = crossfadeSec; }, [crossfadeSec]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);

  // ============================================================
  // 3.4 Sincronizar volumen con elementos de audio
  // ============================================================

  useEffect(() => {
    const audios = audiosRef.current;
    if (!audios) return;
    audios.forEach((a) => {
      if (a.src) a.volume = volume;
    });
  }, [volume]);

  // ============================================================
  // 3.5 CREAR ELEMENTOS DE AUDIO
  // ============================================================

  if (!audiosRef.current && typeof window !== 'undefined') {
    audiosRef.current = [new Audio(), new Audio()];
    audiosRef.current.forEach((a) => {
      a.preload = 'auto';
      a.crossOrigin = 'anonymous';
    });
  }

  // ============================================================
  // 3.6 FUNCIONES AUXILIARES - getActive / getIdle
  // ============================================================

  const getActive = () => audiosRef.current[activeRef.current];
  const getIdle = () => audiosRef.current[activeRef.current === 0 ? 1 : 0];

  // ============================================================
  // 3.7 FUNCIÓN - clearFade (Detener el fade)
  // ============================================================

  const clearFade = () => {
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  };

  // ============================================================
  // 3.8 FUNCIÓN - detectAndSkipSilence (Saltar silencio al inicio)
  // ============================================================

  const detectAndSkipSilence = useCallback((audio) => {
    if (!audio || !audio.src) return;
    if (silenceSkipDoneRef.current) return;

    const checkSilence = () => {
      if (!audio || audio.paused || audio.ended || !audio.src) {
        clearInterval(silenceCheckIntervalRef.current);
        return;
      }

      if (audio.currentTime > SILENCE_CHECK_DURATION) {
        clearInterval(silenceCheckIntervalRef.current);
        silenceSkipDoneRef.current = true;
        return;
      }

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
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length / 255;

        if (average > SILENCE_THRESHOLD) {
          silenceSkipDoneRef.current = true;
          clearInterval(silenceCheckIntervalRef.current);
        } else if (audio.currentTime > 1.5) {
          const skipTo = Math.min(audio.currentTime + 0.5, audio.duration || 0);
          audio.currentTime = skipTo;
          silenceSkipDoneRef.current = true;
          clearInterval(silenceCheckIntervalRef.current);
        }
      } catch (err) {
        silenceSkipDoneRef.current = true;
        clearInterval(silenceCheckIntervalRef.current);
      }
    };

    silenceCheckIntervalRef.current = setInterval(checkSilence, SILENCE_ANALYSE_INTERVAL * 1000);
  }, []);

  // ============================================================
  // 3.9 FUNCIÓN - playIndex (Reproducir una canción por índice)
  // ============================================================

  const playIndex = useCallback(async (idx, { crossfade = true } = {}) => {
    const q = queueRef.current;
    if (idx < 0 || idx >= q.length) return;
    const song = q[idx];
    indexRef.current = idx;
    setCurrent(song);
    setDuration(0);
    setProgress(0);
    silenceSkipDoneRef.current = false;
    advancingRef.current = false; // Resetear flag al cambiar de canción

    const incoming = getIdle();
    const outgoing = getActive();
    const target = volumeRef.current;
    const fadeTime = crossfade ? crossfadeRef.current : 0.1;

    clearFade();
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    crossfadingRef.current = true;

    let sourceUrl = audioUrl(song.id);
    if (song.local) {
      try {
        const localUrl = await getLocalSongUrl(song);
        if (localUrl) {
          sourceUrl = localUrl;
        }
      } catch (error) {
        console.warn('[Player] No se pudo cargar canción local, usando servidor si está disponible:', error);
      }
    }

    incoming.src = sourceUrl;
    incoming.currentTime = 0;
    incoming.volume = 0;

    // Evento: cuando se cargan los metadatos
    const onLoadedMetadata = () => {
      setDuration(incoming.duration || 0);
      incoming.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
    incoming.addEventListener('loadedmetadata', onLoadedMetadata);

    // Evento: cuando comienza la reproducción
    const onPlay = () => {
      detectAndSkipSilence(incoming);
      incoming.removeEventListener('play', onPlay);
    };
    incoming.addEventListener('play', onPlay);

    // Iniciar reproducción
    const playPromise = incoming.play();
    if (playPromise) playPromise.catch(() => { });
    setIsPlaying(true);

    // Fade de volumen
    const steps = Math.max(1, Math.round((fadeTime * 1000) / FADE_MS));
    let step = 0;
    fadeTimerRef.current = setInterval(() => {
      step++;
      const ratio = Math.min(1, step / steps);
      incoming.volume = Math.min(1, target * ratio);
      if (outgoing) {
        outgoing.volume = Math.max(0, target * (1 - ratio));
      }
      if (ratio >= 1) {
        clearFade();
        if (outgoing && outgoing !== incoming) {
          outgoing.pause();
          outgoing.currentTime = 0;
          outgoing.removeAttribute('src');
        }
        activeRef.current = activeRef.current === 0 ? 1 : 0;
        crossfadingRef.current = false;
      }
    }, FADE_MS);
  }, [detectAndSkipSilence]);

  // ============================================================
  // 3.10 FUNCIÓN - play (Reproducir una canción con contexto)
  // ============================================================

  const play = useCallback((song, songs, context = null) => {
    if (!song) return;

    console.log('[Player] play - Cancion:', song?.title);
    console.log('[Player] play - Contexto recibido:', context);
    console.log('[Player] play - Canciones recibidas:', songs?.length || 0);

    let list = songs && songs.length ? [...songs] : [song];
    let idx = list.findIndex((s) => s.id === song.id);

    if (idx === -1) {
      list = [song, ...list];
      idx = 0;
    }

    queueRef.current = list;
    setQueue(list);

    contextRef.current = context;
    console.log('[Player] play - Contexto guardado:', contextRef.current);
    console.log('[Player] play - Cola total:', list.length);

    playIndex(idx, { crossfade: getActive() && !getActive().paused });
  }, [playIndex]);

  // ============================================================
  // 3.11 FUNCIÓN - shufflePlay (Reproducción aleatoria)
  // ============================================================

  const shufflePlay = useCallback((songs) => {
    if (!songs || songs.length === 0) return;

    const list = [...songs];

    // Reiniciar historial si ya se reprodujeron todas
    if (playedHistoryRef.current.size >= list.length) {
      playedHistoryRef.current = new Set();
    }

    // Filtrar canciones no reproducidas
    const unplayed = list.filter((s) => !playedHistoryRef.current.has(s.id));

    // Mezclar canciones no reproducidas
    for (let i = unplayed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unplayed[i], unplayed[j]] = [unplayed[j], unplayed[i]];
    }

    unplayed.forEach((s) => playedHistoryRef.current.add(s.id));

    originalQueueRef.current = list;
    queueRef.current = list;
    setQueue(list);
    contextRef.current = null; // Limpiar contexto en shuffle

    const firstSong = unplayed[0];
    const firstIndex = list.findIndex((s) => s.id === firstSong.id);
    playIndex(firstIndex, { crossfade: getActive() && !getActive().paused });
  }, [playIndex]);

  // ============================================================
  // 3.12 FUNCIÓN - getNextContextTrack (VERSIÓN SIMPLIFICADA)
  // ============================================================

  const getNextContextTrack = useCallback((currentSong, currentQueue, contextType, contextValue) => {
    console.log('[Player] getNextContextTrack - Buscando siguiente:', { contextType, contextValue, currentSong: currentSong?.title });

    if (!contextType || !contextValue || !currentSong) return null;

    const allSongs = currentQueue;

    // ============================================================
    // PASO 1: Obtener TODAS las canciones del mismo contexto
    // ============================================================
    let contextSongs = [];
    if (contextType === 'artist') {
      contextSongs = allSongs.filter(s => s.artist === contextValue);
    } else if (contextType === 'album') {
      contextSongs = allSongs.filter(s => s.album === contextValue);
    } else if (contextType === 'genre') {
      contextSongs = allSongs.filter(s => s.genre === contextValue);
    } else if (contextType === 'year') {
      contextSongs = allSongs.filter(s => s.year === parseInt(contextValue));
    } else {
      console.log('[Player] getNextContextTrack - Contexto desconocido:', contextType);
      return null;
    }

    console.log('[Player] getNextContextTrack - Canciones en contexto:', contextSongs.length);

    if (contextSongs.length === 0) {
      console.log('[Player] getNextContextTrack - ❌ No hay canciones en este contexto');
      return null;
    }

    // ============================================================
    // PASO 2: Encontrar la canción actual dentro del contexto
    // ============================================================
    const currentIndexInContext = contextSongs.findIndex(s => s.id === currentSong.id);
    console.log('[Player] getNextContextTrack - Índice en contexto:', currentIndexInContext);

    // ============================================================
    // PASO 3: Si hay siguiente en el mismo contexto, devolverla
    // ============================================================
    if (currentIndexInContext !== -1 && currentIndexInContext < contextSongs.length - 1) {
      const nextSong = contextSongs[currentIndexInContext + 1];
      console.log('[Player] getNextContextTrack - ✅ Siguiente en mismo contexto:', nextSong?.title);
      return nextSong;
    }

    // ============================================================
    // PASO 4: Es la última canción del contexto
    // Buscar el PRÓXIMO contexto diferente
    // ============================================================
    console.log('[Player] getNextContextTrack - 🎯 Última del contexto, buscando siguiente contexto');

    // Obtener TODOS los contextos únicos en orden de aparición
    const uniqueContexts = [];
    const seen = new Set();

    for (const song of allSongs) {
      let value = '';
      if (contextType === 'artist') {
        value = song.artist || '';
      } else if (contextType === 'album') {
        value = song.album || '';
      } else if (contextType === 'genre') {
        value = song.genre || '';
      } else if (contextType === 'year') {
        value = String(song.year || '');
      }

      // Normalizar y evitar duplicados
      const normalized = value.toLowerCase().trim();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        uniqueContexts.push(value);
      }
    }

    console.log('[Player] getNextContextTrack - 📋 Total contextos únicos:', uniqueContexts.length);

    // Encontrar el índice del contexto actual
    const currentContextNormalized = String(contextValue).toLowerCase().trim();
    let currentContextIndex = -1;
    for (let i = 0; i < uniqueContexts.length; i++) {
      if (String(uniqueContexts[i]).toLowerCase().trim() === currentContextNormalized) {
        currentContextIndex = i;
        break;
      }
    }

    console.log('[Player] getNextContextTrack - 📍 Índice del contexto actual:', currentContextIndex);

    // Si no se encuentra, buscar cualquier otro contexto
    if (currentContextIndex === -1) {
      console.log('[Player] getNextContextTrack - ⚠️ Contexto actual no encontrado en la lista');
      // Intentar encontrar el primer contexto diferente
      for (const song of allSongs) {
        let value = '';
        if (contextType === 'artist') {
          value = song.artist || '';
        } else if (contextType === 'album') {
          value = song.album || '';
        } else if (contextType === 'genre') {
          value = song.genre || '';
        } else if (contextType === 'year') {
          value = String(song.year || '');
        }
        if (value && String(value).toLowerCase().trim() !== currentContextNormalized) {
          const nextContextSongs = allSongs.filter(s => {
            if (contextType === 'artist') return s.artist === value;
            if (contextType === 'album') return s.album === value;
            if (contextType === 'genre') return s.genre === value;
            if (contextType === 'year') return String(s.year) === value;
            return false;
          });
          if (nextContextSongs.length > 0) {
            contextRef.current = { type: contextType, value };
            console.log('[Player] getNextContextTrack - 🔄 NUEVO CONTEXTO encontrado:', value);
            return nextContextSongs[0];
          }
        }
      }
      return null;
    }

    // Buscar el siguiente contexto diferente (después del actual)
    let nextContextValue = null;
    for (let i = currentContextIndex + 1; i < uniqueContexts.length; i++) {
      const candidate = uniqueContexts[i];
      if (String(candidate).toLowerCase().trim() !== currentContextNormalized) {
        nextContextValue = candidate;
        break;
      }
    }

    // Si no hay siguiente, buscar desde el principio (loop)
    if (!nextContextValue) {
      for (let i = 0; i < uniqueContexts.length; i++) {
        const candidate = uniqueContexts[i];
        if (String(candidate).toLowerCase().trim() !== currentContextNormalized) {
          nextContextValue = candidate;
          break;
        }
      }
      console.log('[Player] getNextContextTrack - 🔄 No hay más contextos, looping al principio');
    }

    // Si encontramos un contexto, devolver su primera canción
    if (nextContextValue) {
      const nextContextSongs = allSongs.filter(s => {
        if (contextType === 'artist') return s.artist === nextContextValue;
        if (contextType === 'album') return s.album === nextContextValue;
        if (contextType === 'genre') return s.genre === nextContextValue;
        if (contextType === 'year') return String(s.year) === nextContextValue;
        return false;
      });

      if (nextContextSongs.length > 0) {
        contextRef.current = { type: contextType, value: nextContextValue };
        console.log('[Player] getNextContextTrack - 🎵 SIGUIENTE CONTEXTO:', nextContextValue);
        console.log('[Player] getNextContextTrack - 🎵 Primera canción:', nextContextSongs[0]?.title);
        return nextContextSongs[0];
      }
    }

    console.log('[Player] getNextContextTrack - Fin del contexto');
    return null;
  }, []);

  // ============================================================
  // 3.13 FUNCIÓN - prev (Canción anterior)
  // ============================================================

  const prev = useCallback(() => {
    const a = getActive();
    // Si la canción lleva más de 3 segundos, reiniciar
    if (a && a.currentTime > 3) {
      a.currentTime = 0;
      setProgress(0);
      return;
    }
    if (indexRef.current > 0) playIndex(indexRef.current - 1);
  }, [playIndex]);

  // ============================================================
  // 3.14 FUNCIÓN - next (Siguiente canción)
  // ============================================================

  const next = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) {
      console.log('[Player] next - Cola vacía');
      return;
    }

    // Repeat one: replay current song
    if (repeatModeRef.current === 2 && indexRef.current >= 0 && indexRef.current < q.length) {
      console.log('[Player] next - Repeat one, reproduciendo de nuevo');
      playIndex(indexRef.current);
      return;
    }

    // ============================================================
    // PASO PRIORITARIO: Consumir canciones de "up next" primero
    // ============================================================
    const upNext = upNextRef.current;
    if (upNext.length > 0) {
      const nextSong = upNext[0];
      upNextRef.current = upNext.slice(1);
      setUpNextQueue(upNextRef.current);

      // Buscar el índice de la canción en la cola principal
      const nextIndex = q.findIndex(s => s.id === nextSong.id);
      if (nextIndex !== -1) {
        console.log('[Player] next - Reproduciendo desde up-next:', nextSong.title, '(índice:', nextIndex, ')');
        playIndex(nextIndex);
        return;
      } else {
        // La canción no está en la cola, agregarla y reproducirla
        console.log('[Player] next - Up-next canción no encontrada en cola, añadiendo:', nextSong.title);
        const newQueue = [...q, nextSong];
        queueRef.current = newQueue;
        setQueue(newQueue);
        playIndex(newQueue.length - 1);
        return;
      }
    }

    // Obtener la canción actual
    const currentSong = q[indexRef.current];
    if (!currentSong) {
      console.log('[Player] next - ❌ No hay canción actual');
      return;
    }

    // Obtener contexto
    const context = contextRef.current;
    const contextType = context?.type || null;
    const contextValue = context?.value || null;

    console.log('[Player] next - Contexto:', {
      contextType,
      contextValue,
      currentSong: currentSong?.title,
      currentIndex: indexRef.current,
      total: q.length
    });

    // ============================================================
    // Si hay contexto, buscar la siguiente canción en el contexto
    // ============================================================
    if (contextType && contextValue) {
      const nextTrack = getNextContextTrack(currentSong, q, contextType, contextValue);
      console.log('[Player] next - Siguiente en contexto:', nextTrack?.title || 'No encontrada');

      if (nextTrack) {
        // Buscar el índice de la canción en la cola
        const nextIndex = q.findIndex(s => s.id === nextTrack.id);
        if (nextIndex !== -1 && nextIndex !== indexRef.current) {
          console.log('[Player] next - Reproduciendo:', nextTrack.title, '(índice:', nextIndex, ')');
          playIndex(nextIndex);
          return;
        }
      }
    }

    // ============================================================
    // Si no hay contexto o no se encontró, comportamiento normal
    // ============================================================
    console.log('[Player] next - Comportamiento normal (sin contexto o sin siguiente)');
    if (indexRef.current < q.length - 1) {
      const nextIndex = indexRef.current + 1;
      console.log('[Player] next - Siguiente canción en la lista:', q[nextIndex]?.title);
      playIndex(nextIndex);
    } else {
      console.log('[Player] next - Fin de la lista');
      if (repeatModeRef.current === 1) {
        console.log('[Player] next - Repeat all, volviendo al principio');
        playIndex(0);
      } else {
        console.log('[Player] next - Deteniendo reproducción');
        setIsPlaying(false);
        const a = getActive();
        if (a) {
          a.currentTime = 0;
          setProgress(0);
        }
      }
    }
  }, [playIndex, getNextContextTrack]);

  // ============================================================
  // 3.15 FUNCIÓN - togglePlay (Pausar / Reanudar)
  // ============================================================

  const togglePlay = useCallback(() => {
    const a = getActive();
    if (!a || !a.src) return;
    if (a.paused) {
      a.play();
      setIsPlaying(true);
    } else {
      a.pause();
      setIsPlaying(false);
    }
  }, []);

  // ============================================================
  // 3.16 FUNCIÓN - seek (Cambiar posición de la canción)
  // ============================================================

  const seek = useCallback((time) => {
    const a = getActive();
    if (a && a.duration) {
      a.currentTime = time;
      setProgress(time);
    }
  }, []);

  // ============================================================
  // 3.17 FUNCIÓN - stop (Detener reproducción)
  // ============================================================

  const stop = useCallback(() => {
    clearFade();
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    audiosRef.current?.forEach((a) => {
      a.pause();
      a.removeAttribute('src');
      a.currentTime = 0;
    });
    setIsPlaying(false);
    setCurrent(null);
    setProgress(0);
    setDuration(0);
    queueRef.current = [];
    setQueue([]);
    upNextRef.current = [];
    setUpNextQueue([]);
    indexRef.current = -1;
    activeRef.current = 0;
    contextRef.current = null;
  }, []);

  // ============================================================
  // 3.18 FUNCIÓN - addToQueue (Añadir canción a la cola)
  // ============================================================

  const addToQueue = useCallback((song, position = 'next') => {
    if (!song) return;

    const currentQueue = queueRef.current;
    const currentIndex = indexRef.current;

    if (currentQueue.length === 0 || currentIndex === -1) {
      play(song, [song]);
      return;
    }

    const newUpNext = [...upNextRef.current];

    if (position === 'next') {
      newUpNext.splice(0, 0, song);
    } else {
      newUpNext.push(song);
    }

    upNextRef.current = newUpNext;
    setUpNextQueue(newUpNext);
  }, [play]);

  // ============================================================
  // 3.19 FUNCIÓN - removeFromQueue (Eliminar canción de la cola)
  // ============================================================

  const removeFromQueue = useCallback((songId) => {
    const currentQueue = queueRef.current;
    const currentIndex = indexRef.current;

    const songIndex = currentQueue.findIndex(s => s.id === songId);
    if (songIndex === -1) return false;

    const newQueue = currentQueue.filter(s => s.id !== songId);
    queueRef.current = newQueue;
    setQueue(newQueue);

    if (newQueue.length === 0) {
      stop();
      return true;
    }

    if (songIndex === currentIndex) {
      // Si se eliminó la canción actual, reproducir la siguiente inmediatamente
      const nextSong = newQueue[songIndex] || newQueue[0];
      if (nextSong) {
        const active = getActive();
        if (active) {
          active.pause();
          active.removeAttribute('src');
          active.currentTime = 0;
        }
        // Reproducir inmediatamente la siguiente canción con la nueva cola
        // Usar playIndex directamente para evitar condiciones de carrera
        queueRef.current = newQueue;
        setQueue(newQueue);
        const nextIdx = newQueue.findIndex(s => s.id === nextSong.id);
        if (nextIdx !== -1) {
          playIndex(nextIdx, { crossfade: false });
        }
        return true;
      } else {
        stop();
        return true;
      }
    } else if (songIndex < currentIndex) {
      // Ajustar índice si se eliminó una canción anterior
      const newIndex = currentIndex - 1;
      indexRef.current = newIndex;
      if (newIndex < newQueue.length) {
        setCurrent(newQueue[newIndex]);
      } else {
        setCurrent(newQueue[newQueue.length - 1] || null);
      }
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

    const advanceTrack = () => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      console.log('[Player] advanceTrack - Llamando a next()');
      next();
    };

    const updateProgress = () => {
      const a = getActive();
      if (!a) return;
      if (a.duration && a.duration > 0) {
        setProgress(a.currentTime);
        setDuration(a.duration);

        const remaining = a.duration - a.currentTime;
        if (remaining < 0.3 && remaining > 0 && !crossfadingRef.current) {
          advanceTrack();
        }
      }
    };

    const onTimeUpdate = () => {
      const a = getActive();
      if (!a) return;
      if (a.duration && a.duration > 0) {
        setProgress(a.currentTime);
        setDuration(a.duration);
      }
    };

    // Evento: cuando la canción termina
    const onEnded = () => {
      console.log('[Player] Evento ended - canción terminada');
      if (!crossfadingRef.current && !advancingRef.current) {
        advanceTrack();
      }
    };

    audios.forEach((a) => {
      a.addEventListener('timeupdate', onTimeUpdate);
      a.addEventListener('ended', onEnded);
      a.addEventListener('loadedmetadata', () => {
        setDuration(a.duration || 0);
      });
    });

    intervalId = setInterval(updateProgress, 100);

    return () => {
      audios.forEach((a) => {
        a.removeEventListener('timeupdate', onTimeUpdate);
        a.removeEventListener('ended', onEnded);
        a.removeEventListener('loadedmetadata', () => { });
      });
      if (intervalId) clearInterval(intervalId);
    };
  }, [next]);

  // ============================================================
  // 3.20 EFFECT - Actualizar duración cuando cambia la canción
  // ============================================================

  useEffect(() => {
    if (current) {
      const a = getActive();
      if (a && a.duration) {
        setDuration(a.duration);
      }
    }
  }, [current]);

  // ============================================================
  // 3.21 EFFECT - Media Session API (controles en pantalla de bloqueo)
  // ============================================================

  useEffect(() => {
    const a = getActive();
    if (!a || !current) return;

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title || 'Desconocido',
        artist: current.artist || 'Artista desconocido',
        album: current.album || '',
        artwork: current.cover
          ? [
            { src: current.cover, sizes: '96x96', type: 'image/*' },
            { src: current.cover, sizes: '128x128', type: 'image/*' },
            { src: current.cover, sizes: '192x192', type: 'image/*' },
            { src: current.cover, sizes: '256x256', type: 'image/*' },
            { src: current.cover, sizes: '384x384', type: 'image/*' },
            { src: current.cover, sizes: '512x512', type: 'image/*' },
          ]
          : [],
      });

      // Acciones de control
      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
      navigator.mediaSession.setActionHandler('previoustrack', prev);
      navigator.mediaSession.setActionHandler('nexttrack', next);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime && a.duration) {
          seek(details.seekTime);
        }
      });

      // Botón "Me gusta" (corazón)
      try {
        navigator.mediaSession.setActionHandler('togglemicrophone', () => {
          window.dispatchEvent(new CustomEvent('music-lock-toggle-like', { detail: current }));
        });
      } catch (err) {
        try {
          navigator.mediaSession.setActionHandler('setrating', (details) => {
            if (details.rating === 1) {
              window.dispatchEvent(new CustomEvent('music-lock-toggle-like', { detail: current }));
            }
          });
        } catch (_) { }
      }

      // Botón "No me gusta"
      try {
        navigator.mediaSession.setActionHandler('hangup', () => {
          next();
        });
      } catch (err) { }
    }
  }, [current, isPlaying, togglePlay, prev, next, seek]);

  // ============================================================
  // 3.22 FUNCIÓN - getActiveAudio (Obtener el audio activo)
  // ============================================================

  const getActiveAudio = useCallback(() => getActive(), []);

  // ============================================================
  // 3.23 VALOR DEL CONTEXTO (exportado a los hijos)
  // ============================================================

  const value = {
    queue,
    upNextQueue,
    current,
    isPlaying,
    progress,
    duration,
    volume,
    crossfadeSec,
    repeatMode,
    setVolume,
    setCrossfadeSec,
    setRepeatMode,
    play,
    shufflePlay,
    next,
    prev,
    togglePlay,
    seek,
    stop,
    addToQueue,
    removeFromQueue,
    getActiveAudio,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
