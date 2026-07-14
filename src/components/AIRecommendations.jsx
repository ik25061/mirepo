import { useState, useEffect } from 'react';
import { RecommendationEngine } from '../services/RecommendationEngine.js';
import { generateMonthlySummary, generatePlaylistName } from '../services/AIWriter.js';
import { usePlayer } from '../context/PlayerContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import SongRow from './SongRow.jsx';
import ArtistSelector from './ArtistSelector.jsx';

export default function AIRecommendations({ songs, likedIds, history }) {
  const { user } = useAuth();
  const { play } = usePlayer();
  const [recommendations, setRecommendations] = useState([]);
  const [moodPlaylist, setMoodPlaylist] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [summaryText, setSummaryText] = useState('');
  const [favoriteArtists, setFavoriteArtists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mood, setMood] = useState('feliz');
  const [playlistName, setPlaylistName] = useState('');

  // Cargar artistas favoritos
  useEffect(() => {
    if (user?.id) {
      api.getFavoriteArtists(user.id).then(res => setFavoriteArtists(res.artists || []));
    }
  }, [user]);

  // Generar recomendaciones
  const generateRecommendations = () => {
    setLoading(true);
    const recs = RecommendationEngine.recommend(
      songs,
      likedIds,
      favoriteArtists,
      history || [],
      20
    );
    setRecommendations(recs);
    setLoading(false);
  };

  // Generar playlist por estado de ánimo
  const generateMoodPlaylist = async () => {
    try {
      setLoading(true);
      const playlist = RecommendationEngine.generateMoodPlaylist(
        songs, 
        mood, 
        likedIds, 
        favoriteArtists
      );
      setMoodPlaylist(playlist);
      // Generar nombre con IA (no bloqueante)
      const name = await generatePlaylistName(playlist);
      setPlaylistName(name || `Playlist ${mood}`);
    } catch (err) {
      console.error('Error generando playlist:', err);
      setPlaylistName(`Playlist ${mood}`);
    } finally {
      setLoading(false);
    }
  };

  // Generar resumen mensual
  const generateSummary = async () => {
    try {
      setLoading(true);
      const summary = RecommendationEngine.getMonthlySummary(history, songs);
      if (summary) {
        setMonthlySummary(summary);
        // El resumen con IA puede tardar un poco, mostramos el fallback mientras
        setSummaryText('⏳ Generando resumen personalizado...');
        const text = await generateMonthlySummary(summary);
        setSummaryText(text);
      } else {
        alert('No hay datos de escucha de este mes.');
      }
    } catch (err) {
      console.error('Error generando resumen:', err);
      const summary = RecommendationEngine.getMonthlySummary(history, songs);
      if (summary) {
        setMonthlySummary(summary);
        setSummaryText(`🎵 Resumen rápido: ${summary.totalSongs} canciones, ${summary.totalMinutes} min.`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Reproducir playlist
  const playPlaylist = (list) => {
    if (list.length > 0) {
      play(list[0], list);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold">🤖 Asistente Musical</h2>

      {/* Selector de artistas favoritos */}
      <ArtistSelector userId={user?.id} />

      {/* Botones de acción */}
      <div className="flex flex-wrap gap-3">
        <button 
          onClick={generateRecommendations}
          className="px-4 py-2 bg-primary text-black rounded-full font-semibold hover:brightness-110 transition"
        >
          🔄 Recomendaciones para ti
        </button>
        <button 
          onClick={generateSummary}
          className="px-4 py-2 bg-surface-2 rounded-full font-semibold hover:bg-surface-3 transition"
        >
          📊 Resumen del mes
        </button>
      </div>

      {/* Selector de estado de ánimo */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">Estado de ánimo:</span>
        {['feliz', 'triste', 'energía', 'relax', 'romántico'].map(m => (
          <button
            key={m}
            onClick={() => setMood(m)}
            className={`px-3 py-1 rounded-full text-sm ${
              mood === m ? 'bg-primary text-black' : 'bg-surface-2'
            }`}
          >
            {m === 'feliz' && '😊'} {m === 'triste' && '😢'}
            {m === 'energía' && '⚡'} {m === 'relax' && '🧘'}
            {m === 'romántico' && '❤️'} {m}
          </button>
        ))}
        <button 
          onClick={generateMoodPlaylist}
          className="px-4 py-2 bg-primary/20 text-primary rounded-full font-semibold hover:bg-primary/30 transition"
        >
          🎵 Crear playlist
        </button>
      </div>

      {/* Mostrar recomendaciones */}
      {recommendations.length > 0 && (
        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">🎯 Recomendado para ti</h3>
            <button 
              onClick={() => playPlaylist(recommendations)}
              className="text-sm text-primary hover:underline"
            >
              Reproducir todo
            </button>
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {recommendations.slice(0, 10).map((song, i) => (
              <SongRow 
                key={song.id} 
                song={song} 
                index={i} 
                queue={recommendations}
                likedIds={likedIds}
                onLike={() => {}}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mostrar playlist por estado de ánimo */}
      {moodPlaylist.length > 0 && (
        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">
              🎵 {playlistName || `Playlist ${mood}`}
            </h3>
            <button 
              onClick={() => playPlaylist(moodPlaylist)}
              className="text-sm text-primary hover:underline"
            >
              Reproducir todo
            </button>
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {moodPlaylist.slice(0, 10).map((song, i) => (
              <SongRow 
                key={song.id} 
                song={song} 
                index={i} 
                queue={moodPlaylist}
                likedIds={likedIds}
                onLike={() => {}}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mostrar resumen mensual */}
      {monthlySummary && (
        <div className="bg-surface rounded-xl p-4 border border-border">
          <h3 className="text-lg font-semibold mb-2">📊 Resumen de {monthlySummary.month}</h3>
          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
            <div>🎵 {monthlySummary.totalSongs} canciones</div>
            <div>⏱️ {monthlySummary.totalMinutes} minutos</div>
            <div>🎤 {monthlySummary.topArtist}</div>
            <div>🎧 {monthlySummary.topGenre}</div>
          </div>
          {summaryText && (
            <div className="bg-surface-2 p-3 rounded-lg text-sm italic leading-relaxed">
              {summaryText}
            </div>
          )}
          {monthlySummary.top5Songs && monthlySummary.top5Songs.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-2">Top 5 canciones del mes:</p>
              <div className="space-y-1">
                {monthlySummary.top5Songs.map((song, i) => (
                  <div key={song.id} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground w-5">{i+1}</span>
                    <span className="truncate">{song.title}</span>
                    <span className="text-muted-foreground text-xs">- {song.artist}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}