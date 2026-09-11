import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../lib/api';

export const GRADIENT_PRESETS = {
  midnight: { from: '#0f2027', to: '#2c5364', angle: 135, label: 'Medianoche' },
  sunset: { from: '#ff512f', to: '#dd2476', angle: 135, label: 'Atardecer' },
  ocean: { from: '#2193b0', to: '#6dd5ed', angle: 135, label: 'Oceano' },
  forest: { from: '#134e5e', to: '#71b280', angle: 135, label: 'Bosque' },
  neon: { from: '#1db954', to: '#191414', angle: 135, label: 'Neon' },
  grape: { from: '#654ea3', to: '#eaafc8', angle: 135, label: 'Uva' },
};

export const FONT_OPTIONS = [
  { id: 'system', label: 'Sistema', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: 'inter', label: 'Inter', stack: "'Inter', system-ui, sans-serif" },
  { id: 'roboto', label: 'Roboto', stack: "'Roboto', system-ui, sans-serif" },
  { id: 'poppins', label: 'Poppins', stack: "'Poppins', system-ui, sans-serif" },
  { id: 'space-grotesk', label: 'Space Grotesk', stack: "'Space Grotesk', system-ui, sans-serif" },
  { id: 'serif', label: 'Serif', stack: "Georgia, 'Times New Roman', serif" },
];

export const DEFAULT_THEME = {
  bgMode: 'solid',
  bgColor: '#121212',
  gradientPreset: 'midnight',
  gradientCustom: { from: '#1db954', to: '#121212', angle: 135 },
  bgImage: null,
  bgOverlayColor: '#000000',
  bgOverlayOpacity: 0.55,
  bgBlur: 8,
  fontFamily: 'system',
  fontScale: 1,
};

const ThemeContext = createContext(null);
const LS_KEY = 'mirepo_theme';

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) };
  } catch (e) { /* ignorar */ }
  return { ...DEFAULT_THEME };
}

export function themeToCss(theme) {
  const t = { ...DEFAULT_THEME, ...(theme || {}) };
  let background = t.bgColor || '#121212';
  if (t.bgMode === 'gradient-preset') {
    const p = GRADIENT_PRESETS[t.gradientPreset] || GRADIENT_PRESETS.midnight;
    background = `linear-gradient(${p.angle}deg, ${p.from}, ${p.to})`;
  } else if (t.bgMode === 'gradient-custom') {
    const g = t.gradientCustom || DEFAULT_THEME.gradientCustom;
    background = `linear-gradient(${g.angle || 135}deg, ${g.from}, ${g.to})`;
  } else if (t.bgMode === 'image' && t.bgImage) {
    background = t.bgColor || '#121212';
  }
  const font = FONT_OPTIONS.find(f => f.id === t.fontFamily) || FONT_OPTIONS[0];
  return { background, fontStack: font.stack };
}

export function ThemeProvider({ userId, children }) {
  const [theme, setTheme] = useState(() => loadLocal());
  const [bgImageUrl, setBgImageUrl] = useState(null);

  useEffect(() => {
    let alive = true;
    if (userId) {
      api.getUserSettings(userId).then(d => {
        if (alive && d?.settings) {
          setTheme(prev => ({ ...prev, ...d.settings }));
          try { localStorage.setItem(LS_KEY, JSON.stringify({ ...theme, ...d.settings })); } catch (e) {}
        }
      }).catch(() => {});
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(theme)); } catch (e) {}
    const css = themeToCss(theme);
    const root = document.documentElement;
    root.style.setProperty('--app-bg', css.background);
    root.style.setProperty('--app-font', css.fontStack);
    root.style.setProperty('--app-font-scale', String(theme.fontScale || 1));
    document.body.style.fontFamily = css.fontStack;
    document.body.style.fontSize = `${16 * (theme.fontScale || 1)}px`;
    if (theme.bgMode === 'image' && theme.bgImage) setBgImageUrl(theme.bgImage);
    else setBgImageUrl(null);
  }, [theme]);

  const updateTheme = useCallback(async (patch) => {
    setTheme(prev => ({ ...prev, ...(patch || {}) }));
    if (userId) {
      try {
        const d = await api.updateUserSettings(userId, patch || {});
        if (d?.settings) setTheme(prev => ({ ...prev, ...d.settings }));
      } catch (e) { console.warn('[theme] no se pudo guardar en servidor:', e.message); }
    }
  }, [userId]);

  const value = useMemo(() => {
    const css = themeToCss(theme);
    const overlay = theme.bgMode === 'image' && theme.bgImage
      ? `linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0)), linear-gradient(${hexToRgba(theme.bgOverlayColor, theme.bgOverlayOpacity)}, ${hexToRgba(theme.bgOverlayColor, theme.bgOverlayOpacity)})`
      : null;
    return { theme, css, bgImageUrl, overlay, updateTheme, setTheme };
  }, [theme, bgImageUrl, updateTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function hexToRgba(hex, alpha) {
  let h = String(hex || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha ?? 0.55})`;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}