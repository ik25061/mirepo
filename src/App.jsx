import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { useLibrary } from './hooks/useLibrary';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import PlayerBar from './components/Player/PlayerBar';
import HomeView from './components/Home/HomeView';
import LibraryView from './components/Library/LibraryView';
import CollectionView from './components/CollectionView';
import GridView from './components/GridView';
import DuplicateFinder from './components/DuplicateFinder';
import { useState, useEffect } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

function Shell() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const lib = useLibrary(user?.id);
  const [view, setView] = useState({ type: 'home' });

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