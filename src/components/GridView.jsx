/**
 * ============================================================
 * GRID VIEW - VISTA DE CUADRÍCULA CON SCROLL INFINITO
 * ============================================================
 * 
 * Muestra álbumes, artistas o géneros con scroll infinito.
 * CORREGIDO: Reproducción con contexto correcto.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, Play, Search } from 'lucide-react';
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
  type,           // 'albums', 'artists', 'genres', 'years'
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

    const target = (loadMoreRef && loadMoreRef.current) || internalLoaderRef.current;
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
      case 'years': return 'Años';
      default: return 'Todos';
    }
  };

  // ============================================================
  // ORDENAMIENTO
  // ============================================================
  const [sortBy, setSortBy] = useState('name');
  const [searchQuery, setSearchQuery] = useState('');

  const normalizeText = (text) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = normalizeText(searchQuery);
    return items.filter((item) => {
      const name = normalizeText(item.name || '');
      return name.includes(query);
    });
  }, [items, searchQuery]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sortBy) {
      case 'songs_asc':
        list.sort((a, b) => (a.songs?.length || 0) - (b.songs?.length || 0));
        break;
      case 'songs_desc':
        list.sort((a, b) => (b.songs?.length || 0) - (a.songs?.length || 0));
        break;
      case 'name':
      default:
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
        break;
    }
    return list;
  }, [filtered, sortBy]);

  const getIcon = () => {
    switch(type) {
      case 'albums': return '💿';
      case 'artists': return '🎤';
      case 'genres': return '🎵';
      case 'years': return '📅';
      default: return '📀';
    }
  };

  const getSubtitle = (item) => {
    if (type === 'albums') return item.artist;
    const count = item.songs?.length || 0;
    return `${count} ${count === 1 ? 'canción' : 'canciones'}`;
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
    } else if (type === 'years') {
      onOpenCollection({ kind: 'Año', name: item.name, songs: item.songs });
    }
  };

  const isRound = type === 'artists' || type === 'years';

  // ============================================================
  // REPRODUCIR CANCIÓN CON CONTEXTO
  // ============================================================
const handlePlay = (item, e) => {
  e.stopPropagation();
  if (!item.songs?.length) return;
  
  let contextType = 'album';
  if (type === 'artists') contextType = 'artist';
  else if (type === 'genres') contextType = 'genre';
  else if (type === 'years') contextType = 'year';
  
  const context = { type: contextType, value: item.name };
  console.log('[GridView] ▶️ Reproduciendo con contexto:', context);
  
  // La cola debe ser la coleccion completa, no la biblioteca paginada.
  play(item.songs[0], item.songs, context);
};
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getIcon()}</span>
            <h1 className="font-display text-3xl font-700 tracking-tight text-white">{getTitle()}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Ordenar</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="name">A - Z</option>
              <option value="songs_desc">Más canciones</option>
              <option value="songs_asc">Menos canciones</option>
            </select>
          </div>
        </div>

        {/* ===== BUSCADOR ===== */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Buscar ${getTitle().toLowerCase()}...`}
            className="w-full rounded-lg border border-border bg-surface pl-10 pr-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <p className="text-sm text-muted-foreground">
          {sorted.length} {sorted.length === 1 ? 'elemento' : 'elementos'}
          {hasMore && <span className="text-muted-foreground/60"> · Desplázate para cargar más</span>}
        </p>
      </header>

      {/* ===== GRID CON SCROLL de todos los artistas===== */}
      <div 
        ref={gridRef}
        className="flex-1 overflow-y-auto"
        style={{ overscrollBehavior: 'contain' }}
      >
        <div className="grid grid-cols-4 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {sorted.map((item, idx) => {
            const artistKey = type === 'artists' ? item.name : null;
            const cachedArtist = artistKey ? artistCache[artistKey] : null;

            return (
              <div
                key={item.name + idx}
                onClick={() => handleOpen(item)}
                className="group relative cursor-pointer"
              >
                {/* ===== PORTADA ===== */}
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
                      onClick={(e) => handlePlay(item, e)}
                      className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition hover:scale-105"
                    >
                      <Play size={22} fill="currentColor" className="ml-0.5" />
                    </button>
                  </div>
                </div>

                {/* ===== INFORMACIÓN ===== */}
                <div className="mt-2 px-1">
                  <p className="line-clamp-2 text-[0.6rem] font-light text-white group-hover:text-primary transition-colors">
                    {item.name}
                  </p>
                  <p className="truncate text-[0.5rem] text-muted-foreground">
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
