/**
 * ============================================================
 * APP - COMPONENTE PRINCIPAL
 * ============================================================
 * 
 * Gestiona la autenticación, la biblioteca, la reproducción
 * y la navegación entre vistas.
 * 
 * FUNCIONALIDADES:
 * - Autenticación de usuarios (login/registro)
 * - Modo offline con IndexedDB (carpeta local)
 * - Descarga de canciones para reproducción offline
 * - Sincronización automática de likes/dislikes
 * - Reproducción con contexto (artista/álbum/género)
 * - Scroll infinito en biblioteca y grid
 * - Soporte móvil y escritorio
 * - Pestaña "Descargas" para ver canciones offline
 */

import { AuthProvider, useAuth } from './context/AuthContext';
import { OfflineProvider, useOffline } from './context/OfflineContext.jsx';
import { DownloadProvider, useDownload } from './context/DownloadContext.jsx';
import { PlayerProvider, usePlayer } from './context/PlayerContext.jsx';
import { useLibrary } from './hooks/useLibrary';
import { useAllSongs } from './hooks/useAllSongs';
import { useSync } from './hooks/useSync';
import LoginScreen from './components/LoginScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import BottomNav from './components/BottomNav.jsx';
import MiniPlayer from './components/MiniPlayer.jsx';
import PlayerBar from './components/Player/PlayerBar.jsx';
import HomeView from './components/Home/HomeView.jsx';
import LibraryView from './components/Library/LibraryView.jsx';
import CollectionView from './components/CollectionView.jsx';
import GridView from './components/GridView.jsx';
import DuplicateFinder from './components/DuplicateFinder.jsx';
import NowPlayingScreen from './components/NowPlayingScreen.jsx';
import MobileSearchView from './components/MobileSearchView.jsx';
import LikedSongsView from './components/LikedSongsView.jsx';
import PlayListsManager from './components/PlayListsManager.jsx';
import DownloadsView from './components/DownloadsView.jsx'; // <-- NUEVA IMPORTACIÓN
import DownloadAllButton from './components/DownloadAllButton.jsx';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';

// ============================================================
// COMPONENTE PRINCIPAL Shell
// ============================================================

