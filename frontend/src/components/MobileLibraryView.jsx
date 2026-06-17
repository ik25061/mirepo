// components/MobileLibraryView.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Upload, FolderOpen, Music2, Play, Heart, MoreHorizontal, Trash2 } from "lucide-react";

function formatTime(s) {
  if (!isFinite(s) || s === 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Componente para el loading skeleton
function TrackSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2 px-2 rounded-xl animate-pulse">
      <div className="flex-shrink-0 rounded-lg" style={{ width: 52, height: 52, background: "#282828" }} />
      <div className="flex-1 min-w-0">
        <div style={{ height: 14, width: "70%", background: "#282828", borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: 12, width: "50%", background: "#282828", borderRadius: 4 }} />
      </div>
    </div>
  );
}

export function MobileLibraryView({
  tracks, currentTrack, isPlaying, likedIds, onPlay, onLike, onLoadFiles, onLoadFolder, onDelete, onSync,
}) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const loadMoreRef = useRef(null);
  const listRef = useRef(null);

  // Filtrar canciones según filtro y búsqueda
  const getFilteredTracks = useCallback(() => {
    return tracks
      .filter((t) => {
        if (filter === "liked") return likedIds.has(t.id);
        return true;
      })
      .filter((t) =>
        !search ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.artist.toLowerCase().includes(search.toLowerCase())
      );
  }, [tracks, filter, search, likedIds]);

  const filteredTracks = getFilteredTracks();
  const visibleTracks = filteredTracks.slice(0, visibleCount);
  const hasMore = visibleCount < filteredTracks.length;

  // Cargar más canciones
  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    // Simular carga con timeout
    setTimeout(() => {
      setVisibleCount(prev => Math.min(prev + 20, filteredTracks.length));
      setIsLoading(false);
    }, 300);
  }, [isLoading, hasMore, filteredTracks.length]);

  // Observer para lazy loading
  useEffect(() => {
    if (!loadMoreRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { 
        root: listRef.current,
        rootMargin: "100px",
        threshold: 0.1
      }
    );

    observer.observe(loadMoreRef.current);

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [hasMore, isLoading, loadMore, filteredTracks.length]);

  // Resetear el contador cuando cambian los filtros
  useEffect(() => {
    setVisibleCount(20);
  }, [filter, search]);

  const chips = [
    { id: "all", label: "Todo" },
    { id: "liked", label: "Favoritos" },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: "#121212" }}>
      <div className="px-4 pt-12 pb-3" style={{ flexShrink: 0 }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-white" style={{ fontSize: 22, fontWeight: 800 }}>Mi música</h1>
          <button>
            <MoreHorizontal size={22} style={{ color: "#a7a7a7" }} />
          </button>
        </div>

        {/* Buscador */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: "#282828", marginBottom: 16 }}
        >
          <Search size={15} style={{ color: "#a7a7a7", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Buscar canciones..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-white outline-none"
            style={{ fontSize: 14 }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="p-1 rounded-full hover:bg-white/10"
              style={{ color: "#a7a7a7" }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Botones de filtro */}
        <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {chips.map((chip) => (
            <button
              key={chip.id}
              onClick={() => setFilter(chip.id)}
              className="flex-shrink-0 px-5 py-2 rounded-full transition-colors"
              style={{
                background: filter === chip.id ? "#1db954" : "#282828",
                color: filter === chip.id ? "#000" : "#fff",
                fontSize: 13,
                fontWeight: filter === chip.id ? 700 : 500,
              }}
            >
              {chip.label}
            </button>
          ))}
          <label
            className="flex-shrink-0 flex items-center gap-2 px-5 py-2 rounded-full cursor-pointer transition-colors hover:bg-white/10"
            style={{ background: "#282828", color: "#fff", fontSize: 13, fontWeight: 500 }}
          >
            <Upload size={14} />
            Agregar
            <input type="file" accept="audio/*" multiple className="hidden"
              onChange={(e) => e.target.files && onLoadFiles(e.target.files)} />
          </label>
          <button
            onClick={onLoadFolder}
            className="flex-shrink-0 flex items-center gap-2 px-5 py-2 rounded-full transition-colors hover:bg-white/10"
            style={{ background: "#282828", color: "#fff", fontSize: 13, fontWeight: 500 }}
          >
            <FolderOpen size={14} />
            Carpeta
          </button>
        </div>
      </div>

      {filteredTracks.length > 0 && (
        <div className="px-4 pb-2" style={{ flexShrink: 0 }}>
          <p style={{ fontSize: 12, color: "#a7a7a7" }}>
            {filteredTracks.length} {filteredTracks.length === 1 ? "canción" : "canciones"}
            {visibleCount < filteredTracks.length && (
              <span style={{ color: "#535353" }}> • Mostrando {visibleCount}</span>
            )}
          </p>
        </div>
      )}

      <div 
        ref={listRef}
        className="flex-1 overflow-y-auto px-4" 
        style={{ overscrollBehavior: "contain" }}
      >
        {filteredTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Music2 size={48} style={{ color: "#535353", marginBottom: 12 }} />
            <p className="text-white mb-1" style={{ fontSize: 15, fontWeight: 600 }}>
              {tracks.length === 0 ? "No hay música" : "Sin resultados"}
            </p>
            <p style={{ fontSize: 13, color: "#a7a7a7", marginBottom: 16 }}>
              {tracks.length === 0
                ? "Agrega archivos de audio para empezar"
                : "Intenta con otro término"}
            </p>
            {tracks.length === 0 && (
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
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1 pb-4">
            {visibleTracks.map((track, i) => {
              const isCurrent = currentTrack?.id === track.id;
              const isLiked = likedIds.has(track.id);
              return (
                <div
                  key={track.id}
                  className="flex items-center gap-3 py-2 px-2 rounded-xl active:bg-white/5 cursor-pointer"
                  onDoubleClick={() => onPlay(track, tracks.indexOf(track))}
                >
                  <div
                    className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden relative"
                    style={{ width: 52, height: 52, background: "#282828" }}
                    onClick={() => onPlay(track, tracks.indexOf(track))}
                  >
                    {track.cover ? (
                      <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music2 size={20} style={{ color: "#535353" }} />
                    )}
                    {isCurrent && (
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ background: "rgba(0,0,0,0.5)" }}
                      >
                        {isPlaying ? (
                          <div className="flex items-end gap-0.5 h-4">
                            {[0, 1, 2].map((b) => (
                              <div
                                key={b}
                                style={{
                                  width: 3,
                                  borderRadius: 2,
                                  background: "#1db954",
                                  animation: `eq-bar 0.8s ease-in-out ${b * 0.15}s infinite alternate`,
                                  height: [12, 8, 14][b],
                                }}
                              />
                            ))}
                          </div>
                        ) : (
                          <Play size={16} fill="#1db954" style={{ color: "#1db954", marginLeft: 2 }} />
                        )}
                      </div>
                    )}
                  </div>

                  <div
                    className="flex-1 min-w-0"
                    onClick={() => onPlay(track, tracks.indexOf(track))}
                  >
                    <p
                      className="truncate"
                      style={{ fontSize: 14, fontWeight: 600, color: isCurrent ? "#1db954" : "#fff" }}
                    >
                      {track.title}
                    </p>
                    <p className="truncate" style={{ fontSize: 12, color: "#a7a7a7" }}>
                      {track.artist}
                      {track.duration > 0 && (
                        <span> · {formatTime(track.duration)}</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center" style={{ gap: 8 }}>
                    <button
                      onClick={() => onLike(track.id)}
                      className="flex-shrink-0"
                      style={{ color: isLiked ? "#1db954" : "#535353", padding: "8px" }}
                    >
                      <Heart size={20} fill={isLiked ? "currentColor" : "none"} />
                    </button>
                    
                    {onSync && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSync(track); }}
                        className="rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
                        title="Sincronizar metadatos"
                        style={{ padding: "8px" }}
                      >
                        <Search size={18} style={{ color: "#a7a7a7" }} />
                      </button>
                    )}
                    
                    {onDelete && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(track); }}
                        className="rounded-full hover:bg-red-500/10 transition-colors flex-shrink-0"
                        title="Eliminar canción"
                        style={{ padding: "8px" }}
                      >
                        <Trash2 size={18} style={{ color: "#ff4444" }} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Loader y elemento para observar */}
            {hasMore && (
              <div ref={loadMoreRef} className="py-4">
                {isLoading ? (
                  <>
                    <TrackSkeleton />
                    <TrackSkeleton />
                    <TrackSkeleton />
                  </>
                ) : (
                  <p style={{ textAlign: "center", color: "#535353", fontSize: 13 }}>
                    Desplázate para cargar más...
                  </p>
                )}
              </div>
            )}

            {/* Mensaje final */}
            {!hasMore && filteredTracks.length > 20 && (
              <p style={{ textAlign: "center", color: "#535353", fontSize: 13, padding: "16px 0" }}>
                🎵 {filteredTracks.length} canciones cargadas
              </p>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes eq-bar {
          from { transform: scaleY(0.4); }
          to { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}