import { Home, Library, Disc3, Trash2, Search, Heart, ListMusic, Download } from 'lucide-react';

export default function Sidebar({ view, onNavigate, trashCount = 0 }) {
  const items = [
    { id: 'home', label: 'Inicio', icon: Home },
    { id: 'search', label: 'Buscar', icon: Search },
    { id: 'library', label: 'Biblioteca', icon: Library },
    { id: 'downloads', label: 'Descargas', icon: Download },
    { id: 'ai', label: 'Asistente IA', icon: () => '🤖' },
    { id: 'likedSongs', label: 'Me gusta', icon: Heart },
    { id: 'playlists', label: 'Listas', icon: ListMusic },
  ];

  return (
    <aside className="flex w-16 shrink-0 flex-col gap-2 border-r border-border bg-surface px-2 py-5 sm:w-64 sm:px-4 sm:py-6">
      <div className="mb-6 flex items-center gap-3 px-1 sm:px-2">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Disc3 size={22} />
        </div>
        <span className="hidden font-display text-xl font-700 tracking-tight sm:block">Mirepo</span>
      </div>
      <nav className="flex flex-col gap-1.5">
        {items.map(({ id, label, icon: Icon }) => {
          const active = view?.type === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate({ type: id })}
              className={`flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm font-medium transition sm:px-3 ${
                active
                  ? 'bg-surface-2 text-foreground'
                  : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
              }`}
            >
              <Icon size={20} className={active ? 'text-primary' : ''} />
              <span className="hidden sm:block">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto hidden rounded-lg border border-border bg-surface-2 p-3 sm:block">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Trash2 size={14} />
          <span>
            Papelera: {trashCount} {trashCount === 1 ? 'archivo' : 'archivos'}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Las canciones eliminadas se mueven a <code className="text-foreground">/music/trash</code>
        </p>
      </div>
    </aside>
  );
}