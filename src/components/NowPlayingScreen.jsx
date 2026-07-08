/**
 * ============================================================
 * NOW PLAYING SCREEN - PANTALLA DE REPRODUCCIÓN
 * ============================================================
 * 
 * Muestra la canción actual con:
 * - Portada del álbum de fondo con blur y capa oscura
 * - Click en artista para ir a la colección del artista
 * - Botón de letras integrado (como Spotify) que reemplaza la carátula
 * - Efecto karaoke palabra por palabra (time-synced)
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  ChevronDown, Heart, Play, Pause,
  SkipBack, SkipForward, Shuffle, Repeat, Volume2, Music2,
  Search, Trash2, ThumbsDown, UserX, Wand2, MoreVertical,
} from 'lucide-react';
import { formatTime } from '../lib/format.js';
import { usePlayer } from '../context/PlayerContext.jsx';
import { artistCoverUrl, coverUrl } from '../lib/api.js';
import { FileText, Loader2 } from 'lucide-react';


export default function NowPlayingScreen({
  track, isPlaying, onPlayPause, onNext, onPrev, onLike, onDislike, onDislikeArtist, likedIds, onClose,
  onSync, onDelete, onFixMetadata,
  allTracks = [],
  onOpenArtist = null,
}) {
  const { removeFromQueue, queue, progress, duration, volume, setVolume, repeatMode, setRepeatMode, shufflePlay, seek, upNextQueue } = usePlayer();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const progressRef = useRef(null);
  const [artistImageUrl, setArtistImageUrl] = useState(null);
  const [artistImageFailed, setArtistImageFailed] = useState(false);

  // ===== ESTADO PARA LETRAS INTEGRADAS =====
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState(null);
  const [translatedLyrics, setTranslatedLyrics] = useState(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [syncedLines, setSyncedLines] = useState(null);
  const lyricsContainerRef = useRef(null);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [wordProgress, setWordProgress] = useState(0); // 0..1 dentro de la línea actual

  // Generar URL de la portada del álbum
  const coverId = track?.coverId || track?.id;
  const albumCoverUrl = coverId ? coverUrl(coverId) : null;

  // Precargar imagen del artista
  useEffect(() => {
    if (!track?.artist) {
      setArtistImageUrl(null);
      setArtistImageFailed(false);
      return;
    }
    setArtistImageFailed(false);
    const url = artistCoverUrl(track.artist);
    const img = new Image();
    img.onload = () => {
      setArtistImageUrl(url);
      setArtistImageFailed(false);
    };
    img.onerror = () => {
      setArtistImageUrl(null);
      setArtistImageFailed(true);
    };
    img.src = url;
    return () => { img.onload = null; img.onerror = null; };
  }, [track?.artist]);

  // Resetear letras al cambiar de canción
  useEffect(() => {
    setShowLyrics(false);
    setLyrics(null);
    setTranslatedLyrics(null);
    setLyricsError(null);
    setShowTranslation(false);
    setSyncedLines(null);
    setCurrentLineIndex(-1);
    setWordProgress(0);
  }, [track?.id]);

  // ===== KARAOKE TIME-SYNCED: línea y palabra actuales =====
  useEffect(() => {
    if (!syncedLines || syncedLines.length === 0) return;

    // Encontrar la línea actual (última cuyo tiempo <= progress)
    let lineIdx = -1;
    for (let i = 0; i < syncedLines.length; i++) {
      if (syncedLines[i].time <= progress) {
        lineIdx = i;
      } else {
        break;
      }
    }

    setCurrentLineIndex(lineIdx);

    // Calcular progreso palabra por palabra dentro de la línea actual
    if (lineIdx >= 0 && lineIdx < syncedLines.length - 1) {
      const currentTime = syncedLines[lineIdx].time;
      const nextTime = syncedLines[lineIdx + 1].time;
      const lineDuration = nextTime - currentTime;

      if (lineDuration > 0) {
        const elapsedInLine = Math.max(0, Math.min(lineDuration, progress - currentTime));
        setWordProgress(elapsedInLine / lineDuration);
      } else {
        setWordProgress(1);
      }
    } else if (lineIdx >= 0) {
      // Última línea: usar el progreso restante de la canción
      const currentTime = syncedLines[lineIdx].time;
      const remaining = Math.max(0, duration - currentTime);
      if (remaining > 0) {
        setWordProgress(Math.min(1, (progress - currentTime) / remaining));
      } else {
        setWordProgress(1);
      }
    }

    // Auto-scroll suave a la línea actual
    if (lyricsContainerRef.current && lineIdx >= 0) {
      const container = lyricsContainerRef.current;
      const lineEl = container.querySelector(`[data-lyric-index="${lineIdx}"]`);
      if (lineEl) {
        const containerRect = container.getBoundingClientRect();
        const lineRect = lineEl.getBoundingClientRect();
        const offset = lineRect.top - containerRect.top - containerRect.height * 0.35;
        container.scrollBy({ top: offset, behavior: 'smooth' });
      }
    }
  }, [progress, syncedLines, duration]);

  // Imagen central: artista (si existe) o portada del álbum
  const centerImage = (artistImageUrl && !artistImageFailed) ? artistImageUrl : albumCoverUrl;
  // Fondo: siempre la portada del álbum con blur
  const bgImage = albumCoverUrl;

  // ============================================================
  // CLICK EN ARTISTA - ABRIR COLECCIÓN DEL ARTISTA
  // ============================================================
  const handleArtistClick = () => {
    if (onOpenArtist && track?.artist) {
      const artistSongs = allTracks.filter(s => s.artist === track.artist);
      if (artistSongs.length > 0) {
        onOpenArtist({
          kind: 'Artista',
          name: track.artist,
          songs: artistSongs
        });
        onClose();
      }
    }
  };

  const seekTo = (e) => {
    const bar = progressRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  };

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const isLiked = track ? likedIds?.has(track.id) : false;

  const handleDelete = async () => {
    if (confirmDelete) {
      const songId = track?.id;
      if (!songId) return;
      removeFromQueue(songId);
      await onDelete(track);
      if (queue?.length <= 1) {
        onClose();
      }
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  // ============================================================
  // CARGAR LETRAS
  // ============================================================
  const loadLyrics = async () => {
    if (!track) return;
    setLyricsLoading(true);
    setLyricsError(null);
    try {
      const response = await fetch(`/api/lyrics/${track.id}`);
      const data = await response.json();
      if (data.success && data.hasLyrics) {
        setLyrics(data.lyrics);
        setSyncedLines(data.syncedLines || null);
        setTranslatedLyrics(data.translatedLyrics || null);
        setShowTranslation(!!data.translatedLyrics);
      } else {
        setLyricsError(data.message || 'No se encontraron letras');
        setLyrics(null);
      }
    } catch (err) {
      console.error('[NowPlaying] Error cargando letras:', err);
      setLyricsError('Error al cargar la letra');
    } finally {
      setLyricsLoading(false);
    }
  };

  // Alternar vista de letras
  const toggleLyrics = () => {
    const newState = !showLyrics;
    setShowLyrics(newState);
    if (newState && !lyrics && !lyricsError && !lyricsLoading) {
      loadLyrics();
    }
  };

  // ===== RENDERIZAR LETRAS CON KARAOKE PALABRA POR PALABRA =====
  const renderLyrics = useCallback((text) => {
    if (!text) return null;
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const hasSynced = syncedLines && syncedLines.length > 0;

    return lines.map((line, lineIndex) => {
      const words = line.split(/(\s+)/).filter(Boolean);
      const isCurrentLine = hasSynced && lineIndex === currentLineIndex;
      const isPastLine = hasSynced && lineIndex < currentLineIndex;
      const isFutureLine = hasSynced && lineIndex > currentLineIndex;

      // Determinar cuántas palabras están "iluminadas" en la línea actual
      let wordsHighlighted = 0;
      if (isCurrentLine && words.length > 0) {
        wordsHighlighted = Math.floor(wordProgress * words.length);
      }

      return (
        <p
          key={lineIndex}
          data-lyric-index={lineIndex}
          className="transition-all duration-200"
          style={{
            fontSize: isCurrentLine ? 16 : isPastLine ? 14 : 14,
            fontWeight: isCurrentLine ? 600 : 400,
            padding: '3px 0',
            margin: '2px 0',
            textAlign: 'center',
            lineHeight: 1.8,
          }}
        >
          {hasSynced ? (
            // Modo karaoke: cada palabra se colorea individualmente
            words.map((word, wordIdx) => {
              if (word.trim() === '') {
                // Espacios: solo renderizar el espacio
                return <span key={wordIdx}>{word}</span>;
              }

              // Determinar el color según karaoke
              let color;
              if (isPastLine) {
                color = 'rgba(255,255,255,0.55)';
              } else if (isCurrentLine) {
                if (wordIdx < wordsHighlighted) {
                  // Palabra ya cantada → verde brillante
                  color = '#1db954';
                } else if (wordIdx === wordsHighlighted) {
                  // Palabra actual → verde claro con transición
                  const fadeProgress = (wordProgress * words.length) - wordsHighlighted;
                  const opacity = 0.4 + (fadeProgress * 0.6);
                  color = `rgba(29,185,84,${opacity})`;
                } else {
                  // Palabra futura → tenue
                  color = 'rgba(255,255,255,0.35)';
                }
              } else if (isFutureLine) {
                color = 'rgba(255,255,255,0.3)';
              } else {
                color = 'rgba(255,255,255,0.9)';
              }

              return (
                <span
                  key={wordIdx}
                  className="transition-colors duration-150"
                  style={{
                    color,
                    textShadow: color === '#1db954' ? '0 0 8px rgba(29,185,84,0.5)' : 'none',
                  }}
                >
                  {word}
                </span>
              );
            })
          ) : (
            // Sin sincronización: mostrar todo igual
            <span style={{ color: 'rgba(255,255,255,0.9)' }}>{line}</span>
          )}
        </p>
      );
    });
  }, [syncedLines, currentLineIndex, wordProgress]);

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ background: '#0d0d0d' }}>
        <Music2 size={64} style={{ color: '#535353' }} />
        <p className="mt-4" style={{ color: '#a7a7a7', fontSize: 16 }}>Sin reproducción activa</p>
        <button onClick={onClose} className="mt-6 px-6 py-2 rounded-full bg-primary text-black font-semibold">
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden" style={{ background: '#0d0d0d', padding: '12px 16px 0 16px' }}>

      {/* ===== FONDO DIFUMINADO DEL ÁLBUM ===== */}
      {bgImage && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${bgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            filter: 'blur(20px) brightness(0.4) saturate(1.5)',
          }}
        />
      )}
      {/* Capa oscura para mejorar legibilidad */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.7) 100%)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* ===== CONTENIDO ===== */}
      <div className="relative z-10 flex flex-col h-full">

        {/* ===== BARRA SUPERIOR ===== */}
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
            {/* Botón de letras - integrado como Spotify */}
            <button
              onClick={toggleLyrics}
              className={`p-2 rounded-full transition-colors ${showLyrics ? 'bg-primary/20 text-primary' : 'hover:bg-white/10'}`}
              style={{ color: showLyrics ? '#1db954' : '#a7a7a7', minWidth: 40, minHeight: 40 }}
              title={showLyrics ? 'Ocultar letra' : 'Ver letra'}
            >
              <FileText size={20} />
            </button>
            {onSync && (
              <button onClick={() => onSync(track)} className="p-2 rounded-full hover:bg-white/10 transition-colors" style={{ color: '#a7a7a7', minWidth: 40, minHeight: 40 }}>
                <Search size={20} />
              </button>
            )}

            {/* ===== MENÚ DESPLEGABLE DE 3 PUNTOS ===== */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                style={{ color: '#a7a7a7', minWidth: 40, minHeight: 40 }}
                title="Más opciones"
              >
                <MoreVertical size={20} />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div
                    className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl overflow-hidden shadow-2xl border border-white/10"
                    style={{ background: '#282828' }}
                  >
                    {onDislikeArtist && (
                      <button
                        onClick={() => { setShowMenu(false); onDislikeArtist(track.artist); }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-sm text-left text-red-400 hover:bg-white/10 transition-colors"
                      >
                        <UserX size={18} /> No me gusta artista
                      </button>
                    )}
                    {onFixMetadata && (
                      <button
                        onClick={() => { setShowMenu(false); onFixMetadata(track); }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-sm text-left text-white hover:bg-white/10 transition-colors"
                      >
                        <Wand2 size={18} /> Corregir metadatos
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          if (confirmDelete) {
                            handleDelete();
                          } else {
                            setConfirmDelete(true);
                            setTimeout(() => setConfirmDelete(false), 3000);
                          }
                        }}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${confirmDelete ? 'bg-red-500/30 text-red-400' : 'text-red-400 hover:bg-white/10'}`}
                      >
                        <Trash2 size={18} /> {confirmDelete ? 'Confirmar eliminar' : 'Eliminar canción'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ===== CUERPO PRINCIPAL ===== */}
        <div className="flex-1 flex flex-col" style={{ justifyContent: 'center', overflow: 'hidden' }}>
          <div className="flex flex-col" style={{ maxHeight: '100%' }}>

            {/* ===== PORTADA CENTRAL / LETRAS ===== */}
            {showLyrics ? (
              /* ===== VISTA DE LETRAS KARAOKE ===== */
              <div
                ref={lyricsContainerRef}
                className="flex flex-col overflow-y-auto"
                style={{
                  flex: '1 1 auto',
                  minHeight: 0,
                  padding: '16px 16px',
                  margin: '0 -16px',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(255,255,255,0.2) transparent',
                }}
              >
                {lyricsLoading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 size={32} className="animate-spin" style={{ color: '#1db954' }} />
                    <p className="mt-4" style={{ color: '#a7a7a7', fontSize: 14 }}>Cargando letras...</p>
                  </div>
                ) : lyricsError ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Music2 size={48} style={{ color: '#535353' }} />
                    <p className="mt-3" style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>Sin letras disponibles</p>
                    <p className="mt-1" style={{ color: '#a7a7a7', fontSize: 13 }}>{lyricsError}</p>
                    <button
                      onClick={loadLyrics}
                      className="mt-4 px-4 py-2 rounded-full transition-colors"
                      style={{ background: 'rgba(29,185,84,0.2)', color: '#1db954', fontSize: 13, fontWeight: 600 }}
                    >
                      Reintentar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1" style={{ padding: '4px 0' }}>
                    {showTranslation && translatedLyrics ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Original</p>
                          <div className="space-y-1" style={{ opacity: 0.8 }}>
                            {renderLyrics(lyrics)}
                          </div>
                        </div>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
                          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#1db954', opacity: 0.7 }}>Traducción</p>
                          <div className="space-y-1">
                            {renderLyrics(translatedLyrics)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {renderLyrics(lyrics)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* ===== PORTADA CENTRAL (ARTISTA O ÁLBUM) ===== */
              <div className="flex items-center justify-center" style={{ padding: '8px 0' }}>
                <div
                  className="relative flex items-center justify-center overflow-hidden"
                  style={{
                    width: 'min(65vw, 260px)',
                    height: 'min(65vw, 260px)',
                    borderRadius: '50%',
                    background: '#5c0303',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 0 80px rgba(0,0,0,0.4)',
                  }}
                >
                  {centerImage ? (
                    <img src={centerImage} alt={track.title} className="w-full h-full object-cover" />
                  ) : (
                    <Music2 size={80} style={{ color: '#535353' }} />
                  )}
                </div>
              </div>
            )}

            {/* ===== INFO DEL TEMA ===== */}
            <div className="flex items-center justify-between" style={{ padding: '12px 0 4px 0', flexShrink: 0 }}>
              <div className="min-w-0 flex-1">
                <div className="group flex items-center gap-3">
                  {onDislike && (
                    <button onClick={() => { removeFromQueue(track.id); onDislike(track); }} className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition hover:text-foreground hover:bg-muted sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100" title="No me gusta (pasa a la siguiente)">
                      <ThumbsDown size={26} className="sm:size-4" />
                    </button>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-white truncate" style={{ fontSize: 20, fontWeight: 700 }}>
                      {track.title}
                    </h2>
                    {/* ===== CLICK EN ARTISTA ===== */}
                    <p
                      className="truncate cursor-pointer hover:text-primary transition-colors"
                      style={{ fontSize: 15, color: '#b3b3b3' }}
                      onClick={handleArtistClick}
                      title={`Ver todas las canciones de ${track.artist}`}
                    >
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

            {/* ===== PROGRESS BAR ===== */}
            <div style={{ padding: '4px 0', flexShrink: 0 }}>
              <div
                ref={progressRef}
                onClick={seekTo}
                className="w-full rounded-full cursor-pointer"
                style={{ height: 4, background: 'rgba(255,255,255,0.15)', position: 'relative' }}
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

            {/* ===== CONTROLES ===== */}
            <div className="flex items-center justify-between" style={{ padding: '8px 0', flexShrink: 0 }}>
              <button onClick={() => shufflePlay(allTracks)} style={{ color: '#1db954', padding: 8 }} title="Reproducción aleatoria">
                <Shuffle size={22} />
              </button>
              <button onClick={onPrev} style={{ color: '#fff', padding: '4px 12px' }}>
                <SkipBack size={30} fill="currentColor" />
              </button>
              <button
                onClick={onPlayPause}
                className="flex items-center justify-center rounded-full hover:scale-105 transition-transform"
                style={{ width: 64, height: 64, background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
              >
                {isPlaying ? <Pause size={28} fill="#000" style={{ color: '#000' }} /> : <Play size={28} fill="#000" style={{ color: '#000', marginLeft: 2 }} />}
              </button>
              <button onClick={onNext} style={{ color: '#fff', padding: '4px 12px' }}>
                <SkipForward size={30} fill="currentColor" />
              </button>
              <button
                onClick={() => setRepeatMode((repeatMode + 1) % 3)}
                style={{ color: repeatMode > 0 ? '#1db954' : '#a7a7a7', padding: 8 }}
                title={repeatMode === 0 ? 'Sin repetición' : repeatMode === 1 ? 'Repetir todas' : 'Repetir una'}
              >
                {repeatMode === 2 ? (
                  <span className="relative">
                    <Repeat size={22} />
                    <span style={{ position: 'absolute', top: -4, right: -6, fontSize: 9, fontWeight: 700, color: '#1db954' }}>1</span>
                  </span>
                ) : (
                  <Repeat size={22} />
                )}
              </button>
            </div>

            {/* ===== VOLUMEN ===== */}
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
                style={{ accentColor: '#1db954', WebkitAppearance: 'none', appearance: 'none', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', outline: 'none' }}
              />
            </div>

            {/* ===== BOTÓN PARA VER COLA ===== */}
            <div className="flex justify-center" style={{ padding: '4px 0', flexShrink: 0 }}>
              <button
                onClick={() => setShowQueue(!showQueue)}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                style={{ color: '#a7a7a7' }}
                title={showQueue ? 'Ocultar cola' : 'Ver cola de reproducción'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showQueue ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              </button>
            </div>

            {/* ===== LISTA DE COLA ===== */}
            {showQueue && (
              <div className="overflow-y-auto" style={{ maxHeight: 200, flexShrink: 0, padding: '4px 0' }}>
                <p style={{ fontSize: 11, color: '#a7a7a7', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 8 }}>Próximas canciones</p>
                {upNextQueue.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#a7a7a7' }}>No hay canciones en cola</p>
                ) : (
                  <div className="space-y-2">
                    {upNextQueue.slice(0, 10).map((song, idx) => (
                      <div key={song.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
                        <span style={{ fontSize: 12, color: '#a7a7a7', minWidth: 20 }}>{idx + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate" style={{ fontSize: 13, color: '#fff' }}>{song.title}</p>
                          <p className="truncate" style={{ fontSize: 11, color: '#a7a7a7' }}>{song.artist}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}