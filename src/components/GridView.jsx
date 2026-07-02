/**
 * ============================================================
 * GRID VIEW - VISTA DE CUADRÍCULA CON SCROLL INFINITO
 * ============================================================
 * 
 * Muestra álbumes, artistas o géneros con scroll infinito.
 * Quita el recuadro gris alrededor de la imagen del artista.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Play } from 'lucide-react';
import Cover from './Cover.jsx';
import { usePlayer } from '../context/PlayerContext.jsx';
import { artistCoverUrl } from '../lib/api.js';

// ============================================================
// SKELETON PARA GRID
// ============================================================
function GridSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-square w-full rounded-lg bg-surface-2" />
      <div className="mt-2 h-4 w-3/4 rounded bg-surface-2" />
      <div className="mt-1 h-3 w-1/2 rounded bg-surface-2" />
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function GridView({ 
  items,          // Lista de elementos
  type,           // 'albums', 'artists', 'genres'
  onBack,         // Función para volver
  onOpenCollection, // Función para abrir una colección
  songs,          // TODAS las canciones
  hasMore = false,
  isLoadingMore = false,
  onLoadMore = null,
  loadMoreRef = null
}) {
  const { play } = usePlayer();
  const [artistCache, setArtistCache] = useState({});
  const gridRef = useRef(null);
  const internalLoaderRef = useRef(null);

  // ============================================================
  // PRECARGAR IMÁGENES DE ARTISTAS
  // ============================================================
  useEffect(() => {
    if (type !== 'artists') return;
    const newCache = { ...artistCache };
    let changed = false;
    for (const item of items) {
      if (!newCache[item.name]) {
        const url = artistCoverUrl(item.name);
        const img = new Image();
        img.onload = () => {
          setArtistCache(prev => ({ ...prev, [item.name]: { url } }));
        };
        img.onerror = () => {};
        img.src = url;
        newCache[item.name] = { loading: true };
        changed = true;
      }
    }
    if (changed) setArtistCache(newCache);
  }, [items, type]);

  // ============================================================
  // CONFIGURAR INTERSECTION OBSERVER PARA SCROLL INFINITO
  // ============================================================
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          console.log('[GridView] 📥 Cargando más...');
          onLoadMore();
        }
      },
      {
        root: gridRef.current,
        rootMargin: '0px 0px 200px 0px',
        threshold: 0.1
      }
    );

    const target = loadMoreRef || internalLoaderRef.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoadingMore, onLoadMore, loadMoreRef]);

  // ============================================================
  // OBTENER TÍTULO E ICONO
  // ============================================================
  const getTitle = () => {
    switch(type) {
      case 'albums': return 'Álbumes';
      case 'artists': return 'Artistas';
      case 'genres': return 'Géneros';
      default: return 'Todos';
    }
  };

  const getIcon = () => {
    switch(type) {
      case 'albums': return '💿';
      case 'artists': return '🎤';
      case 'genres': return '🎵';
      default: return '📀';
    }
  };

  const getSubtitle = (item) => {
    if (type === 'albums') return item.artist;
    return `${item.songs.length} ${item.songs.length === 1 ? 'canción' : 'canciones'}`;
  };

  // ============================================================
  // ABRIR COLECCIÓN
  // ============================================================
  const handleOpen = (item) => {
    if (type === 'albums') {
      onOpenCollection({ kind: 'Álbum', name: item.name, songs: item.songs });
    } else if (type === 'artists') {
      onOpenCollection({ kind: 'Artista', name: item.name, songs: item.songs });
    } else if (type === 'genres') {
      onOpenCollection({ kind: 'Género', name: item.name, songs: item.songs });
    }
  };

  const isRound = type === 'artists';

  return (
    <div className="flex flex-col gap-6 pb-20 w-full h-full">
      
      {/* ===== BOTÓN VOLVER ===== */}
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      {/* ===== HEADER ===== */}
      <header className="flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getIcon()}</span>
          <h1 className="font-display text-3xl font-700 tracking-tight text-white">{getTitle()}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? 'elemento' : 'elementos'}
          {hasMore && <span className="text-muted-foreground/60"> · Desplázate para cargar más</span>}
        </p>
      </header>

      {/* ===== GRID CON SCROLL ===== */}
      <div 
        ref={gridRef}
        className="flex-1 overflow-y-auto"
        style={{ overscrollBehavior: 'contain' }}
      >
        <div className="grid grid-cols-4 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {items.map((item, idx) => {
            const artistKey = type === 'artists' ? item.name : null;
            const cachedArtist = artistKey ? artistCache[artistKey] : null;

            return (
              <div
                key={item.name + idx}
                onClick={() => handleOpen(item)}
                className="group relative cursor-pointer"
              >
                {/* ===== PORTADA SIN RECUADRO GRIS ===== */}
                <div className="relative overflow-hidden rounded-lg transition hover:scale-105 duration-200">
                  <div className="aspect-square w-full">
                    {cachedArtist?.url ? (
                      <img
                        src={cachedArtist.url}
                        alt={item.name}
                        className={`w-full h-full object-cover ${isRound ? 'rounded-full' : ''}`}
                      />
                    ) : (
                      <Cover
                        song={{ coverId: item.coverId, hasCover: true }}
                        rounded={isRound ? 'rounded-full' : 'rounded-none'}
                        className={`w-full h-full ${isRound ? 'rounded-full' : ''}`}
                      />
                    )}
                  </div>

                  {/* ===== BOTÓN REPRODUCIR (hover) ===== */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.songs?.length) {
                          const contextType = type === 'artists' ? 'artist' : type === 'albums' ? 'album' : 'genre';
                          const context = { type: contextType, value: item.name };
                          play(item.songs[0], songs, context);
                        }
                      }}
                      className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition hover:scale-105"
                    >
                      <Play size={22} fill="currentColor" className="ml-0.5" />
                    </button>
                  </div>
                </div>

                {/* ===== INFORMACIÓN ===== */}
                <div className="mt-2 px-1">
                  <p className="truncate text-sm font-semibold text-white group-hover:text-primary transition-colors">
                    {item.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {getSubtitle(item)}
                  </p>
                </div>
              </div>
            );
          })}

          {/* ===== LOADER PARA SCROLL INFINITO ===== */}
          {hasMore && (
            <div ref={loadMoreRef || internalLoaderRef} className="col-span-full py-4">
              {isLoadingMore ? (
                <div className="grid grid-cols-4 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                  <GridSkeleton />
                  <GridSkeleton />
                  <GridSkeleton />
                  <GridSkeleton />
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground/60">
                  Desplázate para cargar más...
                </p>
              )}
            </div>
          )}
        </div>
      </div>

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