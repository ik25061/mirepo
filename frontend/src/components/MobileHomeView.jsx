// components/MobileHomeView.jsx
import { Upload, FolderOpen, Music2, Play, Disc, User } from "lucide-react";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 18) return "Buenas tardes";
  return "Buenas noches";
}

export function MobileHomeView({
  tracks, currentTrack, likedIds, onPlay, onLoadFiles, onLoadFolder,
}) {
  const recentPairs = tracks.slice(0, 6);
  const likedTracks = tracks.filter((t) => likedIds.has(t.id));
  
  // Obtener géneros únicos
  const genres = [...new Set(tracks.flatMap(t => {
    if (Array.isArray(t.genre)) return t.genre;
    if (typeof t.genre === 'string') return t.genre.split(/[\/,]/).map(g => g.trim());
    return [];
  }))].filter(g => g && g !== "Desconocido").slice(0, 6);
  
  // Obtener artistas únicos con sus imágenes
  const artistMap = {};
  tracks.forEach(t => {
    if (t.artist && t.artist !== "Desconocido") {
      if (!artistMap[t.artist]) {
        artistMap[t.artist] = { 
          name: t.artist, 
          cover: t.cover || t.imageUrl || null 
        };
      }
    }
  });
  const artists = Object.values(artistMap).slice(0, 6);

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#121212" }}>
      {/* Header - con padding mejorado */}
      <div className="px-4 pt-12 pb-2">
        <h1 className="text-white" style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px" }}>
          {getGreeting()}
        </h1>
      </div>

      {/* Quick picks */}
      {recentPairs.length > 0 ? (
        <div className="px-4 mb-4">
          <div className="grid grid-cols-2 gap-2">
            {recentPairs.map((track, i) => (
              <QuickCard
                key={track.id}
                track={track}
                isCurrent={currentTrack?.id === track.id}
                onPlay={() => onPlay(track, i)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="px-4 mb-6">
          <EmptyState onLoadFiles={onLoadFiles} onLoadFolder={onLoadFolder} />
        </div>
      )}

      {/* Botones de acción - con más padding */}
      {tracks.length > 0 && (
        <div className="px-4 mb-4 flex gap-3">
          <label
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full cursor-pointer hover:bg-white/10 transition-colors"
            style={{ background: "#282828", fontSize: 13, color: "#fff", fontWeight: 600 }}
          >
            <Upload size={14} />
            Agregar
            <input type="file" accept="audio/*" multiple className="hidden"
              onChange={(e) => e.target.files && onLoadFiles(e.target.files)} />
          </label>
          <button
            onClick={onLoadFolder}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full hover:bg-white/10 transition-colors"
            style={{ background: "#282828", fontSize: 13, color: "#fff", fontWeight: 600 }}
          >
            <FolderOpen size={14} />
            Carpeta
          </button>
        </div>
      )}
      
      {tracks.length > 0 && <div className="px-4 mb-2" style={{ borderTop: "1px solid #282828" }} />}

      {/* Toda tu música */}
      {tracks.length >= 3 && (
        <Section title="Toda tu música" tracks={tracks} currentTrack={currentTrack} onPlay={onPlay} />
      )}

      {/* Canciones que te gustan */}
      {likedTracks.length > 0 && (
        <Section
          title="Canciones que te gustan"
          tracks={likedTracks}
          currentTrack={currentTrack}
          onPlay={(t) => {
            const idx = tracks.findIndex((tr) => tr.id === t.id);
            onPlay(t, idx);
          }}
        />
      )}

      {/* NUEVA SECCIÓN: Géneros */}
      {genres.length > 0 && (
        <GenreSection genres={genres} tracks={tracks} currentTrack={currentTrack} onPlay={onPlay} />
      )}

      {/* NUEVA SECCIÓN: Artistas */}
      {artists.length > 0 && (
        <ArtistSection artists={artists} tracks={tracks} currentTrack={currentTrack} onPlay={onPlay} />
      )}

      <div style={{ height: 80 }} />
    </div>
  );
}

function QuickCard({ track, isCurrent, onPlay }) {
  return (
    <button
      onClick={onPlay}
      className="flex items-center gap-2 rounded-lg overflow-hidden w-full text-left transition-all active:scale-95"
      style={{ background: "#282828", height: 56 }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center"
        style={{ width: 56, height: 56, background: "#383838" }}
      >
        {track.cover || track.imageUrl ? (
          <img 
            src={track.cover || track.imageUrl} 
            alt={track.title} 
            className="w-full h-full object-cover" 
          />
        ) : (
          <Music2 size={18} style={{ color: "#a7a7a7" }} />
        )}
      </div>
      <span
        className="truncate pr-2"
        style={{ fontSize: 12, fontWeight: 700, color: isCurrent ? "#1db954" : "#fff" }}
      >
        {track.title}
      </span>
    </button>
  );
}

function Section({ title, tracks, currentTrack, onPlay }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-white" style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
        <button style={{ fontSize: 12, color: "#a7a7a7", fontWeight: 600 }}>Ver todo</button>
      </div>
      <div className="flex gap-3 px-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {tracks.slice(0, 8).map((track, i) => (
          <AlbumCard
            key={track.id}
            track={track}
            isCurrent={currentTrack?.id === track.id}
            onPlay={() => onPlay(track, i)}
          />
        ))}
      </div>
    </div>
  );
}

