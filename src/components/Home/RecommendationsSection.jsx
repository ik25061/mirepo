import { useState, useRef, useEffect, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { usePlayer } from '../../context/PlayerContext.jsx';
import { RecommendationEngine } from '../../services/RecommendationEngine.js';
import SongRow from '../SongRow.jsx';

export default function RecommendationsSection({ songs, likedIds, onLike, onDislike, onDislikeArtist, onDelete, favoriteArtists = [] }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const prevDepsRef = useRef(null);
  const { addToQueue } = usePlayer();

  // handleFixMetadata definido dentro del componente como en HomeView.jsx
  const handleFixMetadata = async (song) => {
    if (!confirm('¿Corregir metadatos de "' + song.title + '"?')) return;
    try {
      const fullPath = song.relPath || song.id;
      const result = await fetch('/api/fix-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: fullPath }),
      }).then(r => r.json());
      const newFileName = result.newPath ? result.newPath.split('/').pop() : '';
      alert('✅ ' + result.message + (newFileName ? '\n\nNuevo nombre: ' + newFileName : ''));
    } catch (err) {
      alert('Error al corregir metadatos: ' + err.message);
    }
  };

  useEffect(() => {
    if (songs.length === 0) {
      setRecommendations([]);
      return;
    }
    
    const deps = {
      songsLength: songs.length,
      songsIds: songs.map(s => s.id).join(','),
      likedIds: Array.from(likedIds).join(','),
      favoriteArtists: favoriteArtists.join(',')
    };
    const depsStr = JSON.stringify(deps);
    if (prevDepsRef.current === depsStr) return;
    prevDepsRef.current = depsStr;

    setLoading(true);
    try {
      const recs = RecommendationEngine.recommend(songs, likedIds, favoriteArtists, [], 10);
      setRecommendations(Array.isArray(recs) ? recs : []);
    } catch (err) {
      console.error('Error generating recommendations:', err);
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  }, [songs, likedIds, favoriteArtists]);

  const addAllToQueue = () => {
    recommendations.forEach(song => addToQueue(song, 'later'));
  };

  if (recommendations.length === 0 && !loading) return null;

  return (
    <section className="animate-fade-in rounded-xl border border-border bg-surface/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          <h2 className="text-base font-600 text-white sm:text-lg">Recomendaciones para ti</h2>
        </div>
        <button
          onClick={() => {
            setRecommendations([]);
            prevDepsRef.current = null;
          }}
          disabled={loading}
          className="text-xs text-primary hover:underline disabled:opacity-50"
        >
          {loading ? 'Generando...' : 'Actualizar'}
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {recommendations.slice(0, 5).map((song, i) => (
            <SongRow
              key={song.id}
              song={song}
              index={i}
              queue={recommendations}
              onLike={onLike}
              onDislike={onDislike}
              onDislikeArtist={onDislikeArtist}
              onDelete={onDelete}
              onFixMetadata={handleFixMetadata}
              showDelete={false}
              context={null}
              likedIds={likedIds}
            />
          ))}
          {recommendations.length > 0 && (
            <button
              onClick={addAllToQueue}
              className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground hover:bg-surface-2/70 transition"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Agregar todas a la cola ({recommendations.length})
            </button>
          )}
        </div>
      )}
    </section>
  );
}