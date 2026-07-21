/**
 * ============================================================
 * COLLECTION VIEW - VISTA DE COLECCIÓN HÍBRIDA
 * ============================================================
 * 
 * Estrategia de carga:
 * 1. Filtra localmente desde allSongs (para modo offline y descargas)
 * 2. Si no hay resultados locales y hay conexión, consulta el endpoint del servidor
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Play, UserX, Loader2 } from 'lucide-react';
import Cover from './Cover.jsx';
import SongRow from './SongRow.jsx';
import { usePlayer } from '../context/PlayerContext.jsx';
import { formatTime } from '../lib/format.js';

const PAGE_SIZE = 100;

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
  const { kind, name, id } = collection;
  const round = kind === 'Artista';

  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [source, setSource] = useState('local'); // 'local' | 'api'
  
  const loaderRef = useRef(null);
  const hasAttemptedApiRef = useRef(false);

  const likedIds = useMemo(() => new Set(allSongs?.filter(s => s.liked).map(s => s.id) || []), [allSongs]);

  // Filtrar localmente desde allSongs
  const localFiltered = useMemo(() => {
    if (!allSongs || !kind) return [];
    return allSongs.filter(song => {
      if (kind === 'Artista') return song.artist === name;
      if (kind === 'Álbum') return song.album === name || song.albumId === id;
      if (kind === 'Género') return song.genre === name || song.genreId === id;
      if (kind === 'Año') {
        const yearNum = Number(id);
        if (!Number.isFinite(yearNum)) return false;
        const songYear = song.year || (song.date ? new Date(song.date).getFullYear() : null);
        return songYear === yearNum;
      }
      return false;
    });
  }, [allSongs, kind, name, id]);

  // Cargar desde API (para paginación online)
  const loadFromApi = useCallback(async (reset = false) => {
    if (isLoadingMore) return;
    
    setIsLoadingMore(true);
    try {
      let endpoint = '';
      const params = { limit: PAGE_SIZE, offset: reset ? 0 : offset, userId };
      
      if (kind === 'Artista') endpoint = `/api/artists/${id}/songs`;
      else if (kind === 'Álbum') endpoint = `/api/albums/${id}/songs`;
      else if (kind === 'Género') endpoint = `/api/genres/${id}/songs`;
      else if (kind === 'Año') endpoint = `/api/years/${id}/songs`;
      else {
        setIsLoadingMore(false);
        return;
      }

      const qs = new URLSearchParams(params);
      const response = await fetch(`${endpoint}?${qs.toString()}`);
      const data = await response.json();
      
      const newSongs = data.songs || [];
      setSongs(prev => reset ? newSongs : [...prev, ...newSongs]);
      setOffset(reset ? newSongs.length : prev => prev + newSongs.length);
      setHasMore(data.pagination?.hasMore || false);
      setTotal(data.pagination?.total || newSongs.length);
      setSource('api');
    } catch (err) {
      console.error('Error cargando desde API:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [kind, id, offset, userId, isLoadingMore]);

  // Inicialización: priorizar local, fallback a API
  useEffect(() => {
    if (!kind || !id) return;
    
    setSongs([]);
    setOffset(0);
    setTotal(0);
    setHasMore(false);
    setSource('local');
    hasAttemptedApiRef.current = false;

    // Paso 1: Usar datos locales primero (offline support)
    if (localFiltered.length > 0) {
      setSongs(localFiltered);
      setTotal(localFiltered.length);
      setHasMore(false); // Datos locales no tienen paginación
      setSource('local');
    } else if (navigator.onLine && !hasAttemptedApiRef.current) {
      // Paso 2: Si no hay locales y hay conexión, consultar API
      hasAttemptedApiRef.current = true;
      setLoading(true);
      loadFromApi(true);
    } else {
      setLoading(false);
    }
  }, [kind, id, name]); // Remover localFiltered y loadFromApi para evitar loops

  // Configurar IntersectionObserver para scroll infinito (solo en modo API)
  useEffect(() => {
    if (!hasMore || isLoadingMore || source !== 'api') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadFromApi(false);
        }
      },
      { rootMargin: '0px 0px 200px 0px', threshold: 0.1 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, source, loadFromApi]);

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
      play(songs[0], queueSongs, context);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 pb-20">
        <button onClick={onBack} className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft size={16} /> Volver
        </button>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-20">
      
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <header className="flex flex-col items-center gap-5 sm:flex-row sm:items-end">
        {coverId && (
          <Cover
            song={{ coverId, hasCover: true }}
            rounded={round ? 'rounded-full' : 'rounded-2xl'}
            className="h-44 w-44 shrink-0 shadow-2xl"
          />
        )}
        {!coverId && (
          <div className="h-44 w-44 shrink-0 rounded-2xl bg-surface/30 flex items-center justify-center shadow-2xl">
            <span className="text-5xl text-muted-foreground/30">
              {round ? '🎤' : '💿'}
            </span>
          </div>
        )}
        <div className="text-center sm:text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kind}</p>
          <h1 className="mt-1 font-display text-4xl font-700 tracking-tight text-balance">{name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {songs.length} {songs.length === 1 ? 'canción' : 'canciones'}
            <span className="mx-2">·</span>
            {formatTime(totalSec)}
            {source === 'api' && total > songs.length && (
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
        
        {/* Loader para scroll infinito (solo en modo API) */}
        {source === 'api' && hasMore && (
          <div ref={loaderRef} className="py-4 flex justify-center">
            {isLoadingMore ? (
              <Loader2 size={24} className="animate-spin text-primary" />
            ) : (
              <p className="text-xs text-muted-foreground/60">Desplázate para cargar más...</p>
            )}
          </div>
        )}
        
        {songs.length === 0 && (
          <p className="text-center text-xs text-muted-foreground/60 py-4">
            No se encontraron canciones {source === 'local' ? 'en tu biblioteca' : 'en el servidor'}
          </p>
        )}
      </div>
    </div>
  );
}