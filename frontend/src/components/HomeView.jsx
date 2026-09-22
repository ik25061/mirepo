// components/HomeView.jsx
import { Play, Music2, Upload, FolderOpen } from "lucide-react";

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 18) return "Buenas tardes";
  return "Buenas noches";
}

export function HomeView({ tracks, currentTrack, likedIds, onPlay, onLoadFiles, onLoadFolder }) {
  const recentTracks = tracks.slice(0, 6);
  const likedTracks = tracks.filter((t) => likedIds.has(t.id)).slice(0, 6);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Hero gradient header */}
      <div
        className="px-6 pt-8 pb-6"
        style={{ background: "linear-gradient(180deg, #1a3a2a 0%, #121212 100%)" }}
      >
        <h1 className="text-white" style={{ fontSize: 32, fontWeight: 800 }}>
          {getTimeGreeting()}
        </h1>

        {tracks.length === 0 && (
          <div className="mt-6 p-6 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }}>
            <p className="text-white mb-4" style={{ fontSize: 16, fontWeight: 600 }}>
              Empieza agregando tu música
            </p>
            <div className="flex gap-3 flex-wrap">
              <label
                className="flex items-center gap-2 px-5 py-2.5 rounded-full cursor-pointer hover:scale-105 transition-transform"
                style={{ background: "#1db954", color: "#000", fontSize: 13, fontWeight: 700 }}
              >
                <Upload size={15} />
                Agregar archivos
                <input
                  type="file"
                  accept="audio/*"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && onLoadFiles(e.target.files)}
                />
              </label>
              <button
                onClick={onLoadFolder}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full hover:scale-105 transition-transform"
                style={{ background: "#282828", color: "#fff", fontSize: 13, fontWeight: 600 }}
              >
                <FolderOpen size={15} />
                Abrir carpeta
              </button>
            </div>
          </div>
        )}

        {/* Quick picks (grid of recent tracks) */}
        {recentTracks.length > 0 && (
          <div className="mt-6 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {recentTracks.map((track, i) => (
              <QuickPickCard
                key={track.id}
                track={track}
                isCurrent={currentTrack?.id === track.id}
                onPlay={() => onPlay(track, i)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="px-6 pb-8">
        {/* Recently added */}
        {tracks.length > 0 && (
          <Section title="Toda tu música" tracks={tracks} currentTrack={currentTrack} onPlay={onPlay} />
        )}

        {/* Liked songs */}
        {likedTracks.length > 0 && (
          <Section 
            title="Canciones que te gustan" 
            tracks={likedTracks} 
            currentTrack={currentTrack} 
            onPlay={(t) => {
              const idx = tracks.findIndex(tr => tr.id === t.id);
              onPlay(t, idx);
            }} 
          />
        )}
      </div>
    </div>
  );
}

function QuickPickCard({ track, isCurrent, onPlay }) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg cursor-pointer group transition-colors hover:bg-white/10"
      style={{ background: "rgba(255,255,255,0.07)", padding: "8px 12px 8px 8px" }}
      onDoubleClick={onPlay}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center rounded"
        style={{ width: 48, height: 48, background: "#282828" }}
      >
        {track.cover ? (
          <img src={track.cover} alt={track.title} className="w-full h-full object-cover rounded" />
        ) : (
          <Music2 size={20} className="text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`truncate ${isCurrent ? "text-primary" : "text-white"}`}
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          {track.title}
        </p>
        <p className="text-muted-foreground truncate" style={{ fontSize: 11 }}>{track.artist}</p>
      </div>
      <button
        onClick={onPlay}
        className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-9 h-9 rounded-full bg-primary transition-opacity hover:scale-105"
      >
        <Play size={16} className="text-black ml-0.5" fill="black" />
      </button>
    </div>
  );
}

function Section({ title, tracks, currentTrack, onPlay }) {
  return (
    <div className="mt-8">
      <h2 className="text-white mb-4" style={{ fontSize: 20, fontWeight: 700 }}>
        {title}
      </h2>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
      >
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
      className="flex flex-col gap-2 p-3 rounded-xl cursor-pointer group transition-colors hover:bg-secondary"
      style={{ background: "#181818" }}
      onDoubleClick={onPlay}
    >
      <div
        className="relative w-full rounded-lg overflow-hidden flex items-center justify-center"
        style={{ aspectRatio: "1", background: "#282828" }}
      >
        {track.cover ? (
          <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
        ) : (
          <Music2 size={40} className="text-muted-foreground" />
        )}
        <button
          onClick={onPlay}
          className="absolute bottom-2 right-2 flex items-center justify-center w-10 h-10 rounded-full bg-primary opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all shadow-xl hover:scale-105"
        >
          <Play size={18} className="text-black ml-0.5" fill="black" />
        </button>
      </div>
      <div>
        <p
          className={`truncate ${isCurrent ? "text-primary" : "text-white"}`}
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          {track.title}
        </p>
        <p className="text-muted-foreground truncate" style={{ fontSize: 12 }}>{track.artist}</p>
      </div>
    </div>
  );
}