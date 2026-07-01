import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { useLibrary } from './hooks/useLibrary';
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
import { useState, useEffect } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

function Shell() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const lib = useLibrary(user?.id);
  const { current, isPlaying, togglePlay, next, prev, stop } = usePlayer();
  const [view, setView] = useState({ type: 'home' });
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Si la canción que suena se elimina/oculta, pasar a la siguiente
  useEffect(() => {
    if (current && !lib.loading && !lib.songs.some((s) => s.id === current.id)) {
      next();
    }
  }, [lib.songs, lib.loading, current, next]);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background" style={{ background: '#121212' }}>
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (lib.loading) {
    return (
      <div className="flex h-screen flex-col bg-background" style={{ background: '#121212' }}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="animate-spin text-primary mx-auto mb-4" size={40} />
            <p className="text-muted-foreground" style={{ color: '#a7a7a7' }}>Cargando tu biblioteca...</p>
          </div>
        </div>
      </div>
    );
  }

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

  const openCollection = (collection) => setView({ type: 'collection', collection });
  const openGridView = (type, items) => setView({ type: 'grid', gridData: { type, items } });

  // ====== PANTALLA DE REPRODUCCIÓN ======
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
          onClose={() => setShowNowPlaying(false)}
          allTracks={lib.songs}
          onDelete={lib.removeSong}
        />
      </div>
    );
  }

  // ====== VISTA MÓVIL ======
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-background text-foreground overflow-hidden" style={{ background: '#121212' }}>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-3 pb-0">
          {view.type === 'home' ? (
            <HomeView 
              songs={lib.songs} 
              onOpenCollection={openCollection} 
              onOpenGridView={openGridView}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
              onOpenDuplicates={() => setView({ type: 'duplicates' })}
            />
          ) : view.type === 'library' ? (
            <LibraryView
              songs={lib.songs}
              counts={lib.counts}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
              onLoadMore={lib.loadMore}
              hasMore={lib.hasMore}
              loading={lib.loading}
            />
          ) : view.type === 'search' ? (
            <MobileSearchView tracks={lib.songs} currentTrack={current} onPlay={lib.playSong} />
          ) : view.type === 'grid' ? (
            <GridView
              items={view.gridData.items}
              type={view.gridData.type}
              onBack={() => setView({ type: 'home' })}
              onOpenCollection={openCollection}
              songs={lib.songs}
            />
          ) : view.type === 'duplicates' ? (
            <DuplicateFinder onBack={() => setView({ type: 'home' })} />
          ) : view.type === 'collection' ? (
            <CollectionView
              collection={{
                ...view.collection,
                songs: view.collection.songs.filter((s) => lib.songs.some((ls) => ls.id === s.id)),
              }}
              onBack={() => setView({ type: 'home' })}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
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

  // ====== VISTA ESCRITORIO ======
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground" style={{ background: '#121212', color: '#fff' }}>
      <Sidebar view={view} onNavigate={setView} trashCount={lib.counts.trash} />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          {view.type === 'home' ? (
            <HomeView 
              songs={lib.songs} 
              onOpenCollection={openCollection} 
              onOpenGridView={openGridView}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
              onOpenDuplicates={() => setView({ type: 'duplicates' })}
            />
          ) : view.type === 'library' ? (
            <LibraryView
              songs={lib.songs}
              counts={lib.counts}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
              onLoadMore={lib.loadMore}
              hasMore={lib.hasMore}
              loading={lib.loading}
            />
          ) : view.type === 'search' ? (
            <MobileSearchView tracks={lib.songs} currentTrack={current} onPlay={lib.playSong} />
          ) : view.type === 'grid' ? (
            <GridView
              items={view.gridData.items}
              type={view.gridData.type}
              onBack={() => setView({ type: 'home' })}
              onOpenCollection={openCollection}
              songs={lib.songs}
            />
          ) : view.type === 'duplicates' ? (
            <DuplicateFinder onBack={() => setView({ type: 'home' })} />
          ) : view.type === 'collection' ? (
            <CollectionView
              collection={{
                ...view.collection,
                songs: view.collection.songs.filter((s) => lib.songs.some((ls) => ls.id === s.id)),
              }}
              onBack={() => setView({ type: 'home' })}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
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