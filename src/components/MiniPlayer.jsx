import { Play, Pause, SkipForward, Music2 } from 'lucide-react';

export default function MiniPlayer({ track, isPlaying, onPlayPause, onNext, onOpen }) {
  // Si no hay canción, mostrar mini player vacío
  if (!track) {
    return (
      <div
        className="flex items-center gap-3 cursor-pointer flex-shrink-0 opacity-50"
        style={{
          height: 48,
          minHeight: 48,
          background: '#282828',
          margin: '0 12px 4px 12px',
          padding: '0 12px',
          borderRadius: 14,
          flexShrink: 0,
        }}
      >
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden"
          style={{ width: 36, height: 36, background: '#383838' }}
        >
          <Music2 size={14} style={{ color: '#535353' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-muted-foreground truncate text-xs">Sin reproducción</p>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onOpen}
      className="flex items-center gap-3 cursor-pointer flex-shrink-0"
      style={{
        height: 48,
        minHeight: 48,
        background: '#282828',
        margin: '0 12px 4px 12px',
        padding: '0 12px',
        borderRadius: 14,
        flexShrink: 0,
      }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden"
        style={{ width: 36, height: 36, background: '#383838' }}
      >
        {track.cover ? (
          <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
        ) : (
          <Music2 size={14} style={{ color: '#a7a7a7' }} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-white truncate text-xs font-medium">{track.title}</p>
        <p className="truncate text-[10px] text-muted-foreground">{track.artist}</p>
      </div>

      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onPlayPause}
          className="flex items-center justify-center w-7 h-7 rounded-full"
        >
          {isPlaying ? (
            <Pause size={16} fill="white" className="text-white" />
          ) : (
            <Play size={16} fill="white" className="text-white ml-0.5" />
          )}
        </button>
        <button onClick={onNext} className="flex items-center justify-center w-7 h-7">
          <SkipForward size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}