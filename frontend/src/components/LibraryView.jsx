// components/LibraryView.jsx
import { useState } from "react";
import { FolderOpen, Music2, Upload, Search } from "lucide-react";
import { TrackList } from "./TrackList";

export function LibraryView({
  tracks,
  currentTrack,
  isPlaying,
  likedIds,
  onPlay,
  onLike,
  onLoadFiles,
  onLoadFolder,
  onDelete,
  onSync,
}) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState("list");

  const filtered = tracks.filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.artist.toLowerCase().includes(search.toLowerCase()) ||
      t.album.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-6 pt-6 pb-4"
        style={{ background: "linear-gradient(180deg, #2a1f3d 0%, #121212 100%)" }}
      >
        <h1 className="text-white mb-4" style={{ fontSize: 28, fontWeight: 800 }}>
          Tu biblioteca
        </h1>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-full" style={{ background: "#282828", minWidth: 200 }}>
            <Search size={15} className="text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar en tu biblioteca..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-white outline-none w-full"
              style={{ fontSize: 13 }}
            />
          </div>

          {/* Load files */}
          <label
            className="flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer transition-colors hover:bg-secondary/70"
            style={{ background: "#282828", fontSize: 13, color: "#fff", fontWeight: 500 }}
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

          {/* Load folder */}
          <button
            onClick={onLoadFolder}
            className="flex items-center gap-2 px-4 py-2 rounded-full transition-colors hover:bg-secondary/70"
            style={{ background: "#282828", fontSize: 13, color: "#fff", fontWeight: 500 }}
          >
            <FolderOpen size={15} />
            Abrir carpeta
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        {tracks.length === 0 ? (
          <EmptyLibrary onLoadFiles={onLoadFiles} onLoadFolder={onLoadFolder} />
        ) : (
          <>
            <p className="text-muted-foreground mb-4" style={{ fontSize: 13 }}>
              {filtered.length} {filtered.length === 1 ? "canción" : "canciones"}
            </p>
            <TrackList
              tracks={filtered}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              likedIds={likedIds}
              onPlay={onPlay}
              onLike={onLike}
              onDelete={onDelete}
              onSync={onSync}
            />
          </>
        )}
      </div>
    </div>
  );
}

function EmptyLibrary({ onLoadFiles, onLoadFolder }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div
        className="flex items-center justify-center w-20 h-20 rounded-full mb-6"
        style={{ background: "#282828" }}
      >
        <Music2 size={36} className="text-muted-foreground" />
      </div>
      <h2 className="text-white mb-2" style={{ fontSize: 20, fontWeight: 700 }}>
        Tu biblioteca está vacía
      </h2>
      <p className="text-muted-foreground mb-8" style={{ fontSize: 14, maxWidth: 360 }}>
        Agrega archivos de audio desde tu PC para empezar a escuchar música.
        Soporta MP3, FLAC, WAV, OGG y más.
      </p>
      <div className="flex gap-3 flex-wrap justify-center">
        <label
          className="flex items-center gap-2 px-6 py-3 rounded-full cursor-pointer transition-all hover:scale-105"
          style={{ background: "#1db954", color: "#000", fontSize: 14, fontWeight: 700 }}
        >
          <Upload size={16} />
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
          className="flex items-center gap-2 px-6 py-3 rounded-full transition-all hover:scale-105"
          style={{ background: "#282828", color: "#fff", fontSize: 14, fontWeight: 600 }}
        >
          <FolderOpen size={16} />
          Abrir carpeta
        </button>
      </div>
    </div>
  );
}