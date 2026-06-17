// App.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { BottomNav } from "./components/BottomNav";
import { MiniPlayer } from "./components/MiniPlayer";
import { NowPlayingScreen } from "./components/NowPlayingScreen";
import { MobileHomeView } from "./components/MobileHomeView";
import { MobileLibraryView } from "./components/MobileLibraryView";
import { MobileSearchView } from "./components/MobileSearchView";
import "./App.css";

const API_URL = 'http://172.16.12.4:5001';

// ====== CONFIGURACIÓN DE CROSSFADE Y SILENCIO ======
const CROSSFADE_DURATION = 3; // segundos de crossfade
const SILENCE_THRESHOLD = 0.01; // umbral para detectar silencio (0-1)
const SILENCE_CHECK_DURATION = 5; // segundos máximos a analizar al inicio
const SILENCE_ANALYSE_INTERVAL = 0.1; // intervalo de análisis en segundos

// ====== PERSISTENCIA DE FAVORITOS (localStorage) ======
const STORAGE_KEY_LIKED = 'mirepo_liked_ids';

function loadLikedIds() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_LIKED);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    }
  } catch (e) {
    console.warn('Error loading liked IDs from localStorage:', e);
  }
  return new Set();
}

function saveLikedIds(ids) {
  try {
    localStorage.setItem(STORAGE_KEY_LIKED, JSON.stringify([...ids]));
  } catch (e) {
    console.warn('Error saving liked IDs to localStorage:', e);
  }
}

function parseFilename(filename) {
  const name = filename.replace(/\.[^.]+$/, "");
  const dashIdx = name.indexOf(" - ");
  if (dashIdx !== -1) {
    return {
      artist: name.slice(0, dashIdx).trim(),
      title: name.slice(dashIdx + 3).trim(),
      album: "Desconocido",
    };
  }
  return { title: name, artist: "Artista desconocido", album: "Desconocido" };
}

function fileToTrack(file) {
  const { title, artist, album } = parseFilename(file.name);
  const url = URL.createObjectURL(file);
  return {
    id: `${file.name}-${file.lastModified}`,
    title,
    artist,
    album,
    duration: 0,
    url,
    file,
  };
}

