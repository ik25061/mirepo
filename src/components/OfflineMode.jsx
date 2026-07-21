import { useEffect, useState } from 'react';
import { useDownload } from '../context/DownloadContext.jsx';
import { usePlayer } from '../context/PlayerContext.jsx';
import SongRow from './SongRow.jsx';

export default function OfflineMode() {
  const { downloadedSongs, loading, reload } = useDownload();
  const { play } = usePlayer();

  useEffect(() => {
    reload();
  }, []);

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

  return (
    <div className="p-4 max-w-4xl mx-auto">
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
            onLike={() => {}}
            likedIds={new Set()}
          />
        ))}
      </div>
    </div>
  );
}