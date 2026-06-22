import { useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Volume2,
  Volume1,
  VolumeX,
  Waves,
} from 'lucide-react';
import Cover from '../Cover.jsx';
import SliderBar from './SliderBar.jsx';
import { formatTime } from '../../lib/format.js';
import { usePlayer } from '../../context/PlayerContext.jsx';

export default function PlayerBar({ onLike }) {
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
      <footer className="flex h-20 items-center justify-center border-t border-border bg-surface px-4 text-sm text-muted-foreground">
        Selecciona una canción para empezar a escuchar
      </footer>
    );
  }

  const VolIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <footer className="border-t border-border bg-surface px-3 py-3 sm:px-5">
      <div className="flex items-center gap-3 sm:gap-5">
        {/* Info de la canción */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Cover song={current} className="h-14 w-14 shrink-0" rounded="rounded-lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{current.title}</p>
            <p className="truncate text-xs text-muted-foreground">{current.artist}</p>
          </div>
          <button
            onClick={() => onLike?.(current)}
            className={`ml-1 hidden shrink-0 rounded-full p-2 transition sm:block ${
              current.liked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Heart size={18} fill={current.liked ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* Controles + progreso */}
        <div className="flex flex-[1.4] flex-col items-center gap-1">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={prev}
              className="rounded-full p-2 text-muted-foreground transition hover:text-foreground"
            >
              <SkipBack size={20} fill="currentColor" />
            </button>
            <button
              onClick={togglePlay}
              className="grid h-11 w-11 place-items-center rounded-full bg-foreground text-background transition hover:scale-105"
            >
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
            </button>
            <button
              onClick={next}
              className="rounded-full p-2 text-muted-foreground transition hover:text-foreground"
            >
              <SkipForward size={20} fill="currentColor" />
            </button>
          </div>
          <div className="flex w-full max-w-xl items-center gap-2">
            <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
              {formatTime(progress)}
            </span>
            <SliderBar
              value={progress}
              max={duration}
              onChange={seek}
              ariaLabel="Progreso de la canción"
              className="flex-1"
            />
            <span className="w-9 text-[11px] tabular-nums text-muted-foreground">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Volumen + crossfade */}
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
          <VolIcon size={18} className="text-muted-foreground" />
          <SliderBar
            value={volume}
            max={1}
            onChange={setVolume}
            ariaLabel="Volumen"
            className="w-24"
          />
        </div>
      </div>
    </footer>
  );
}