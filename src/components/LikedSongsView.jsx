/**
 * ============================================================
 * LIKED SONGS VIEW - CANCIONES QUE ME GUSTAN
 * ============================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Play, Shuffle, Heart, Loader2 } from 'lucide-react';
import SongRow from './SongRow.jsx';
import DownloadAllButton from './DownloadAllButton.jsx';
import { usePlayer } from '../context/PlayerContext.jsx';
import { formatTime } from '../lib/format.js';
import { api } from '../lib/api.js';

export default function LikedSongsView({ 
  userId,
  onBack, 
  onLike, 
  onDislike, 
  onDislikeArtist, 
  onDelete,
  onAddToPlayList
}) {
  const { play, shufflePlay } = usePlayer();
  const [likedSongs, setLikedSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loaderRef = useRef(null);
  const PAGE_SIZE = 100;

  // Cargar canciones que me gustan
  const loadLikedSongs = useCallback(async (reset = true) => {
    if (!userId) return;
    
    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
      } else {
        setIsLoadingMore(true);
      }
      
      const currentOffset = reset ? 0 : offset;
      console.log(`[LikedSongsView] Cargando likes: offset=${currentOffset}, limit=${PAGE_SIZE}`);
      
      const data = await api.getLikedSongs(userId, { 
        limit: PAGE_SIZE, 
        offset: currentOffset 
      });
      
      console.log(`[LikedSongsView] Recibidos ${data.songs?.length || 0} canciones`);
      
      const songs = data.songs || [];
      const pagination = data.pagination || { total: songs.length, hasMore: false };
      
      if (reset) {
        setLikedSongs(songs);
        setTotal(pagination.total || songs.length);
        setOffset(PAGE_SIZE);
      } else {
        setLikedSongs(prev => [...prev, ...songs]);
        setOffset(prev => prev + songs.length);
      }
      
      setHasMore(pagination.hasMore || false);
      
    } catch (err) {
      console.error('[LikedSongsView] Error cargando canciones que me gustan:', err);
    } finally {
      if (reset) {
        setLoading(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  }, [userId, offset, PAGE_SIZE]);

  // Cargar más canciones (scroll infinito)
  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    console.log('[LikedSongsView] Cargando más...');
    loadLikedSongs(false);
  }, [isLoadingMore, hasMore, loadLikedSongs]);

  // Configurar IntersectionObserver para scroll infinito
  useEffect(() => {
    if (!hasMore || isLoadingMore || !loaderRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          console.log('[LikedSongsView] IntersectionObserver disparado');
          loadMore();
        }
      },
      { rootMargin: '0px 0px 200px 0px', threshold: 0.1 }
    );

    observer.observe(loaderRef.current);

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  // Carga inicial
  useEffect(() => {
    if (userId) {
      loadLikedSongs(true);
    } else {
      console.log('[LikedSongsView] userId no disponible');
      setLoading(false);
    }
  }, [userId]);

  const totalSec = likedSongs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const likedIds = new Set(likedSongs.map(s => s.id));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando canciones que te gustan...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <header className="flex flex-col items-center gap-5 sm:flex-row sm:items-end">
        <div className="grid h-36 w-36 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-2xl sm:h-44 sm:w-44">
          <Heart size={48} fill="currentColor" />
        </div>
        <div className="text-center sm:text-left">
      
          <h1 className="mt-1 font-display text-xl font-600 tracking-tight text-balance sm:text-4xl">
            Canciones que me gustan
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {likedSongs.length} {likedSongs.length === 1 ? 'canción' : 'canciones'}
            <span className="mx-2">·</span>
            {formatTime(totalSec)}
            {total > likedSongs.length && (
              <span className="ml-2 text-xs text-muted-foreground/60">
                (Mostrando {likedSongs.length} de {total})
              </span>
            )}
          </p>

          {likedSongs.length > 0 && (
            <div className="mt-4 flex justify-between  gap-3 sm:flex-row sm:items-center sm:justify-start">
                <button
                  onClick={() => play(likedSongs[0], likedSongs)}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:scale-105"
                >
                  <Play size={18} fill="currentColor" /> 
                </button>
                <button
                  onClick={() => shufflePlay(likedSongs)}
                  className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-6 py-2.5 text-sm font-semibold text-foreground shadow transition hover:scale-105"
                  title="Reproducción aleatoria"
                >
                  <Shuffle size={16} /> 
                </button>
              <DownloadAllButton
                songs={likedSongs}
                onComplete={(result) => {
                  if (result && result.successCount > 0) {
                    console.log('[LikedSongsView] Descarga completada:', result);
                  }
                }}
              />
            </div>
          )}
        </div>
      </header>

      {/* ===== LISTA DE CANCIONES ===== */}
      {likedSongs.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface/50 p-2">
          {likedSongs.map((song, i) => (
            <SongRow
              key={song.id}
              song={song}
              index={i}
              queue={likedSongs}
              onLike={onLike}
              onDislike={onDislike}
              onDislikeArtist={onDislikeArtist}
              onDelete={onDelete}
              showDelete
              context={null}
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
          
          {!hasMore && likedSongs.length > 0 && (
            <p className="text-center text-xs text-muted-foreground/60 py-4">
              🎵 {likedSongs.length} canciones que te gustan
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Heart size={48} className="text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">
            No hay canciones que te gusten aún.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Marca canciones con el corazón para verlas aquí.
          </p>
        </div>
      )}
    </div>
  );
}