function Shell() {
  // ============================================================
  // AUTENTICACIÓN
  // ============================================================
  const { isAuthenticated, loading: authLoading, user } = useAuth();

  // ============================================================
  // MODO OFFLINE (carpeta local)
  // ============================================================
  const {
    localSongs,
    localFolderName,
    offlineMode,
    localLoading,
    localError,
    supported: offlineSupported,
    openLocalFolder,
    toggleLocalLike,
  } = useOffline();

  // ============================================================
  // DESCARGAS (IndexedDB)
  // ============================================================
  const {
    downloadedIds,
    isDownloading,
    downloadProgress,
    downloadSongs,
    updateLiked,
    removeDownload,
    syncLikes,
    isDownloaded,
  } = useDownload();

  // ============================================================
  // REPRODUCTOR
  // ============================================================
  const { current, isPlaying, togglePlay, next, prev, stop, removeFromQueue } = usePlayer();

  // ============================================================
  // TODAS LAS CANCIONES (servidor)
  // ============================================================
  const { allSongs: serverAllSongs, loading: allSongsLoading, toggleLiked, removeSong: removeSongFromAllSongs } = useAllSongs({ enabled: !offlineMode });

  // ============================================================
  // BIBLIOTECA (100 canciones + scroll infinito)
  // ============================================================
  const lib = useLibrary(toggleLiked, removeSongFromAllSongs, { enabled: !offlineMode });



      // ============================================================
  // BIBLIOTECA (según modo offline o online)
  // ============================================================
  const library = offlineMode
    ? {
        ...lib,
        songs: localSongs,
        counts: { total: localSongs.length, trash: 0 },
        loading: localLoading,
        error: localError,
        hasMore: false,
        isLoadingMore: false,
        toggleLike: toggleLocalLike,
        dislikeSong: () => {},
        dislikeArtist: () => {},
        removeSong: () => {},
      }
    : lib;

  const handleLike = useCallback(async (songOrId) => {
    if (!songOrId) return;
    const songId = typeof songOrId === 'string' ? songOrId : songOrId.id;
    if (!songId) return;

    if (isDownloaded(songId)) {
      // Actualizar like en la descarga local y propagar a la lista global
      try {
        await updateLiked(songId, true);
      } catch (e) {
        console.error('[App] Error updateLiked:', e);
      }
      // Asegurar que allSongs refleje el cambio
      try { toggleLiked?.(songId, true); } catch (e) {}
    } else {
      library.toggleLike(songId);
    }
  }, [isDownloaded, updateLiked, library, toggleLiked]);

  const handleDislike = useCallback(async (song) => {
    if (!song) return;
    const songId = typeof song === 'string' ? song : song.id;
    if (!songId) return;

    removeFromQueue(songId);
    if (isDownloaded(songId)) {
      try {
        await updateLiked(songId, false);
      } catch (e) {
        console.error('[App] Error updateLiked(false):', e);
      }
      // Eliminar descarga si procede
      try { await removeDownload(songId); } catch (e) {}
      // Propagar cambio a allSongs
      try { toggleLiked?.(songId, false); } catch (e) {}
    } else if (typeof song !== 'string') {
      library.dislikeSong(song);
    }
  }, [isDownloaded, updateLiked, removeDownload, removeFromQueue, library, toggleLiked]);

  // ============================================================
  // CONJUNTO DE CANCIONES (según modo offline o online)
  // ============================================================
  const allSongs = offlineMode ? localSongs : serverAllSongs;



  // ============================================================
  // SINCRONIZACIÓN (likes/dislikes con el servidor)
  // ============================================================
  const { isOnline, isSyncing, lastSync, sync } = useSync(user?.id);

  // ============================================================
  // NAVEGACIÓN
  // ============================================================
  const [view, setView] = useState({ type: 'home' });
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // ============================================================
  // CONTROL DE SCROLL (biblioteca)
  // ============================================================
  const [shouldScrollToCurrent, setShouldScrollToCurrent] = useState(false);

  // ============================================================
  // SCROLL INFINITO PARA GRID
  // ============================================================
  const [gridOffset, setGridOffset] = useState(0);
  const [gridHasMore, setGridHasMore] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const gridLoaderRef = useRef(null);
  const GRID_PAGE_SIZE = 30;
  const [gridItems, setGridItems] = useState([]);
  const [gridType, setGridType] = useState('artists');

  // ============================================================
  // DETECTAR CAMBIO DE TAMAÑO (móvil/escritorio)
  // ============================================================
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ============================================================
  // FUNCIÓN PARA CERRAR NOWPLAYING (con scroll a canción actual)
  // ============================================================
  const handleCloseNowPlaying = useCallback(() => {
    setShowNowPlaying(false);
    setShouldScrollToCurrent(true);
    setTimeout(() => {
      setShouldScrollToCurrent(false);
    }, 2500);
  }, []);

  // ============================================================
  // FUNCIONES DE NAVEGACIÓN
  // ============================================================

  // Abrir una colección (artista, álbum, género, año)
  const openCollection = (collection) => setView({ type: 'collection', collection });

  // Abrir grid view (ver todos)
  const openGridView = useCallback((type, items) => {
    setGridType(type);
    setGridItems(items);
    setGridOffset(GRID_PAGE_SIZE);
    setGridHasMore(items.length > GRID_PAGE_SIZE);
    setView({ type: 'grid', gridData: { type, items: items.slice(0, GRID_PAGE_SIZE) } });
  }, []);

  // Cargar más elementos en el grid (scroll infinito)
  const loadMoreGridItems = useCallback(() => {
    if (gridLoading || !gridHasMore) return;

    setGridLoading(true);

    setTimeout(() => {
      const nextOffset = gridOffset;
      const nextItems = gridItems.slice(nextOffset, nextOffset + GRID_PAGE_SIZE);

      if (nextItems.length > 0) {
        setGridOffset(prev => prev + nextItems.length);
        setGridHasMore(gridItems.length > nextOffset + nextItems.length);

        setView(prev => {
          if (prev.type === 'grid' && prev.gridData) {
            return {
              ...prev,
              gridData: {
                ...prev.gridData,
                items: [...prev.gridData.items, ...nextItems],
              },
            };
          }
          return prev;
        });
      } else {
        setGridHasMore(false);
      }

      setGridLoading(false);
    }, 300);
  }, [gridLoading, gridHasMore, gridOffset, gridItems]);

  // Abrir artista desde NowPlayingScreen
  const openArtistFromNowPlaying = (collection) => {
    setView({ type: 'collection', collection });
  };

  // ============================================================
  // FUNCIÓN PARA DESCARGAR CANCIONES DE LA BIBLIOTECA
  // ============================================================
  const handleDownloadLibrarySongs = () => {
    if (library.songs.length === 0) return;
    // Descargar las primeras 100 canciones visibles
    downloadSongs(library.songs.slice(0, 100));
  };

  // ============================================================
  // FUNCIÓN PARA ABRIR COLECCIONES (handler)
  // ============================================================
  const openCollectionHandler = (collection) => setView({ type: 'collection', collection });

  // ============================================================
  // PANTALLA DE CARGA (autenticación o biblioteca)
  // ============================================================
  const shouldShowFullScreenLoader = (!current && (authLoading || library.loading || allSongsLoading));

  if (shouldShowFullScreenLoader) {
    return (
      <div className="flex h-screen items-center justify-center bg-background" style={{ background: '#121212' }}>
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  // ============================================================
  // PANTALLA DE LOGIN (con opción offline)
  // ============================================================
  if (!isAuthenticated && !offlineMode) {
    return <LoginScreen onOpenLocal={openLocalFolder} offlineSupported={offlineSupported} />;
  }

  // ============================================================
  // PANTALLA DE ERROR
  // ============================================================
  if (library.error) {
    return (
      <div className="flex h-screen flex-col bg-background" style={{ background: '#121212' }}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 mb-4">Error: {library.error}</p>
            <button
              onClick={library.reload}
              className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm text-foreground"
              style={{ background: '#282828', color: '#fff' }}
            >
              <RefreshCw size={16} /> Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // ============================================================
  // PANTALLA DE REPRODUCCIÓN (NowPlaying)
  // ============================================================
  // ============================================================
  if (showNowPlaying) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <NowPlayingScreen
          track={current}
          isPlaying={isPlaying}
          onPlayPause={togglePlay}
          onNext={next}
          onPrev={prev}
          onLike={handleLike}
          onDislike={handleDislike}
          onDislikeArtist={library.dislikeArtist}
          likedIds={new Set(allSongs.filter(s => s.liked).map(s => s.id))}
          onClose={handleCloseNowPlaying}
          allTracks={allSongs}
          onDelete={library.removeSong}
          onFixMetadata={(song) => {
            const fullPath = song.relPath?.startsWith('music/') ? song.relPath : 'music/' + (song.relPath || song.id);
            if (confirm('¿Corregir metadatos de "' + song.title + '"?')) {
              import('./lib/api.js')
                .then(({ api }) =>
                  api
                    .fixMetadata(fullPath)
                    .then((result) => {
                      alert('✅ ' + result.message + (result.newPath ? '\n\nNuevo nombre: ' + result.newPath.split('/').pop() : ''));
                    })
                    .catch((err) => alert('Error al corregir metadatos: ' + err.message))
                );
            }
          }}
          onOpenArtist={openArtistFromNowPlaying}
        />
      </div>
    );
  }

  // ============================================================
  // ============================================================
  // VISTA MÓVIL (con barra inferior)
  // ============================================================
  // ============================================================
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-background text-foreground overflow-hidden" style={{ background: '#121212' }}>
        
        {/* ===== INDICADOR DE CONEXIÓN Y SINCRONIZACIÓN ===== */}
        <div className="flex items-center justify-between px-3 py-1 flex-shrink-0 bg-surface/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi size={12} className="text-primary" />
            ) : (
              <WifiOff size={12} className="text-danger" />
            )}
          </div>
        </div>

        {/* ===== CONTENIDO PRINCIPAL ===== */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-3 pb-0">
          
          {/* ============================================================
          ===== SECCIÓN DE VISTAS - MÓVIL =====
          ============================================================ */}
          
          {view.type === 'home' ? (
            // ===== VISTA INICIO =====
            <HomeView
              songs={library.songs}
              onOpenCollection={openCollectionHandler}
              onOpenGridView={openGridView}
              onLike={handleLike}
              onDislike={handleDislike}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
              onOpenDuplicates={() => setView({ type: 'duplicates' })}
              onOpenLikedSongs={() => setView({ type: 'likedSongs' })}
              onOpenPlayLists={() => setView({ type: 'playlists' })}
              userId={user?.id}
            />
          ) : view.type === 'library' ? (
            // ===== VISTA BIBLIOTECA =====
            <>
              {/* Barra de herramientas de biblioteca */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3 flex-shrink-0">
                <div>
                  <h1 className="text-xl font-700 tracking-tight text-white">Biblioteca</h1>
                  <p className="text-xs text-muted-foreground">
                    {library.counts.total} canciones
                    {library.hasMore && ' · Desplázate para más'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Botón de descarga masiva */}
                  {!offlineMode && library.songs.length > 0 && (
                    <DownloadAllButton
                      songs={library.songs}
                      onComplete={(result) => {
                        if (result && result.successCount > 0) {
                          console.log('[App] Descarga completada:', result);
                        }
                      }}
                    />
                  )}
                </div>
              </div>
              <LibraryView
                songs={library.songs}
                counts={library.counts}
                onLike={handleLike}
                onDislike={handleDislike}
                onDislikeArtist={library.dislikeArtist}
                onDelete={library.removeSong}
                loading={library.loading}
                hasMore={library.hasMore}
                isLoadingMore={library.isLoadingMore}
                onLoadMore={library.loadMore}
                shouldScrollToCurrent={shouldScrollToCurrent}
                allSongs={allSongs}
                downloadedIds={downloadedIds}
              />
            </>
          ) : view.type === 'search' ? (
            // ===== VISTA BÚSQUEDA =====
            <MobileSearchView tracks={library.songs} currentTrack={current} />
          ) : view.type === 'downloads' ? (
            // ===== VISTA DESCARGAS (NUEVO) =====
            <DownloadsView onBack={() => setView({ type: 'home' })} />
          ) : view.type === 'grid' ? (
            // ===== VISTA GRID (Ver todos) =====
            <GridView
              items={view.gridData.items}
              type={view.gridData.type}
              onBack={() => setView({ type: 'home' })}
              onOpenCollection={openCollectionHandler}
              songs={allSongs}
              hasMore={gridHasMore}
              isLoadingMore={gridLoading}
              onLoadMore={loadMoreGridItems}
              loadMoreRef={gridLoaderRef}
            />
          ) : view.type === 'duplicates' ? (
            // ===== VISTA DUPLICADOS =====
            <DuplicateFinder onBack={() => setView({ type: 'home' })} />
          ) : view.type === 'collection' ? (
            // ===== VISTA COLECCIÓN (Artista/Álbum/Género/Año) =====
            <CollectionView
              collection={view.collection}
              onBack={() => setView({ type: 'home' })}
              onLike={library.toggleLike}
              onDislike={library.dislikeSong}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
              allSongs={allSongs}
            />
          ) : view.type === 'likedSongs' ? (
            // ===== VISTA CANCIONES QUE ME GUSTAN =====
            <LikedSongsView
              userId={user?.id}
              onBack={() => setView({ type: 'home' })}
              onLike={library.toggleLike}
              onDislike={library.dislikeSong}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
            />
          ) : view.type === 'playlists' ? (
            // ===== VISTA LISTAS DE REPRODUCCIÓN =====
            <PlayListsManager
              userId={user?.id}
              onBack={() => setView({ type: 'home' })}
              onLike={library.toggleLike}
              onDislike={library.dislikeSong}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
              allSongs={allSongs}
            />
          ) : null}
        </div>

        {/* ===== MINI PLAYER (barra inferior) ===== */}
        <MiniPlayer
          track={current}
          isPlaying={isPlaying}
          onPlayPause={togglePlay}
          onNext={next}
          onOpen={() => current && setShowNowPlaying(true)}
          onLike={handleLike}
          onDislike={handleDislike}
          likedIds={new Set(allSongs.filter(s => s.liked).map(s => s.id))}
          onViewChange={(v) => {
            if (v === 'nowplaying' && current) {
              setShowNowPlaying(true);
            } else {
              setView({ type: v });
            }
          }}
          hasCurrentTrack={!!current}
        />

        {/* ===== BOTTOM NAV (móvil) ===== */}
        <BottomNav
          activeView={view.type}
          onViewChange={(v) => setView({ type: v })}
          hasCurrentTrack={!!current}
        />
      </div>
    );
  }

  // ============================================================
  // ============================================================
  // VISTA ESCRITORIO (con sidebar izquierda)
  // ============================================================
  // ============================================================
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground" style={{ background: '#121212', color: '#fff' }}>
      
      {/* ===== SIDEBAR ===== */}
      <Sidebar view={view} onNavigate={setView} trashCount={library.counts.trash} />

      {/* ===== CONTENIDO PRINCIPAL ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        
        {/* ===== INDICADOR DE CONEXIÓN Y SINCRONIZACIÓN ===== */}
        <div className="flex items-center justify-between px-6 py-1 flex-shrink-0 bg-surface/30 border-b border-border/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi size={14} className="text-primary" />
            ) : (
              <WifiOff size={14} className="text-danger" />
            )}
          </div>
        </div>

        {/* ===== CONTENIDO PRINCIPAL ===== */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          
          {/* ============================================================
          ===== SECCIÓN DE VISTAS - ESCRITORIO =====
          ============================================================ */}
          
          {view.type === 'home' ? (
            // ===== VISTA INICIO =====
            <HomeView
              songs={library.songs}
              onOpenCollection={openCollectionHandler}
              onOpenGridView={openGridView}
              onLike={handleLike}
              onDislike={handleDislike}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
              onOpenDuplicates={() => setView({ type: 'duplicates' })}
              onOpenLikedSongs={() => setView({ type: 'likedSongs' })}
              onOpenPlayLists={() => setView({ type: 'playlists' })}
              userId={user?.id}
            />
          ) : view.type === 'library' ? (
            // ===== VISTA BIBLIOTECA =====
            <>
              {/* Barra de herramientas de biblioteca */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 flex-shrink-0">
                <div>
                  <h1 className="text-2xl font-700 tracking-tight text-white">Biblioteca</h1>
                  <p className="text-sm text-muted-foreground">
                    {library.counts.total} canciones
                    {library.hasMore && ' · Desplázate para cargar más'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Botón de descarga masiva */}
                  {!offlineMode && library.songs.length > 0 && (
                    <DownloadAllButton
                      songs={library.songs}
                      onComplete={(result) => {
                        if (result && result.successCount > 0) {
                          console.log('[App] Descarga completada:', result);
                        }
                      }}
                    />
                  )}
                  {/* Botón de rescan */}
                  {!offlineMode && (
                    <button
                      onClick={library.rescan}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-2 text-foreground text-sm hover:bg-surface-2/70 transition"
                    >
                      <RefreshCw size={16} />
                      Rescanear
                    </button>
                  )}
                </div>
              </div>
              <LibraryView
                songs={library.songs}
                counts={library.counts}
                onLike={handleLike}
                onDislike={handleDislike}
                onDislikeArtist={library.dislikeArtist}
                onDelete={library.removeSong}
                loading={library.loading}
                hasMore={library.hasMore}
                isLoadingMore={library.isLoadingMore}
                onLoadMore={library.loadMore}
                shouldScrollToCurrent={shouldScrollToCurrent}
                allSongs={allSongs}
                downloadedIds={downloadedIds}
              />
            </>
          ) : view.type === 'search' ? (
            // ===== VISTA BÚSQUEDA =====
            <MobileSearchView tracks={library.songs} currentTrack={current} />
          ) : view.type === 'downloads' ? (
            // ===== VISTA DESCARGAS (NUEVO) =====
            <DownloadsView onBack={() => setView({ type: 'home' })} />
          ) : view.type === 'grid' ? (
            // ===== VISTA GRID (Ver todos) =====
            <GridView
              items={view.gridData.items}
              type={view.gridData.type}
              onBack={() => setView({ type: 'home' })}
              onOpenCollection={openCollectionHandler}
              songs={allSongs}
              hasMore={gridHasMore}
              isLoadingMore={gridLoading}
              onLoadMore={loadMoreGridItems}
              loadMoreRef={gridLoaderRef}
            />
          ) : view.type === 'duplicates' ? (
            // ===== VISTA DUPLICADOS =====
            <DuplicateFinder onBack={() => setView({ type: 'home' })} />
          ) : view.type === 'collection' ? (
            // ===== VISTA COLECCIÓN (Artista/Álbum/Género/Año) =====
            <CollectionView
              collection={view.collection}
              onBack={() => setView({ type: 'home' })}
              onLike={handleLike}
              onDislike={handleDislike}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
              allSongs={allSongs}
            />
          ) : view.type === 'likedSongs' ? (
            // ===== VISTA CANCIONES QUE ME GUSTAN =====
            <LikedSongsView
              userId={user?.id}
              onBack={() => setView({ type: 'home' })}
              onLike={handleLike}
              onDislike={handleDislike}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
            />
          ) : view.type === 'playlists' ? (
            // ===== VISTA LISTAS DE REPRODUCCIÓN =====
            <PlayListsManager
              userId={user?.id}
              onBack={() => setView({ type: 'home' })}
              onLike={handleLike}
              onDislike={handleDislike}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
              allSongs={allSongs}
            />
          ) : null}
        </main>

        {/* ===== PLAYER BAR (escritorio) ===== */}
        <PlayerBar
          onLike={handleLike}
          onDislike={handleDislike}
          likedIds={new Set(allSongs.filter(s => s.liked).map(s => s.id))}
        />
      </div>
    </div>
  );
}

// ============================================================
// EXPORTACIÓN PRINCIPAL (con todos los providers)
// ============================================================

export default function App() {
  return (
    <AuthProvider>
      <OfflineProvider>
        <DownloadProvider>
          <PlayerProvider>
            <Shell />
          </PlayerProvider>
        </DownloadProvider>
      </OfflineProvider>
    </AuthProvider>
  );
}