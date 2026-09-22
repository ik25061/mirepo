// components/MobileSearchView.jsx
import { useState } from "react";
import { Search, Music2, Play } from "lucide-react";

export function MobileSearchView({ tracks, currentTrack, onPlay }) {
  const [query, setQuery] = useState("");

  const results = query.trim()
    ? tracks.filter(
        (t) =>
          t.title.toLowerCase().includes(query.toLowerCase()) ||
          t.artist.toLowerCase().includes(query.toLowerCase()) ||
          t.album.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  return (
    <div className="flex flex-col h-full" style={{ background: "#121212" }}>
      <div className="px-4 pt-12 pb-4">
        <h1 className="text-white mb-4" style={{ fontSize: 22, fontWeight: 800 }}>Buscar</h1>
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl"
          style={{ background: "#282828" }}
        >
          <Search size={16} style={{ color: "#a7a7a7", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Artistas, canciones, álbumes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-white outline-none"
            style={{ fontSize: 15 }}
            autoFocus
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        {query.trim() === "" ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search size={48} style={{ color: "#535353", marginBottom: 12 }} />
            <p className="text-white mb-1" style={{ fontSize: 15, fontWeight: 600 }}>
              Encuentra tu música
            </p>
            <p style={{ fontSize: 13, color: "#a7a7a7" }}>
              Busca por canción, artista o álbum
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-white mb-1" style={{ fontSize: 15, fontWeight: 600 }}>
              Sin resultados
            </p>
            <p style={{ fontSize: 13, color: "#a7a7a7" }}>
              No se encontró "{query}" en tu biblioteca
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 pb-4">
            {results.map((track) => {
              const isCurrent = currentTrack?.id === track.id;
              return (
                <div
                  key={track.id}
                  onClick={() => onPlay(track, tracks.indexOf(track))}
                  className="flex items-center gap-3 py-2 px-2 rounded-xl cursor-pointer active:bg-white/5"
                >
                  <div
                    className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden"
                    style={{ width: 52, height: 52, background: "#282828" }}
                  >
                    {track.cover ? (
                      <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music2 size={20} style={{ color: "#535353" }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="truncate"
                      style={{ fontSize: 14, fontWeight: 600, color: isCurrent ? "#1db954" : "#fff" }}
                    >
                      {track.title}
                    </p>
                    <p className="truncate" style={{ fontSize: 12, color: "#a7a7a7" }}>
                      {track.artist} · {track.album}
                    </p>
                  </div>
                  <Play size={18} style={{ color: "#a7a7a7", flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}