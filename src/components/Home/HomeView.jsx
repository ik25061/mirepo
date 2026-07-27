/**
 * ============================================================
 * HOME VIEW - VISTA PRINCIPAL DE INICIO
 * ============================================================
 * 
 * Muestra:
 * - Saludo personalizado según la hora del día
 * - Lista de canciones favoritas (primeras 5)
 * - Carouseles de Álbumes, Artistas, Géneros y Años
 * - Canciones sin artista o álbum
 * - Recomendaciones personalizadas
 * - Resumen mensual de escucha
 * - Playlist según estado de ánimo
 * 
 * El scroll infinito en "Ver todo" se maneja con GridView
 * y las funciones loadMore correspondientes.
 * ============================================================
 */

import { Heart, Play, Shuffle, Sparkles, BarChart3, RefreshCw } from 'lucide-react';
import Carousel from './Carousel.jsx';
import CollectionCard from './CollectionCard.jsx';
import SongRow from '../SongRow.jsx';
import RecommendationsSection from './RecommendationsSection.jsx';
import { usePlayer } from '../../context/PlayerContext.jsx';
import { api } from '../../lib/api.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useMemo } from 'react';
import { RecommendationEngine } from '../../services/RecommendationEngine.js';

// ============================================================
// 1. CONSTANTES Y CACHÉ
// ============================================================

const HOME_CACHE_TTL = 60 * 1000;
const PAGE_SIZE = 50;

const homeDataCache = {
  userId: null,
  ts: 0,
  allSongs: [],
  artists: [],
  albums: [],
  genres: [],
  years: [],
  liked: [],
  favArtists: [],
};

// ============================================================
// 2. FUNCIÓN AUXILIAR: CORREGIR METADATOS
// ============================================================

const handleFixMetadata = async (song) => {
  if (!confirm('¿Corregir metadatos de "' + song.title + '"?')) return;
  try {
    const fullPath = song.relPath || song.id;
    const result = await api.fixMetadata(fullPath);
    const newFileName = result.newPath ? result.newPath.split('/').pop() : '';
    alert('✅ ' + result.message + (newFileName ? '\n\nNuevo nombre: ' + newFileName : ''));
  } catch (err) {
    alert('Error al corregir metadatos: ' + err.message);
  }
};

// ============================================================
// 3. COMPONENTE PRINCIPAL HomeView
// ============================================================

