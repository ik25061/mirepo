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
  const indexRef = useRef(-1); // Índice de la canción actual
  const silenceSkipDoneRef = useRef(false); // Ya se saltó el silencio
  const silenceCheckIntervalRef = useRef(null); // Intervalo para check de silencio
  const playedHistoryRef = useRef(new Set()); // Historial de canciones reproducidas (shuffle)
  const originalQueueRef = useRef([]); // Cola original (para shuffle)
  const contextRef = useRef(null); // Contexto actual (artista, álbum, género)

  // ============================================================
  // 3.2 ESTADO (useState)
  // ============================================================

  const [queue, setQueue] = useState([]); // Cola visible
  const [current, setCurrent] = useState(null); // Canción actual
  const [isPlaying, setIsPlaying] = useState(false); // Estado de reproducción
  const [progress, setProgress] = useState(0); // Progreso en segundos
  const [duration, setDuration] = useState(0); // Duración total
  const [volume, setVolume] = useState(0.9); // Volumen (0-1)
  const [crossfadeSec, setCrossfadeSec] = useState(1.5); // Duración del fade (segundos)
  const [repeatMode, setRepeatMode] = useState(0); // 0=none, 1=all, 2=one

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

  const playIndex = useCallback((idx, { crossfade = true } = {}) => {
    const q = queueRef.current;
    if (idx < 0 || idx >= q.length) return;
    const song = q[idx];
    indexRef.current = idx;
    setCurrent(song);
    setDuration(0);
    setProgress(0);
    silenceSkipDoneRef.current = false;

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

    incoming.src = audioUrl(song.id);
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
  console.log('[Player] play - Canción:', song?.title);
  console.log('[Player] play - Contexto recibido:', context);
  console.log('[Player] play - Canciones recibidas:', songs?.length || 0);
  
  // Si hay contexto, usar TODAS las canciones para la cola,
  // no solo las del contexto, para poder saltar a otros contextos
  let list = songs && songs.length ? songs : [song];
  
  // Si hay contexto y las canciones son solo del contexto,
  // necesitamos obtener todas las canciones de la biblioteca
  if (context && list.length === 1) {
    // Intentar obtener todas las canciones del estado global
    // Nota: esto requiere que pasemos todas las canciones desde el componente padre
    console.log('[Player] play - Contexto con una sola canción, buscando más canciones...');
    // Usamos las canciones recibidas, si solo es 1, esa es la que tenemos
  }
  
  queueRef.current = list;
  setQueue(list);
  
  // Guardar contexto para navegación continua
  contextRef.current = context;
  console.log('[Player] play - Contexto guardado:', contextRef.current);
  console.log('[Player] play - Cola total:', list.length);
  
  const idx = list.findIndex((s) => s.id === song.id);
  playIndex(idx === -1 ? 0 : idx, { crossfade: getActive() && !getActive().paused });
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
// 3.12 FUNCIÓN - getNextContextTrack (Buscar siguiente canción en el contexto)
// ============================================================
  
const getNextContextTrack = useCallback((currentSong, currentQueue, contextType, contextValue) => {
  console.log('[Player] getNextContextTrack - Buscando siguiente en:', contextType, contextValue);
  console.log('[Player] getNextContextTrack - Canción actual:', currentSong?.title);
  
  if (!contextType || !contextValue) return null;
  
  const allSongs = currentQueue;
  
  // Obtener todas las canciones del mismo contexto
  let contextSongs = [];
  if (contextType === 'artist') {
    contextSongs = allSongs.filter(s => s.artist === contextValue);
  } else if (contextType === 'album') {
    contextSongs = allSongs.filter(s => s.album === contextValue);
  } else if (contextType === 'genre') {
    contextSongs = allSongs.filter(s => s.genre === contextValue);
  } else {
    return null;
  }
  
  console.log('[Player] getNextContextTrack - Canciones en contexto:', contextSongs.length);
  
  if (contextSongs.length === 0) return null;
  
  // Encontrar la canción actual en el contexto
  const currentIndex = contextSongs.findIndex(s => s.id === currentSong.id);
  console.log('[Player] getNextContextTrack - Índice actual en contexto:', currentIndex);
  
  // ============================================================
  // CASO 1: Hay siguiente en el mismo contexto
  // ============================================================
  if (currentIndex < contextSongs.length - 1 && currentIndex !== -1) {
    const nextSong = contextSongs[currentIndex + 1];
    console.log('[Player] getNextContextTrack - ✅ Siguiente en mismo contexto:', nextSong?.title);
    return nextSong;
  }
  
  // ============================================================
  // CASO 2: Es la última canción del contexto
  // Buscar el SIGUIENTE contexto en la lista (en orden)
  // ============================================================
  console.log('[Player] getNextContextTrack - 🎯 Última del contexto, buscando siguiente contexto en orden');
  
  const currentAllIndex = allSongs.findIndex(s => s.id === currentSong.id);
  
  // Recopilar todos los contextos únicos en orden de aparición
  const uniqueContexts = [];
  const seenValues = new Set();
  
  for (const song of allSongs) {
    let contextValue = '';
    if (contextType === 'artist') {
      contextValue = song.artist;
    } else if (contextType === 'album') {
      contextValue = song.album;
    } else if (contextType === 'genre') {
      contextValue = song.genre;
    }
    
    if (contextValue && !seenValues.has(contextValue)) {
      seenValues.add(contextValue);
      uniqueContexts.push(contextValue);
    }
  }
  
  console.log('[Player] getNextContextTrack - 📋 Contextos únicos en orden:', uniqueContexts);
  
  // Encontrar el índice del contexto actual en la lista de contextos únicos
  const currentContextIndex = uniqueContexts.findIndex(c => c === contextValue);
  console.log('[Player] getNextContextTrack - 📍 Índice del contexto actual:', currentContextIndex);
  
  // Buscar el siguiente contexto en la lista (saltando el actual)
  let nextContextValue = null;
  for (let i = currentContextIndex + 1; i < uniqueContexts.length; i++) {
    const candidate = uniqueContexts[i];
    if (candidate !== contextValue) {
      nextContextValue = candidate;
      break;
    }
  }
  
  // Si no hay siguiente contexto, buscar desde el principio (loop)
  if (!nextContextValue && uniqueContexts.length > 1) {
    for (let i = 0; i < uniqueContexts.length; i++) {
      const candidate = uniqueContexts[i];
      if (candidate !== contextValue) {
        nextContextValue = candidate;
        break;
      }
    }
    console.log('[Player] getNextContextTrack - 🔄 No hay más contextos, looping al principio');
  }
  
  // Si encontramos un siguiente contexto, devolver su primera canción
  if (nextContextValue) {
    let nextContextSongs = [];
    if (contextType === 'artist') {
      nextContextSongs = allSongs.filter(s => s.artist === nextContextValue);
    } else if (contextType === 'album') {
      nextContextSongs = allSongs.filter(s => s.album === nextContextValue);
    } else if (contextType === 'genre') {
      nextContextSongs = allSongs.filter(s => s.genre === nextContextValue);
    }
    
    if (nextContextSongs.length > 0) {
      // ACTUALIZAR EL CONTEXTO AL NUEVO
      contextRef.current = { type: contextType, value: nextContextValue };
      const firstSong = nextContextSongs[0];
      console.log('[Player] getNextContextTrack - 🎵 SIGUIENTE CONTEXTO:', nextContextValue);
      console.log('[Player] getNextContextTrack - 🎵 Primera canción:', firstSong?.title);
      return firstSong;
    }
  }
  
  // ============================================================
  // CASO 3: Solo hay un contexto en toda la lista
  // ============================================================
  console.log('[Player] getNextContextTrack - ℹ️ Solo hay un contexto en toda la lista');
  
  // Si hay más de una canción del mismo contexto, volver a la primera
  if (contextSongs.length > 1) {
    const firstSong = contextSongs[0];
    if (firstSong && firstSong.id !== currentSong.id) {
      console.log('[Player] getNextContextTrack - 🔁 Volviendo a la primera canción:', firstSong?.title);
      return firstSong;
    }
    if (contextSongs.length > 1) {
      const nextSong = contextSongs[1];
      if (nextSong) {
        console.log('[Player] getNextContextTrack - 🔁 Siguiente canción:', nextSong?.title);
        return nextSong;
      }
    }
  }
  
  // Si solo hay una canción en toda la lista, detener
  console.log('[Player] getNextContextTrack - ⏹️ Solo una canción en toda la lista, deteniendo');
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
  
  console.log('[Player] next - Índice actual:', indexRef.current, 'Total:', q.length);
  
  // Repeat one: replay current song
  if (repeatModeRef.current === 2 && indexRef.current >= 0 && indexRef.current < q.length) {
    console.log('[Player] next - Repeat one, reproduciendo de nuevo');
    playIndex(indexRef.current);
    return;
  }
  
  // Obtener contexto si existe
  const currentSong = q[indexRef.current];
  const context = contextRef.current;
  const contextType = context?.type || null;
  const contextValue = context?.value || null;
  
  console.log('[Player] next - Contexto:', { 
    contextType: contextType, 
    contextValue: contextValue, 
    currentSong: currentSong?.title 
  });
  
  // Si hay contexto, buscar la siguiente canción en el contexto
  if (contextType && contextValue && currentSong) {
    const nextTrack = getNextContextTrack(currentSong, q, contextType, contextValue);
    console.log('[Player] next - Siguiente canción en contexto:', nextTrack?.title || 'No encontrada');
    
    if (nextTrack) {
      const nextIndex = q.findIndex(s => s.id === nextTrack.id);
      if (nextIndex !== -1 && nextIndex !== indexRef.current) {
        console.log('[Player] next - Reproduciendo:', nextTrack.title);
        playIndex(nextIndex);
        return;
      }
    }
  }
  
  // Si no hay contexto o no se encontró, comportamiento normal
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
    indexRef.current = -1;
    activeRef.current = 0;
    contextRef.current = null;
  }, []);

  // ============================================================
  // 3.18 FUNCIÓN - removeFromQueue (Eliminar canción de la cola)
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
      let nextIndex = songIndex;
      if (nextIndex >= newQueue.length) {
        nextIndex = 0;
      }
      const nextSong = newQueue[nextIndex];
      if (nextSong) {
        const active = getActive();
        if (active) {
          active.pause();
          active.removeAttribute('src');
          active.currentTime = 0;
        }
        setTimeout(() => {
          play(nextSong, newQueue);
        }, 150);
        return true;
      } else {
        stop();
        return true;
      }
    } else if (songIndex < currentIndex) {
      const newIndex = currentIndex - 1;
      indexRef.current = newIndex;
      if (newIndex < newQueue.length) {
        setCurrent(newQueue[newIndex]);
      } else {
        setCurrent(newQueue[newQueue.length - 1] || null);
      }
    }

    return true;
  }, [play, stop]);

  // ============================================================
  // 3.19 EFFECT - Actualizar progreso y manejar fin de canción
  // ============================================================

  useEffect(() => {
    const audios = audiosRef.current;
    if (!audios) return;

    let intervalId = null;

    // Avanzar a la siguiente canción
    const advanceTrack = () => {
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
        // Cuando queda menos de 0.3 segundos, avanzar
        if (remaining < 0.3 && remaining > 0 && !crossfadingRef.current) {
          console.log('[Player] Canción terminando, avanzando...');
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
      if (!crossfadingRef.current) {
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
    removeFromQueue,
    getActiveAudio,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}