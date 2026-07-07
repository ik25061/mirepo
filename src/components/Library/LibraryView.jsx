/**
 * ============================================================
 * LIBRARY VIEW - VISTA DE BIBLIOTECA
 * ============================================================
 * 
 * Implementa scroll infinito usando IntersectionObserver.
 * Basado en: https://dev.to/franklin030601/creando-un-scroll-infinito-con-react-js-27gf
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Search, Play, Trash2, Wand2 } from 'lucide-react';
import SongRow from '../SongRow.jsx';
import { usePlayer } from '../../context/PlayerContext.jsx';
import { api } from '../../lib/api.js';
import path from 'node:path';

// ============================================================
// LOADING SKELETON
// ============================================================
function TrackSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2 px-2 rounded-xl animate-pulse">
      <div className="flex-shrink-0 rounded-lg" style={{ width: 40, height: 40, background: '#282828' }} />
      <div className="flex-1 min-w-0">
        <div style={{ height: 14, width: '70%', background: '#282828', borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: 12, width: '50%', background: '#282828', borderRadius: 4 }} />
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function LibraryView({
  songs,
  counts,
  onLike,
  onDislike,
  onDislikeArtist,
  onDelete,
  loading,
  hasMore,
  isLoadingMore,
  onLoadMore,
  allSongs
}) {
  const { play, current } = usePlayer();
  const [query, setQuery] = useState('');
  const [fixingMetadata, setFixingMetadata] = useState(null);

  // ============================================================
  // REFERENCIAS PARA INTERSECTION OBSERVER
  // ============================================================
  const listRef = useRef(null);
  const loaderRef = useRef(null);
  const observerRef = useRef(null);

  // ============================================================
  // LIKED IDS - Set de IDs de canciones favoritas
  // ============================================================
  const likedIds = useMemo(() => {
    return new Set(allSongs?.filter(s => s.liked).map(s => s.id) || []);
  }, [allSongs]);

  // ============================================================
  // FILTRAR CANCIONES
  // ============================================================
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q)
    );
  }, [songs, query]);

  // ============================================================
  // CORREGIR METADATOS
  // ============================================================
  const handleFixMetadata = async (song) => {
    if (!confirm('¿Corregir metadatos de "' + song.title + '"?')) return;

    setFixingMetadata(song.id);
    try {
      const fullPath = song.relPath.startsWith('music/') ? song.relPath : 'music/' + song.relPath;
      const result = await api.fixMetadata(fullPath);
      alert('✅ ' + result.message + '\n\nNuevo nombre: ' + path.basename(result.newPath));
    } catch (err) {
      alert('Error al corregir metadatos: ' + err.message);
    } finally {
      setFixingMetadata(null);
    }
  };

  // ============================================================
  // FUNCIÓN PARA CARGAR MÁS CANCIONES (wrapper)
  // ============================================================
  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !hasMore || loading) {
      console.log('[LibraryView] ⏳ No se puede cargar más:', { isLoadingMore, hasMore, loading });
      return;
    }
    console.log('[LibraryView] 📥 Cargando más canciones...');
    onLoadMore();
  }, [isLoadingMore, hasMore, loading, onLoadMore]);

  // ============================================================
  // CONFIGURAR INTERSECTION OBSERVER
  // ============================================================
  useEffect(() => {
    // Si no hay más canciones, no configurar el observer
    if (!hasMore) return;

    // Crear el observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Si el elemento es visible y hay más canciones
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !loading) {
          console.log('[LibraryView] 👁️ Elemento visible, cargando más...');
          handleLoadMore();
        }
      },
      {
        root: listRef.current,
        rootMargin: '0px 0px 200px 0px',
        threshold: 0.1
      }
    );

    // Observar el elemento loader
    if (loaderRef.current) {
      observerRef.current.observe(loaderRef.current);
    }

    // Limpiar observer al desmontar
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoadingMore, loading, handleLoadMore]);

  return (
    <div className="flex flex-col gap-4 h-full w-full">

      {/* ===== HEADER ===== */}
      <header className="animate-fade-in flex flex-wrap items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="font-display text-3xl font-700 tracking-tight">Biblioteca</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {counts.total} {counts.total === 1 ? 'canción' : 'canciones'}
            <span className="mx-2">·</span>
            <span className="inline-flex items-center gap-1">
              <Trash2 size={13} /> {counts.trash} en papelera
            </span>
          </p>
        </div>

        {/* ===== BUSCADOR ===== */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search size={16} className="absolute left-3 text-muted-foreground" style={{ top: '50%', transform: 'translateY(-50%)', zIndex: 1 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en tu biblioteca"
              className="w-full sm:w-48 rounded-full border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary sm:w-64"
            />
          </div>
          {filtered.length > 0 && (
            <button
              onClick={() => play(filtered[0], filtered)}
              className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shadow transition hover:scale-105 flex-shrink-0"
              aria-label="Reproducir todo"
            >
              <Play size={18} fill="currentColor" className="ml-0.5" />
            </button>
          )}
        </div>
      </header>

      {/* ===== CONTADOR DE RESULTADOS ===== */}
      {filtered.length > 0 && (
        <div className="flex-shrink-0">
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'canción' : 'canciones'}
            {hasMore && (
              <span className="text-muted-foreground/60"> · Desplázate para cargar más</span>
            )}
          </p>
        </div>
      )}

      {/* ===== LISTA DE CANCIONES ===== */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto rounded-xl border border-border bg-surface/50 p-2"
        style={{ overscrollBehavior: 'contain' }}
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {songs.length === 0
              ? 'No hay canciones. Agrega archivos a la carpeta /music del servidor.'
              : 'No se encontraron coincidencias.'}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((song, i) => {
              const isCurrent = current?.id === song.id;

              return (
                <div
                  key={song.id}
                  className={isCurrent ? 'bg-primary/10 rounded-lg' : ''}
                >
                  <SongRow
                    song={song}
                    index={i}
                    queue={filtered}
                    onLike={onLike}
                    onDislike={onDislike}
                    onDelete={onDelete}
                    showDelete
                    context={null}
                    likedIds={likedIds}
                  />
                </div>
              );
            })}

            {/* ===== ELEMENTO LOADER PARA INFINITE SCROLL ===== */}
            {hasMore && (
              <div ref={loaderRef} className="py-4">
                {isLoadingMore ? (
                  <>
                    <TrackSkeleton />
                    <TrackSkeleton />
                    <TrackSkeleton />
                    <TrackSkeleton />
                  </>
                ) : (
                  <p className="text-center text-xs text-muted-foreground/60">
                    Desplázate para cargar más canciones...
                  </p>
                )}
              </div>
            )}

            {/* ===== MENSAJE FINAL ===== */}
            {!hasMore && filtered.length > 0 && (
              <p className="text-center text-xs text-muted-foreground/60 py-4">
                🎵 {filtered.length} canciones cargadas
              </p>
            )}
          </div>
        )}
      </div>

      <style>{'\n        @keyframes pulse {\n          0%, 100% { opacity: 0.4; }\n          50% { opacity: 0.8; }\n        }\n        .animate-pulse {\n          animation: pulse 1.5s ease-in-out infinite;\n        }\n      '}</style>
    </div>
  );
}