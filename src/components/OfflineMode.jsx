import { useEffect, useState, useCallback, useMemo } from 'react';
import { useDownload } from '../context/DownloadContext.jsx';
import { usePlayer } from '../context/PlayerContext.jsx';
import SongRow from './SongRow.jsx';
import MiniPlayer from './MiniPlayer.jsx';
import NowPlayingScreen from './NowPlayingScreen.jsx';

export default function OfflineMode() {
  const {
    downloadedSongs,
    loading,
    reload,
    updateLiked,
    markSongForDeletion,
  } = useDownload();
  const { current, isPlaying, togglePlay, next, prev, removeFromQueue } = usePlayer();
  const [showNowPlaying, setShowNowPlaying] = useState(false);

  useEffect(() => {
    reload();
  }, []);

  // Conjunto de IDs de descargas marcadas como "me gusta". Se recalcula
  // cuando cambia downloadedSongs, de modo que el corazón se pinta en rojo
  // en cuanto se guarda el cambio.
  const likedIds = useMemo(
    () => new Set(downloadedSongs.filter((s) => s.liked).map((s) => s.id)),
    [downloadedSongs]
  );

  // Alternar "me gusta" en una descarga. updateLiked actualiza IndexedDB,
  // el estado local (para pintar el corazón) y encola el cambio pendiente
  // que se sincronizará con el servidor al recuperar la conexión.
  const handleLike = useCallback(async (songOrId) => {
    const songId = typeof songOrId === 'string' ? songOrId : songOrId?.id;
    if (!songId) return;
    try {
      await updateLiked(songId, !likedIds.has(songId));
    } catch (e) {
      console.error('[OfflineMode] Error al marcar me gusta:', e);
    }
  }, [updateLiked, likedIds]);

  // "No me gusta": quitar de la cola actual, desmarcar el like y marcar la
  // canción para eliminación diferida. markSongForDeletion elimina la descarga
  // local y encola la eliminación pendiente que se aplicará en el servidor al
  // recuperar la conexión (mismo comportamiento que en modo online).
  const handleDislike = useCallback(async (songOrId) => {
    const songId = typeof songOrId === 'string' ? songOrId : songOrId?.id;
    if (!songId) return;
    removeFromQueue(songId);
    try {
      await updateLiked(songId, false);
      await markSongForDeletion(songId);
    } catch (e) {
      console.error('[OfflineMode] Error al marcar no me gusta:', e);
    }
  }, [removeFromQueue, updateLiked, markSongForDeletion]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (downloadedSongs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4 text-center">
        <div className="text-6xl mb-4">📡</div>
        <h2 className="text-xl font-bold">Sin conexión</h2>
        <p className="text-muted-foreground mt-2 max-w-xs">
          No hay canciones descargadas para reproducir offline.
          Conéctate a internet y descarga algunas canciones primero.
        </p>
      </div>
    );
  }

  // Reproductor a pantalla completa (también disponible sin conexión).
  if (showNowPlaying && current) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <NowPlayingScreen
          track={current}
          isPlaying={isPlaying}
          onPlayPause={togglePlay}
          onNext={next}
          onPrev={prev}
          onLike={handleLike}
          onDislike={handleDislike}
          onDislikeArtist={() => {}}
          likedIds={likedIds}
          onClose={() => setShowNowPlaying(false)}
          allTracks={downloadedSongs}
          onDelete={() => {}}
          onFixMetadata={() => {}}
          onOpenArtist={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background" style={{ background: '#121212' }}>
      <div className="flex-1 overflow-y-auto p-4 w-full max-w-4xl mx-auto">
        <h2 className="text-xl font-bold mb-2">📱 Modo offline</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {downloadedSongs.length} canciones disponibles sin conexión
        </p>
        <div className="space-y-1">
          {downloadedSongs.map((song, i) => (
            <SongRow
              key={song.id}
              song={song}
              index={i}
              queue={downloadedSongs}
              onLike={handleLike}
              onDislike={handleDislike}
              likedIds={likedIds}
            />
          ))}
        </div>
      </div>

      {/* ===== MINI PLAYER (con me gusta funcional y acceso a pantalla completa) ===== */}
      <MiniPlayer
        track={current}
        isPlaying={isPlaying}
        onPlayPause={togglePlay}
        onNext={next}
        onOpen={() => current && setShowNowPlaying(true)}
        onLike={handleLike}
        onDislike={handleDislike}
        likedIds={likedIds}
        hasCurrentTrack={!!current}
      />
    </div>
  );
}
