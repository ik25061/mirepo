import { useState } from 'react';
import { Play, Pause, Heart, ThumbsDown, UserX, Trash2, Check } from 'lucide-react';
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
  showDelete = false,
  showCover = true,
}) {
  const { current, isPlaying, play, togglePlay } = usePlayer();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isCurrent = current?.id === song.id;

  const handlePlay = () => {
    if (isCurrent) togglePlay();
    else play(song, queue);
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

      {showCover && <Cover song={song} className="h-7 w-7 shrink-0 sm:h-10 sm:w-10" rounded="rounded-md" />}

      <div className="min-w-0 flex-1">
        <p className={`truncate text-xs font-medium sm:text-sm ${isCurrent ? 'text-primary' : 'text-foreground'}`}>
          {song.title}
        </p>
        <p className="truncate text-[10px] text-muted-foreground sm:text-xs">{song.artist}</p>
      </div>

      <p className="hidden min-w-0 flex-1 truncate text-[10px] text-muted-foreground sm:block sm:text-xs md:block">
        {song.album}
      </p>

      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onLike?.(song)}
          className={`${iconBtn} ${song.liked ? 'text-primary hover:text-primary' : 'opacity-0 group-hover:opacity-100'}`}
        >
          <Heart size={12} fill={song.liked ? 'currentColor' : 'none'} className="sm:size-4" />
        </button>

        {onDislike && (
          <button
            onClick={() => onDislike(song)}
            className={`${iconBtn} opacity-0 group-hover:opacity-100`}
            title="No me gusta esta canción"
          >
            <ThumbsDown size={12} className="sm:size-4" />
          </button>
        )}

        {onDislikeArtist && (
          <button
            onClick={() => onDislikeArtist(song.artist)}
            className={`${iconBtn} opacity-0 group-hover:opacity-100`}
            title={`No mostrar al artista ${song.artist}`}
          >
            <UserX size={12} className="sm:size-4" />
          </button>
        )}

        {showDelete && onDelete && (
          <button
            onClick={() => {
              if (confirmDelete) {
                onDelete(song);
              } else {
                setConfirmDelete(true);
                setTimeout(() => setConfirmDelete(false), 3000);
              }
            }}
            className={`${iconBtn} ${
              confirmDelete
                ? 'bg-danger/15 text-danger opacity-100'
                : 'opacity-0 group-hover:opacity-100 hover:text-danger'
            }`}
            title={confirmDelete ? 'Pulsa de nuevo para confirmar' : 'Eliminar (mover a papelera)'}
          >
            {confirmDelete ? <Check size={12} className="sm:size-4" /> : <Trash2 size={12} className="sm:size-4" />}
          </button>
        )}

        <span className="ml-1 w-7 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground sm:w-9 sm:text-xs">
          {formatTime(song.duration)}
        </span>
      </div>
    </div>
  );
}