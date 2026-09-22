// components/Sidebar.jsx
import {
  Home,
  Search,
  Library,
  Plus,
  Music2,
  Heart,
  Clock,
  ListMusic,
} from "lucide-react";

export function Sidebar({ activeView, onViewChange, playlists, onCreatePlaylist }) {
  const navItems = [
    { id: "home", label: "Inicio", icon: Home },
    { id: "search", label: "Buscar", icon: Search },
    { id: "library", label: "Tu biblioteca", icon: Library },
  ];

  const quickLinks = [
    { id: "liked", label: "Canciones que te gustan", icon: Heart },
    { id: "recent", label: "Reproducidas recientemente", icon: Clock },
  ];

  return (
    <aside className="flex flex-col h-full bg-black" style={{ width: 240 }}>
      <div className="flex items-center gap-2 px-6 py-6">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary">
          <Music2 size={16} className="text-black" />
        </div>
        <span className="text-white" style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>
          LocalTunes
        </span>
      </div>

      <nav className="px-3 mb-4">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={`w-full flex items-center gap-4 px-3 py-2.5 rounded-md transition-all duration-150 ${
              activeView === id
                ? "text-white bg-secondary"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <Icon size={20} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
          </button>
        ))}
      </nav>

      <div className="mx-4 border-t border-border mb-4" />

      <nav className="px-3 mb-4">
        {quickLinks.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={`w-full flex items-center gap-4 px-3 py-2.5 rounded-md transition-all duration-150 ${
              activeView === id
                ? "text-white bg-secondary"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <Icon size={18} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
          </button>
        ))}
      </nav>

      <div className="mx-4 border-t border-border mb-4" />

      <div className="flex-1 overflow-y-auto px-3">
        <div className="flex items-center justify-between px-3 mb-3">
          <span className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Listas
          </span>
          <button
            onClick={onCreatePlaylist}
            className="text-muted-foreground hover:text-white transition-colors p-1 rounded"
          >
            <Plus size={16} />
          </button>
        </div>

        {playlists.map((pl) => (
          <button
            key={pl.id}
            onClick={() => onViewChange(`playlist-${pl.id}`)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-150 ${
              activeView === `playlist-${pl.id}`
                ? "text-white bg-secondary"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <ListMusic size={15} />
            <div className="flex-1 text-left min-w-0">
              <div className="truncate" style={{ fontSize: 13, fontWeight: 500 }}>{pl.name}</div>
              <div style={{ fontSize: 11 }} className="text-muted-foreground">{pl.count} canciones</div>
            </div>
          </button>
        ))}

        {playlists.length === 0 && (
          <div className="px-3 py-6 text-center">
            <p className="text-muted-foreground" style={{ fontSize: 12 }}>
              No hay listas aún.
            </p>
            <button
              onClick={onCreatePlaylist}
              className="mt-2 text-primary hover:text-white transition-colors"
              style={{ fontSize: 12, fontWeight: 600 }}
            >
              Crear lista
            </button>
          </div>
        )}
      </div>

      <div className="px-6 py-4">
        <p className="text-muted-foreground" style={{ fontSize: 10, lineHeight: 1.4 }}>
          Solo usa archivos locales de tu PC
        </p>
      </div>
    </aside>
  );
}