export default function HomeView({
  songs,
  onOpenCollection,
  onOpenGridView,
  onLike,
  onDislike,
  onDislikeArtist,
  onDelete,
  onOpenDuplicates,
  onOpenLikedSongs,
  onOpenPlayLists,
  userId
}) {
  const { play, shufflePlay } = usePlayer();

  // ============================================================
  // 3.1 ESTADO DEL COMPONENTE
  // ============================================================

  const [fullArtists, setFullArtists] = useState([]);
  const [fullAlbums, setFullAlbums] = useState([]);
  const [fullGenres, setFullGenres] = useState([]);
  const [fullYears, setFullYears] = useState([]);
  const [likedSongs, setLikedSongs] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [allSongsFromServer, setAllSongsFromServer] = useState([]);
  const [favArtists, setFavArtists] = useState([]);
  const mountedRef = useRef(true);

  // Estado para paginación
  const [artistOffset, setArtistOffset] = useState(0);
  const [albumOffset, setAlbumOffset] = useState(0);
  const [genreOffset, setGenreOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);
  const [hasMoreArtists, setHasMoreArtists] = useState(false);
  const [hasMoreAlbums, setHasMoreAlbums] = useState(false);
  const [hasMoreGenres, setHasMoreGenres] = useState(false);
  const [hasMoreYears, setHasMoreYears] = useState(false);

  const artistOffsetRef = useRef(artistOffset);
  const albumOffsetRef = useRef(albumOffset);
  const genreOffsetRef = useRef(genreOffset);
  const yearOffsetRef = useRef(yearOffset);
  const hasMoreArtistsRef = useRef(hasMoreArtists);
  const hasMoreAlbumsRef = useRef(hasMoreAlbums);
  const hasMoreGenresRef = useRef(hasMoreGenres);
  const hasMoreYearsRef = useRef(hasMoreYears);

  const loadingMoreArtistsRef = useRef(false);
  const loadingMoreAlbumsRef = useRef(false);
  const loadingMoreGenresRef = useRef(false);
  const loadingMoreYearsRef = useRef(false);
  const loadingListsRef = useRef(loadingLists);

  useEffect(() => { artistOffsetRef.current = artistOffset; }, [artistOffset]);
  useEffect(() => { albumOffsetRef.current = albumOffset; }, [albumOffset]);
  useEffect(() => { genreOffsetRef.current = genreOffset; }, [genreOffset]);
  useEffect(() => { yearOffsetRef.current = yearOffset; }, [yearOffset]);
  useEffect(() => { hasMoreArtistsRef.current = hasMoreArtists; }, [hasMoreArtists]);
  useEffect(() => { hasMoreAlbumsRef.current = hasMoreAlbums; }, [hasMoreAlbums]);
  useEffect(() => { hasMoreGenresRef.current = hasMoreGenres; }, [hasMoreGenres]);
  useEffect(() => { hasMoreYearsRef.current = hasMoreYears; }, [hasMoreYears]);
  useEffect(() => { loadingListsRef.current = loadingLists; }, [loadingLists]);

  // ============================================================
  // 3.2 FUNCIONES DE CARGA DE DATOS
  // ============================================================

  const loadCompleteLists = useCallback(async () => {
    if (!userId) return;
    
    try {
      setLoadingLists(true);
      
      console.log('[HomeView] Cargando datos iniciales...');
      
      // Cargar artistas (primeros 20)
      const artistsRes = await api.getArtists({ limit: PAGE_SIZE, offset: 0, userId });
      setFullArtists(artistsRes.items || []);
      setHasMoreArtists(artistsRes.pagination?.hasMore || false);
      setArtistOffset(PAGE_SIZE);

      // Cargar álbumes (primeros 20)
      const albumsRes = await api.getAlbums({ limit: PAGE_SIZE, offset: 0, userId });
      setFullAlbums(albumsRes.items || []);
      setHasMoreAlbums(albumsRes.pagination?.hasMore || false);
      setAlbumOffset(PAGE_SIZE);

      // Cargar géneros (primeros 20)
      const genresRes = await api.getGenres({ limit: PAGE_SIZE, offset: 0, userId });
      setFullGenres(genresRes.items || []);
      setHasMoreGenres(genresRes.pagination?.hasMore || false);
      setGenreOffset(PAGE_SIZE);

      // Cargar años (primeros 20)
      const yearsRes = await api.getYears({ limit: PAGE_SIZE, offset: 0, userId });
      setFullYears(yearsRes.items || []);
      setHasMoreYears(yearsRes.pagination?.hasMore || false);
      setYearOffset(PAGE_SIZE);

      // Cargar canciones que me gustan
      const likedRes = await api.getLikedSongs(userId, { limit: 100, offset: 0 });
      setLikedSongs(likedRes.songs || []);

      // Cargar artistas favoritos
      const favRes = await api.getFavoriteArtists(userId);
      setFavArtists(favRes.artists || []);

      // Cargar primeras 100 canciones para recomendaciones
      const allSongsRes = await api.getLibrary({ limit: 100, offset: 0, userId });
      setAllSongsFromServer(allSongsRes.songs || []);

      console.log('[HomeView] Datos cargados correctamente');
      setLoadingLists(false);
    } catch (err) {
      console.error('[HomeView] Error cargando listas:', err);
      setLoadingLists(false);
    }
  }, [userId]);

  // ============================================================
  // 3.3 FUNCIONES DE CARGA INFINITA (SCROLL)
  // ============================================================

  const loadMoreArtists = useCallback(async () => {
    if (!hasMoreArtistsRef.current || loadingLists || loadingMoreArtistsRef.current) return { items: [], hasMore: false, total: 0 };
    
    try {
      loadingMoreArtistsRef.current = true;
      const offset = artistOffsetRef.current;
      console.log(`[HomeView] Cargando más artistas desde offset ${offset}`);
      const res = await api.getArtists({ limit: PAGE_SIZE, offset, userId });
      const newItems = res.items || [];
      
      setFullArtists(prev => [...prev, ...newItems]);
      setHasMoreArtists(res.pagination?.hasMore || false);
      hasMoreArtistsRef.current = res.pagination?.hasMore || false;
      setArtistOffset(prev => {
        const next = prev + newItems.length;
        artistOffsetRef.current = next;
        return next;
      });
      
      return {
        items: newItems,
        hasMore: res.pagination?.hasMore || false,
        total: res.pagination?.total || 0
      };
    } catch (err) {
      console.error('[HomeView] Error cargando más artistas:', err);
      return { items: [], hasMore: false, total: 0 };
    } finally {
      loadingMoreArtistsRef.current = false;
    }
  }, [loadingLists, userId]);

  const loadMoreAlbums = useCallback(async () => {
    if (!hasMoreAlbumsRef.current || loadingMoreAlbumsRef.current) {
      return { items: [], hasMore: false, total: 0 };
    }
    
    try {
      loadingMoreAlbumsRef.current = true;
      const offset = albumOffsetRef.current;
      console.log(`[HomeView] Cargando más álbumes desde offset ${offset}, lock activado`);
      const res = await api.getAlbums({ limit: PAGE_SIZE, offset, userId });
      const newItems = res.items || [];
      const nextOffset = offset + newItems.length;
      console.log(`[HomeView] Álbumes recibidos: ${newItems.length}, nuevo offset calculado: ${nextOffset}`);
      
      setFullAlbums(prev => [...prev, ...newItems]);
      setHasMoreAlbums(res.pagination?.hasMore || false);
      hasMoreAlbumsRef.current = res.pagination?.hasMore || false;
      albumOffsetRef.current = nextOffset;
      setAlbumOffset(nextOffset);
      console.log(`[HomeView] albumOffsetRef actualizado a ${nextOffset}`);
      
      return {
        items: newItems,
        hasMore: res.pagination?.hasMore || false,
        total: res.pagination?.total || 0
      };
    } catch (err) {
      console.error('[HomeView] Error cargando más álbumes:', err);
      return { items: [], hasMore: false, total: 0 };
    } finally {
      loadingMoreAlbumsRef.current = false;
      console.log(`[HomeView] lock de álbumes liberado`);
    }
  }, [loadingLists, userId]);

  const loadMoreGenres = useCallback(async () => {
    if (!hasMoreGenresRef.current || loadingLists || loadingMoreGenresRef.current) return { items: [], hasMore: false, total: 0 };
    
    try {
      loadingMoreGenresRef.current = true;
      const offset = genreOffsetRef.current;
      console.log(`[HomeView] Cargando más géneros desde offset ${offset}`);
      const res = await api.getGenres({ limit: PAGE_SIZE, offset, userId });
      const newItems = res.items || [];
      
      setFullGenres(prev => [...prev, ...newItems]);
      setHasMoreGenres(res.pagination?.hasMore || false);
      hasMoreGenresRef.current = res.pagination?.hasMore || false;
      setGenreOffset(prev => {
        const next = prev + newItems.length;
        genreOffsetRef.current = next;
        return next;
      });
      
      return {
        items: newItems,
        hasMore: res.pagination?.hasMore || false,
        total: res.pagination?.total || 0
      };
    } catch (err) {
      console.error('[HomeView] Error cargando más géneros:', err);
      return { items: [], hasMore: false, total: 0 };
    } finally {
      loadingMoreGenresRef.current = false;
    }
  }, [loadingLists, userId]);

  const loadMoreYears = useCallback(async () => {
    if (!hasMoreYearsRef.current || loadingLists || loadingMoreYearsRef.current) return { items: [], hasMore: false, total: 0 };
    
    try {
      loadingMoreYearsRef.current = true;
      const offset = yearOffsetRef.current;
      console.log(`[HomeView] Cargando más años desde offset ${offset}`);
      const res = await api.getYears({ limit: PAGE_SIZE, offset, userId });
      const newItems = res.items || [];
      
      setFullYears(prev => [...prev, ...newItems]);
      setHasMoreYears(res.pagination?.hasMore || false);
      hasMoreYearsRef.current = res.pagination?.hasMore || false;
      setYearOffset(prev => {
        const next = prev + newItems.length;
        yearOffsetRef.current = next;
        return next;
      });
      
      return {
        items: newItems,
        hasMore: res.pagination?.hasMore || false,
        total: res.pagination?.total || 0
      };
    } catch (err) {
      console.error('[HomeView] Error cargando más años:', err);
      return { items: [], hasMore: false, total: 0 };
    } finally {
      loadingMoreYearsRef.current = false;
    }
  }, [loadingLists, userId]);

  // ============================================================
  // 3.4 FUNCIONES PARA ABRIR VISTAS
  // ============================================================

  const handleOpenArtists = useCallback(() => {
    onOpenGridView('artists', fullArtists, loadMoreArtists, hasMoreArtists, fullArtists.length);
  }, [fullArtists, hasMoreArtists, loadMoreArtists, onOpenGridView]);

  const handleOpenAlbums = useCallback(() => {
    onOpenGridView('albums', fullAlbums, loadMoreAlbums, hasMoreAlbums, fullAlbums.length);
  }, [fullAlbums, hasMoreAlbums, loadMoreAlbums, onOpenGridView]);

  const handleOpenGenres = useCallback(() => {
    onOpenGridView('genres', fullGenres, loadMoreGenres, hasMoreGenres, fullGenres.length);
  }, [fullGenres, hasMoreGenres, loadMoreGenres, onOpenGridView]);

  const handleOpenYears = useCallback(() => {
    onOpenGridView('years', fullYears, loadMoreYears, hasMoreYears, fullYears.length);
  }, [fullYears, hasMoreYears, loadMoreYears, onOpenGridView]);

  // ============================================================
  // 3.5 EFECTOS
  // ============================================================

  useEffect(() => {
    mountedRef.current = true;
    loadCompleteLists();
    return () => { mountedRef.current = false; };
  }, [loadCompleteLists]);

  // ============================================================
  // 3.6 VARIABLES DERIVADAS
  // ============================================================

  const liked = likedSongs;
  const albums = fullAlbums;
  const artists = fullArtists;
  const genres = fullGenres;
  const years = fullYears;
  
  // Combinar IDs de canciones liked desde todas las fuentes
  const likedIds = useMemo(() => {
    const ids = new Set(allSongsFromServer.filter(s => s.liked).map(s => s.id));
    likedSongs.forEach(s => ids.add(s.id));
    return ids;
  }, [allSongsFromServer, likedSongs]);

  const unknownSongs = allSongsFromServer.filter(s =>
    !s.artist || s.artist === 'Artista desconocido' ||
    !s.album || s.album === 'Álbum desconocido' ||
    s.artist === 'Desconocido' || s.album === 'Desconocido'
  );

  // ============================================================
  // 3.7 SALUDO SEGÚN HORA DEL DÍA
  // ============================================================

  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Buenas noches' : hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  // ============================================================
  // 3.8 VARIABLES PARA CANCIONES SIN CLASIFICAR
  // ============================================================

  // Estado para forzar re-render aleatorio de canciones sin clasificar
  const [unknownRandomSeed, setUnknownRandomSeed] = useState(0);
  
  // Función para obtener 10 canciones aleatorias de unknownSongs
  const get10RandomUnknown = useCallback(() => {
    const shuffled = [...unknownSongs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 10);
  }, [unknownSongs]);

  // 10 canciones aleatorias actuales (se refrescan con cada cambio de unknownRandomSeed)
  const unknownSongs10 = useMemo(() => get10RandomUnknown(), [get10RandomUnknown, unknownRandomSeed]);

  // Efecto para cambiar las 10 canciones una sola vez al montar la vista
  // Se usa [] como dependencia para evitar bucles infinitos causados por
  // cambios repetidos en unknownSongs.length (p. ej. al hacer like/unlike)
  useEffect(() => {
    setUnknownRandomSeed(Date.now());
  }, []);

  // ============================================================
  // 3.9 RENDERIZADO
  // ============================================================

  return (
    <div className="flex flex-col gap-4 w-full" style={{ paddingBottom: '140px' }}>
      
      {/* ============================================================
      4. HEADER - SALUDO
      ============================================================ */}
      <header className="animate-fade-in">
        <h1 className="text-xl font-700 tracking-tight text-white sm:text-3xl">{greeting}</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">Tu música, sin distracciones.</p>
      </header>

      {/* ============================================================
      5. SECCIÓN: CANCIONES QUE ME GUSTAN
      ============================================================ */}
      <section className="animate-fade-in overflow-hidden rounded-xl border border-border bg-gradient-to-b from-primary/10 to-surface sm:rounded-2xl">
        <div className="flex items-center gap-4 p-4 sm:p-6 sm:pb-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg sm:h-20 sm:w-20 sm:rounded-xl">
            <Heart size={22} fill="currentColor" className="sm:hidden" />
            <Heart size={36} fill="currentColor" className="hidden sm:block" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-700 text-white sm:text-2xl">Canciones que me gustan</h2>
          </div>
          {liked.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <button 
                onClick={() => shufflePlay(liked)} 
                className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-white shadow-lg transition hover:scale-105 sm:grid sm:h-12 sm:w-12" 
                title="Reproducción aleatoria"
              >
                <Shuffle size={16} className="sm:size-5" />
              </button>
              <button 
                onClick={() => play(liked[0], liked)} 
                className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 sm:grid sm:h-12 sm:w-12"
              >
                <Play size={18} fill="currentColor" className="ml-0.5 sm:size-6" />
              </button>
              {liked.length > 5 && (
                <button 
                  onClick={() => onOpenLikedSongs?.()} 
                  className="text-xs text-primary hover:underline"
                >
                  Ver todas
                </button>
              )}
            </div>
          )}
        </div>

        {liked.length > 0 ? (
          <div className="flex flex-col gap-1.5 px-3 pb-4 sm:px-5 sm:pb-5">
            {liked.slice(0, 5).map((song, i) => (
              <SongRow
                key={song.id}
                song={song}
                index={i}
                queue={liked}
                onLike={onLike}
                onDislike={onDislike}
                onDislikeArtist={onDislikeArtist}
                onDelete={onDelete}
                onFixMetadata={handleFixMetadata}
                showDelete
                context={null}
                likedIds={likedIds}
              />
            ))}
          </div>
        ) : (
          <p className="px-4 pb-4 text-xs text-muted-foreground sm:px-6 sm:pb-6 sm:text-sm">
            Marca canciones con el corazón para verlas aquí.
          </p>
        )}
      </section>

      {/* ============================================================
      6. CAROUSEL: ÁLBUMES
      ============================================================ */}
      <Carousel
        title="Álbumes"
        action={
          albums.length > 0 && (
            <button 
              onClick={handleOpenAlbums}
              className="text-xs font-medium text-muted-foreground hover:text-white transition-colors disabled:opacity-50"
            >
              Ver todo
            </button>
          )
        }
      >
        {albums.slice(0, 10).map((al) => (
          <CollectionCard
            key={al.id}
            title={al.name}
            subtitle={al.artist}
            coverSong={{ coverId: al.coverId, hasCover: true }}
            songs={al.songs}
            onOpen={() => onOpenCollection({ kind: 'Álbum', name: al.name, songs: al.songs, id: al.id })}
          />
        ))}
      </Carousel>

      {/* ============================================================
      7. CAROUSEL: ARTISTAS
      ============================================================ */}
      <Carousel
        title="Artistas"
        action={
          artists.length > 0 && (
            <button 
              onClick={handleOpenArtists}
              className="text-xs font-medium text-muted-foreground hover:text-white transition-colors disabled:opacity-50"
            >
              Ver todo
            </button>
          )
        }
      >
        {artists.slice(0, 10).map((ar) => (
          <CollectionCard
            key={ar.id}
            round
            title={ar.name}
            subtitle={`${ar.song_count || 0} ${(ar.song_count || 0) === 1 ? 'canción' : 'canciones'}`}
            coverSong={{ coverId: ar.coverId, hasCover: true }}
            songs={ar.songs}
            artistName={ar.name}
            onOpen={() => onOpenCollection({ kind: 'Artista', name: ar.name, songs: ar.songs, id: ar.id })}
          />
        ))}
      </Carousel>

      {/* ============================================================
      8. CAROUSEL: GÉNEROS
      ============================================================ */}
      <Carousel
        title="Géneros"
        action={
          genres.length > 0 && (
            <button 
              onClick={handleOpenGenres}
              className="text-xs font-medium text-muted-foreground hover:text-white transition-colors disabled:opacity-50"
            >
              Ver todo
            </button>
          )
        }
      >
        {genres.slice(0, 10).map((ge) => (
          <CollectionCard
            key={ge.id}
            title={ge.name}
            subtitle={`${ge.song_count || 0} ${(ge.song_count || 0) === 1 ? 'canción' : 'canciones'}`}
            coverSong={{ coverId: ge.coverId, hasCover: true }}
            songs={ge.songs}
            onOpen={() => onOpenCollection({ kind: 'Género', name: ge.name, songs: ge.songs, id: ge.id })}
          />
        ))}
      </Carousel>

      {/* ============================================================
      9. CAROUSEL: AÑOS
      ============================================================ */}
      <Carousel
        title="Años"
        action={
          years.length > 0 && (
            <button 
              onClick={handleOpenYears}
              className="text-xs font-medium text-muted-foreground hover:text-white transition-colors disabled:opacity-50"
            >
              Ver todo
            </button>
          )
        }
      >
        {years.slice(0, 10).map((yr, idx) => (
          <CollectionCard
            key={`${yr.year}-${yr.coverId || idx}`}
            title={String(yr.year)}
            subtitle={`${yr.song_count || 0} ${(yr.song_count || 0) === 1 ? 'canción' : 'canciones'}`}
            coverSong={{ coverId: yr.coverId, hasCover: true }}
            songs={yr.songs}
            onOpen={() => onOpenCollection({ kind: 'Año', name: String(yr.year), songs: yr.songs, id: yr.year })}
          />
        ))}
      </Carousel>

      {/* ============================================================
      10. SECCIÓN: SIN ARTISTA O ÁLBUM (LISTA DE CANCIONES)
      ============================================================ */}
      {unknownSongs.length > 0 && (
        <section className="animate-fade-in overflow-hidden rounded-xl border border-border bg-gradient-to-b from-primary/5 to-surface sm:rounded-2xl">
          <div className="flex items-center gap-4 p-4 sm:p-6 sm:pb-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-500/60 text-white shadow-lg sm:h-20 sm:w-20 sm:rounded-xl">
              <span className="text-2xl sm:text-4xl">🎵</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-700 text-white sm:text-2xl">Sin artista o álbum</h2>
              <p className="text-xs text-muted-foreground">
                {unknownSongs.length} {unknownSongs.length === 1 ? 'canción sin clasificar' : 'canciones sin clasificar'}
              </p>
            </div>
            {unknownSongs.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <button 
                  onClick={() => shufflePlay(get10RandomUnknown())} 
                  className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-white shadow-lg transition hover:scale-105 sm:grid sm:h-12 sm:w-12" 
                  title="Reproducción aleatoria de 10"
                >
                  <Shuffle size={16} className="sm:size-5" />
                </button>
                <button 
                  onClick={() => play(unknownSongs10[0], unknownSongs10)} 
                  className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 sm:grid sm:h-12 sm:w-12"
                >
                  <Play size={18} fill="currentColor" className="ml-0.5 sm:size-6" />
                </button>
                {unknownSongs.length > 10 && (
                  <button 
                    onClick={() => onOpenCollection({ kind: 'Lista', name: 'Sin artista o álbum', songs: unknownSongs })} 
                    className="text-xs text-primary hover:underline"
                  >
                    Ver todas
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 px-3 pb-4 sm:px-5 sm:pb-5">
            {unknownSongs10.map((song, i) => (
              <SongRow
                key={song.id}
                song={song}
                index={i}
                queue={unknownSongs10}
                onLike={onLike}
                onDislike={onDislike}
                onDislikeArtist={onDislikeArtist}
                onDelete={onDelete}
                showDelete
                context={null}
                likedIds={likedIds}
              />
            ))}
          </div>
        </section>
      )}

      {/* ============================================================
      11. RECOMENDACIONES
      ============================================================ */}
      <RecommendationsSection 
        songs={allSongsFromServer} 
        likedIds={likedIds} 
        onLike={onLike} 
        onDislike={onDislike} 
        onDislikeArtist={onDislikeArtist} 
        onDelete={onDelete} 
        favoriteArtists={favArtists} 
      />

      {/* ============================================================
      12. RESUMEN MENSUAL
      ============================================================ */}
      <MonthlySummarySection 
        userId={userId} 
        allSongs={allSongsFromServer} 
      />

      {/* ============================================================
      13. PLAYLIST POR ESTADO DE ÁNIMO
      ============================================================ */}
      <section className="animate-fade-in rounded-xl border border-border bg-surface/50 p-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-white mb-2">Crear playlist según estado de ánimo</p>
            <MoodPlaylistCreator
              allSongs={allSongsFromServer}
              likedIds={likedIds}
              userId={userId}
              favArtists={favArtists}
              onCreated={() => onOpenPlayLists && onOpenPlayLists()}
            />
          </div>
        </div>
      </section>

      <div className="h-4" />
    </div>
  );
}

// ============================================================
// 14. COMPONENTE: MOOD PLAYLIST CREATOR
// ============================================================

function MoodPlaylistCreator({ allSongs, likedIds, userId, favArtists, onCreated }) {
  const [mood, setMood] = useState('feliz');
  const [playlist, setPlaylist] = useState([]);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const pl = RecommendationEngine.generateMoodPlaylist(allSongs, mood, likedIds, favArtists, 20);
      setPlaylist(pl || []);
    } catch (err) {
      console.error('[MoodPlaylistCreator] Error generando mood playlist:', err);
      setPlaylist([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        {['feliz', 'triste', 'energía', 'relax', 'romántico'].map(m => (
          <button
            key={m}
            onClick={() => setMood(m)}
            className={`px-3 py-1 rounded-full text-sm ${mood === m ? 'bg-primary text-black' : 'bg-surface-2'}`}
          >
            {m}
          </button>
        ))}
        <button
          onClick={generate}
          disabled={loading}
          className="ml-2 p-2 rounded-lg bg-primary text-black hover:brightness-110 transition disabled:opacity-50"
          title="Generar playlist según estado de ánimo"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {loading && <p className="text-xs text-muted-foreground">Generando...</p>}
      {playlist.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-1">
          {playlist.slice(0, 6).map(s => (
            <div key={s.id} className="text-sm text-white truncate">
              {s.title} <span className="text-xs text-muted-foreground">- {s.artist}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 15. COMPONENTE: MONTHLY SUMMARY SECTION
// ============================================================

function MonthlySummarySection({ userId, allSongs }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [firstLoadDone, setFirstLoadDone] = useState(false);

  useEffect(() => {
    if (firstLoadDone || allSongs.length === 0) return;
    
    setLoading(true);
    const historyKey = `mirepo_play_history_${userId || 'default'}`;
    let history = [];
    try {
      const stored = window.localStorage.getItem(historyKey);
      if (stored) history = JSON.parse(stored);
    } catch { }
    
    const result = RecommendationEngine.getMonthlySummary(history, allSongs);
    if (result) setSummary(result);
    setFirstLoadDone(true);
    setLoading(false);
  }, [allSongs.length, userId, firstLoadDone]);

  if (!summary && !loading) return null;

  return (
    <section className="animate-fade-in rounded-xl border border-border bg-surface/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={18} className="text-primary" />
        <h2 className="text-base font-600 text-white sm:text-lg">Resumen del mes</h2>
      </div>
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
        </div>
      ) : summary ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">🎵</span>
              <span className="text-white">{summary.totalSongs} canciones</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">⏱️</span>
              <span className="text-white">{summary.totalMinutes} minutos</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">🎤</span>
              <span className="text-white truncate">{summary.topArtist}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">🎧</span>
              <span className="text-white truncate">{summary.topGenre}</span>
            </div>
          </div>
          {summary.top5Songs && summary.top5Songs.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Top 5 canciones del mes:</p>
              <div className="space-y-1">
                {summary.top5Songs.slice(0, 5).map((song, i) => (
                  <div key={song.id} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground w-5">{i + 1}</span>
                    <span className="truncate text-white flex-1">{song.title}</span>
                    <span className="text-muted-foreground text-xs">- {song.artist}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}