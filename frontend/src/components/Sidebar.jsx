import { Home, Library, Disc3, Trash2, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ view, onNavigate, trashCount = 0 }) {
  const { user, logout } = useAuth();

  const items = [
    { id: 'home', label: 'Inicio', icon: Home },
    { id: 'library', label: 'Biblioteca', icon: Library },
  ];

  return (
    <aside className="flex w-16 shrink-0 flex-col gap-2 border-r border-border bg-surface px-2 py-4 sm:w-60 sm:px-3" style={{ background: '#0d0d0d', borderColor: '#282828' }}>
      <div className="mb-4 flex items-center gap-2 px-1 sm:px-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground" style={{ background: '#1db954' }}>
          <Disc3 size={20} className="text-black" />
        </div>
        <span className="hidden font-display text-lg font-700 tracking-tight sm:block text-white">Lumina</span>
      </div>

      <nav className="flex flex-col gap-1">
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
              style={{
                background: active ? '#282828' : 'transparent',
                color: active ? '#fff' : '#a7a7a7',
              }}
            >
              <Icon size={20} className={active ? 'text-primary' : ''} style={{ color: active ? '#1db954' : '#a7a7a7' }} />
              <span className="hidden sm:block">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2">
        {/* Información del usuario */}
        {user && (
          <div className="hidden rounded-lg border border-border bg-surface-2 p-3 sm:block" style={{ borderColor: '#282828', background: '#1a1a1a' }}>
            <div className="flex items-center gap-2">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-black font-bold">
                  {user.name?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate" style={{ color: '#727272' }}>{user.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Papelera */}
        <div className="hidden rounded-lg border border-border bg-surface-2 p-3 sm:block" style={{ borderColor: '#282828', background: '#1a1a1a' }}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground" style={{ color: '#727272' }}>
            <Trash2 size={14} />
            <span>
              Papelera: {trashCount} {trashCount === 1 ? 'archivo' : 'archivos'}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground" style={{ color: '#535353' }}>
            Las canciones eliminadas se mueven a la papelera para su borrado manual.
          </p>
        </div>

        {/* Botón de cerrar sesión */}
        <button
          onClick={logout}
          className="hidden w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-surface-2 hover:text-foreground sm:flex"
          style={{ color: '#a7a7a7' }}
        >
          <LogOut size={16} />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}