import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { audioUrl } from '../lib/api.js';

const PlayerContext = createContext(null);
export const usePlayer = () => useContext(PlayerContext);

const FADE_MS = 16;
const SILENCE_THRESHOLD = 0.01;
const SILENCE_CHECK_DURATION = 5;
const SILENCE_ANALYSE_INTERVAL = 0.1;

export function PlayerProvider({ children }) {
  const audiosRef = useRef(null);
  const activeRef = useRef(0);
  const fadeTimerRef = useRef(null);
  const crossfadingRef = useRef(false);
  const queueRef = useRef([]);
  const indexRef = useRef(-1);
  const silenceSkipDoneRef = useRef(false);
  const silenceCheckIntervalRef = useRef(null);
  const playedHistoryRef = useRef(new Set());
  const originalQueueRef = useRef([]);

  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [crossfadeSec, setCrossfadeSec] = useState(3);
  const [repeatMode, setRepeatMode] = useState(0); // 0=none, 1=all, 2=one

  const volumeRef = useRef(volume);
  const crossfadeRef = useRef(crossfadeSec);
  const repeatModeRef = useRef(repeatMode);
  
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { crossfadeRef.current = crossfadeSec; }, [crossfadeSec]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);

  if (!audiosRef.current && typeof window !== 'undefined') {
    audiosRef.current = [new Audio(), new Audio()];
    audiosRef.current.forEach((a) => {
      a.preload = 'auto';
      a.crossOrigin = 'anonymous';
    });
  }

  const getActive = () => audiosRef.current[activeRef.current];
  const getIdle = () => audiosRef.current[activeRef.current === 0 ? 1 : 0];

  const clearFade = () => {
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  };

  // Detectar y saltar silencio al inicio
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
    const fadeTime = crossfade ? crossfadeRef.current : 0.3;

    clearFade();
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    crossfadingRef.current = true;

    incoming.src = audioUrl(song.id);
    incoming.currentTime = 0;
    incoming.volume = 0;
    
    const onLoadedMetadata = () => {
      setDuration(incoming.duration || 0);
      incoming.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
    incoming.addEventListener('loadedmetadata', onLoadedMetadata);
    
    const onPlay = () => {
      detectAndSkipSilence(incoming);
      incoming.removeEventListener('play', onPlay);
    };
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

  const play = useCallback((song, songs) => {
    const list = songs && songs.length ? songs : [song];
    queueRef.current = list;
    setQueue(list);
    const idx = list.findIndex((s) => s.id === song.id);
    playIndex(idx === -1 ? 0 : idx, { crossfade: getActive() && !getActive().paused });
  }, [playIndex]);

  // Reproducción aleatoria SIN repetición hasta completar toda la lista
  const shufflePlay = useCallback((songs) => {
    if (!songs || songs.length === 0) return;
    
    const list = [...songs];
    
    // Si ya se reprodujeron todas las canciones, reiniciar historial
    if (playedHistoryRef.current.size >= list.length) {
      playedHistoryRef.current = new Set();
    }
    
    // Filtrar canciones no reproducidas
    const unplayed = list.filter((s) => !playedHistoryRef.current.has(s.id));
    
    // Mezclar las canciones no reproducidas
    for (let i = unplayed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unplayed[i], unplayed[j]] = [unplayed[j], unplayed[i]];
    }
    
    // Actualizar historial: marcar todas como reproducidas para este ciclo
    unplayed.forEach((s) => playedHistoryRef.current.add(s.id));
    
    // Establecer cola completa (para next/prev funcionen correctamente)
    originalQueueRef.current = list;
    queueRef.current = list;
    setQueue(list);
    
    // Reproducir la primera canción del subset aleatorio
    const firstSong = unplayed[0];
    const firstIndex = list.findIndex((s) => s.id === firstSong.id);
    playIndex(firstIndex, { crossfade: getActive() && !getActive().paused });
  }, [playIndex]);

  const prev = useCallback(() => {
    const a = getActive();
    if (a && a.currentTime > 3) {
      a.currentTime = 0;
      setProgress(0);
      return;
    }
    if (indexRef.current > 0) playIndex(indexRef.current - 1);
  }, [playIndex]);

  const next = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    // Repeat one: replay current song
    if (repeatModeRef.current === 2 && indexRef.current >= 0 && indexRef.current < q.length) {
      playIndex(indexRef.current);
      return;
    }
    if (indexRef.current < q.length - 1) {
      playIndex(indexRef.current + 1);
    } else {
      // Repeat all: loop to beginning
      if (repeatModeRef.current === 1) {
        playIndex(0);
      } else {
        // No repeat: stop at end
        setIsPlaying(false);
        const a = getActive();
        if (a) {
          a.currentTime = 0;
          setProgress(0);
        }
      }
    }
  }, [playIndex]);

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

  const seek = useCallback((time) => {
    const a = getActive();
    if (a && a.duration) {
      a.currentTime = time;
      setProgress(time);
    }
  }, []);

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
  }, []);

