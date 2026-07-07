/**
 * ============================================================
 * APP - COMPONENTE PRINCIPAL
 * ============================================================
 */

import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { useLibrary } from './hooks/useLibrary';
import { useAllSongs } from './hooks/useAllSongs';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import MiniPlayer from './components/MiniPlayer';
import PlayerBar from './components/Player/PlayerBar';
import HomeView from './components/Home/HomeView';
import LibraryView from './components/Library/LibraryView';
import CollectionView from './components/CollectionView';
import GridView from './components/GridView';
import DuplicateFinder from './components/DuplicateFinder';
import NowPlayingScreen from './components/NowPlayingScreen';
import MobileSearchView from './components/MobileSearchView';
import LikedSongsView from './components/LikedSongsView';
import PlayListsManager from './components/PlayListsManager';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

function Shell() {
  // ============================================================
  // AUTENTICACIÓN
  // ============================================================
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  
  // ============================================================
  // REPRODUCTOR
  // ============================================================
  const { current, isPlaying, togglePlay, next, prev, stop } = usePlayer();
  
  // ============================================================
  // BIBLIOTECA
  // ============================================================
  const lib = useLibrary(user?.id);
  
  // ============================================================
  // TODAS LAS CANCIONES
  // ============================================================
  const { allSongs, loading: allSongsLoading } = useAllSongs(user?.id);
  
  // ============================================================
  // NAVEGACIÓN
  // ============================================================
  const [view, setView] = useState({ type: 'home' });
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // ============================================================
  // CONTROL DE SCROLL
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
  // DETECTAR CAMBIO DE TAMAÑO
  // ============================================================
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ============================================================
  // SI LA CANCIÓN QUE SUENA SE ELIMINA, PASAR A LA SIGUIENTE
  // ============================================================
  useEffect(() => {
    if (current && !allSongsLoading && !allSongs.some((s) => s.id === current.id)) {
      next();
    }
  }, [allSongs, allSongsLoading, current, next]);

  // ============================================================
  // FUNCIÓN PARA CERRAR NOWPLAYING
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
                items: [...prev.gridData.items, ...nextItems]
              }
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

  // ============================================================
  // PANTALLA DE CARGA
  // ============================================================
  if (authLoading || lib.loading || allSongsLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background" style={{ background: '#121212' }}>
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  // ============================================================
  // PANTALLA DE LOGIN
  // ============================================================
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // ============================================================
  // PANTALLA DE ERROR
  // ============================================================
  if (lib.error) {
    return (
      <div className="flex h-screen flex-col bg-background" style={{ background: '#121212' }}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 mb-4">Error: {lib.error}</p>
            <button
              onClick={lib.reload}
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
  // FUNCIONES DE NAVEGACIÓN
  // ============================================================
  const openCollectionHandler = (collection) => setView({ type: 'collection', collection });

  // ============================================================
  // PANTALLA DE REPRODUCCIÓN
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
          onLike={lib.toggleLike}
          onDislike={lib.dislikeSong}
          likedIds={new Set(lib.songs.filter(s => s.liked).map(s => s.id))}
          onClose={handleCloseNowPlaying}
          allTracks={allSongs}
          onDelete={lib.removeSong}
          onOpenArtist={openArtistFromNowPlaying}
        />
      </div>
    );
  }

  // ============================================================
  // VISTA MÓVIL
  // ============================================================
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-background text-foreground overflow-hidden" style={{ background: '#121212' }}>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-3 pb-0">
          {view.type === 'home' ? (
            <HomeView 
              songs={lib.songs} 
              onOpenCollection={openCollectionHandler} 
              onOpenGridView={openGridView}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
              onOpenDuplicates={() => setView({ type: 'duplicates' })}
              onOpenLikedSongs={() => setView({ type: 'likedSongs' })}
              onOpenPlayLists={() => setView({ type: 'playlists' })}
              userId={user?.id}
            />
          ) : view.type === 'library' ? (
            <LibraryView
              songs={lib.songs}
              counts={lib.counts}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
              loading={lib.loading}
              hasMore={lib.hasMore}
              isLoadingMore={lib.isLoadingMore}
              onLoadMore={lib.loadMore}
              shouldScrollToCurrent={shouldScrollToCurrent}
            />
          ) : view.type === 'search' ? (
            <MobileSearchView tracks={lib.songs} currentTrack={current} />
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
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
              allSongs={allSongs}
            />
          ) : view.type === 'likedSongs' ? (
            <LikedSongsView
              userId={user?.id}
              onBack={() => setView({ type: 'home' })}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
            />
          ) : view.type === 'playlists' ? (
            <PlayListsManager
              userId={user?.id}
              onBack={() => setView({ type: 'home' })}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
              allSongs={allSongs}
            />
          ) : null}
        </div>

        <MiniPlayer
          track={current}
          isPlaying={isPlaying}
          onPlayPause={togglePlay}
          onNext={next}
          onOpen={() => current && setShowNowPlaying(true)}
        />

        <BottomNav
          activeView={view.type}
          onViewChange={(v) => {
            if (v === 'nowplaying' && current) {
              setShowNowPlaying(true);
            } else {
              setView({ type: v });
            }
          }}
          hasCurrentTrack={!!current}
        />
      </div>
    );
  }

  // ============================================================
  // VISTA ESCRITORIO
  // ============================================================
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground" style={{ background: '#121212', color: '#fff' }}>
      <Sidebar view={view} onNavigate={setView} trashCount={lib.counts.trash} />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          {view.type === 'home' ? (
            <HomeView 
              songs={lib.songs} 
              onOpenCollection={openCollectionHandler} 
              onOpenGridView={openGridView}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
              onOpenDuplicates={() => setView({ type: 'duplicates' })}
              onOpenLikedSongs={() => setView({ type: 'likedSongs' })}
              onOpenPlayLists={() => setView({ type: 'playlists' })}
              userId={user?.id}
            />
          ) : view.type === 'library' ? (
            <LibraryView
              songs={lib.songs}
              counts={lib.counts}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
              loading={lib.loading}
              hasMore={lib.hasMore}
              isLoadingMore={lib.isLoadingMore}
              onLoadMore={lib.loadMore}
              shouldScrollToCurrent={shouldScrollToCurrent}
            />
          ) : view.type === 'search' ? (
            <MobileSearchView tracks={lib.songs} currentTrack={current} />
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
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
              allSongs={allSongs}
            />
          ) : view.type === 'likedSongs' ? (
            <LikedSongsView
              userId={user?.id}
              onBack={() => setView({ type: 'home' })}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
            />
          ) : view.type === 'playlists' ? (
            <PlayListsManager
              userId={user?.id}
              onBack={() => setView({ type: 'home' })}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
              allSongs={allSongs}
            />
          ) : null}
        </main>

        <PlayerBar onLike={lib.toggleLike} onDislike={lib.dislikeSong} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <Shell />
      </PlayerProvider>
    </AuthProvider>
  );
}
