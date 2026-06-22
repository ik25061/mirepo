import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, Heart, Play, Pause,
  SkipBack, SkipForward, Shuffle, Repeat, Volume2, Music2,
  Search, Trash2, ChevronUp, Disc, User, ListMusic,
} from 'lucide-react';
import { formatTime } from '../lib/format.js';
import { usePlayer } from '../context/PlayerContext.jsx';

export default function NowPlayingScreen({
  track, isPlaying, onPlayPause, onNext, onPrev, onLike, likedIds, audioRef, onClose,
  onSync, onDelete,
  allTracks = [], playContext, onPlay, currentQueueIndex,
}) {
  const { removeFromQueue, queue } = usePlayer();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [showTrackList, setShowTrackList] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const progressRef = useRef(null);

  useEffect(() => {
    const audio = audioRef?.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoad = () => setDuration(audio.duration);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoad);
    setCurrentTime(audio.currentTime);
    setDuration(audio.duration || 0);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoad);
    };
  }, [audioRef]);

  const seekTo = (e) => {
    const bar = progressRef.current;
    if (!bar || !audioRef?.current || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isLiked = track ? likedIds?.has(track.id) : false;

  // ====== ELIMINAR CANCIÓN DESDE NOW PLAYING ======
  const handleDelete = async () => {
    if (confirmDelete) {
      const songId = track?.id;
      if (!songId) return;
      
      // Obtener la cola actual
      const currentQueue = queue || [];
      
      // Eliminar de la cola de reproducción (esto maneja el paso a la siguiente)
      removeFromQueue(songId);
      
      // Ejecutar eliminación en el servidor
      await onDelete(track);
      
      // Cerrar la vista de NowPlaying si no hay más canciones
      if (currentQueue.length <= 1) {
        onClose();
      }
      
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ background: '#0d0d0d' }}>
        <Music2 size={64} style={{ color: '#535353' }} />
        <p className="mt-4" style={{ color: '#a7a7a7', fontSize: 16 }}>
          Sin reproducción activa
        </p>
        <button
          onClick={onClose}
          className="mt-6 px-6 py-2 rounded-full bg-primary text-black font-semibold"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0d0d0d 100%)',
        padding: '12px 16px 0 16px',
      }}
    >
      <div className="flex items-center justify-between" style={{ flexShrink: 0 }}>
        <button
          onClick={onClose}
          className="p-3 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          style={{ minWidth: 48, minHeight: 48 }}
        >
          <ChevronDown size={28} style={{ color: '#fff' }} />
        </button>
        <div className="text-center">
          <p style={{ fontSize: 11, color: '#a7a7a7', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
            Reproduciendo ahora
          </p>
        </div>
        <div className="flex items-center" style={{ gap: 12 }}>
          {onSync && (
            <button
              onClick={(e) => { e.stopPropagation(); onSync(track); }}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              style={{ color: '#a7a7a7', minWidth: 40, minHeight: 40 }}
            >
              <Search size={20} />
            </button>
          )}
          {/* Botón eliminar con confirmación */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className={`p-2 rounded-full transition-colors ${
                confirmDelete ? 'bg-red-500/30' : 'hover:bg-red-500/20'
              }`}
              style={{ 
                color: confirmDelete ? '#ff4444' : '#ff4444',
                minWidth: 40, 
                minHeight: 40 
              }}
              title={confirmDelete ? 'Pulsa de nuevo para confirmar' : 'Eliminar canción'}
            >
              {confirmDelete ? (
                <span style={{ fontSize: 12, fontWeight: 700 }}>✓</span>
              ) : (
                <Trash2 size={20} />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col" style={{ justifyContent: 'center' }}>
        <div className="flex flex-col">
          <div className="flex items-center justify-center" style={{ padding: '8px 0' }}>
            <div
              className="relative flex items-center justify-center overflow-hidden"
              style={{
                width: 'min(65vw, 240px)',
                height: 'min(65vw, 240px)',
                borderRadius: '12px',
                background: '#282828',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              }}
            >
              {track.cover ? (
                <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
              ) : (
                <Music2 size={80} style={{ color: '#535353' }} />
              )}
            </div>
          </div>

          <div className="flex items-center justify-between" style={{ padding: '8px 0 4px 0' }}>
            <div className="min-w-0 flex-1">
              <h2 className="text-white truncate" style={{ fontSize: 20, fontWeight: 700 }}>
                {track.title}
              </h2>
              <p className="truncate" style={{ fontSize: 15, color: '#a7a7a7' }}>
                {track.artist}
              </p>
            </div>
            <button
              onClick={() => onLike?.(track.id)}
              className="ml-3 flex-shrink-0 p-2 hover:scale-110 transition-transform"
              style={{ color: isLiked ? '#1db954' : '#a7a7a7' }}
            >
              <Heart size={26} fill={isLiked ? 'currentColor' : 'none'} />
            </button>
          </div>

          <div style={{ padding: '4px 0' }}>
            <div
              ref={progressRef}
              onClick={seekTo}
              className="w-full rounded-full cursor-pointer"
              style={{ height: 5, background: '#535353', position: 'relative' }}
            >
              <div
                className="rounded-full"
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: '#1db954',
                  position: 'relative',
                }}
              />
            </div>
            <div className="flex justify-between" style={{ marginTop: 2 }}>
              <span style={{ fontSize: 11, color: '#a7a7a7' }}>{formatTime(currentTime)}</span>
              <span style={{ fontSize: 11, color: '#a7a7a7' }}>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between" style={{ padding: '8px 0' }}>
            <button
              onClick={() => setShuffle(!shuffle)}
              style={{ color: shuffle ? '#1db954' : '#a7a7a7', padding: 8 }}
            >
              <Shuffle size={22} />
            </button>

            <button onClick={onPrev} style={{ color: '#fff', padding: '4px 12px' }}>
              <SkipBack size={30} fill="currentColor" />
            </button>

            <button
              onClick={onPlayPause}
              className="flex items-center justify-center rounded-full hover:scale-105 transition-transform"
              style={{
                width: 64,
                height: 64,
                background: '#fff',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              }}
            >
              {isPlaying ? (
                <Pause size={28} fill="#000" style={{ color: '#000' }} />
              ) : (
                <Play size={28} fill="#000" style={{ color: '#000', marginLeft: 2 }} />
              )}
            </button>

            <button onClick={onNext} style={{ color: '#fff', padding: '4px 12px' }}>
              <SkipForward size={30} fill="currentColor" />
            </button>

            <button
              onClick={() => setRepeat(!repeat)}
              style={{ color: repeat ? '#1db954' : '#a7a7a7', padding: 8 }}
            >
              <Repeat size={22} />
            </button>
          </div>

          <div className="flex items-center gap-3" style={{ padding: '4px 0 8px 0', flexShrink: 0 }}>
            <Volume2 size={16} style={{ color: '#a7a7a7', flexShrink: 0 }} />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.8}
              onChange={(e) => {
                if (audioRef?.current) audioRef.current.volume = parseFloat(e.target.value);
              }}
              className="flex-1"
              style={{ accentColor: '#1db954', height: 4, borderRadius: 2 }}
            />
          </div>

          {/* Mensaje de confirmación de eliminación */}
          {confirmDelete && (
            <div className="text-center py-2">
              <span style={{ fontSize: 13, color: '#ff4444', fontWeight: 600 }}>
                ⚠️ Pulsa de nuevo el botón basura para confirmar
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}