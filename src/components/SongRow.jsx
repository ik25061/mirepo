import { useState, useEffect } from 'react';
import { 
  Play, Pause, Heart, ThumbsDown, Trash2, Check, Wand2, 
  ListMusic, PlayCircle, ListEnd, Download, FileText 
} from 'lucide-react';
import Cover from './Cover.jsx';
import NowPlayingBars from './Player/NowPlayingBars.jsx';
import { formatTime } from '../lib/format.js';
import { usePlayer } from '../context/PlayerContext.jsx';
import { audioUrl } from '../lib/api.js';
import { useDownload } from '../context/DownloadContext.jsx';

export default function SongRow({
  song,
  index,
  queue,
  onLike,
  onDislike,
  onDelete,
  onFixMetadata,
  showDelete = false,
  showCover = true,
  context = null,
  likedIds, // Set de IDs de canciones favoritas
  onShowLyrics = null,
  fixingMetadata = null,
}) {
  const { current, isPlaying, play, togglePlay, addToQueue, removeFromQueue } = usePlayer();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isCurrent = current?.id === song.id;

  // ===== OBTENER ESTADO DE DESCARGA =====
  const { isDownloaded, downloadSong } = useDownload();
  const songDownloaded = isDownloaded(song.id);

  // Calcular si la canción está liked a partir del Set de likedIds
  const isLiked = likedIds?.has(song.id) ?? song.liked ?? false;

  // Resetear confirmación cuando cambia la canción
  useEffect(() => {
    setConfirmDelete(false);
  }, [song.id]);

  const handlePlay = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      console.log('[SongRow] Reproduciendo con contexto:', context);
      play(song, queue, context);
    }
  };

  // Eliminar canción - usa removeFromQueue para pasar a la siguiente
  const handleDelete = async (e) => {
    e.stopPropagation();

    if (confirmDelete) {
      const songId = song.id;

      // Eliminar de la cola de reproducción (esto maneja el paso a la siguiente)
      removeFromQueue(song.id);

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

  // ===== FUNCIÓN PARA DESCARGAR CANCIÓN INDIVIDUAL =====
  const handleDownload = async (e) => {
    e.stopPropagation();
    
    // Si ya está descargada, no hacer nada
    if (songDownloaded) return;
    
    try {
      const success = await downloadSong(song);
      if (success) {
        console.log('[SongRow] Canción descargada:', song.title);
      } else {
        alert('Error al descargar la canción.');
      }
    } catch (err) {
      console.error('Error descargando canción:', err);
      alert('Error al descargar la canción.');
    }
  };

  const iconBtn = 'grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition hover:text-foreground hover:bg-muted sm:h-8 sm:w-8';

  return (
    <div
      className={`group flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition hover:bg-surface-2 sm:gap-3 sm:px-2 sm:py-2 ${isCurrent ? 'bg-surface-2' : ''
        }`}
      style={{ minHeight: 36 }}
    >
      {/* ===== BOTÓN DE REPRODUCCIÓN ===== */}
      <button
        onClick={handlePlay}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs text-muted-foreground sm:h-9 sm:w-9 sm:text-sm"
        aria-label={isCurrent && isPlaying ? 'Pausar' : 'Reproducir ' + song.title}
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
        <span className={'group-hover:hidden text-[10px] sm:text-sm ' + (isCurrent ? 'text-primary' : '')}>
          {isCurrent && isPlaying ? <NowPlayingBars /> : typeof index === 'number' ? index + 1 : ''}
        </span>
      </button>

      {/* ===== PORTADA CON BADGE DE DESCARGA ===== */}
      {showCover && (
        <div onClick={handlePlay} className="cursor-pointer shrink-0 relative">
          <Cover song={song} className="h-7 w-7 sm:h-10 sm:w-10" rounded="rounded-md" />
          {songDownloaded && (
            <div className="absolute -top-1 -right-1 rounded-full bg-primary p-0.5 shadow-lg">
              <Download size={10} className="text-primary-foreground" fill="currentColor" />
            </div>
          )}
        </div>
      )}

      {/* ===== TÍTULO Y ARTISTA ===== */}
      <div className="min-w-0 flex-1 cursor-pointer" onClick={handlePlay}>
        <p className={'truncate text-xs font-medium sm:text-sm ' + (isCurrent ? 'text-primary' : 'text-foreground')}>
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
        {/* Añadir a cola - siguiente */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            addToQueue(song, 'next');
          }}
          className={`${iconBtn} sm:opacity-0 sm:group-hover:opacity-100 hover:text-primary`}
          title="Reproducir después de la actual"
        >
          <PlayCircle size={12} className="sm:size-4" />
        </button>

        {/* Añadir a cola - al final */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            addToQueue(song, 'end');
          }}
          className={`${iconBtn} sm:opacity-0 sm:group-hover:opacity-100 hover:text-primary`}
          title="Añadir al final de la cola"
        >
          <ListEnd size={12} className="sm:size-4" />
        </button>

        {/* Me gusta */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLike?.(song);
          }}
          className={iconBtn + ' ' + (isLiked ? 'text-primary hover:text-primary' : 'sm:opacity-0 sm:group-hover:opacity-100')}
        >
          <Heart size={12} fill={isLiked ? 'currentColor' : 'none'} className="sm:size-4" />
        </button>

        {/* No me gusta canción */}
        {onDislike && (
          <button
            onClick={(e) => { e.stopPropagation(); onDislike(song); }}
            className={iconBtn + ' sm:opacity-0 sm:group-hover:opacity-100'}
            title="No me gusta esta canción"
          >
            <ThumbsDown size={12} className="sm:size-4" />
          </button>
        )}

        {/* Eliminar canción */}
        {/* {showDelete && onDelete && (
          <button
            onClick={handleDelete}
            className={iconBtn + ' ' + (
              confirmDelete
                ? 'bg-red-500/20 text-red-500 opacity-100'
                : 'sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-500'
            )}
            title={confirmDelete ? 'Pulsa de nuevo para confirmar' : 'Eliminar (mover a papelera)'}
          >
            {confirmDelete ? <Check size={12} className="sm:size-4" /> : <Trash2 size={12} className="sm:size-4" />}
          </button>
        )} */}

        {/* Corregir metadatos */}
        {/* {onFixMetadata && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFixMetadata(song);
            }}
            className={`${iconBtn} sm:opacity-0 sm:group-hover:opacity-100 hover:text-primary`}
            title="Corregir metadatos"
          >
            <Wand2 size={12} className="sm:size-4" />
          </button>
        )} */}

        {/* ===== BOTÓN DE DESCARGA INDIVIDUAL ===== */}
        {/* <button
          onClick={handleDownload}
          disabled={songDownloaded}
          className={`${iconBtn} ${
            songDownloaded 
              ? 'text-primary' 
              : 'sm:opacity-0 sm:group-hover:opacity-100 hover:text-primary'
          }`}
          title={songDownloaded ? 'Ya descargada' : 'Descargar canción'}
        >
          <Download 
            size={12} 
            className="sm:size-4" 
            fill={songDownloaded ? 'currentColor' : 'none'} 
          />
        </button> */}

        {/* Ver letra */}
        {onShowLyrics && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShowLyrics(song);
            }}
            className={`${iconBtn} sm:opacity-0 sm:group-hover:opacity-100 hover:text-primary`}
            title="Ver letra"
          >
            <FileText size={12} className="sm:size-4" />
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