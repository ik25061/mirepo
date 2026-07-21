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
import SyncNotification from './components/SyncNotification.jsx';
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
    syncLikes,
    isDownloaded,
    syncingSongs,
    currentlySyncingSong,
    pendingLikeChanges,
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
  const [gridLoadMore, setGridLoadMore] = useState(null);
  const [gridTotal, setGridTotal] = useState(0);

  // ============================================================
  // 3. REFERENCIAS (useRef)
  // ============================================================
  const gridLoaderRef = useRef(null);
  const gridLoadMoreRef = useRef(null);
  const gridLoadingRef = useRef(gridLoading);
  const gridHasMoreRef = useRef(gridHasMore);

  // ============================================================
  // 4. EFECTOS (useEffect) - Siempre en el mismo orden
  // ============================================================

  // 4.1 Detectar cambio de tamaño (móvil/escritorio)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // 4.2 Sincronizar likes pendientes al autenticar
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

  const openGridView = useCallback((type, items, loadMoreFn, hasMore, total) => {
    setGridType(type);
    setGridItems(items);
    setGridOffset(items.length);
    setGridHasMore(hasMore || false);
    setGridLoadMore(() => loadMoreFn || null);
    setGridTotal(total || items.length);
    setView({ type: 'grid', gridData: { type, hasMore: hasMore || false, total: total || items.length } });
  }, []);

  const loadMoreGridItems = useCallback(async () => {
    if (gridLoadingRef.current || !gridHasMoreRef.current || !gridLoadMoreRef.current) {
      console.log('[App] loadMoreGridItems bloqueado');
      return;
    }

    setGridLoading(true);
    gridLoadingRef.current = true;

    try {
      console.log('[App] Ejecutando loadMoreGridItems...');
      const result = await gridLoadMoreRef.current();
      console.log('[App] Resultado loadMoreGridItems:', result);
      if (result && Array.isArray(result.items)) {
        setGridItems(prev => {
          const next = [...prev, ...result.items];
          console.log('[App] gridItems actualizado:', next.length);
          return next;
        });
        if (typeof result.hasMore === 'boolean') {
          setGridHasMore(result.hasMore);
          gridHasMoreRef.current = result.hasMore;
        }
        setView(prev => {
          if (prev.type === 'grid' && prev.gridData) {
            const nextItems = [...(prev.gridData.items || []), ...result.items];
            console.log('[App] view.gridData.items actualizado:', nextItems.length);
            return { ...prev, gridData: { ...prev.gridData, items: nextItems } };
          }
          return prev;
        });
      }
      console.log('[App] gridLoading puesto en false, lock liberado');
    } catch (err) {
      console.error('[App] Error cargando más items del grid:', err);
    } finally {
      setGridLoading(false);
      gridLoadingRef.current = false;
    }
  }, []);

  const openArtistFromNowPlaying = (collection) => {
    setView({ type: 'collection', collection });
  };

  const openCollectionHandler = (collection) => setView({ type: 'collection', collection });

  // ============================================================
  // 6. HANDLERS DE LIKES/DISLIKES (useCallback)
  // ============================================================

  useEffect(() => {
    gridLoadMoreRef.current = gridLoadMore;
  }, [gridLoadMore]);

  useEffect(() => {
    gridHasMoreRef.current = gridHasMore;
  }, [gridHasMore]);

  useEffect(() => {
    gridLoadingRef.current = gridLoading;
  }, [gridLoading]);

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
      try { toggleLiked?.(songId, true); } catch (e) { }
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
      try { await removeDownload(songId); } catch (e) { }
      try { toggleLiked?.(songId, false); } catch (e) { }
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
      dislikeSong: () => { },
      dislikeArtist: () => { },
      removeSong: () => { },
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
        {/* ===== NOTIFICACIÓN DE SINCRONIZACIÓN ===== */}
        <SyncNotification
          isOnline={navigator.onLine}
          isSyncing={syncingSongs.length > 0}
          syncingSongs={syncingSongs}
          lastSync={null}
          pendingCount={pendingLikeChanges.length}
        />

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
            <MobileSearchView tracks={allSongs} currentTrack={current} />
          ) : view.type === 'downloads' ? (
            <DownloadsView onBack={() => setView({ type: 'home' })} />
          ) : view.type === 'grid' ? (
            <GridView
              items={gridItems}
              type={view.gridData.type}
              onBack={() => setView({ type: 'home' })}
              onOpenCollection={openCollectionHandler}
              songs={allSongs}
              hasMore={gridHasMore}
              isLoadingMore={gridLoading}
              onLoadMore={loadMoreGridItems}
              loadMoreRef={gridLoaderRef}
              total={gridTotal}
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
              userId={user?.id}
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
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground relative" style={{ background: '#121212', color: '#fff' }}>
      {/* ===== NOTIFICACIÓN DE SINCRONIZACIÓN ===== */}
      <SyncNotification
        isOnline={navigator.onLine}
        isSyncing={syncingSongs.length > 0}
        syncingSongs={syncingSongs}
        lastSync={null}
        pendingCount={pendingLikeChanges.length}
      />
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
            <MobileSearchView tracks={allSongs} currentTrack={current} />
          ) : view.type === 'downloads' ? (
            <DownloadsView onBack={() => setView({ type: 'home' })} />
          ) : view.type === 'grid' ? (
            <GridView
              items={gridItems}
              type={view.gridData.type}
              onBack={() => setView({ type: 'home' })}
              onOpenCollection={openCollectionHandler}
              songs={allSongs}
              hasMore={gridHasMore}
              isLoadingMore={gridLoading}
              onLoadMore={loadMoreGridItems}
              loadMoreRef={gridLoaderRef}
              total={gridTotal}
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
              userId={user?.id}
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