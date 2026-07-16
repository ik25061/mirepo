import { Heart, Play, Copy, Shuffle, Sparkles, BarChart3, RefreshCw } from 'lucide-react';
import Carousel from './Carousel.jsx';
import CollectionCard from './CollectionCard.jsx';
import SongRow from '../SongRow.jsx';
import { buildYears } from '../../lib/format.js';
import { usePlayer } from '../../context/PlayerContext.jsx';
import { api } from '../../lib/api.js';
import { useState, useEffect, useRef } from 'react';
import { RecommendationEngine } from '../../services/RecommendationEngine.js';
import { generateMonthlySummary, generatePlaylistName } from '../../services/AIWriter.js';
import ArtistSelector from '../ArtistSelector.jsx';

// ============================================================
// CACHÉ A NIVEL DE MÓDULO
// ============================================================
const HOME_CACHE_TTL = 60 * 1000;
const homeDataCache = {
  userId: null,
  ts: 0,
  allSongs: [],
  artists: [],
  albums: [],
  genres: [],
  liked: [],
  favArtists: [],
};

const handleFixMetadata = async (song) => {
  if (!confirm('¿Corregir metadatos de "' + song.title + '"?')) return;
  try {
    const fullPath = song.relPath || song.id;
    const result = await api.fixMetadata(fullPath);
    const newFileName = result.newPath ? result.newPath.split('/').pop() : '';
    alert('✅ ' + result.message + (newFileName ? '\n\nNuevo nombre: ' + newFileName : ''));
  } catch (err) {
    alert('Error al corregir metadatos: ' + err.message);
  }
};

