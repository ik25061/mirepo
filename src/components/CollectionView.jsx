/**
 * ============================================================
 * COLLECTION VIEW - VISTA DE COLECCIÓN HÍBRIDA
 * ============================================================
 * 
 * Estrategia de carga:
 * 1. Si hay conexión, consulta directamente la API (paginación completa)
 * 2. Si no hay conexión o la API falla, filtra localmente desde allSongs
 * 3. En modo descargas/offline, usa siempre el filtro local
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Play, UserX, Loader2 } from 'lucide-react';
import Cover from './Cover.jsx';
import SongRow from './SongRow.jsx';
import DownloadAllButton from './DownloadAllButton.jsx';
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
  offlineMode = false,
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
      if (kind === 'Género') {
        // El género puede ser un array de géneros o un string
        const genres = Array.isArray(song.genre) ? song.genre : [song.genre || ''];
        return genres.includes(name) || song.genreId === id;
      }
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
      const currentOffset = reset ? 0 : offset;
      let endpoint = '';
      const params = { limit: PAGE_SIZE, offset: currentOffset, userId };
      
      if (kind === 'Artista') endpoint = `/api/artists/${id}/songs`;
      else if (kind === 'Álbum') endpoint = `/api/albums/${id}/songs`;
      else if (kind === 'Género') endpoint = `/api/genres/${id}/songs`;
      else if (kind === 'Año') endpoint = `/api/years/${id}/songs`;
      else {
        setIsLoadingMore(false);
        setLoading(false);
        return;
      }

      const qs = new URLSearchParams(params);
      const response = await fetch(`${endpoint}?${qs.toString()}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      const newSongs = data.songs || [];
      setSongs(prev => reset ? newSongs : [...prev, ...newSongs]);
      setOffset(reset ? newSongs.length : prev => prev + newSongs.length);
      setHasMore(data.pagination?.hasMore || false);
      setTotal(data.pagination?.total || newSongs.length);
      setSource('api');
    } catch (err) {
      console.error('[CollectionView] Error cargando desde API:', err.message);
      // Fallback a datos locales si la API falla
      if (localFiltered.length > 0 && reset) {
        setSongs(localFiltered);
        setTotal(localFiltered.length);
        setHasMore(false);
        setSource('local');
      }
    } finally {
      setIsLoadingMore(false);
      setLoading(false);
    }
  }, [kind, id, offset, userId, isLoadingMore, localFiltered]);

  // Inicialización: priorizar API si hay conexión, fallback a local si offline
  useEffect(() => {
    if (!kind || !id) return;
    
    console.log('[CollectionView] Inicializando:', { kind, name, id, userId, online: navigator.onLine });
    
    setSongs([]);
    setOffset(0);
    setTotal(0);
    setHasMore(false);
    setSource('local');
    hasAttemptedApiRef.current = false;

    if (navigator.onLine) {
      // Prioridad 1: API (paginación completa, resultados reales)
      console.log('[CollectionView] Hay conexión, cargando desde API...');
      hasAttemptedApiRef.current = true;
      setLoading(true);
      // Ejecutar loadFromApi fuera del setState batch
      setTimeout(() => loadFromApi(true), 0);
    } else if (localFiltered.length > 0) {
      // Prioridad 2: Datos locales (offline o modo descargas)
      console.log('[CollectionView] Sin conexión, usando datos locales:', localFiltered.length);
      setSongs(localFiltered);
      setTotal(localFiltered.length);
      setHasMore(false);
      setSource('local');
      setLoading(false);
    } else {
      console.log('[CollectionView] Sin datos disponibles');
      setLoading(false);
    }
  }, [kind, id, name, userId]); // Añadir userId para actualizar si cambia

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
    <div className="relative flex flex-col gap-6 pb-20">

      {/* Botón "No me gusta artista": esquina superior derecha, separado de las
          acciones principales para evitar pulsaciones accidentales */}
      {kind === 'Artista' && onDislikeArtist && (
        <button
          onClick={() => onDislikeArtist(name)}
          className="absolute right-0 top-0 inline-flex items-center gap-2 rounded-full bg-surface-2/60 px-3 py-2 text-xs font-semibold text-red-400/80 shadow transition hover:bg-red-500/30 hover:text-red-400"
          title={`No mostrar al artista ${name}`}
        >
          <UserX size={16} /> 
        </button>
      )}

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
            {!offlineMode && songs.length > 0 && (
              <DownloadAllButton songs={songs} />
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