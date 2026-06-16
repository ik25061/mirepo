// components/MiniPlayer.jsx
import { Play, Pause, SkipForward, Music2 } from "lucide-react";

export function MiniPlayer({ track, isPlaying, onPlayPause, onNext, onOpen }) {
  return (
    <div
      onClick={onOpen}
      className="flex items-center gap-3 px-3 mx-2 mb-2 rounded-xl cursor-pointer"
      style={{ height: 60, background: "#282828" }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden"
        style={{ width: 44, height: 44, background: "#383838" }}
      >
        {track.cover ? (
          <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
        ) : (
          <Music2 size={18} style={{ color: "#a7a7a7" }} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-white truncate" style={{ fontSize: 13, fontWeight: 600 }}>
          {track.title}
        </p>
        <p style={{ fontSize: 12, color: "#a7a7a7" }} className="truncate">
          {track.artist}
        </p>
        {(track.album && track.album !== "Desconocido") || track.year ? (
          <p style={{ fontSize: 10, color: "#727272", marginTop: 1 }} className="truncate">
            {track.album && track.album !== "Desconocido" ? track.album : ""}
            {track.year ? ` • ${track.year}` : ""}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onPlayPause}
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: "transparent" }}
        >
          {isPlaying ? (
            <Pause size={22} fill="white" className="text-white" />
          ) : (
            <Play size={22} fill="white" className="text-white ml-0.5" />
          )}
        </button>
        <button onClick={onNext} className="flex items-center justify-center w-9 h-9">
          <SkipForward size={22} className="text-white" />
        </button>
      </div>
    </div>
  );
}