// ====== ELIMINAR CANCIÓN DE LA COLA Y PASAR A LA SIGUIENTE ======
const removeFromQueue = useCallback((songId) => {
  const currentQueue = queueRef.current;
  const currentIndex = indexRef.current;
  
  // Encontrar la canción en la cola
  const songIndex = currentQueue.findIndex(s => s.id === songId);
  if (songIndex === -1) return false;
  
  // Crear nueva cola sin la canción
  const newQueue = currentQueue.filter(s => s.id !== songId);
  queueRef.current = newQueue;
  setQueue(newQueue);
  
  // Si la cola quedó vacía
  if (newQueue.length === 0) {
    stop();
    return true;
  }
  
  // Si la canción eliminada era la actual o estaba antes
  if (songIndex === currentIndex) {
    // La canción actual fue eliminada
    // Buscar la siguiente canción en la nueva cola
    let nextIndex = songIndex;
    if (nextIndex >= newQueue.length) {
      nextIndex = 0;
    }
    const nextSong = newQueue[nextIndex];
    if (nextSong) {
      // Detener reproducción actual
      const active = getActive();
      if (active) {
        active.pause();
        active.removeAttribute('src');
        active.currentTime = 0;
      }
      // Reproducir la siguiente
      setTimeout(() => {
        play(nextSong, newQueue);
      }, 150);
      return true;
    } else {
      stop();
      return true;
    }
  } else if (songIndex < currentIndex) {
    // La canción eliminada estaba antes de la actual, ajustar índice
    const newIndex = currentIndex - 1;
    indexRef.current = newIndex;
    // Actualizar current si es necesario
    if (newIndex < newQueue.length) {
      setCurrent(newQueue[newIndex]);
    } else {
      setCurrent(newQueue[newQueue.length - 1] || null);
    }
  }
  
  return true;
}, [play, stop]);

  // Actualizar progreso
  useEffect(() => {
    const audios = audiosRef.current;
    if (!audios) return;

    let intervalId = null;

    // Inline next-track logic to avoid circular dependency with next() const
    const advanceTrack = () => {
      const q = queueRef.current;
      const repeat = repeatModeRef.current;
      if (q.length === 0) return;
      // Repeat one: replay current song
      if (repeat === 2 && indexRef.current >= 0 && indexRef.current < q.length) {
        playIndex(indexRef.current);
        return;
      }
      if (indexRef.current < q.length - 1) {
        playIndex(indexRef.current + 1);
      } else {
        // Repeat all: loop to beginning
        if (repeat === 1) {
          playIndex(0);
        } else {
          // No repeat: stop at end
          setIsPlaying(false);
          const a = getActive();
          if (a) {
            a.currentTime = 0;
            setProgress(0);
          }
        }
      }
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

    const onEnded = () => {
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
        a.removeEventListener('loadedmetadata', () => {});
      });
      if (intervalId) clearInterval(intervalId);
    };
  }, [playIndex]);

  useEffect(() => {
    if (current) {
      const a = getActive();
      if (a && a.duration) {
        setDuration(a.duration);
      }
    }
  }, [current]);

  // Media Session API para controles de pantalla de bloqueo
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

      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
      navigator.mediaSession.setActionHandler('previoustrack', prev);
      navigator.mediaSession.setActionHandler('nexttrack', next);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime && a.duration) {
          seek(details.seekTime);
        }
      });

      // Botón "Me gusta" (corazón) - mapeado a 'togglemicrophone' en algunos dispositivos
      try {
        navigator.mediaSession.setActionHandler('togglemicrophone', () => {
          // Disparar evento personalizado para que App.jsx lo capture
          window.dispatchEvent(new CustomEvent('music-lock-toggle-like', { detail: current }));
        });
      } catch (err) {
        // Alternativa: API de Rating
        try {
          navigator.mediaSession.setActionHandler('setrating', (details) => {
            if (details.rating === 1) {
              window.dispatchEvent(new CustomEvent('music-lock-toggle-like', { detail: current }));
            }
          });
        } catch (_) {}
      }

      // Botón "No me gusta" / Bloquear (icono prohibido) - mapeado a 'hangup'
      try {
        navigator.mediaSession.setActionHandler('hangup', () => {
          next();
        });
      } catch (err) {}
    }
  }, [current, isPlaying, togglePlay, prev, next, seek]);

  // Exponer el audio activo para WaveSurfer
  const getActiveAudio = useCallback(() => getActive(), []);

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