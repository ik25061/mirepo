/**
 * ============================================================
 * GRID VIEW - VISTA DE CUADRÍCULA CON SCROLL INFINITO
 * ============================================================
 * pagina de inicio
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ArrowLeft, Play, Search } from 'lucide-react';
import Cover from './Cover.jsx';
import { usePlayer } from '../context/PlayerContext.jsx';
import { artistCoverUrl } from '../lib/api.js';

function GridSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-square w-full rounded-lg bg-surface-2" />
      <div className="mt-2 h-4 w-3/4 rounded bg-surface-2" />
      <div className="mt-1 h-3 w-1/2 rounded bg-surface-2" />
    </div>
  );
}

export default function GridView({ 
  items,          
  type,           // 'albums', 'artists', 'genres', 'years'
  onBack,         
  onOpenCollection,
  songs,          
  hasMore = false,
  isLoadingMore = false,
  onLoadMore = null,
  loadMoreRef = null,
  total = 0
}) {
  const { play } = usePlayer();
  const [artistCache, setArtistCache] = useState({});
  const gridRef = useRef(null);
  const internalLoaderRef = useRef(null);
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const [localItems, setLocalItems] = useState(items || []);
  const itemsRef = useRef(items || []);

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { isLoadingMoreRef.current = isLoadingMore; }, [isLoadingMore]);

  // Sincronizar items y mantener ref estable
  useEffect(() => {
    itemsRef.current = items || [];
    setLocalItems(items || []);
  }, [items]);

  // ============================================================
  // PRECARGAR IMÁGENES DE ARTISTAS
  // ============================================================
  useEffect(() => {
    if (type !== 'artists') return;
    const newCache = { ...artistCache };
    let changed = false;
    for (const item of localItems) {
      if (item.name && !newCache[item.name]) {
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
  }, [localItems, type]);

  // ============================================================
  // CONFIGURAR INTERSECTION OBSERVER PARA SCROLL INFINITO
  // ============================================================
  useEffect(() => {
    if (!hasMoreRef.current) {
      return;
    }

    console.log('[GridView] Configurando IntersectionObserver...');

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !isLoadingMoreRef.current && onLoadMoreRef.current) {
          console.log('[GridView] 📥 Cargando más elementos...');
          onLoadMoreRef.current();
        }
      },
      {
        root: null,
        rootMargin: '0px 0px 200px 0px',
        threshold: 0.1
      }
    );

    const tryObserve = () => {
      if (internalLoaderRef.current) {
        observer.observe(internalLoaderRef.current);
        console.log('[GridView] Observer registrado en el loader');
      } else {
        console.log('[GridView] ⚠️ Loader no encontrado, reintentando...');
      }
    };

    tryObserve();

    const id = setInterval(() => {
      if (internalLoaderRef.current && !hasMoreRef.current) {
        observer.disconnect();
        clearInterval(id);
      }
    }, 300);

    return () => {
      clearInterval(id);
      observer.disconnect();
    };
  }, []);

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
  // ORDENAMIENTO Y BÚSQUEDA
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
    if (!searchQuery.trim()) return localItems;
    const query = normalizeText(searchQuery);
    return localItems.filter((item) => {
      const name = normalizeText(item.name || item.year || '');
      return name.includes(query);
    });
  }, [localItems, searchQuery]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sortBy) {
      case 'songs_asc':
        list.sort((a, b) => (a.song_count || a.songs?.length || 0) - (b.song_count || b.songs?.length || 0));
        break;
      case 'songs_desc':
        list.sort((a, b) => (b.song_count || b.songs?.length || 0) - (a.song_count || a.songs?.length || 0));
        break;
      case 'year_desc':
        list.sort((a, b) => (b.year || 0) - (a.year || 0));
        break;
      case 'year_asc':
        list.sort((a, b) => (a.year || 0) - (b.year || 0));
        break;
      case 'name':
      default:
        list.sort((a, b) => String(a.name || a.year || '').localeCompare(String(b.name || b.year || ''), 'es'));
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
    const count = item.song_count || item.songs?.length || 0;
    return `${count} ${count === 1 ? 'canción' : 'canciones'}`;
  };

  // ============================================================
  // ABRIR COLECCIÓN
  // ============================================================
  const handleOpen = (item) => {
    const kindMap = {
      'albums': 'Álbum',
      'artists': 'Artista',
      'genres': 'Género',
      'years': 'Año'
    };
    onOpenCollection({ 
      kind: kindMap[type] || 'Lista', 
      name: item.name || String(item.year), 
      songs: item.songs || [],
      id: item.id || item.year
    });
  };

  const isRound = type === 'artists' || type === 'years';

  // ============================================================
  // REPRODUCIR CANCIÓN CON CONTEXTO
  // ============================================================
  const handlePlay = (item, e) => {
    e.stopPropagation();
    if (!item.songs?.length) return;
    
    const contextTypeMap = {
      'artists': 'artist',
      'albums': 'album',
      'genres': 'genre',
      'years': 'year'
    };
    const contextType = contextTypeMap[type] || 'album';
    const context = { type: contextType, value: item.name || String(item.year) };
    console.log('[GridView] ▶️ Reproduciendo con contexto:', context);
    play(item.songs[0], item.songs, context);
  };

  const displayCount = localItems.length;
  const totalItems = total || localItems.length;

  return (
    <div className="flex flex-col gap-6 pb-20 w-full h-full">
      
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <header className="flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getIcon()}</span>
            <h1 className="font-display text-xl font-700 tracking-tight text-white">{getTitle()}</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="name">A - Z</option>
              <option value="songs_desc">Más canciones</option>
              <option value="songs_asc">Menos canciones</option>
              {type === 'years' && (
                <>
                  <option value="year_desc">Más reciente</option>
                  <option value="year_asc">Más antiguo</option>
                </>
              )}
            </select>
          </div>
        </div>

        <div className="relative ">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Buscar ${getTitle().toLowerCase()}...`}
            className="w-full rounded-lg border border-border bg-surface pl-10 pr-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
    
      </header>

      <div 
        ref={gridRef}
        className="flex-1 overflow-y-auto "
        style={{ overscrollBehavior: 'contain' }}
      >
        <div className="grid grid-cols-4 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {sorted.map((item, idx) => {
            const artistKey = type === 'artists' ? item.name : null;
            const cachedArtist = artistKey ? artistCache[artistKey] : null;

            return (
              <div
                key={item.id || item.name || idx}
                onClick={() => handleOpen(item)}
                className="group relative cursor-pointer"
              >
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

                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handlePlay(item, e)}
                      className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl transition hover:scale-105"
                    >
                      <Play size={22} fill="currentColor" className="ml-0.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-2 px-1">
                  <p className="line-clamp-2 text-[0.6rem] font-light text-white group-hover:text-primary transition-colors">
                    {item.name || item.year}
                  </p>
                  <p className="truncate text-[0.5rem] text-muted-foreground">
                    {getSubtitle(item)}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Loader para scroll infinito */}
          {hasMore && (
            <div ref={internalLoaderRef} className="col-span-full py-4">
              {isLoadingMore ? (
                <div className="grid grid-cols-4 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                  <GridSkeleton />
                  <GridSkeleton />
                  <GridSkeleton />
                  <GridSkeleton />
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground/60">
                  Sigue haciendo scroll para cargar más {getTitle().toLowerCase()}
                </p>
              )}
            </div>
          )}
          
          {!hasMore && sorted.length > 0 && (
            <div className="col-span-full py-4">
              <p className="text-center text-xs text-muted-foreground/60">
                🎵 {sorted.length} {sorted.length === 1 ? 'elemento cargado' : 'elementos cargados'} · No hay más {getTitle().toLowerCase()}
              </p>
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