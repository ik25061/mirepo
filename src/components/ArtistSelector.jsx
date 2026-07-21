/**
 * ============================================================
 * ARTIST SELECTOR - SELECCIONAR ARTISTAS FAVORITOS
 * ============================================================
 * 
 * Permite al usuario seleccionar artistas favoritos de su biblioteca.
 * Muestra todos los artistas con paginación y búsqueda.
 * ============================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, artistCoverUrl } from '../lib/api.js';
import { Check, Heart, Search, Loader2 } from 'lucide-react';

// ============================================================
// 1. CONSTANTES
// ============================================================

const PAGE_SIZE = 50;

// ============================================================
// 2. COMPONENTE PRINCIPAL
// ============================================================

export default function ArtistSelector({ userId }) {
  // ============================================================
  // 2.1 ESTADO
  // ============================================================
  
  const [allArtists, setAllArtists] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState({});
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const loaderRef = useRef(null);

  const searchRef = useRef(search);
  const offsetRef = useRef(offset);
  const hasMoreRef = useRef(hasMore);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const userIdRef = useRef(userId);

  useEffect(() => { searchRef.current = search; }, [search]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { isLoadingMoreRef.current = isLoadingMore; }, [isLoadingMore]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // ============================================================
  // 2.2 FUNCIONES DE CARGA
  // ============================================================

  const loadArtists = useCallback(async (reset = true) => {
    const currentUserId = userIdRef.current;
    if (!currentUserId) {
      console.log('[ArtistSelector] userId no disponible');
      setLoading(false);
      return;
    }

    try {
      if (reset) {
        setLoading(true);
      }

      const currentOffset = reset ? 0 : offsetRef.current;
      const currentSearch = searchRef.current;
      console.log(`[ArtistSelector] Cargando artistas desde offset ${currentOffset}, search="${currentSearch}"`);
      
      const res = await api.getArtists({ 
        limit: PAGE_SIZE, 
        offset: currentOffset, 
        userId: currentUserId,
        search: currentSearch || undefined
      });

      const items = res.items || [];
      const pagination = res.pagination || { total: 0, hasMore: false };

      console.log(`[ArtistSelector] Recibidos ${items.length} artistas, total ${pagination.total}`);

      if (reset) {
        setAllArtists(items);
        setTotal(pagination.total || 0);
        setOffset(PAGE_SIZE);
        offsetRef.current = PAGE_SIZE;
      } else {
        setAllArtists(prev => [...prev, ...items]);
        setOffset(prev => {
          const next = prev + items.length;
          offsetRef.current = next;
          return next;
        });
      }

      setHasMore(pagination.hasMore || false);
      hasMoreRef.current = pagination.hasMore || false;

    } catch (err) {
      console.error('[ArtistSelector] Error cargando artistas:', err);
    } finally {
      if (reset) {
        setLoading(false);
      } else {
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
      }
    }
  }, []);

  // ============================================================
  // 2.3 CARGAR FAVORITOS
  // ============================================================

  const loadFavorites = useCallback(async () => {
    const currentUserId = userIdRef.current;
    if (!currentUserId) return;
    try {
      const res = await api.getFavoriteArtists(currentUserId);
      setFavorites(res.artists || []);
    } catch (err) {
      console.error('[ArtistSelector] Error cargando favoritos:', err);
    }
  }, []);

  const initialLoadDone = useRef(false);

  // ============================================================
  // 2.4 CARGA INICIAL (solo una vez por userId)
  // ============================================================

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      initialLoadDone.current = false;
      return;
    }
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    loadArtists(true);
    loadFavorites();
  }, [userId]);

  const observerReadyRef = useRef(false);

  // ============================================================
  // 2.5 SCROLL INFINITO
  // ============================================================

  useEffect(() => {
    if (!hasMore || isLoadingMore || !loaderRef.current) return;

    observerReadyRef.current = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          if (!observerReadyRef.current) {
            observerReadyRef.current = true;
            return;
          }
          console.log('[ArtistSelector] Cargando más artistas...');
          loadArtists(false);
        }
      },
      { rootMargin: '0px 0px 200px 0px', threshold: 0.1 }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadArtists]);

  // ============================================================
  // 2.7 TOGGLE ARTISTA FAVORITO
  // ============================================================

  const toggle = async (artistName) => {
    if (!userId) return;
    
    try {
      await api.toggleFavoriteArtist(artistName, userId);
      
      // Actualizar estado local
      setFavorites(prev => 
        prev.includes(artistName) 
          ? prev.filter(a => a !== artistName)
          : [...prev, artistName]
      );
    } catch (err) {
      console.error('[ArtistSelector] Error al togglear artista:', err);
    }
  };

  // ============================================================
  // 2.8 FUNCIONES AUXILIARES
  // ============================================================

  const isFavorite = (name) => favorites.includes(name);

  const handleImageError = (name) => {
    setImageErrors(prev => ({ ...prev, [name]: true }));
  };

  const getInitial = (name) => name.charAt(0).toUpperCase();

  const getBgColor = (name) => {
    const colors = [
      'bg-red-600', 'bg-blue-600', 'bg-green-600', 'bg-yellow-600',
      'bg-purple-600', 'bg-pink-600', 'bg-indigo-600', 'bg-teal-600',
      'bg-orange-600', 'bg-cyan-600', 'bg-rose-600', 'bg-amber-600'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // ============================================================
  // 2.9 RENDERIZADO
  // ============================================================

  if (loading) {
    return (
      <div className="bg-surface rounded-xl border border-border p-4">
        <div className="flex items-center justify-center py-12">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const displayedArtists = useMemo(() => {
    if (!search.trim()) return allArtists;
    const q = search.toLowerCase().trim();
    return allArtists.filter(a => (a.name || '').toLowerCase().includes(q));
  }, [allArtists, search]);

  const totalArtists = total || allArtists.length;

  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      
      {/* ============================================================
      3. HEADER
      ============================================================ */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">Artistas favoritos</h3>
          <p className="text-sm text-muted-foreground">
            {favorites.length} {favorites.length === 1 ? 'artista seleccionado' : 'artistas seleccionados'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Heart size={18} className="text-primary" fill="currentColor" />
        </div>
      </div>

      {/* ============================================================
      4. BUSCADOR
      ============================================================ */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar artistas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-surface-2 text-white outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
        />
      </div>

      {/* ============================================================
      5. CONTADOR DE RESULTADOS
      ============================================================ */}
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs text-muted-foreground">
          {displayedArtists.length} {displayedArtists.length === 1 ? 'artista' : 'artistas'}
          {totalArtists > displayedArtists.length && (
            <span className="ml-2 text-muted-foreground/60">
              (Mostrando {displayedArtists.length} de {totalArtists})
            </span>
          )}
        </span>
      </div>

      {/* ============================================================
      6. GRID DE ARTISTAS
      ============================================================ */}
      {displayedArtists.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {search ? 'No se encontraron artistas' : 'No hay artistas en tu biblioteca'}
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 max-h-80 overflow-y-auto pr-1">
          {displayedArtists.map(artist => {
            const favorite = isFavorite(artist.name);
            const hasImageError = imageErrors[artist.name];
            const imageUrl = artistCoverUrl(artist.name);

            return (
              <button
                key={artist.id || artist.name}
                onClick={() => toggle(artist.name)}
                className={`
                  group relative flex flex-col items-center rounded-xl p-2 transition-all duration-200
                  ${favorite 
                    ? 'bg-primary/20 ring-2 ring-primary ring-offset-2 ring-offset-surface' 
                    : 'bg-surface-2 hover:bg-surface-3'
                  }
                `}
              >
                {/* Foto del artista */}
                <div className={`
                  w-full aspect-square rounded-full overflow-hidden mb-1.5
                  ${favorite ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''}
                `}>
                  {!hasImageError ? (
                    <img
                      src={imageUrl}
                      alt={artist.name}
                      className="w-full h-full object-cover"
                      onError={() => handleImageError(artist.name)}
                      loading="lazy"
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center ${getBgColor(artist.name)} text-white text-3xl font-bold`}>
                      {getInitial(artist.name)}
                    </div>
                  )}
                </div>

                {/* Nombre */}
                <span className={`
                  text-[0.5rem] line-clamp-2 font-light text-center w-full
                  ${favorite ? 'text-primary' : 'text-white group-hover:text-white'}
                `}>
                  {artist.name}
                </span>

                {/* Badge de selección */}
                {favorite && (
                  <div className="absolute -top-1 -right-1 bg-primary rounded-full p-0.5 shadow-lg">
                    <Check size={14} className="text-black" strokeWidth={3} />
                  </div>
                )}

                {/* Indicador de hover (corazón) */}
                <div className={`
                  absolute inset-0 flex items-center justify-center rounded-xl
                  bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity
                  ${favorite ? 'opacity-0 group-hover:opacity-100' : ''}
                `}>
                  <Heart 
                    size={28} 
                    className={`transition-transform ${favorite ? 'text-primary scale-110' : 'text-white scale-100'}`}
                    fill={favorite ? 'currentColor' : 'none'}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ============================================================
      7. LOADER PARA SCROLL INFINITO
      ============================================================ */}
      {hasMore && (
        <div ref={loaderRef} className="py-4 flex justify-center">
          {isLoadingMore ? (
            <Loader2 size={24} className="animate-spin text-primary" />
          ) : (
            <p className="text-xs text-muted-foreground/60">Desplázate para cargar más...</p>
          )}
        </div>
      )}

      {/* ============================================================
      8. BOTÓN "HECHO"
      ============================================================ */}
      {favorites.length > 0 && (
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {favorites.length} artistas seleccionados
          </span>
          <button
            onClick={() => {
              alert(`✅ ${favorites.length} artistas favoritos guardados`);
            }}
            className="px-4 py-1.5 bg-primary text-black text-sm font-semibold rounded-full hover:brightness-110 transition"
          >
            Hecho
          </button>
        </div>
      )}
    </div>
  );
}