function AlbumCard({ track, isCurrent, onPlay }) {
  return (
    <div
      className="flex-shrink-0 flex flex-col gap-2 cursor-pointer group"
      style={{ width: 140 }}
      onClick={onPlay}
    >
      <div
        className="relative flex items-center justify-center rounded-xl overflow-hidden"
        style={{ width: 140, height: 140, background: "#282828" }}
      >
        {track.cover || track.imageUrl ? (
          <img 
            src={track.cover || track.imageUrl} 
            alt={track.title} 
            className="w-full h-full object-cover" 
          />
        ) : (
          <Music2 size={40} style={{ color: "#535353" }} />
        )}
        <div
          className="absolute inset-0 flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "rgba(0,0,0,0.3)" }}
        >
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 36, height: 36, background: "#1db954" }}
          >
            <Play size={16} fill="#000" style={{ color: "#000", marginLeft: 2 }} />
          </div>
        </div>
      </div>
      <div>
        <p className="truncate" style={{ fontSize: 12, fontWeight: 600, color: isCurrent ? "#1db954" : "#fff" }}>
          {track.title}
        </p>
        <p className="truncate" style={{ fontSize: 11, color: "#a7a7a7" }}>{track.artist}</p>
      </div>
    </div>
  );
}

// ===== NUEVA SECCIÓN: GÉNEROS =====
function GenreSection({ genres, tracks, currentTrack, onPlay }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-white" style={{ fontSize: 16, fontWeight: 700 }}>Géneros</h2>
        <button style={{ fontSize: 12, color: "#a7a7a7", fontWeight: 600 }}>Ver todo</button>
      </div>
      <div className="flex gap-3 px-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {genres.map((genre) => {
          // Buscar una canción de este género para mostrar portada
          const genreTrack = tracks.find(t => {
            if (Array.isArray(t.genre)) return t.genre.includes(genre);
            if (typeof t.genre === 'string') return t.genre.split(/[\/,]/).map(g => g.trim()).includes(genre);
            return false;
          });
          return (
            <GenreCard
              key={genre}
              genre={genre}
              track={genreTrack}
              onPlay={() => {
                // Reproducir primera canción del género
                const firstTrack = tracks.find(t => {
                  if (Array.isArray(t.genre)) return t.genre.includes(genre);
                  if (typeof t.genre === 'string') return t.genre.split(/[\/,]/).map(g => g.trim()).includes(genre);
                  return false;
                });
                if (firstTrack) {
                  const idx = tracks.indexOf(firstTrack);
                  onPlay(firstTrack, idx);
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function GenreCard({ genre, track, onPlay }) {
  return (
    <div
      className="flex-shrink-0 flex flex-col gap-2 cursor-pointer group"
      style={{ width: 140 }}
      onClick={onPlay}
    >
      <div
        className="relative flex items-center justify-center rounded-xl overflow-hidden"
        style={{ width: 140, height: 140, background: "#282828" }}
      >
        {track?.cover || track?.imageUrl ? (
          <img 
            src={track.cover || track.imageUrl} 
            alt={genre} 
            className="w-full h-full object-cover" 
          />
        ) : (
          <Disc size={50} style={{ color: "#535353" }} />
        )}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)" }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
            {genre}
          </span>
        </div>
      </div>
    </div>
  );
}

// ===== NUEVA SECCIÓN: ARTISTAS =====
function ArtistSection({ artists, tracks, currentTrack, onPlay }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-white" style={{ fontSize: 16, fontWeight: 700 }}>Artistas</h2>
        <button style={{ fontSize: 12, color: "#a7a7a7", fontWeight: 600 }}>Ver todo</button>
      </div>
      <div className="flex gap-4 px-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {artists.map((artist) => (
          <ArtistCard
            key={artist.name}
            artist={artist}
            onPlay={() => {
              // Reproducir primera canción del artista
              const firstTrack = tracks.find(t => t.artist === artist.name);
              if (firstTrack) {
                const idx = tracks.indexOf(firstTrack);
                onPlay(firstTrack, idx);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ArtistCard({ artist, onPlay }) {
  return (
    <div
      className="flex-shrink-0 flex flex-col items-center gap-2 cursor-pointer group"
      style={{ width: 100 }}
      onClick={onPlay}
    >
      <div
        className="relative flex items-center justify-center rounded-full overflow-hidden"
        style={{ width: 90, height: 90, background: "#282828" }}
      >
        {artist.cover ? (
          <img 
            src={artist.cover} 
            alt={artist.name} 
            className="w-full h-full object-cover" 
          />
        ) : (
          <User size={40} style={{ color: "#535353" }} />
        )}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "rgba(0,0,0,0.4)" }}
        >
          <Play size={24} fill="#fff" style={{ color: "#fff" }} />
        </div>
      </div>
      <p className="text-center truncate" style={{ fontSize: 12, fontWeight: 600, color: "#fff", maxWidth: 90 }}>
        {artist.name}
      </p>
    </div>
  );
}

function EmptyState({ onLoadFiles, onLoadFolder }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 px-6 rounded-2xl text-center"
      style={{ background: "#1a1a1a" }}
    >
      <div
        className="flex items-center justify-center rounded-full mb-4"
        style={{ width: 72, height: 72, background: "#282828" }}
      >
        <Music2 size={32} style={{ color: "#535353" }} />
      </div>
      <p className="text-white mb-1" style={{ fontSize: 16, fontWeight: 700 }}>
        Tu biblioteca está vacía
      </p>
      <p style={{ fontSize: 13, color: "#a7a7a7", marginBottom: 20 }}>
        Agrega archivos MP3, FLAC, WAV y más desde tu dispositivo
      </p>
      <div className="flex gap-3 flex-wrap justify-center">
        <label
          className="flex items-center gap-2 px-5 py-2.5 rounded-full cursor-pointer"
          style={{ background: "#1db954", color: "#000", fontSize: 13, fontWeight: 700 }}
        >
          <Upload size={14} />
          Agregar archivos
          <input type="file" accept="audio/*" multiple className="hidden"
            onChange={(e) => e.target.files && onLoadFiles(e.target.files)} />
        </label>
        <button
          onClick={onLoadFolder}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full"
          style={{ background: "#282828", color: "#fff", fontSize: 13, fontWeight: 600 }}
        >
          <FolderOpen size={14} />
          Carpeta
        </button>
      </div>
    </div>
  );
}