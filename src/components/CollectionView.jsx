/**
 * ============================================================
 * COLLECTION VIEW - VISTA DE COLECCIÓN (ÁLBUM, ARTISTA, GÉNERO)
 * ============================================================
 * 
 * Muestra una colección de canciones (álbum, artista o género)
 * con portada, título, lista de canciones y controles.
 * Ahora recibe todas las canciones (allSongs) para la cola
 * y poder saltar a otros contextos.
 */

import { ArrowLeft, Play } from 'lucide-react';
import Cover from './Cover.jsx';
import SongRow from './SongRow.jsx';
import { usePlayer } from '../context/PlayerContext.jsx';
import { formatTime } from '../lib/format.js';

export default function CollectionView({ 
  collection,      // { kind, name, songs }
  onBack,          // Función para volver
  onLike,          // Función para dar like
  onDislike,       // Función para dislike
  onDislikeArtist, // Función para dislike de artista
  onDelete,        // Función para eliminar canción
  allSongs = []    // NUEVO: TODAS las canciones de la biblioteca
}) {
  const { play } = usePlayer();
  const { kind, name, songs } = collection;
  const round = kind === 'Artista';
  const totalSec = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const coverId = songs.find((s) => s.hasCover)?.id || songs[0]?.id;

  // Crear contexto para reproducción continua
  const contextType = kind === 'Artista' ? 'artist' : kind === 'Álbum' ? 'album' : kind === 'Año' ? 'year' : 'genre';
  const context = { type: contextType, value: name };

  // ============================================================
  // Usar las canciones de la COLECCIÓN como cola principal
  // (álbum, artista, género o año)
  // ============================================================
  const queueSongs = songs;

  return (
    <div className="flex flex-col gap-6 pb-20">
      
      {/* ===== BOTÓN VOLVER ===== */}
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      {/* ===== HEADER DE LA COLECCIÓN ===== */}
      <header className="flex flex-col items-center gap-5 sm:flex-row sm:items-end">
        
        {/* Portada */}
        <Cover
          song={{ coverId, hasCover: true }}
          rounded={round ? 'rounded-full' : 'rounded-2xl'}
          className="h-44 w-44 shrink-0 shadow-2xl"
        />
        
        {/* Información de la colección */}
        <div className="text-center sm:text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kind}</p>
          <h1 className="mt-1 font-display text-4xl font-700 tracking-tight text-balance">{name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {songs.length} {songs.length === 1 ? 'canción' : 'canciones'}
            <span className="mx-2">·</span>
            {formatTime(totalSec)}
          </p>
          
          {/* ===== BOTÓN REPRODUCIR CON CONTEXTO ===== */}
          <button
            onClick={() => {
              if (queueSongs.length) {
                console.log('[CollectionView] 📀 Reproduciendo con contexto:', context);
                console.log('[CollectionView] 📊 Canciones en cola:', queueSongs.length);
                // Reproducir la PRIMERA canción del contexto,
                // pero la COLA completa son TODAS las canciones
                play(songs[0], queueSongs, context);
              }
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:scale-105"
          >
            <Play size={18} fill="currentColor" /> Reproducir
          </button>
        </div>
      </header>

      {/* ===== LISTA DE CANCIONES ===== */}
      <div className="rounded-xl border border-border bg-surface/50 p-2">
        {songs.map((song, i) => (
          <SongRow
            key={song.id}
            song={song}
            index={i}
            queue={queueSongs} // <-- Pasar TODAS las canciones como cola
            onLike={onLike}
            onDislike={onDislike}
            onDislikeArtist={onDislikeArtist}
            onDelete={onDelete}
            showDelete={true}
            showCover={!round}
            context={context} // <-- Pasar contexto para reproducción
          />
        ))}
      </div>
    </div>
  );
}