function serverToTrack(song) {
  // La URL de la canción
  const audioUrl = `${API_URL}/songs/${encodeURIComponent(song.filename)}`;
  
  // Las imágenes ahora usan las nuevas rutas
  const coverUrl = song.hasCover && song.albumArtist && song.album 
    ? `${API_URL}/songs/${encodeURIComponent(song.albumArtist)}/${encodeURIComponent(song.album)}/cover.jpg`
    : null;
    
  const artistImageUrl = song.hasArtistImage && song.albumArtist
    ? `${API_URL}/songs/${encodeURIComponent(song.albumArtist)}/artist.jpg`
    : null;
  
  return {
    id: song.filename,
    title: song.title,
    artist: song.artist,
    album: song.album,
    albumArtist: song.albumArtist || song.artist,
    trackNumber: song.trackNumber,
    year: song.year || null,
    duration: song.duration || 0,
    url: audioUrl,
    cover: coverUrl,
    imageUrl: coverUrl || artistImageUrl, // Para compatibilidad
    genre: song.genre || 'Desconocido',
    filename: song.filename,
    hasCover: song.hasCover || false,
    hasArtistImage: song.hasArtistImage || false
  };
}
export default function App() {
  const [tracks, setTracks] = useState([]);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [likedIds, setLikedIds] = useState(() => loadLikedIds());
  const [activeView, setActiveView] = useState("home");
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  // Contexto de reproducción: qué grupo de canciones se está mostrando
  // { type: 'artist', value: 'Nombre', tracks: [...] } o { type: 'genre', value: 'Rock', tracks: [...] }
  const [playContext, setPlayContext] = useState(null);

  // ====== AUDIO CON CROSSFADE ======
  const audioContextRef = useRef(null);
  const audioARef = useRef(null);
  const audioBRef = useRef(null);
  const sourceARef = useRef(null);
  const sourceBRef = useRef(null);
  const gainARef = useRef(null);
  const gainBRef = useRef(null);
  const analyserRef = useRef(null);
  const activeSlotRef = useRef("A"); // "A" o "B" - cuál está reproduciendo
  const crossfadingRef = useRef(false);
  const silenceSkipDoneRef = useRef(false);
  const silenceCheckIntervalRef = useRef(null);

  // Referencia legacy para compatibilidad con componentes
  const audioRef = useRef(null);

  // ====== PERSISTIR likedIds EN localStorage ======
  useEffect(() => {
    saveLikedIds(likedIds);
  }, [likedIds]);

  // ====== FETCH SONGS FROM SERVER ======
  // Remove the limit parameter to fetch ALL songs from the server
  const fetchSongsFromServer = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/songs`);
      if (!response.ok) throw new Error('Error fetching songs');
      const data = await response.json();
      const tracksWithUrls = data.songs.map(serverToTrack);
      setTracks(tracksWithUrls);

      // Limpiar likedIds: eliminar IDs de canciones que ya no existen en el servidor
      const validIds = new Set(tracksWithUrls.map(t => t.id));
      setLikedIds(prev => {
        const cleaned = new Set([...prev].filter(id => validIds.has(id)));
        if (cleaned.size !== prev.size) {
          // Si hubo cambios, se guardarán automáticamente por el useEffect de persistencia
          return cleaned;
        }
        return prev;
      });
    } catch (err) {
      console.error('Error fetching songs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSongsFromServer();
  }, [fetchSongsFromServer]);

  // ====== INICIALIZAR AUDIO CONTEXT CON CROSSFADE ======
  useEffect(() => {
    // Crear AudioContext
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    audioContextRef.current = ctx;

    // Crear dos elementos de audio (A y B para crossfade)
    const audioA = new Audio();
    audioA.crossOrigin = "anonymous";
    const audioB = new Audio();
    audioB.crossOrigin = "anonymous";

    // Crear nodos de Audio
    const sourceA = ctx.createMediaElementSource(audioA);
    const gainA = ctx.createGain();
    sourceA.connect(gainA);

    const sourceB = ctx.createMediaElementSource(audioB);
    const gainB = ctx.createGain();
    sourceB.connect(gainB);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    // Conectar ambos gain nodes al analyser y al destino
    gainA.connect(analyser);
    gainB.connect(analyser);
    analyser.connect(ctx.destination);

    // Inicializar: A activo, B silenciado
    gainA.gain.value = 1;
    gainB.gain.value = 0;

    audioARef.current = audioA;
    audioBRef.current = audioB;
    sourceARef.current = sourceA;
    sourceBRef.current = sourceB;
    gainARef.current = gainA;
    gainBRef.current = gainB;
    analyserRef.current = analyser;

    // Hacer referencia legacy apunte al audio activo
    audioRef.current = audioA;

    return () => {
      audioA.pause();
      audioB.pause();
      audioA.src = "";
      audioB.src = "";
      ctx.close();
    };
  }, []);

  const currentTrack = queue[queueIndex] ?? null;

  // ====== FUNCIÓN: Obtener el audio activo ======
  const getActiveAudio = useCallback(() => {
    return activeSlotRef.current === "A" ? audioARef.current : audioBRef.current;
  }, []);

  const getActiveGain = useCallback(() => {
    return activeSlotRef.current === "A" ? gainARef.current : gainBRef.current;
  }, []);

  const getInactiveAudio = useCallback(() => {
    return activeSlotRef.current === "A" ? audioBRef.current : audioARef.current;
  }, []);

  const getInactiveGain = useCallback(() => {
    return activeSlotRef.current === "A" ? gainBRef.current : gainARef.current;
  }, []);

  // ====== FUNCIÓN: Detectar y saltar silencio al inicio ======
  const detectAndSkipSilence = useCallback((audio) => {
    if (!audio || !analyserRef.current || !audioContextRef.current) return;
    if (silenceSkipDoneRef.current) return;

    // Esperar a que empiece a reproducir
    const checkSilence = () => {
      if (!audio || audio.paused || audio.ended) {
        clearInterval(silenceCheckIntervalRef.current);
        return;
      }

      // Solo analizar los primeros N segundos
      if (audio.currentTime > SILENCE_CHECK_DURATION) {
        clearInterval(silenceCheckIntervalRef.current);
        silenceSkipDoneRef.current = true;
        return;
      }

      // Obtener nivel de audio actual
      const analyser = analyserRef.current;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);

      // Calcular nivel promedio
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length / 255; // Normalizar a 0-1

      // Si hay audio por encima del umbral, no hay silencio
      if (average > SILENCE_THRESHOLD) {
        silenceSkipDoneRef.current = true;
        clearInterval(silenceCheckIntervalRef.current);
        return;
      }

      // Si llevamos un tiempo reproduciendo y sigue en silencio, buscar adelante
      if (audio.currentTime > 1.5) {
        // Buscar el siguiente punto con audio
        const skipTo = Math.min(audio.currentTime + 0.5, audio.duration || 0);
        audio.currentTime = skipTo;
        silenceSkipDoneRef.current = true;
        clearInterval(silenceCheckIntervalRef.current);
      }
    };

    silenceCheckIntervalRef.current = setInterval(checkSilence, SILENCE_ANALYSE_INTERVAL * 1000);
  }, []);

  // ====== FUNCIÓN: Crossfade a siguiente canción ======
  const crossfadeToTrack = useCallback((nextTrack) => {
    if (crossfadingRef.current) return;
    crossfadingRef.current = true;

    const ctx = audioContextRef.current;
    if (!ctx) {
      crossfadingRef.current = false;
      return;
    }

    // Reanudar AudioContext si está suspendido
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const currentAudio = getActiveAudio();
    const currentGain = getActiveGain();
    const nextAudio = getInactiveAudio();
    const nextGain = getInactiveGain();

    // Preparar el siguiente audio
    nextAudio.src = nextTrack.url;
    nextAudio.load();

    // Configurar el volumen del siguiente en 0
    nextGain.gain.setValueAtTime(0, ctx.currentTime);

    // Cuando esté listo, hacer crossfade
    const onCanPlay = () => {
      nextAudio.removeEventListener("canplay", onCanPlay);

      // Iniciar reproducción del siguiente
      nextAudio.play().catch(() => {});

      // Fade out del actual
      currentGain.gain.setValueAtTime(currentGain.gain.value, ctx.currentTime);
      currentGain.gain.linearRampToValueAtTime(0, ctx.currentTime + CROSSFADE_DURATION);

      // Fade in del siguiente
      nextGain.gain.setValueAtTime(0, ctx.currentTime);
      nextGain.gain.linearRampToValueAtTime(1, ctx.currentTime + CROSSFADE_DURATION);

      // Después del crossfade, limpiar
      setTimeout(() => {
        currentAudio.pause();
        currentAudio.src = "";
        currentGain.gain.value = 1; // Reset para uso futuro

        // Intercambiar slots
        activeSlotRef.current = activeSlotRef.current === "A" ? "B" : "A";
        audioRef.current = nextAudio; // Actualizar referencia legacy
        crossfadingRef.current = false;

        // Detectar silencio en la nueva canción
        silenceSkipDoneRef.current = false;
        detectAndSkipSilence(nextAudio);
      }, CROSSFADE_DURATION * 1000);
    };

    nextAudio.addEventListener("canplay", onCanPlay, { once: true });
  }, [getActiveAudio, getActiveGain, getInactiveAudio, getInactiveGain, detectAndSkipSilence]);

  // ====== CARGAR TRACK ACTUAL ======
  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !currentTrack) return;

    // Reanudar AudioContext si está suspendido (necesario por políticas de autoplay)
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    // Si ya está crossfadeando, no interferir
    if (crossfadingRef.current) return;

    const audio = getActiveAudio();
    const gain = getActiveGain();
    if (!audio || !gain) return;

    // Resetear silencio
    silenceSkipDoneRef.current = false;

    audio.src = currentTrack.url;
    audio.load();

    // Configurar volumen
    gain.gain.setValueAtTime(1, ctx.currentTime);

    // Detectar silencio cuando empiece a reproducir
    const onPlay = () => {
      detectAndSkipSilence(audio);
      audio.removeEventListener("play", onPlay);
    };
    audio.addEventListener("play", onPlay);

    audio.play().catch(() => {});
  }, [currentTrack?.id, getActiveAudio, getActiveGain, detectAndSkipSilence]);

  // ====== PLAY/PAUSE ======
  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const audio = getActiveAudio();
    if (!audio) return;

    if (isPlaying) {
      if (ctx.state === "suspended") ctx.resume();
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, getActiveAudio]);

  // ====== ACTUALIZAR METADATOS DE DURACIÓN ======
  useEffect(() => {
    const audio = getActiveAudio();
    if (!audio || !currentTrack) return;

    const onMeta = () => {
      const dur = audio.duration;
      setTracks((prev) => prev.map((t) => t.id === currentTrack.id ? { ...t, duration: dur } : t));
      setQueue((prev) => prev.map((t) => t.id === currentTrack.id ? { ...t, duration: dur } : t));
    };

    audio.addEventListener("loadedmetadata", onMeta);
    return () => audio.removeEventListener("loadedmetadata", onMeta);
  }, [currentTrack, getActiveAudio]);

  // ====== AUTOMATIC NEXT WITH CROSSFADE ======
  // Referencia mutable para el handler onEnded (evita stale closures con los refs)
  const onEndedRef = useRef(null);

  useEffect(() => {
    // Cada vez que cambia currentTrack o queue, re-adjuntar evento ended al audio correcto
    const currentAudio = getActiveAudio();
    if (!currentAudio) return;

    // Limpiar listener anterior
    if (onEndedRef.current) {
      // Remover del audio previo (si existe y es diferente)
    }

    const onEnded = () => {
      const nextIndex = queueIndex + 1;
      if (nextIndex < queue.length) {
        const nextTrack = queue[nextIndex];
        setQueueIndex(nextIndex);
        setIsPlaying(true);
        // Pequeño delay para asegurar que el estado se actualice antes del crossfade
        setTimeout(() => {
          crossfadeToTrack(nextTrack);
        }, 100);
      } else if (queue.length > 0) {
        setQueueIndex(0);
        setIsPlaying(true);
        setTimeout(() => {
          crossfadeToTrack(queue[0]);
        }, 100);
      }
    };

    // Guardar referencia
    onEndedRef.current = onEnded;

    // Adjuntar evento
    currentAudio.addEventListener("ended", onEnded);

    // También detectar "stuck" en móvil (si el audio termina pero ended no se dispara)
    const checkInterval = setInterval(() => {
      if (!currentAudio.paused && currentAudio.currentTime > 0 && currentAudio.duration > 0) {
        const remaining = currentAudio.duration - currentAudio.currentTime;
        if (remaining <= 0.2 && !currentAudio.ended) {
          // El audio llegó al final pero no disparó ended, forzar
          currentAudio.dispatchEvent(new Event('ended'));
        }
      }
    }, 500);

    return () => {
      currentAudio.removeEventListener("ended", onEnded);
      clearInterval(checkInterval);
    };
  }, [currentTrack?.id, queueIndex, queue, getActiveAudio, crossfadeToTrack]);

  // ====== PLAYBACK CONTROLS ======
  const playTrack = useCallback((track, indexInTracks, context) => {
    // Si hay crossfade en curso, cancelarlo
    if (crossfadingRef.current) {
      const oldActive = getActiveAudio();
      if (oldActive) {
        oldActive.pause();
        oldActive.src = "";
      }
      crossfadingRef.current = false;
    }

    // Limpiar intervalo de silencio
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
    }

    setQueue(tracks);
    setQueueIndex(indexInTracks);
    setIsPlaying(true);

    // Establecer contexto de reproducción (artista, género, etc.)
    if (context) {
      setPlayContext(context);
    } else {
      setPlayContext(null);
    }

    // Reproducir directamente en el slot activo
    const ctx = audioContextRef.current;
    const audio = getActiveAudio();
    const gain = getActiveGain();
    if (ctx && audio && gain) {
      if (ctx.state === "suspended") ctx.resume();
      silenceSkipDoneRef.current = false;
      audio.src = track.url;
      audio.load();
      gain.gain.setValueAtTime(1, ctx.currentTime);
      audio.play().catch(() => {});
    }
  }, [tracks, getActiveAudio, getActiveGain]);

  const handleNext = useCallback(() => {
    const nextIndex = queueIndex + 1;
    if (nextIndex < queue.length) {
      const nextTrack = queue[nextIndex];
      setQueueIndex(nextIndex);
      setIsPlaying(true);
      crossfadeToTrack(nextTrack);
    } else if (queue.length > 0) {
      setQueueIndex(0);
      setIsPlaying(true);
      crossfadeToTrack(queue[0]);
    }
  }, [queueIndex, queue, crossfadeToTrack]);

  const handlePrev = useCallback(() => {
    const audio = getActiveAudio();
    if (audio && audio.currentTime > 3) {
      // Si llevamos más de 3 segundos, reiniciar la canción actual
      const ctx = audioContextRef.current;
      if (ctx) {
        audio.currentTime = 0;
      }
    } else if (queueIndex - 1 >= 0) {
      // Ir a la anterior
      const prevTrack = queue[queueIndex - 1];
      setQueueIndex(queueIndex - 1);
      setIsPlaying(true);
      crossfadeToTrack(prevTrack);
    } else if (queue.length > 0) {
      // Ir a la última
      const lastTrack = queue[queue.length - 1];
      setQueueIndex(queue.length - 1);
      setIsPlaying(true);
      crossfadeToTrack(lastTrack);
    }
  }, [queueIndex, queue, getActiveAudio, crossfadeToTrack]);

  const handlePlayPause = useCallback(() => {
    if (!currentTrack) return;
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === "suspended") {
      ctx.resume();
    }
    setIsPlaying((p) => !p);
  }, [currentTrack]);

  const handleLike = useCallback((id) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ====== DELETE SONG ======
const handleDeleteSong = useCallback(async (track) => {
  if (!window.confirm(`¿Eliminar "${track.title}" de la biblioteca?`)) return;
  
  try {
    // Asegurar que enviamos el filename correcto
    const filename = track.filename || track.id;
    
    const response = await fetch(`${API_URL}/api/songs`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: filename })
    });
    
    if (response.ok) {
      const isCurrentTrack = currentTrack?.id === track.id;
      
      // 1. Eliminar de tracks (actualización local inmediata)
      setTracks(prev => prev.filter(t => t.id !== track.id && t.filename !== track.filename));
      
      // 2. Eliminar de likedIds si estaba marcada como favorita
      if (likedIds.has(track.id)) {
        setLikedIds(prev => {
          const next = new Set(prev);
          next.delete(track.id);
          return next;
        });
      }
      
      // 3. Manejar la cola de reproducción si la canción estaba en ella
      setQueue(prev => {
        const newQueue = prev.filter(t => t.id !== track.id && t.filename !== track.filename);
        
        if (newQueue.length === 0) {
          // No hay más canciones en la cola
          setQueueIndex(-1);
          setIsPlaying(false);
          // Limpiar audio
          const audio = getActiveAudio();
          if (audio) {
            audio.pause();
            audio.src = "";
          }
          return [];
        }
        
        // Si la canción eliminada estaba en la cola, ajustar índice
        const deletedIndex = prev.findIndex(t => t.id === track.id || t.filename === track.filename);
        if (deletedIndex !== -1) {
          if (deletedIndex < queueIndex) {
            // Canción anterior eliminada - seguir reproduciendo la misma, ajustar índice
            setQueueIndex(queueIndex - 1);
          } else if (deletedIndex === queueIndex) {
            // Canción actual eliminada - pasar a la siguiente (la que se desplaza a esta posición)
            const newIndex = Math.min(queueIndex, newQueue.length - 1);
            setQueueIndex(newIndex);
            
            if (isCurrentTrack && newQueue.length > 0) {
              const nextTrack = newQueue[newIndex];
              setTimeout(() => {
                const ctx = audioContextRef.current;
                const audio = getActiveAudio();
                const gain = getActiveGain();
                if (ctx && audio && gain && nextTrack) {
                  if (ctx.state === "suspended") ctx.resume();
                  silenceSkipDoneRef.current = false;
                  audio.src = nextTrack.url;
                  audio.load();
                  gain.gain.setValueAtTime(1, ctx.currentTime);
                  audio.play().catch(() => {});
                }
              }, 100);
            }
          }
          // Si deletedIndex > queueIndex, el índice no cambia (la canción actual sigue igual)
        }
        
        return newQueue;
      });
      
      // Mostrar mensaje de éxito
      console.log(`✅ Canción "${track.title}" eliminada correctamente`);
      
    } else {
      const error = await response.json();
      alert(`❌ Error al eliminar: ${error.error || 'Error desconocido'}`);
    }
  } catch (err) {
    console.error('Error deleting song:', err);
    alert('❌ Error de red al eliminar la canción');
  }
}, [currentTrack, likedIds, queueIndex, getActiveAudio, getActiveGain, audioContextRef]);

  // ====== SYNC METADATA ======
  const handleSyncMetadata = useCallback(async (track) => {
    try {
      const response = await fetch(`${API_URL}/api/songs/sync-metadata`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: track.filename || track.id })
      });

      if (response.ok) {
        const result = await response.json();
        const albumText = result.updatedSong.album || "Desconocido";
        const yearText = result.updatedSong.year || "";
        alert(`✅ Sincronización completa!\n\n🎵 Título: ${result.updatedSong.title}\n🎤 Artista: ${result.updatedSong.artist}\n📀 Álbum: ${albumText}${yearText ? `\n📅 Año: ${yearText}` : ''}\n🏷️ Género: ${result.updatedSong.genre}`);

        await fetchSongsFromServer();

        if (currentTrack?.id === track.id || currentTrack?.id === track.filename) {
          const updatedFilename = result.updatedSong.filename;
          setQueue(prev => prev.map(t => {
            if (t.id === track.id || t.id === track.filename) {
              return {
                ...t,
                title: result.updatedSong.title,
                artist: result.updatedSong.artist,
                album: result.updatedSong.album || t.album,
                year: result.updatedSong.year || t.year,
                genre: result.updatedSong.genre,
                filename: updatedFilename,
                id: updatedFilename,
                cover: result.updatedSong.hasAlbumImage
                  ? `${API_URL}/songs/album_art/${encodeURIComponent(updatedFilename.replace(/\.[^.]+$/, ''))}.jpg`
                  : result.updatedSong.hasArtistImage
                    ? `${API_URL}/songs/artist_art/${encodeURIComponent(updatedFilename.replace(/\.[^.]+$/, ''))}_artist.jpg`
                    : t.cover,
              };
            }
            return t;
          }));
        }
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.error}`);
      }
    } catch (err) {
      console.error('Error syncing metadata:', err);
      alert('❌ Error de red al sincronizar');
    }
  }, [fetchSongsFromServer, currentTrack]);

  // ====== LOAD FILES (local) ======
  const handleLoadFiles = useCallback((files) => {
    const newTracks = Array.from(files)
      .filter((f) => f.type.startsWith("audio/") || /\.(mp3|flac|wav|ogg|aac|m4a|opus|wma)$/i.test(f.name))
      .map(fileToTrack);
    setTracks((prev) => {
      const ids = new Set(prev.map((t) => t.id));
      return [...prev, ...newTracks.filter((t) => !ids.has(t.id))];
    });
  }, []);

  const handleLoadFolder = useCallback(async () => {
    try {
      if (typeof window.showDirectoryPicker !== "undefined") {
        const dirHandle = await window.showDirectoryPicker();
        const files = [];
        async function walk(handle) {
          for await (const entry of handle.values()) {
            if (entry.kind === "file") {
              const file = await entry.getFile();
              if (/\.(mp3|flac|wav|ogg|aac|m4a|opus|wma)$/i.test(file.name)) files.push(file);
            } else if (entry.kind === "directory") {
              await walk(entry);
            }
          }
        }
        await walk(dirHandle);
        const newTracks = files.map(fileToTrack);
        setTracks((prev) => {
          const ids = new Set(prev.map((t) => t.id));
          return [...prev, ...newTracks.filter((t) => !ids.has(t.id))];
        });
      } else {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "audio/*";
        input.multiple = true;
        input.webkitdirectory = true;
        input.onchange = () => { if (input.files) handleLoadFiles(input.files); };
        input.click();
      }
    } catch (_) {}
  }, [handleLoadFiles]);

  // ====== RENDER ======
  if (showNowPlaying) {
    return (
      <div className="fixed inset-0" style={{ zIndex: 50 }}>
        <NowPlayingScreen
          track={currentTrack}
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onNext={handleNext}
          onPrev={handlePrev}
          onLike={handleLike}
          likedIds={likedIds}
          audioRef={audioRef}
          onClose={() => setShowNowPlaying(false)}
          onSync={handleSyncMetadata}
          onDelete={handleDeleteSong}
          allTracks={tracks}
          playContext={playContext}
          onPlay={playTrack}
          currentQueueIndex={queueIndex}
        />
      </div>
    );
  }

  function renderView() {
    const commonProps = {
      tracks,
      currentTrack,
      isPlaying,
      likedIds,
      onPlay: playTrack,
      onLike: handleLike,
      onLoadFiles: handleLoadFiles,
      onLoadFolder: handleLoadFolder,
      onDelete: handleDeleteSong,
      onSync: handleSyncMetadata,
    };

    if (activeView === "home") {
      return <MobileHomeView {...commonProps} />;
    }
    if (activeView === "search") {
      return <MobileSearchView tracks={tracks} currentTrack={currentTrack} onPlay={playTrack} />;
    }
    if (activeView === "library" || activeView === "nowplaying") {
      return <MobileLibraryView {...commonProps} />;
    }
    return null;
  }

  return (
    <div
      className="flex flex-col app-root"
      style={{
        height: "100dvh",
        background: "#121212",
        color: "#fff",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* App container: max-width on mobile, full-width on TV */}
      <div className="app-inner" style={{
        maxWidth: 480,
        width: "100%",
        margin: "0 auto",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}>
        <div className="flex-1 min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p style={{ color: "#a7a7a7" }}>Cargando música...</p>
            </div>
          ) : (
            renderView()
          )}
        </div>

        <div style={{ flexShrink: 0 }}>
          {currentTrack && (
            <MiniPlayer
              track={currentTrack}
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              onNext={handleNext}
              onOpen={() => setShowNowPlaying(true)}
            />
          )}
          <BottomNav
            activeView={activeView}
            onViewChange={(v) => {
              if (v === "nowplaying" && currentTrack) {
                setShowNowPlaying(true);
              } else {
                setActiveView(v);
              }
            }}
            hasCurrentTrack={!!currentTrack}
          />
        </div>
      </div>
    </div>
  );
}