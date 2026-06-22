import { Home, Search, Library, Music2 } from 'lucide-react';

export function BottomNav({ activeView, onViewChange, hasCurrentTrack }) {
  const tabs = [
    { id: 'home', label: 'Inicio', icon: Home },
    { id: 'search', label: 'Buscar', icon: Search },
    { id: 'library', label: 'Tu biblioteca', icon: Library },
    { id: 'nowplaying', label: 'Reproduciendo', icon: Music2 },
  ];

  return (
    <div
      className="flex items-center justify-around w-full"
      style={{
        height: 64,
        minHeight: 64,
        background: '#121212',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
      }}
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = activeView === id;
        const isNowPlaying = id === 'nowplaying';
        return (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className="flex flex-col items-center justify-center flex-1"
            style={{ 
              color: isActive ? '#fff' : '#a7a7a7',
              minHeight: 44,
              touchAction: 'manipulation',
              gap: 3,
              padding: '6px 0 4px',
            }}
          >
            <Icon
              size={isNowPlaying ? 20 : 18}
              fill={isActive && isNowPlaying && hasCurrentTrack ? 'currentColor' : 'none'}
              strokeWidth={isActive ? 2.5 : 1.8}
            />
            <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, lineHeight: 1.2, letterSpacing: '0.02em' }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
