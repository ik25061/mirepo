/**
 * ============================================================
 * DOWNLOADS VIEW - VISTA DE CANCIONES DESCARGADAS
 * ============================================================
 * 
 * Muestra todas las canciones almacenadas en IndexedDB para
 * reproducción offline. Permite:
 * - Ver lista de canciones descargadas
 * - Reproducir canciones sin conexión
 * - Eliminar canciones descargadas
 * - Ver espacio utilizado
 */

import { useState, useEffect } from 'react';
import { Download, Trash2, Music2, HardDrive, Play, Pause, Loader2 } from 'lucide-react';
import { useDownload } from '../context/DownloadContext';
import { usePlayer } from '../context/PlayerContext';
import Cover from './Cover.jsx';
import { formatTime } from '../lib/format.js';

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function DownloadsView({ onBack }) {
  const { downloadedSongs, removeDownload, loading, reload } = useDownload();
  const { play, current, isPlaying, togglePlay } = usePlayer();
  const [totalSize, setTotalSize] = useState(0);
  const [deletingId, setDeletingId] = useState(null);

  // Calcular espacio total utilizado
  useEffect(() => {
    let size = 0;
    // Estimar tamaño: cada canción ~5MB en promedio
    // En realidad, podríamos calcular el tamaño real desde IndexedDB
    size = downloadedSongs.length * 5 * 1024 * 1024;
    setTotalSize(size);
  }, [downloadedSongs]);

  const handleDelete = async (songId) => {
    if (!confirm('¿Eliminar esta canción de las descargas?')) return;
    setDeletingId(songId);
    await removeDownload(songId);
    setDeletingId(null);
    reload();
  };

  const handleDeleteAll = async () => {
    if (!confirm('¿Eliminar TODAS las canciones descargadas?')) return;
    for (const song of downloadedSongs) {
      await removeDownload(song.id);
    }
    reload();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <Loader2 size={40} className="animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando descargas...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-20 w-full h-full">
      
      {/* ===== HEADER ===== */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-700 tracking-tight text-white sm:text-2xl">
            <Download size={22} className="inline mr-2 text-primary" />
            Descargas
          </h1>
          <p className="text-xs text-muted-foreground">
            {downloadedSongs.length} {downloadedSongs.length === 1 ? 'canción' : 'canciones'} descargadas
            {totalSize > 0 && ` · ${formatFileSize(totalSize)}`}
          </p>
        </div>
      </div>

      {/* ===== ESTADÍSTICAS ===== */}
      {downloadedSongs.length > 0 && (
        <div className="flex items-center gap-4 p-3 rounded-xl bg-surface border border-border">
          <div className="flex items-center gap-2">
            <HardDrive size={18} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {formatFileSize(totalSize)} utilizados
            </span>
          </div>
          <button
            onClick={handleDeleteAll}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger/20 text-danger text-xs font-medium hover:bg-danger/30 transition"
          >
            <Trash2 size={14} />
            Eliminar todas
          </button>
        </div>
      )}

      {/* ===== LISTA DE CANCIONES DESCARGADAS ===== */}
      {downloadedSongs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center flex-1">
          <div className="w-20 h-20 rounded-full bg-surface flex items-center justify-center mb-4">
            <Download size={40} className="text-muted-foreground/40" />
          </div>
          <p className="text-white font-medium mb-1">Sin canciones descargadas</p>
          <p className="text-muted-foreground text-sm max-w-xs">
            Descarga canciones desde la biblioteca para escucharlas sin conexión a internet.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-surface/50 p-2">
          <div className="flex flex-col gap-1">
            {downloadedSongs.map((song, i) => {
              const isCurrent = current?.id === song.id;
              const isDeleting = deletingId === song.id;
              
              return (
                <div
                  key={song.id}
                  className={`group flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition hover:bg-surface-2 sm:gap-3 sm:px-2 sm:py-2 ${
                    isCurrent ? 'bg-surface-2' : ''
                  }`}
                  style={{ minHeight: 36 }}
                >
                  {/* ===== BOTÓN DE REPRODUCCIÓN ===== */}
                  <button
                    onClick={() => {
                      if (isCurrent) {
                        togglePlay();
                      } else {
                        // Reproducir la canción descargada
                        play(song, downloadedSongs);
                      }
                    }}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs text-muted-foreground sm:h-9 sm:w-9 sm:text-sm"
                  >
                    {isCurrent && isPlaying ? (
                      <span className="hidden group-hover:block">
                        <Pause size={12} className="text-foreground sm:size-4" />
                      </span>
                    ) : (
                      <span className="hidden group-hover:block">
                        <Play size={12} className="text-foreground sm:size-4" />
                      </span>
                    )}
                    <span className="group-hover:hidden text-[10px] sm:text-sm text-primary">
                      {isCurrent && isPlaying ? '▶' : i + 1}
                    </span>
                  </button>

                  {/* ===== PORTADA ===== */}
                  <div className="cursor-pointer shrink-0">
                    <Cover song={song} className="h-7 w-7 sm:h-10 sm:w-10" rounded="rounded-md" />
                  </div>

                  {/* ===== TÍTULO Y ARTISTA ===== */}
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => play(song, downloadedSongs)}>
                    <p className={`truncate text-xs font-medium sm:text-sm ${isCurrent ? 'text-primary' : 'text-foreground'}`}>
                      {song.title}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground sm:text-xs">{song.artist}</p>
                  </div>

                  {/* ===== ÁLBUM ===== */}
                  <p className="hidden min-w-0 flex-1 truncate text-[10px] text-muted-foreground sm:block sm:text-xs md:block">
                    {song.album}
                  </p>

                  {/* ===== ACCIONES ===== */}
                  <div className="flex items-center gap-0.5 sm:gap-0.5">
                    <button
                      onClick={() => handleDelete(song.id)}
                      disabled={isDeleting}
                      className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition hover:text-danger hover:bg-danger/20 sm:h-8 sm:w-8"
                      title="Eliminar descarga"
                    >
                      {isDeleting ? (
                        <Loader2 size={12} className="animate-spin sm:size-4" />
                      ) : (
                        <Trash2 size={12} className="sm:size-4" />
                      )}
                    </button>
                    <span className="ml-1 w-7 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground sm:w-9 sm:text-xs">
                      {formatTime(song.duration)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}