export default function HomeView({
  songs,
  onOpenCollection,
  onOpenGridView,
  onLike,
  onDislike,
  onDislikeArtist,
  onDelete,
  onOpenDuplicates,
  onOpenLikedSongs,
  onOpenPlayLists,
  userId
}) {
  const { play, shufflePlay } = usePlayer();

  const [fullArtists, setFullArtists] = useState([]);
  const [fullAlbums, setFullAlbums] = useState([]);
  const [fullGenres, setFullGenres] = useState([]);
  const [likedSongs, setLikedSongs] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [allSongsFromServer, setAllSongsFromServer] = useState([]);
  const [favArtists, setFavArtists] = useState([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (
      homeDataCache.userId === userId &&
      homeDataCache.allSongs.length > 0 &&
      Date.now() - homeDataCache.ts < HOME_CACHE_TTL
    ) {
      setAllSongsFromServer(homeDataCache.allSongs);
      setFullArtists(homeDataCache.artists);
      setFullAlbums(homeDataCache.albums);
      setFullGenres(homeDataCache.genres);
      setLikedSongs(homeDataCache.liked);
      setFavArtists(homeDataCache.favArtists);
      setLoadingLists(false);
      return () => { mountedRef.current = false; };
    }

    const loadCompleteLists = async () => {
      try {
        setLoadingLists(true);
        const [allSongsRes, artistsRes, albumsRes, genresRes, likedRes, favRes] = await Promise.all([
          api.getLibrary({ limit: 99999, offset: 0, userId }),
          api.getArtists(userId),
          api.getAlbums(userId),
          api.getGenres(),
          api.getLikedSongs(userId),
          api.getFavoriteArtists(userId)
        ]);

        if (mountedRef.current) {
          homeDataCache.userId = userId;
          homeDataCache.ts = Date.now();
          homeDataCache.allSongs = allSongsRes.songs || [];
          homeDataCache.artists = artistsRes.artists || [];
          homeDataCache.albums = albumsRes.albums || [];
          homeDataCache.genres = genresRes.genres || [];
          homeDataCache.liked = likedRes.songs || [];
          homeDataCache.favArtists = favRes.artists || [];

          setAllSongsFromServer(homeDataCache.allSongs);
          setFullArtists(homeDataCache.artists);
          setFullAlbums(homeDataCache.albums);
          setFullGenres(homeDataCache.genres);
          setLikedSongs(homeDataCache.liked);
          setFavArtists(homeDataCache.favArtists);
          setLoadingLists(false);
        }
      } catch (err) {
        console.error('Error cargando listas completas:', err);
        if (mountedRef.current) setLoadingLists(false);
      }
    };
    loadCompleteLists();

    return () => { mountedRef.current = false; };
  }, [userId]);

  const liked = likedSongs;
  const albums = fullAlbums;
  const artists = fullArtists;
  const genres = fullGenres;
  const years = buildYears(allSongsFromServer);
  const likedIds = new Set(allSongsFromServer.filter(s => s.liked).map(s => s.id));

  const unknownSongs = allSongsFromServer.filter(s =>
    !s.artist || s.artist === 'Artista desconocido' ||
    !s.album || s.album === 'Álbum desconocido' ||
    s.artist === 'Desconocido' || s.album === 'Desconocido'
  );

  const RecommendationsSection = ({ songs, likedIds, onPlay, favoriteArtists = [] }) => {
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(false);
    const prevDepsRef = useRef(null);

    const generateRecommendations = () => {
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
      generateRecommendations();
    }, [songs, likedIds, favoriteArtists]);

    const { addToQueue } = usePlayer();

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
            onClick={generateRecommendations}
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
  };

  function MoodPlaylistCreator({ allSongs, likedIds, userId, onCreated }) {
    const [mood, setMood] = useState('feliz');
    const [playlist, setPlaylist] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      let mounted = true;
      if (!userId) return;
      api.getFavoriteArtists(userId).then(res => {
        if (mounted) setFavArtists(res.artists || []);
      }).catch(() => { });
      return () => { mounted = false; };
    }, [userId]);

    const generate = async () => {
      setLoading(true);
      try {
        const pl = RecommendationEngine.generateMoodPlaylist(allSongs, mood, likedIds, favArtists, 20);
        setPlaylist(pl || []);
      } catch (err) {
        console.error('Error generando mood playlist:', err);
        setPlaylist([]);
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          {['feliz', 'triste', 'energía', 'relax', 'romántico'].map(m => (
            <button
              key={m}
              onClick={() => setMood(m)}
              className={`px-3 py-1 rounded-full text-sm ${mood === m ? 'bg-primary text-black' : 'bg-surface-2'}`}
            >{m}</button>
          ))}
          <button
            onClick={generate}
            disabled={loading}
            className="ml-2 p-2 rounded-lg bg-primary text-black hover:brightness-110 transition disabled:opacity-50"
            title="Generar playlist según estado de ánimo"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {loading && <p className="text-xs text-muted-foreground">Generando...</p>}
        {playlist.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-1">
            {playlist.slice(0, 6).map(s => (
              <div key={s.id} className="text-sm text-white truncate">{s.title} <span className="text-xs text-muted-foreground">- {s.artist}</span></div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const MonthlySummarySection = ({ userId }) => {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [firstLoadDone, setFirstLoadDone] = useState(false);

    useEffect(() => {
      if (firstLoadDone) return;
      setLoading(true);
      const historyKey = `mirepo_play_history_${userId || 'default'}`;
      let history = [];
      try {
        const stored = window.localStorage.getItem(historyKey);
        if (stored) history = JSON.parse(stored);
      } catch { }
      const result = RecommendationEngine.getMonthlySummary(history, allSongsFromServer);
      if (result) setSummary(result);
      setFirstLoadDone(true);
      setLoading(false);
    }, [allSongsFromServer.length]);

    if (!summary && !loading) return null;

    return (
      <section className="animate-fade-in rounded-xl border border-border bg-surface/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={18} className="text-primary" />
          <h2 className="text-base font-600 text-white sm:text-lg">Resumen del mes</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          </div>
        ) : summary ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2"><span className="text-muted-foreground">🎵</span><span className="text-white">{summary.totalSongs} canciones</span></div>
              <div className="flex items-center gap-2"><span className="text-muted-foreground">⏱️</span><span className="text-white">{summary.totalMinutes} minutos</span></div>
              <div className="flex items-center gap-2"><span className="text-muted-foreground">🎤</span><span className="text-white truncate">{summary.topArtist}</span></div>
              <div className="flex items-center gap-2"><span className="text-muted-foreground">🎧</span><span className="text-white truncate">{summary.topGenre}</span></div>
            </div>
            {summary.top5Songs && summary.top5Songs.length > 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Top 5 canciones del mes:</p>
                <div className="space-y-1">
                  {summary.top5Songs.slice(0, 5).map((song, i) => (
                    <div key={song.id} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-5">{i + 1}</span>
                      <span className="truncate text-white flex-1">{song.title}</span>
                      <span className="text-muted-foreground text-xs">- {song.artist}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </section>
    );
  };

  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Buenas noches' : hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="flex flex-col gap-4 w-full" style={{ paddingBottom: '140px' }}>
      <header className="animate-fade-in">
        <h1 className="text-xl font-700 tracking-tight text-white sm:text-3xl">{greeting}</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">Tu música, sin distracciones.</p>
      </header>

      <section className="animate-fade-in overflow-hidden rounded-xl border border-border bg-gradient-to-b from-primary/10 to-surface sm:rounded-2xl">
        <div className="flex items-center gap-4 p-4 sm:p-6 sm:pb-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg sm:h-20 sm:w-20 sm:rounded-xl">
            <Heart size={22} fill="currentColor" className="sm:hidden" />
            <Heart size={36} fill="currentColor" className="hidden sm:block" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">Lista</p>
            <h2 className="text-sm font-700 text-white sm:text-2xl">Canciones que me gustan</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {liked.length} {liked.length === 1 ? 'canción' : 'canciones'}
            </p>
          </div>
          {liked.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => shufflePlay(liked)} className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-white shadow-lg transition hover:scale-105 sm:grid sm:h-12 sm:w-12" title="Reproducción aleatoria">
                <Shuffle size={16} className="sm:size-5" />
              </button>
              <button onClick={() => play(liked[0], liked)} className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 sm:grid sm:h-12 sm:w-12">
                <Play size={18} fill="currentColor" className="ml-0.5 sm:size-6" />
              </button>
              {liked.length > 5 && (
                <button onClick={() => onOpenLikedSongs?.()} className="text-xs text-primary hover:underline">
                  Ver todas
                </button>
              )}
            </div>
          )}
        </div>

        {liked.length > 0 ? (
          <div className="flex flex-col gap-1.5 px-3 pb-4 sm:px-5 sm:pb-5">
            {liked.slice(0, 5).map((song, i) => (
              <SongRow
                key={song.id}
                song={song}
                index={i}
                queue={liked}
                onLike={onLike}
                onDislike={onDislike}
                onDislikeArtist={onDislikeArtist}
                onDelete={onDelete}
                onFixMetadata={handleFixMetadata}
                showDelete
                context={null}
                likedIds={likedIds}
              />
            ))}
          </div>
        ) : (
          <p className="px-4 pb-4 text-xs text-muted-foreground sm:px-6 sm:pb-6 sm:text-sm">
            Marca canciones con el corazón para verlas aquí.
          </p>
        )}
      </section>

      <Carousel
        title="Álbumes"
        action={
          albums.length > 10 && (
            <button onClick={() => onOpenGridView('albums', albums)} disabled={loadingLists} className="text-xs font-medium text-muted-foreground hover:text-white transition-colors disabled:opacity-50">
              Ver todo
            </button>
          )
        }
      >
        {albums.slice(0, 10).map((al) => (
          <CollectionCard
            key={al.name}
            title={al.name}
            subtitle={al.artist}
            coverSong={{ coverId: al.coverId, hasCover: true }}
            songs={al.songs}
            onOpen={() => onOpenCollection({ kind: 'Álbum', name: al.name, songs: al.songs })}
          />
        ))}
      </Carousel>

      <Carousel
        title="Artistas"
        action={
          artists.length > 10 && (
            <button onClick={() => onOpenGridView('artists', artists)} disabled={loadingLists} className="text-xs font-medium text-muted-foreground hover:text-white transition-colors disabled:opacity-50">
              Ver todo
            </button>
          )
        }
      >
        {artists.slice(0, 10).map((ar) => (
          <CollectionCard
            key={ar.name}
            round
            title={ar.name}
            subtitle={`${ar.songs.length} ${ar.songs.length === 1 ? 'canción' : 'canciones'}`}
            coverSong={{ coverId: ar.coverId, hasCover: true }}
            songs={ar.songs}
            artistName={ar.name}
            onOpen={() => onOpenCollection({ kind: 'Artista', name: ar.name, songs: ar.songs })}
          />
        ))}
      </Carousel>

      <Carousel
        title="Géneros"
        action={
          genres.length > 10 && (
            <button onClick={() => onOpenGridView('genres', genres)} disabled={loadingLists} className="text-xs font-medium text-muted-foreground hover:text-white transition-colors disabled:opacity-50">
              Ver todo
            </button>
          )
        }
      >
        {genres.slice(0, 10).map((ge) => (
          <CollectionCard
            key={ge.name}
            title={ge.name}
            subtitle={`${ge.songs.length} ${ge.songs.length === 1 ? 'canción' : 'canciones'}`}
            coverSong={{ coverId: ge.coverId, hasCover: true }}
            songs={ge.songs}
            onOpen={() => onOpenCollection({ kind: 'Género', name: ge.name, songs: ge.songs })}
          />
        ))}
      </Carousel>

      <Carousel
        title="Años"
        action={
          years.length > 10 && (
            <button onClick={() => onOpenGridView('years', years)} className="text-xs font-medium text-muted-foreground hover:text-white transition-colors">
              Ver todo
            </button>
          )
        }
      >
        {years.slice(0, 10).map((yr) => (
          <CollectionCard
            key={yr.name}
            title={yr.name}
            subtitle={`${yr.songs.length} ${yr.songs.length === 1 ? 'canción' : 'canciones'}`}
            coverSong={{ coverId: yr.coverId, hasCover: true }}
            songs={yr.songs}
            onOpen={() => onOpenCollection({ kind: 'Año', name: yr.name, songs: yr.songs })}
          />
        ))}
      </Carousel>

      {unknownSongs.length > 0 && (
        <Carousel
          title="🎵 Sin artista o álbum"
          action={
            unknownSongs.length > 10 && (
              <button onClick={() => onOpenCollection({ kind: 'Lista', name: 'Sin artista o álbum', songs: unknownSongs })} className="text-xs font-medium text-muted-foreground hover:text-white transition-colors">
                Ver todo
              </button>
            )
          }
        >
          {unknownSongs.slice(0, 10).map((song) => (
            <CollectionCard
              key={song.id}
              title={song.title}
              subtitle={song.artist || 'Artista desconocido'}
              coverSong={{ coverId: song.id, hasCover: song.hasCover }}
              songs={[song]}
              onOpen={() => onOpenCollection({ kind: 'Lista', name: 'Sin artista o álbum', songs: unknownSongs })}
            />
          ))}
        </Carousel>
      )}

      <RecommendationsSection songs={allSongsFromServer} likedIds={likedIds} onPlay={play} favoriteArtists={favArtists} />
      <MonthlySummarySection userId={userId} />

      <section className="animate-fade-in rounded-xl border border-border bg-surface/50 p-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-white mb-2">Crear playlist según estado de ánimo</p>
            <MoodPlaylistCreator
              allSongs={allSongsFromServer}
              likedIds={likedIds}
              userId={userId}
              onCreated={() => onOpenPlayLists && onOpenPlayLists()}
            />
          </div>
        </div>
      </section>

      <div className="h-4" />
    </div>
  );
}