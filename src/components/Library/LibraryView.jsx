import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Search, Play, Trash2 } from 'lucide-react';
import SongRow from '../SongRow.jsx';
import { usePlayer } from '../../context/PlayerContext.jsx';

// Componente para el loading skeleton
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

export default function LibraryView({ songs, counts, onLike, onDislike, onDislikeArtist, onDelete }) {
  const { play } = usePlayer();
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const loadMoreRef = useRef(null);
  const listRef = useRef(null);

  // Filtrar canciones
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

  const visibleTracks = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Resetear el contador cuando cambia la búsqueda
  useEffect(() => {
    setVisibleCount(20);
  }, [query]);

  // Cargar más canciones
  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    setTimeout(() => {
      setVisibleCount(prev => Math.min(prev + 20, filtered.length));
      setIsLoading(false);
    }, 300);
  }, [isLoading, hasMore, filtered.length]);

  // Observer para lazy loading (Intersection Observer)
  useEffect(() => {
    const currentRef = loadMoreRef.current;
    if (!currentRef) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { 
        root: listRef.current,
        rootMargin: '100px',
        threshold: 0.1
      }
    );

    observer.observe(currentRef);

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, isLoading, loadMore, filtered.length]);

  return (
    <div className="flex flex-col gap-4 h-full w-full">
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
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Buscador - ancho completo en móvil */}
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

      {/* Contador de resultados */}
      {filtered.length > 0 && (
        <div className="flex-shrink-0">
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'canción' : 'canciones'}
            {visibleCount < filtered.length && (
              <span className="text-muted-foreground/60"> · Mostrando {visibleCount}</span>
            )}
          </p>
        </div>
      )}

      {/* Lista de canciones con scroll infinito */}
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
            {visibleTracks.map((song, i) => (
              <SongRow
                key={song.id}
                song={song}
                index={i}
                queue={filtered}
                onLike={onLike}
                onDislike={onDislike}
                onDislikeArtist={onDislikeArtist}
                onDelete={onDelete}
                showDelete
              />
            ))}

            {/* Loader y elemento para observar */}
            {hasMore && (
              <div ref={loadMoreRef} className="py-4">
                {isLoading ? (
                  <>
                    <TrackSkeleton />
                    <TrackSkeleton />
                    <TrackSkeleton />
                    <TrackSkeleton />
                  </>
                ) : (
                  <p className="text-center text-xs text-muted-foreground/60">
                    Desplázate para cargar más...
                  </p>
                )}
              </div>
            )}

            {/* Mensaje final */}
            {!hasMore && filtered.length > 20 && (
              <p className="text-center text-xs text-muted-foreground/60 py-4">
                🎵 {filtered.length} canciones cargadas
              </p>
            )}
          </div>
        )}
      </div>

      {/* Animación para el skeleton */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        .animate-pulse {
          animation: pulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}