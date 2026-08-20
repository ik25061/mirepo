/**
 * ============================================================
 * LIBRARY VIEW - VISTA DE BIBLIOTECA
 * ============================================================
 * 
 * Implementa scroll infinito usando IntersectionObserver.
 * Basado en: https://dev.to/franklin030601/creando-un-scroll-infinito-con-react-js-27gf
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Search, Play, Trash2, Wand2, RefreshCw } from 'lucide-react';
import SongRow from '../SongRow.jsx';
import DownloadAllButton from '../DownloadAllButton.jsx';
import { usePlayer } from '../../context/PlayerContext.jsx';
import { api } from '../../lib/api.js';

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
    allSongs,
  offlineMode,
  onRescan,
  rescanState
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
  // ESTADO DE ORDENAMIENTO
  // ============================================================
  const [sortBy, setSortBy] = useState('added'); // 'added', 'az', 'artist', 'genre'

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
  // ORDENAR CANCIONES
  // ============================================================
  const sortedSongs = useMemo(() => {
    const list = [...filtered];
    switch (sortBy) {
      case 'az':
        list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'es'));
        break;
      case 'artist':
        list.sort((a, b) => String(a.artist || '').localeCompare(String(b.artist || ''), 'es'));
        break;
      case 'genre':
        list.sort((a, b) => {
          const genreA = Array.isArray(a.genre) ? (a.genre[0] || '') : (a.genre || '');
          const genreB = Array.isArray(b.genre) ? (b.genre[0] || '') : (b.genre || '');
          return String(genreA).localeCompare(String(genreB), 'es');
        });
        break;
      case 'added':
      default:
        // Mantener orden original (por ID)
        list.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        break;
    }
    return list;
  }, [filtered, sortBy]);

  // ============================================================
  // CORREGIR METADATOS
  // ============================================================
  const handleFixMetadata = async (song) => {
    if (!confirm('¿Corregir metadatos de "' + song.title + '"?')) return;

    setFixingMetadata(song.id);
    try {
      const fullPath = song.relPath || song.id;
      const result = await api.fixMetadata(fullPath);
      const newFileName = result.newPath.split('/').pop();
      alert('✅ ' + result.message + '\n\nNuevo nombre: ' + newFileName);
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
      <header className="animate-fade-in flex flex-wrap items-center justify-between gap-3 mb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl font-700 tracking-tight text-white">Biblioteca</h1>
          {/* <p className="text-xs text-muted-foreground">
            {counts.total} canciones
            {hasMore && ' · Desplázate para más'}
          </p> */}
        </div>
        <div className="flex items-center gap-2">
          {!offlineMode && songs.length > 0 && (
            <DownloadAllButton
              songs={songs}
              onComplete={(result) => {
                if (result && result.successCount > 0) {
                  console.log('[LibraryView] Descarga completada:', result);
                }
              }}
            />
          )}
                    {!offlineMode && onRescan && (
            <button
              onClick={onRescan}
              disabled={rescanState?.active}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-2 text-foreground text-sm hover:bg-surface-2/70 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {rescanState?.active ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> Escaneando...
                </>
              ) : (
                <>
                  <RefreshCw size={16} /> Rescanear
                </>
              )}
            </button>
          )}
        </div>

        {/* ===== BARRA DE PROGRESO DE RESCAN ===== */}
        {rescanState?.active && (
          <div className="mb-3 animate-fade-in">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground truncate">
                {rescanState.message || 'Rescaneando la biblioteca...'}
              </span>
              <span className="text-xs text-muted-foreground">
                {rescanState.total > 0
                  ? `${rescanState.processed} / ${rescanState.total}`
                  : `${rescanState.pct}%`}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-2/70 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, rescanState.pct))}%` }}
              />
            </div>
          </div>
                )}
      </header>

      {/* ===== BUSCADOR ===== */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 text-muted-foreground" style={{ top: '50%', transform: 'translateY(-50%)', zIndex: 1 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en tu biblioteca"
          className="w-full sm:w-64 rounded-full border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* ===== BARRA DE ORDENAMIENTO ===== */}
      {sortedSongs.length > 0 && (
        <div className="flex-shrink-0 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {sortedSongs.length} {sortedSongs.length === 1 ? 'canción' : 'canciones'}
            {hasMore && (
              <span className="text-muted-foreground/60"> · Desplázate para cargar más</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="added">Agregado</option>
              <option value="az">A - Z</option>
              <option value="artist">Artista</option>
              <option value="genre">Género</option>
            </select>
          </div>
        </div>
      )}

      {/* ===== LISTA DE CANCIONES ===== */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto rounded-xl border border-border bg-surface/50 p-2"
        style={{ overscrollBehavior: 'contain' }}
      >
        {sortedSongs.length === 0 && filtered.length > 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No se encontraron coincidencias.
          </p>
        ) : sortedSongs.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {songs.length === 0
              ? 'No hay canciones. Agrega archivos a la carpeta /music del servidor.'
              : 'No se encontraron coincidencias.'}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {sortedSongs.map((song, i) => {
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
                    onFixMetadata={handleFixMetadata}
                    fixingMetadata={fixingMetadata}
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