/**
 * ============================================================
 * COLLECTION VIEW - VISTA DE COLECCIÓN (ÁLBUM, ARTISTA, GÉNERO)
 * ============================================================
 */

import { useState, useEffect } from 'react';
import { ArrowLeft, Play, UserX } from 'lucide-react';
import Cover from './Cover.jsx';
import SongRow from './SongRow.jsx';
import { usePlayer } from '../context/PlayerContext.jsx';
import { formatTime } from '../lib/format.js';

export default function CollectionView({ 
  collection,
  onBack,
  onLike,
  onDislike,
  onDislikeArtist,
  onDelete,
  allSongs, // todas las canciones para calcular likedIds
}) {
  const { play } = usePlayer();
  const { kind, name, songs } = collection;
  const round = kind === 'Artista';
  
  // Calcular likedIds a partir de allSongs
  const likedIds = new Set(allSongs?.filter(s => s.liked).map(s => s.id) || []);

  const totalSec = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const coverId = songs.find((s) => s.hasCover)?.id || songs[0]?.id;

  // Crear contexto para reproducción continua
  let contextType = 'album';
  if (kind === 'Artista') contextType = 'artist';
  else if (kind === 'Género') contextType = 'genre';
  else if (kind === 'Año') contextType = 'year';
  
  const context = { type: contextType, value: name };

  // TODAS las canciones de la colección SON la cola
  const queueSongs = songs;

  // Función para reproducir la colección
  const handlePlayAll = () => {
    if (songs.length) {
      console.log('[CollectionView] Reproduciendo colección:', { kind, name, songs: songs.length });
      console.log('[CollectionView] Contexto:', context);
      play(songs[0], queueSongs, context);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-20">
      
      {/* ===== BOTÓN VOLVER ===== */}
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      {/* ===== HEADER ===== */}
      <header className="flex flex-col items-center gap-5 sm:flex-row sm:items-end">
        <Cover
          song={{ coverId, hasCover: true }}
          rounded={round ? 'rounded-full' : 'rounded-2xl'}
          className="h-44 w-44 shrink-0 shadow-2xl"
        />
        <div className="text-center sm:text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kind}</p>
          <h1 className="mt-1 font-display text-4xl font-700 tracking-tight text-balance">{name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {songs.length} {songs.length === 1 ? 'canción' : 'canciones'}
            <span className="mx-2">·</span>
            {formatTime(totalSec)}
          </p>
          
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handlePlayAll}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:scale-105"
            >
              <Play size={18} fill="currentColor" /> Reproducir
            </button>
            {kind === 'Artista' && onDislikeArtist && (
              <button
                onClick={() => onDislikeArtist(name)}
                className="inline-flex items-center gap-2 rounded-full bg-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-400 shadow transition hover:bg-red-500/30"
                title={`No mostrar al artista ${name}`}
              >
                <UserX size={18} /> No me gusta artista
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ===== LISTA DE CANCIONES ===== */}
      <div className="rounded-xl border border-border bg-surface/50 p-2">
        {songs.map((song, i) => (
          <SongRow
            key={song.id}
            song={song}
            index={i}
            queue={queueSongs}
            onLike={onLike}
            onDislike={onDislike}
            onDislikeArtist={onDislikeArtist}
            onDelete={onDelete}
            showDelete={true}
            showCover={!round}
            context={context}
            likedIds={likedIds}
          />
        ))}
      </div>
    </div>
  );
}