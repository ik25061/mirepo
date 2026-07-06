import { useState, useEffect } from 'react';
import { Play, Pause, Heart, ThumbsDown, UserX, Trash2, Check, Wand2, ListMusic } from 'lucide-react';
import Cover from './Cover.jsx';
import NowPlayingBars from './Player/NowPlayingBars.jsx';
import { formatTime } from '../lib/format.js';
import { usePlayer } from '../context/PlayerContext.jsx';

export default function SongRow({
  song,
  index,
  queue,
  onLike,
  onDislike,
  onDislikeArtist,
  onDelete,
  onFixMetadata,
  showDelete = false,
  showFixMetadata = false,
  showCover = true,
  fixingMetadata = false,
  context = null, // <-- NUEVO: contexto para reproducción
}) {
  const { current, isPlaying, play, togglePlay, removeFromQueue } = usePlayer();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isCurrent = current?.id === song.id;

  // Resetear confirmación cuando cambia la canción
  useEffect(() => {
    setConfirmDelete(false);
  }, [song.id]);

  const handlePlay = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      console.log('[SongRow] Reproduciendo con contexto:', context);
      play(song, queue, context); // <-- Pasar contexto a play
    }
  };

  // Eliminar canción - usa removeFromQueue para pasar a la siguiente
  const handleDelete = async (e) => {
    e.stopPropagation();
    
    if (confirmDelete) {
      const songId = song.id;
      
      // Eliminar de la cola de reproducción (esto maneja el paso a la siguiente)
      removeFromQueue(songId);
      
      // Ejecutar eliminación en el servidor
      await onDelete(song);
      
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      // Auto-cancelar después de 3 segundos si no se confirma
      setTimeout(() => {
        setConfirmDelete(false);
      }, 3000);
    }
  };

  const iconBtn =
    'grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition hover:text-foreground hover:bg-muted sm:h-8 sm:w-8';

  return (
    <div
      className={`group flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition hover:bg-surface-2 sm:gap-3 sm:px-2 sm:py-2 ${
        isCurrent ? 'bg-surface-2' : ''
      }`}
      style={{ minHeight: 36 }}
    >
      {/* ===== BOTÓN DE REPRODUCCIÓN ===== */}
      <button
        onClick={handlePlay}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs text-muted-foreground sm:h-9 sm:w-9 sm:text-sm"
        aria-label={isCurrent && isPlaying ? 'Pausar' : `Reproducir ${song.title}`}
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
        <span className={`group-hover:hidden text-[10px] sm:text-sm ${isCurrent ? 'text-primary' : ''}`}>
          {isCurrent && isPlaying ? <NowPlayingBars /> : typeof index === 'number' ? index + 1 : ''}
        </span>
      </button>

      {/* ===== PORTADA ===== */}
      {showCover && (
        <div onClick={handlePlay} className="cursor-pointer shrink-0">
          <Cover song={song} className="h-7 w-7 sm:h-10 sm:w-10" rounded="rounded-md" />
        </div>
      )}

      {/* ===== TÍTULO Y ARTISTA ===== */}
      <div className="min-w-0 flex-1 cursor-pointer" onClick={handlePlay}>
        <p className={`truncate text-xs font-medium sm:text-sm ${isCurrent ? 'text-primary' : 'text-foreground'}`}>
          {song.title}
        </p>
        <p className="truncate text-[10px] text-muted-foreground sm:text-xs">{song.artist}</p>
      </div>

      {/* ===== ÁLBUM (solo escritorio) ===== */}
      <p className="hidden min-w-0 flex-1 truncate text-[10px] text-muted-foreground sm:block sm:text-xs md:block">
        {song.album}
      </p>

      {/* ===== BOTONES DE ACCIÓN ===== */}
      <div className="flex items-center gap-0.5 sm:gap-0.5">
        {/* Me gusta */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLike?.(song);
          }}
          className={`${iconBtn} ${song.liked ? 'text-primary hover:text-primary' : 'sm:opacity-0 sm:group-hover:opacity-100'}`}
        >
          <Heart size={12} fill={song.liked ? 'currentColor' : 'none'} className="sm:size-4" />
        </button>

        {/* No me gusta canción */}
        {onDislike && (
          <button
            onClick={(e) => { e.stopPropagation(); onDislike(song); }}
            className={`${iconBtn} sm:opacity-0 sm:group-hover:opacity-100`}
            title="No me gusta esta canción"
          >
            <ThumbsDown size={12} className="sm:size-4" />
          </button>
        )}

        {/* No me gusta artista */}
        {onDislikeArtist && (
          <button
            onClick={(e) => { e.stopPropagation(); onDislikeArtist(song.artist); }}
            className={`${iconBtn} sm:opacity-0 sm:group-hover:opacity-100`}
            title={`No mostrar al artista ${song.artist}`}
          >
            <UserX size={12} className="sm:size-4" />
          </button>
        )}

        {/* Corregir metadatos */}
        {showFixMetadata && onFixMetadata && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFixMetadata();
            }}
            disabled={fixingMetadata}
            className={`${iconBtn} ${
              fixingMetadata
                ? 'text-primary opacity-100'
                : 'sm:opacity-0 sm:group-hover:opacity-100 hover:text-primary'
            }`}
            title={fixingMetadata ? 'Corrigiendo metadatos...' : 'Corregir metadatos (AcoustID)'}
          >
            {fixingMetadata ? (
              <span className="animate-spin">⚙️</span>
            ) : (
              <Wand2 size={12} className="sm:size-4" />
            )}
          </button>
        )}

        {/* Eliminar */}
        {showDelete && onDelete && (
          <button
            onClick={handleDelete}
            className={`${iconBtn} ${
              confirmDelete
                ? 'bg-red-500/20 text-red-500 opacity-100'
                : 'sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-500'
            }`}
            title={confirmDelete ? 'Pulsa de nuevo para confirmar' : 'Eliminar (mover a papelera)'}
          >
            {confirmDelete ? <Check size={12} className="sm:size-4" /> : <Trash2 size={12} className="sm:size-4" />}
          </button>
        )}

        {/* Duración */}
        <span className="ml-1 w-7 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground sm:w-9 sm:text-xs">
          {formatTime(song.duration)}
        </span>
      </div>
    </div>
  );
}