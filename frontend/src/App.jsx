// App.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { BottomNav } from "./components/BottomNav";
import { MiniPlayer } from "./components/MiniPlayer";
import { NowPlayingScreen } from "./components/NowPlayingScreen";
import { MobileHomeView } from "./components/MobileHomeView";
import { MobileLibraryView } from "./components/MobileLibraryView";
import { MobileSearchView } from "./components/MobileSearchView";
import "./App.css";

const API_URL = 'http://172.16.12.4:5000';

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
  return {
    id: song.filename,
    title: song.title,
    artist: song.artist,
    album: song.album || "Desconocido",
    year: song.year || null,
    duration: song.duration || 0,
    url: `${API_URL}/songs/${encodeURIComponent(song.filename)}`,
    cover: song.imageUrl ? `${API_URL}${song.imageUrl}` : undefined,
    genre: song.genre,
    filename: song.filename,
  };
}

export default function App() {
  const [tracks, setTracks] = useState([]);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [likedIds, setLikedIds] = useState(new Set());
  const [activeView, setActiveView] = useState("home");
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [loading, setLoading] = useState(true);

  const audioRef = useRef(null);

  // ===== FETCH SONGS FROM SERVER =====
  const fetchSongsFromServer = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/songs?limit=100`);
      if (!response.ok) throw new Error('Error fetching songs');
      const data = await response.json();
      const tracksWithUrls = data.songs.map(serverToTrack);
      setTracks(tracksWithUrls);
    } catch (err) {
      console.error('Error fetching songs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSongsFromServer();
  }, [fetchSongsFromServer]);

  // ===== AUDIO SETUP =====
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
  }, []);

  const currentTrack = queue[queueIndex] ?? null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.src = currentTrack.url;
    audio.load();
    audio.play().catch(() => {});
  }, [currentTrack?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => {
      if (currentTrack) {
        const dur = audio.duration;
        setTracks((prev) => prev.map((t) => t.id === currentTrack.id ? { ...t, duration: dur } : t));
        setQueue((prev) => prev.map((t) => t.id === currentTrack.id ? { ...t, duration: dur } : t));
      }
    };
    audio.addEventListener("loadedmetadata", onMeta);
    return () => audio.removeEventListener("loadedmetadata", onMeta);
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      setQueueIndex((i) => (i + 1 < queue.length ? i + 1 : 0));
      setIsPlaying(true);
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [queue.length]);

  // ===== PLAYBACK CONTROLS =====
  const playTrack = useCallback((track, indexInTracks) => {
    setQueue(tracks);
    setQueueIndex(indexInTracks);
    setIsPlaying(true);
  }, [tracks]);

  const handleNext = useCallback(() => {
    setQueueIndex((i) => (i + 1 < queue.length ? i + 1 : 0));
    setIsPlaying(true);
  }, [queue.length]);

  const handlePrev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
    } else {
      setQueueIndex((i) => (i - 1 >= 0 ? i - 1 : queue.length - 1));
    }
    setIsPlaying(true);
  }, [queue.length]);

  const handlePlayPause = useCallback(() => {
    if (!currentTrack) return;
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

  // ===== DELETE SONG (envía a la papelera y salta a la siguiente) =====
  const handleDeleteSong = useCallback(async (track) => {
    if (!window.confirm(`¿Enviar "${track.title}" a la papelera?`)) return;
    try {
      const response = await fetch(`${API_URL}/api/songs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: track.filename || track.id })
      });
      if (response.ok) {
        // Obtener índice antes de eliminar para saber si era la canción actual
        const isCurrentTrack = currentTrack?.id === track.id;
        
        // Actualizar la lista de tracks
        setTracks(prev => {
          const updated = prev.filter(t => t.id !== track.id);
          return updated;
        });
        
        if (isCurrentTrack) {
          // Saltar a la siguiente canción
          setQueue(queue => {
            const deletedIdx = queue.findIndex(t => t.id === track.id);
            if (deletedIdx === -1) return queue;
            const newQueue = queue.filter(t => t.id !== track.id);
            if (newQueue.length === 0) {
              setQueueIndex(-1);
              setIsPlaying(false);
              return [];
            }
            // Si la canción eliminada estaba antes o en el índice actual, ajustar
            setQueueIndex(prevIdx => {
              if (deletedIdx < prevIdx) return prevIdx - 1;
              if (deletedIdx === prevIdx) return Math.min(prevIdx, newQueue.length - 1);
              return prevIdx;
            });
            setIsPlaying(true);
            return newQueue;
          });
        }
        
        await fetchSongsFromServer();
      } else {
        const error = await response.json();
        alert(`❌ Error al eliminar: ${error.error}`);
      }
    } catch (err) {
      console.error('Error deleting song:', err);
      alert('❌ Error de red al eliminar la canción');
    }
  }, [currentTrack, fetchSongsFromServer]);

  // ===== SYNC METADATA (actualiza la vista actual también) =====
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
        
        // Refrescar lista completa
        await fetchSongsFromServer();
        
        // Si la canción sincronizada es la actual, actualizar también la queue
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

  // ===== LOAD FILES (local) =====
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

  // ===== RENDER =====
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
      className="flex flex-col"
      style={{
        height: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        background: "#121212",
        color: "#fff",
        overflow: "hidden",
        position: "relative",
      }}
    >
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
  );
}