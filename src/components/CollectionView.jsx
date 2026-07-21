/**
 * ============================================================
 * COLLECTION VIEW - VISTA DE COLECCIÓN CON PAGINACIÓN
 * ============================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Play, UserX, Loader2 } from 'lucide-react';
import Cover from './Cover.jsx';
import SongRow from './SongRow.jsx';
import { usePlayer } from '../context/PlayerContext.jsx';
import { formatTime } from '../lib/format.js';
import { api } from '../lib/api.js';

export default function CollectionView({ 
  collection,
  onBack,
  onLike,
  onDislike,
  onDislikeArtist,
  onDelete,
  allSongs,
  userId,
}) {
  const { play } = usePlayer();
  const { kind, name, songs: initialSongs, id } = collection;
  const round = kind === 'Artista';
  
  const [songs, setSongs] = useState(initialSongs || []);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(initialSongs?.length || 0);
  const [total, setTotal] = useState(initialSongs?.length || 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loaderRef = useRef(null);
  const PAGE_SIZE = 100;

  const likedIds = new Set(allSongs?.filter(s => s.liked).map(s => s.id) || []);

  // Cargar más canciones de la colección
  const loadMoreSongs = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    try {
      let endpoint = '';
      let params = { limit: PAGE_SIZE, offset, userId };
      
      if (kind === 'Artista') {
        endpoint = `/api/artists/${id}/songs`;
      } else if (kind === 'Álbum') {
        endpoint = `/api/albums/${id}/songs`;
      } else if (kind === 'Género') {
        endpoint = `/api/genres/${id}/songs`;
      } else if (kind === 'Año') {
        endpoint = `/api/years/${id}/songs`;
      } else {
        setIsLoadingMore(false);
        return;
      }

      const qs = new URLSearchParams(params);
      const response = await fetch(`/api${endpoint}?${qs.toString()}`);
      const data = await response.json();
      
      const newSongs = data.songs || [];
      setSongs(prev => [...prev, ...newSongs]);
      setOffset(prev => prev + newSongs.length);
      setHasMore(data.pagination?.hasMore || false);
      setTotal(data.pagination?.total || songs.length);
    } catch (err) {
      console.error('Error cargando más canciones:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [kind, id, offset, userId, isLoadingMore, hasMore]);

  // Configurar IntersectionObserver para scroll infinito
  useEffect(() => {
    if (!hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMoreSongs();
        }
      },
      { rootMargin: '0px 0px 200px 0px', threshold: 0.1 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMoreSongs]);

  // Si la colección tiene menos canciones que las iniciales, no mostrar scroll
  useEffect(() => {
    if (songs.length > 0 && songs.length < (initialSongs?.length || 0)) {
      setSongs(initialSongs);
    }
  }, [initialSongs]);

  const totalSec = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const coverId = songs.find((s) => s.hasCover)?.id || songs[0]?.id;

  let contextType = 'album';
  if (kind === 'Artista') contextType = 'artist';
  else if (kind === 'Género') contextType = 'genre';
  else if (kind === 'Año') contextType = 'year';
  
  const context = { type: contextType, value: name };
  const queueSongs = songs;

  const handlePlayAll = () => {
    if (songs.length) {
      console.log('[CollectionView] Reproduciendo colección:', { kind, name, songs: songs.length });
      console.log('[CollectionView] Contexto:', context);
      play(songs[0], queueSongs, context);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-20">
      
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={16} /> Volver
      </button>

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
            {total > songs.length && (
              <span className="ml-2 text-xs text-muted-foreground/60">
                (Mostrando {songs.length} de {total})
              </span>
            )}
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
        
        {/* Loader para scroll infinito */}
        {hasMore && (
          <div ref={loaderRef} className="py-4 flex justify-center">
            {isLoadingMore ? (
              <Loader2 size={24} className="animate-spin text-primary" />
            ) : (
              <p className="text-xs text-muted-foreground/60">Desplázate para cargar más...</p>
            )}
          </div>
        )}
        
        {!hasMore && songs.length > 0 && (
          <p className="text-center text-xs text-muted-foreground/60 py-4">
            🎵 {songs.length} canciones cargadas
          </p>
        )}
      </div>
    </div>
  );
}