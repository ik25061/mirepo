import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { audioUrl } from '../lib/api.js';

const PlayerContext = createContext(null);
export const usePlayer = () => useContext(PlayerContext);

const FADE_MS = 16;

export function PlayerProvider({ children }) {
  const audiosRef = useRef(null);
  const activeRef = useRef(0);
  const fadeTimerRef = useRef(null);
  const crossfadingRef = useRef(false);
  const queueRef = useRef([]);
  const indexRef = useRef(-1);

  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [crossfadeSec, setCrossfadeSec] = useState(3);

  const volumeRef = useRef(volume);
  const crossfadeRef = useRef(crossfadeSec);
  
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { crossfadeRef.current = crossfadeSec; }, [crossfadeSec]);

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

  const playIndex = useCallback((idx, { crossfade = true } = {}) => {
    const q = queueRef.current;
    if (idx < 0 || idx >= q.length) return;
    const song = q[idx];
    indexRef.current = idx;
    setCurrent(song);

    const incoming = getIdle();
    const outgoing = getActive();
    const target = volumeRef.current;
    const fadeTime = crossfade ? crossfadeRef.current : 0.3;

    clearFade();
    crossfadingRef.current = true;

    incoming.src = audioUrl(song.id);
    incoming.currentTime = 0;
    incoming.volume = 0;
    const playPromise = incoming.play();
    if (playPromise) playPromise.catch(() => {});
    setIsPlaying(true);

    const steps = Math.max(1, Math.round((fadeTime * 1000) / FADE_MS));
    let step = 0;
    fadeTimerRef.current = setInterval(() => {
      step++;
      const ratio = Math.min(1, step / steps);
      incoming.volume = Math.min(1, target * ratio);
      if (outgoing && !outgoing.paused) {
        outgoing.volume = Math.max(0, target * (1 - ratio));
      }
      if (ratio >= 1) {
        clearFade();
        if (outgoing && outgoing !== incoming) {
          outgoing.pause();
          outgoing.currentTime = 0;
        }
        activeRef.current = activeRef.current === 0 ? 1 : 0;
        crossfadingRef.current = false;
      }
    }, FADE_MS);
  }, []);

  const play = useCallback((song, songs) => {
    const list = songs && songs.length ? songs : [song];
    queueRef.current = list;
    setQueue(list);
    const idx = list.findIndex((s) => s.id === song.id);
    playIndex(idx === -1 ? 0 : idx, { crossfade: getActive() && !getActive().paused });
  }, [playIndex]);

  const next = useCallback(() => {
    if (indexRef.current < queueRef.current.length - 1) {
      playIndex(indexRef.current + 1);
    }
  }, [playIndex]);

  const prev = useCallback(() => {
    const a = getActive();
    if (a && a.currentTime > 3) {
      a.currentTime = 0;
      return;
    }
    if (indexRef.current > 0) playIndex(indexRef.current - 1);
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
    if (a) a.currentTime = time;
  }, []);

  const stop = useCallback(() => {
    clearFade();
    audiosRef.current?.forEach((a) => {
      a.pause();
      a.removeAttribute('src');
    });
    setIsPlaying(false);
    setCurrent(null);
    setProgress(0);
    setDuration(0);
    queueRef.current = [];
    setQueue([]);
    indexRef.current = -1;
  }, []);

  useEffect(() => {
    const audios = audiosRef.current;
    if (!audios) return;

    const onTime = () => {
      const a = getActive();
      if (!a) return;
      setProgress(a.currentTime);
      setDuration(a.duration || 0);

      const remaining = (a.duration || 0) - a.currentTime;
      const cf = crossfadeRef.current;
      if (
        cf > 0 &&
        a.duration &&
        remaining <= cf &&
        !crossfadingRef.current &&
        indexRef.current < queueRef.current.length - 1
      ) {
        playIndex(indexRef.current + 1);
      }
    };

    const onEnded = () => {
      if (!crossfadingRef.current && indexRef.current < queueRef.current.length - 1) {
        playIndex(indexRef.current + 1);
      } else if (indexRef.current >= queueRef.current.length - 1) {
        setIsPlaying(false);
      }
    };

    audios.forEach((a) => {
      a.addEventListener('timeupdate', onTime);
      a.addEventListener('ended', onEnded);
    });
    return () => {
      audios.forEach((a) => {
        a.removeEventListener('timeupdate', onTime);
        a.removeEventListener('ended', onEnded);
      });
    };
  }, [playIndex]);

  useEffect(() => {
    if (!crossfadingRef.current) {
      const a = getActive();
      if (a) a.volume = volume;
    }
  }, [volume]);

  const value = {
    queue,
    current,
    isPlaying,
    progress,
    duration,
    volume,
    crossfadeSec,
    setVolume,
    setCrossfadeSec,
    play,
    next,
    prev,
    togglePlay,
    seek,
    stop,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}