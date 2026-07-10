import { Home, Search, Library, Music2, Download } from 'lucide-react';

export default function BottomNav({ activeView, onViewChange, hasCurrentTrack }) {
  const tabs = [
    { id: 'home', label: 'Inicio', icon: Home },
    { id: 'search', label: 'Buscar', icon: Search },
    { id: 'library', label: 'Biblioteca', icon: Library },
    { id: 'downloads', label: 'Descargas', icon: Download }, // <-- NUEVO
    { id: 'nowplaying', label: 'Reproduciendo', icon: Music2 },
  ];

  return (
    <div
      className="flex items-center w-full flex-shrink-0"
      style={{
        height: 64,
        minHeight: 64,
        background: '#121212',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        position: 'relative',
        zIndex: 10,
        overflow: 'hidden',
      }}
    >
      <div className="flex items-center justify-around flex-1 min-w-0" style={{ gap: 1 }}>
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeView === id;
          const isNowPlaying = id === 'nowplaying';
          return (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              className="flex flex-col items-center justify-center flex-1 min-w-0"
              style={{ 
                color: isActive ? '#fff' : '#a7a7a7',
                minHeight: 44,
                touchAction: 'manipulation',
                gap: 2,
                padding: '6px 1px 4px',
                overflow: 'hidden',
                flexBasis: 0,
              }}
            >
              <Icon
                size={isNowPlaying ? 20 : 18}
                fill={isActive && isNowPlaying && hasCurrentTrack ? 'currentColor' : 'none'}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span style={{ fontSize: 'clamp(7px, 2.5vw, 10px)', fontWeight: isActive ? 700 : 500, lineHeight: 1.2, letterSpacing: '0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}