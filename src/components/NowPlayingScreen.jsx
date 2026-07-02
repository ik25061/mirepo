import { useRef, useState, useEffect, useCallback } from 'react';
import {
  ChevronDown, Heart, Play, Pause,
  SkipBack, SkipForward, Shuffle, Repeat, Volume2, Music2,
  Search, Trash2, User, ListMusic, ThumbsDown,
} from 'lucide-react';
import { formatTime } from '../lib/format.js';
import { usePlayer } from '../context/PlayerContext.jsx';
import WaveSurfer from 'wavesurfer.js';
import { audioUrl, artistCoverUrl, coverUrl } from '../lib/api.js';

export default function NowPlayingScreen({
  track, isPlaying, onPlayPause, onNext, onPrev, onLike, onDislike, likedIds, audioRef, onClose,
  onSync, onDelete,
  allTracks = [], playContext, onPlay, currentQueueIndex,
}) {
  const { removeFromQueue, queue, progress, duration, volume, setVolume, repeatMode, setRepeatMode, shufflePlay, seek, getActiveAudio } = usePlayer();
  const [showTrackList, setShowTrackList] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const progressRef = useRef(null);
  const waveformRef = useRef(null);
  const wavesurferInstance = useRef(null);
  const [wavesurferReady, setWavesurferReady] = useState(false);
  const [wsProgress, setWsProgress] = useState(0);
  const [artistImageUrl, setArtistImageUrl] = useState(null);

  // Generar URL de la portada del álbum a partir del ID de la canción
  // Usar coverId si existe, si no el id de la canción
  const coverId = track?.coverId || track?.id;
  const albumCoverUrl = coverId ? coverUrl(coverId) : null;

  // Precargar imagen del artista silenciosamente (sin errores 404 en consola)
  useEffect(() => {
    if (!track?.artist) {
      setArtistImageUrl(null);
      return;
    }
    const url = artistCoverUrl(track.artist);
    const img = new Image();
    img.onload = () => setArtistImageUrl(url);
    img.onerror = () => setArtistImageUrl(null);
    img.src = url;
    return () => { img.onload = null; img.onerror = null; };
  }, [track?.artist]);

  // Priority: artist image (if loaded) > album cover > null
  const centerImage = artistImageUrl || albumCoverUrl || null;
  // Background: siempre la portada del álbum
  const bgImage = albumCoverUrl || null;

  // Inicializar WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !track) return;

    if (wavesurferInstance.current) {
      wavesurferInstance.current.destroy();
      wavesurferInstance.current = null;
    }
    setWavesurferReady(false);

    const audio = getActiveAudio?.();
    if (!audio) return;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgba(255,255,255,0.25)',
      progressColor: '#1db954',
      cursorColor: 'transparent',
      barWidth: 2.5,
      barGap: 2,
      barRadius: 3,
      height: 56,
      normalize: true,
      backend: 'WebAudio',
      media: audio,
      interact: true,
    });

    ws.on('ready', () => {
      setWavesurferReady(true);
    });

    ws.on('timeupdate', (currentTime) => {
      setWsProgress(currentTime);
    });

    ws.on('interaction', () => {
      const newTime = ws.getCurrentTime();
      seek(newTime);
    });

    wavesurferInstance.current = ws;

    return () => {
      if (wavesurferInstance.current) {
        wavesurferInstance.current.destroy();
        wavesurferInstance.current = null;
      }
    };
  }, [track?.id, getActiveAudio, seek]);

  // Sincronizar play/pausa con WaveSurfer
  useEffect(() => {
    if (!wavesurferInstance.current || !wavesurferReady) return;
    if (isPlaying) {
      try { wavesurferInstance.current.play(); } catch (e) { }
    } else {
      try { wavesurferInstance.current.pause(); } catch (e) { }
    }
  }, [isPlaying, wavesurferReady]);

  const seekTo = (e) => {
    const bar = progressRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  };

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const isLiked = track ? likedIds?.has(track.id) : false;

  // ====== ELIMINAR CANCIÓN DESDE NOW PLAYING ======
  const handleDelete = async () => {
    if (confirmDelete) {
      const songId = track?.id;
      if (!songId) return;

      const currentQueue = queue || [];

      removeFromQueue(songId);

      await onDelete(track);

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
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        background: '#0d0d0d',
        padding: '12px 16px 0 16px',
      }}
    >
      {/* FONDO DIFUMINADO - Capa de imagen del álbum */}
      {bgImage && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${bgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            filter: 'blur(5px) brightness(0.4) saturate(1.3)',
            transform: 'scale(1.2)',
          }}
        />
      )}
      {/* Degradado oscuro encima del fondo para mejor legibilidad */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.6) 100%)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* CONTENIDO PRINCIPAL (sobre el fondo) */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Barra superior */}
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
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className={`p-2 rounded-full transition-colors ${confirmDelete ? 'bg-red-500/30' : 'hover:bg-red-500/20'
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

        {/* Cuerpo principal centrado */}
        <div className="flex-1 flex flex-col" style={{ justifyContent: 'center' }}>
          <div className="flex flex-col">

            {/* Portada del álbum/artista centrada */}
            <div className="flex items-center justify-center" style={{ padding: '8px 0' }}>
              <div
                className="relative flex items-center justify-center overflow-hidden"
                style={{
                  width: 'min(65vw, 260px)',
                  height: 'min(65vw, 260px)',
                  borderRadius: '12px',
                  background: '#bbb5b5',
                  boxShadow: '0 8px 32px rgba(73, 0, 51, 0.7), 0 0 80px rgba(80, 0, 56, 0.4)',
                }}
              >
                {centerImage ? (
                  <img
                    src={centerImage}
                    alt={track.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music2 size={80} style={{ color: '#535353' }} />
                )}
              </div>
            </div>

            {/* Info del tema */}
            <div className="flex items-center justify-between" style={{ padding: '12px 0 4px 0' }}>
              <div className="min-w-0 flex-1">
                <div className="group flex items-center gap-3">
                  {onDislike && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDislike(track); }}
                      className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition hover:text-foreground hover:bg-muted sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100"
                      title="No me gusta (pasa a la siguiente)"
                    >
                      <ThumbsDown size={26} className="sm:size-4" />
                    </button>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-white truncate" style={{ fontSize: 20, fontWeight: 700 }}>
                      {track.title}
                    </h2>
                    <p className="truncate" style={{ fontSize: 15, color: '#b3b3b3' }}>
                      {track.artist}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => onLike?.(track.id)}
                className="ml-3 flex-shrink-0 p-2 hover:scale-110 transition-transform"
                style={{ color: isLiked ? '#1db954' : '#a7a7a7' }}
              >
                <Heart size={26} fill={isLiked ? 'currentColor' : 'none'} />
              </button>
            </div>

            {/* WaveSurfer Waveform */}
            <div style={{ padding: '4px 0' }}>
              <div
                ref={waveformRef}
                style={{
                  width: '100%',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  minHeight: 56,
                  position: 'relative',
                }}
              />
              <div
                ref={progressRef}
                onClick={seekTo}
                className="w-full rounded-full cursor-pointer"
                style={{
                  height: 4,
                  background: 'rgba(255,255,255,0.15)',
                  position: 'relative',
                  marginTop: 4,
                  display: 'none',
                }}
              >
                <div
                  className="rounded-full"
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    background: '#1db954',
                    position: 'relative',
                  }}
                />
              </div>
              <div className="flex justify-between" style={{ marginTop: 4 }}>
                <span style={{ fontSize: 11, color: '#a7a7a7' }}>{formatTime(progress)}</span>
                <span style={{ fontSize: 11, color: '#a7a7a7' }}>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controles de reproducción */}
            <div className="flex items-center justify-between" style={{ padding: '8px 0' }}>
              <button
                onClick={() => {
                  if (allTracks && allTracks.length > 0) {
                    shufflePlay(allTracks);
                  }
                }}
                style={{ color: '#1db954', padding: 8 }}
                title="Reproducción aleatoria"
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
                onClick={() => {
                  setRepeatMode((repeatMode + 1) % 3);
                }}
                style={{ color: repeatMode > 0 ? '#1db954' : '#a7a7a7', padding: 8 }}
                title={
                  repeatMode === 0 ? 'Sin repetición' :
                    repeatMode === 1 ? 'Repetir todas' : 'Repetir una'
                }
              >
                {repeatMode === 2 ? (
                  <span className="relative">
                    <Repeat size={22} />
                    <span style={{
                      position: 'absolute', top: -4, right: -6,
                      fontSize: 9, fontWeight: 700, color: '#1db954'
                    }}>1</span>
                  </span>
                ) : (
                  <Repeat size={22} />
                )}
              </button>
            </div>

            {/* Control de volumen */}
            <div className="flex items-center gap-3" style={{ padding: '4px 0 8px 0', flexShrink: 0 }}>
              <Volume2 size={16} style={{ color: '#a7a7a7', flexShrink: 0 }} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="flex-1 h-2 cursor-pointer"
                style={{
                  accentColor: '#1db954',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '2px',
                  outline: 'none',
                }}
              />
            </div>

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
    </div>
  );
}