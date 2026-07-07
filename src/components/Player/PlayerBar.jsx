import { useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  ThumbsDown,
  Volume2,
  Volume1,
  VolumeX,
  Waves,
} from 'lucide-react';
import Cover from '../Cover.jsx';
import SliderBar from './SliderBar.jsx';
import { formatTime } from '../../lib/format.js';
import { usePlayer } from '../../context/PlayerContext.jsx';

export default function PlayerBar({ onLike, onDislike, likedIds }) {
  const {
    current,
    isPlaying,
    progress,
    duration,
    volume,
    setVolume,
    crossfadeSec,
    setCrossfadeSec,
    togglePlay,
    next,
    prev,
    seek,
  } = usePlayer();

  const [showCrossfade, setShowCrossfade] = useState(false);

  if (!current) {
    return (
      <footer className="flex h-16 items-center justify-center border-t border-border bg-surface px-4 text-sm text-muted-foreground">
        Selecciona una canción para empezar a escuchar
      </footer>
    );
  }

  const VolIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  // Calcular si la canción actual está liked
  const isLiked = likedIds?.has(current.id) ?? current.liked ?? false;

  return (
    <footer className="border-t border-border bg-surface px-3 py-2 sm:px-5" style={{ overflow: 'hidden' }}>
      <div className="flex items-center gap-3 sm:gap-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Cover song={current} className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" rounded="rounded-lg" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold sm:text-sm">{current.title}</p>
            <p className="truncate text-[10px] text-muted-foreground sm:text-xs">{current.artist}</p>
          </div>
          <button
            onClick={() => onLike?.(current)}
            className={'ml-1 hidden shrink-0 rounded-full p-2 transition sm:block ' + (isLiked ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
          </button>

          {onDislike && (
            <button
              onClick={() => onDislike(current)}
              className="ml-1 hidden shrink-0 rounded-full p-2 transition text-muted-foreground hover:text-foreground sm:block"
              title="No me gusta"
            >
              <ThumbsDown size={16} />
            </button>
          )}
        </div>

        <div className="flex flex-[1.4] flex-col items-center gap-1">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={prev}
              className="rounded-full p-1.5 text-muted-foreground transition hover:text-foreground sm:p-2"
            >
              <SkipBack size={16} fill="currentColor" className="sm:size-5" />
            </button>
            <button
              onClick={togglePlay}
              className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background transition hover:scale-105 sm:h-11 sm:w-11"
            >
              {isPlaying ? <Pause size={16} fill="currentColor" className="sm:size-5" /> : <Play size={16} fill="currentColor" className="ml-0.5 sm:size-5" />}
            </button>
            <button
              onClick={next}
              className="rounded-full p-1.5 text-muted-foreground transition hover:text-foreground sm:p-2"
            >
              <SkipForward size={16} fill="currentColor" className="sm:size-5" />
            </button>
          </div>
          <div className="flex w-full max-w-xl items-center gap-2">
            <span className="w-7 text-right text-[10px] tabular-nums text-muted-foreground sm:w-9 sm:text-[11px]">
              {formatTime(progress)}
            </span>
            <SliderBar
              value={progress}
              max={duration || 1}
              onChange={seek}
              ariaLabel="Progreso de la canción"
              className="flex-1"
            />
            <span className="w-7 text-[10px] tabular-nums text-muted-foreground sm:w-9 sm:text-[11px]">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        <div className="hidden flex-1 items-center justify-end gap-3 lg:flex">
          <div className="relative">
            <button
              onClick={() => setShowCrossfade((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs transition ${
                crossfadeSec > 0
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Waves size={15} />
              {crossfadeSec > 0 ? `${crossfadeSec}s` : 'Off'}
            </button>
            {showCrossfade && (
              <div className="absolute bottom-full right-0 mb-2 w-48 rounded-xl border border-border bg-surface-2 p-3 shadow-xl">
                <p className="mb-2 text-xs font-medium">Fundido cruzado</p>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="1"
                  value={crossfadeSec}
                  onChange={(e) => setCrossfadeSec(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {crossfadeSec === 0 ? 'Desactivado' : `${crossfadeSec} segundos`}
                </p>
              </div>
            )}
          </div>
          <VolIcon size={16} className="text-muted-foreground sm:size-5" />
          <SliderBar
            value={volume}
            max={1}
            onChange={setVolume}
            ariaLabel="Volumen"
            className="w-20 sm:w-24"
          />
        </div>
      </div>
    </footer>
  );
}