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
 * 
 * CORRECCIÓN DE HOOKS (2026-07-16):
 * - Eliminado useSync para evitar orden inconsistente de hooks.
 * - Sincronización de likes integrada mediante syncLikes de useDownload.
 * - El useEffect de sincronización se coloca al final de todos los hooks,
 *   antes de cualquier return condicional.
 */

import { AuthProvider, useAuth } from './context/AuthContext';
import { OfflineProvider, useOffline } from './context/OfflineContext.jsx';
import { DownloadProvider, useDownload } from './context/DownloadContext.jsx';
import { PlayerProvider, usePlayer } from './context/PlayerContext.jsx';
import { useLibrary } from './hooks/useLibrary';
import { useAllSongs } from './hooks/useAllSongs';
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
import DownloadsView from './components/DownloadsView.jsx';
import OfflineMode from './components/OfflineMode.jsx';
import AIRecommendations from './components/AIRecommendations.jsx';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';

// ============================================================
// COMPONENTE PRINCIPAL Shell
// ============================================================

function Shell() {
  // ============================================================
  // 1. HOOKS DE CONTEXTO (siempre en el mismo orden)
  // ============================================================
  const { isAuthenticated, loading: authLoading, user } = useAuth();
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

  const {
    downloadedIds,
    isDownloading,
    downloadProgress,
    downloadSongs,
    updateLiked,
    removeDownload,
    syncLikes,          // <-- Ahora usamos syncLikes directamente
    isDownloaded,
  } = useDownload();

  const { current, isPlaying, togglePlay, next, prev, stop, removeFromQueue } = usePlayer();

  const { allSongs: serverAllSongs, loading: allSongsLoading, toggleLiked, removeSong: removeSongFromAllSongs } = useAllSongs({ enabled: !offlineMode });

  const lib = useLibrary(toggleLiked, removeSongFromAllSongs, { enabled: !offlineMode });

  // ============================================================
  // 2. ESTADO (useState)
  // ============================================================
  const [view, setView] = useState({ type: 'home' });
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [shouldScrollToCurrent, setShouldScrollToCurrent] = useState(false);

  // Estado para scroll infinito en grid
  const [gridOffset, setGridOffset] = useState(0);
  const [gridHasMore, setGridHasMore] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridItems, setGridItems] = useState([]);
  const [gridType, setGridType] = useState('artists');

  // ============================================================
  // 3. REFERENCIAS (useRef)
  // ============================================================
  const gridLoaderRef = useRef(null);

  // ============================================================
  // 4. EFECTOS (useEffect) - Siempre en el mismo orden
  // ============================================================

  // 4.1 Detectar cambio de tamaño (móvil/escritorio)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // 4.2 Sincronizar likes pendientes al autenticar (NUEVO)
  useEffect(() => {
    if (isAuthenticated && user) {
      syncLikes(user.id);
    }
  }, [isAuthenticated, user, syncLikes]);

  // ============================================================
  // 5. FUNCIONES (useCallback) - Siempre en el mismo orden
  // ============================================================

  const handleCloseNowPlaying = useCallback(() => {
    setShowNowPlaying(false);
    setShouldScrollToCurrent(true);
    setTimeout(() => {
      setShouldScrollToCurrent(false);
    }, 2500);
  }, []);

  const openCollection = (collection) => setView({ type: 'collection', collection });

  const openGridView = useCallback((type, items) => {
    setGridType(type);
    setGridItems(items);
    setGridOffset(GRID_PAGE_SIZE);
    setGridHasMore(items.length > GRID_PAGE_SIZE);
    setView({ type: 'grid', gridData: { type, items: items.slice(0, GRID_PAGE_SIZE) } });
  }, []);

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

  const openArtistFromNowPlaying = (collection) => {
    setView({ type: 'collection', collection });
  };

  const openCollectionHandler = (collection) => setView({ type: 'collection', collection });

  // ============================================================
  // 6. HANDLERS DE LIKES/DISLIKES (useCallback)
  // ============================================================

  const handleLike = useCallback(async (songOrId) => {
    if (!songOrId) return;
    const songId = typeof songOrId === 'string' ? songOrId : songOrId.id;
    if (!songId) return;

    if (isDownloaded(songId)) {
      try {
        await updateLiked(songId, true);
      } catch (e) {
        console.error('[App] Error updateLiked:', e);
      }
      try { toggleLiked?.(songId, true); } catch (e) {}
    } else {
      lib.toggleLike(songId);
    }
  }, [isDownloaded, updateLiked, lib, toggleLiked]);

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
      try { await removeDownload(songId); } catch (e) {}
      try { toggleLiked?.(songId, false); } catch (e) {}
    } else if (typeof song !== 'string') {
      lib.dislikeSong(song);
    }
  }, [isDownloaded, updateLiked, removeDownload, removeFromQueue, lib, toggleLiked]);

  // ============================================================
  // 7. CONSTANTES LOCALES
  // ============================================================
  const GRID_PAGE_SIZE = 30;
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

  const allSongs = offlineMode ? localSongs : serverAllSongs;

  // ============================================================
  // 8. RENDERIZADO CONDICIONAL (después de todos los hooks)
  // ============================================================

  // 8.1 Pantalla de carga
  const shouldShowFullScreenLoader = (!current && (authLoading || library.loading || allSongsLoading));

  if (shouldShowFullScreenLoader) {
    return (
      <div className="flex h-screen items-center justify-center bg-background" style={{ background: '#121212' }}>
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  // 8.2 Modo offline (sin conexión)
  if (!navigator.onLine) {
    return <OfflineMode />;
  }

  // 8.3 Pantalla de login (con opción offline)
  if (!isAuthenticated && !offlineMode) {
    return <LoginScreen onOpenLocal={openLocalFolder} offlineSupported={offlineSupported} />;
  }

  // 8.4 Pantalla de error
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
  // 9. PANTALLA DE REPRODUCCIÓN (NowPlaying)
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
            const fullPath = song.relPath || song.id;
            if (confirm('¿Corregir metadatos de "' + song.title + '"?')) {
              fetch('/api/fix-metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: fullPath }),
              })
                .then((res) => {
                  if (!res.ok) throw new Error('Error ' + res.status);
                  return res.json();
                })
                .then((result) => {
                  alert('✅ ' + result.message + (result.newPath ? '\n\nNuevo nombre: ' + result.newPath.split('/').pop() : ''));
                })
                .catch((err) => alert('Error al corregir metadatos: ' + err.message));
            }
          }}
          onOpenArtist={openArtistFromNowPlaying}
        />
      </div>
    );
  }

  // ============================================================
  // 10. VISTA MÓVIL
  // ============================================================
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-background text-foreground overflow-hidden" style={{ background: '#121212' }}>
        {/* ===== INDICADOR DE CONEXIÓN ===== */}
        <div className="flex items-center justify-between px-3 py-1 flex-shrink-0 bg-surface/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {navigator.onLine ? (
              <Wifi size={12} className="text-primary" />
            ) : (
              <WifiOff size={12} className="text-danger" />
            )}
          </div>
        </div>

        {/* ===== CONTENIDO PRINCIPAL ===== */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-3 pb-0">
          {view.type === 'home' ? (
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
              offlineMode={offlineMode}
              onRescan={library.rescan}
            />
          ) : view.type === 'search' ? (
            <MobileSearchView tracks={library.songs} currentTrack={current} />
          ) : view.type === 'downloads' ? (
            <DownloadsView onBack={() => setView({ type: 'home' })} />
          ) : view.type === 'grid' ? (
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
            <DuplicateFinder onBack={() => setView({ type: 'home' })} />
          ) : view.type === 'collection' ? (
            <CollectionView
              collection={view.collection}
              onBack={() => setView({ type: 'home' })}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
              allSongs={allSongs}
            />
          ) : view.type === 'likedSongs' ? (
            <LikedSongsView
              userId={user?.id}
              onBack={() => setView({ type: 'home' })}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
            />
          ) : view.type === 'playlists' ? (
            <PlayListsManager
              userId={user?.id}
              onBack={() => setView({ type: 'home' })}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
              allSongs={allSongs}
            />
          ) : view.type === 'ai' ? (
            <AIRecommendations
              songs={allSongs}
              likedIds={new Set(allSongs.filter(s => s.liked).map(s => s.id))}
              history={[]}
            />
          ) : null}
        </div>

        {/* ===== MINI PLAYER ===== */}
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

        {/* ===== BOTTOM NAV ===== */}
        <BottomNav
          activeView={view.type}
          onViewChange={(v) => setView({ type: v })}
          hasCurrentTrack={!!current}
        />
      </div>
    );
  }

  // ============================================================
  // 11. VISTA ESCRITORIO
  // ============================================================
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground" style={{ background: '#121212', color: '#fff' }}>
      <Sidebar view={view} onNavigate={setView} trashCount={library.counts.trash} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-6 py-1 flex-shrink-0 bg-surface/30 border-b border-border/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {navigator.onLine ? (
              <Wifi size={14} className="text-primary" />
            ) : (
              <WifiOff size={14} className="text-danger" />
            )}
          </div>
        </div>
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          {view.type === 'home' ? (
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
              offlineMode={offlineMode}
              onRescan={library.rescan}
            />
          ) : view.type === 'search' ? (
            <MobileSearchView tracks={library.songs} currentTrack={current} />
          ) : view.type === 'downloads' ? (
            <DownloadsView onBack={() => setView({ type: 'home' })} />
          ) : view.type === 'grid' ? (
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
            <DuplicateFinder onBack={() => setView({ type: 'home' })} />
          ) : view.type === 'collection' ? (
            <CollectionView
              collection={view.collection}
              onBack={() => setView({ type: 'home' })}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
              allSongs={allSongs}
            />
          ) : view.type === 'likedSongs' ? (
            <LikedSongsView
              userId={user?.id}
              onBack={() => setView({ type: 'home' })}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
            />
          ) : view.type === 'playlists' ? (
            <PlayListsManager
              userId={user?.id}
              onBack={() => setView({ type: 'home' })}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={library.dislikeArtist}
              onDelete={library.removeSong}
              allSongs={allSongs}
            />
          ) : view.type === 'ai' ? (
            <AIRecommendations
              songs={allSongs}
              likedIds={new Set(allSongs.filter(s => s.liked).map(s => s.id))}
              history={[]}
            />
          ) : null}
        </main>
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