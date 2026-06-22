import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { PlayerProvider, usePlayer } from './context/PlayerContext.jsx';
import { useLibrary } from './hooks/useLibrary.js';
import Sidebar from './components/Sidebar.jsx';
import PlayerBar from './components/Player/PlayerBar.jsx';
import HomeView from './components/Home/HomeView.jsx';
import LibraryView from './components/Library/LibraryView.jsx';
import CollectionView from './components/CollectionView.jsx';
import MobileSearchView from './components/MobileSearchView.jsx';
import NowPlayingScreen from './components/NowPlayingScreen.jsx';
import { MiniPlayer } from './components/MiniPlayer.jsx';
import { BottomNav } from './components/BottomNav.jsx';

function Shell() {
  const lib = useLibrary();
  const { current, stop, isPlaying, togglePlay, next } = usePlayer();
  const [view, setView] = useState({ type: 'home' });
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Si la canción que suena se elimina/oculta, detener
  useEffect(() => {
    if (current && !lib.loading && !lib.songs.some((s) => s.id === current.id)) {
      stop();
    }
  }, [lib.songs, lib.loading, current, stop]);

  const openCollection = (collection) => setView({ type: 'collection', collection });

  if (showNowPlaying) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <NowPlayingScreen
          track={current}
          isPlaying={isPlaying}
          onPlayPause={togglePlay}
          onNext={next}
          onPrev={() => {}}
          onLike={lib.toggleLike}
          likedIds={new Set(lib.songs.filter(s => s.liked).map(s => s.id))}
          audioRef={null}
          onClose={() => setShowNowPlaying(false)}
          allTracks={lib.songs}
          onSync={() => {}}
          onDelete={lib.removeSong}
        />
      </div>
    );
  }

  // ====== VISTA MÓVIL ======
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        {/* Contenido principal con scroll */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-3 pb-0">
          {lib.loading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 animate-spin" size={20} /> Cargando...
            </div>
          ) : lib.error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <p>No se pudo conectar con el servidor.</p>
              <button onClick={lib.reload} className="rounded-full bg-surface-2 px-4 py-2 text-sm text-white">
                <RefreshCw size={16} className="inline mr-2" /> Reintentar
              </button>
            </div>
          ) : view.type === 'home' ? (
            <HomeView songs={lib.songs} onOpenCollection={openCollection} onLike={lib.toggleLike} />
          ) : view.type === 'library' ? (
            <LibraryView
              songs={lib.songs}
              counts={lib.counts}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
            />
          ) : view.type === 'search' ? (
            <MobileSearchView tracks={lib.songs} currentTrack={current} />
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
        </div>

        {/* MiniPlayer (si hay canción) */}
        {current && (
          <MiniPlayer
            track={current}
            isPlaying={isPlaying}
            onPlayPause={togglePlay}
            onNext={next}
            onOpen={() => setShowNowPlaying(true)}
          />
        )}

        {/* BottomNav SIEMPRE visible */}
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
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar view={view} onNavigate={setView} trashCount={lib.counts.trash} />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          {lib.loading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 animate-spin" size={20} /> Cargando biblioteca…
            </div>
          ) : lib.error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <p>No se pudo conectar con el servidor.</p>
              <button onClick={lib.reload} className="rounded-full bg-surface-2 px-4 py-2 text-sm text-white">
                <RefreshCw size={16} className="inline mr-2" /> Reintentar
              </button>
            </div>
          ) : view.type === 'home' ? (
            <HomeView songs={lib.songs} onOpenCollection={openCollection} onLike={lib.toggleLike} />
          ) : view.type === 'library' ? (
            <LibraryView
              songs={lib.songs}
              counts={lib.counts}
              onLike={lib.toggleLike}
              onDislike={lib.dislikeSong}
              onDislikeArtist={lib.dislikeArtist}
              onDelete={lib.removeSong}
            />
          ) : view.type === 'search' ? (
            <MobileSearchView tracks={lib.songs} currentTrack={current} />
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
    <PlayerProvider>
      <Shell />
    </PlayerProvider>
  );
}