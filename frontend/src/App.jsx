import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider } from './context/PlayerContext';
import { useLibrary } from './hooks/useLibrary';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import PlayerBar from './components/Player/PlayerBar';
import HomeView from './components/Home/HomeView';
import LibraryView from './components/Library/LibraryView';
import CollectionView from './components/CollectionView';
import { useState, useEffect } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

function Shell() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const lib = useLibrary();
  const [view, setView] = useState({ type: 'home' });

  // Si la autenticación está cargando, mostrar spinner
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background" style={{ background: '#121212' }}>
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  // Si no está autenticado, mostrar login
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // Si la biblioteca está cargando
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

  // Si hay error
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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground" style={{ background: '#121212', color: '#fff' }}>
      <Sidebar view={view} onNavigate={setView} trashCount={lib.counts.trash} />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          {view.type === 'home' ? (
            <HomeView songs={lib.songs} onOpenCollection={openCollection} onLike={lib.toggleLike} />
          ) : view.type === 'library' ? (
            <LibraryView
              songs={lib.songs}
              counts={lib.counts}
              onLike={lib.toggleLike}
              onHideSong={lib.hideSong}
              onHideArtist={lib.hideArtist}
              onDelete={lib.removeSong}
            />
          ) : view.type === 'collection' ? (
            <CollectionView
              collection={{
                ...view.collection,
                songs: view.collection.songs.filter((s) => lib.songs.some((ls) => ls.id === s.id)),
              }}
              onBack={() => setView({ type: 'home' })}
              onLike={lib.toggleLike}
            />
          ) : null}
        </main>

        <PlayerBar onLike={lib.toggleLike} />
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