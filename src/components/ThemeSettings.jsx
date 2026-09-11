import { useState, useEffect } from 'react';
import { useTheme, GRADIENT_PRESETS, FONT_OPTIONS, DEFAULT_THEME } from '../context/ThemeContext.jsx';

export default function ThemeSettings({ userId, onBack }) {
  const { theme, updateTheme, setTheme } = useTheme();
  const [local, setLocal] = useState(theme);
  useEffect(() => setLocal(theme), [theme]);
  const patch = (p) => { setLocal(prev => ({ ...prev, ...p })); updateTheme(p); };
  const onImage = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { alert('Max 2MB'); return; }
    const r = new FileReader();
    r.onload = () => patch({ bgImage: r.result, bgMode: 'image' });
    r.readAsDataURL(f);
  };
  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center gap-2">
        {onBack && <button onClick={onBack} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs">Atras</button>}
        <h2 className="text-lg font-bold">Apariencia</h2>
      </div>
      <section className="rounded-xl border border-border bg-surface/50 p-4">
        <h3 className="text-sm font-semibold">Fondo</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {[['solid', 'Color'], ['gradient-preset', 'Degradado'], ['gradient-custom', 'Degradado propio'], ['image', 'Imagen']].map(([v, l]) => (
            <button key={v} onClick={() => patch({ bgMode: v })} className={`rounded-full px-3 py-1.5 text-xs ${local.bgMode === v ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
        {local.bgMode === 'solid' && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <input type="color" value={local.bgColor} onChange={e => patch({ bgColor: e.target.value })} className="h-10 w-14 rounded" />
            <span>{local.bgColor}</span>
          </div>
        )}
        {local.bgMode === 'gradient-preset' && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {Object.entries(GRADIENT_PRESETS).map(([id, p]) => (
              <button key={id} onClick={() => patch({ gradientPreset: id })} className={`rounded-lg border p-2 text-left text-xs ${local.gradientPreset === id ? 'border-primary' : 'border-border'}`}>
                <div className="h-10 rounded" style={{ background: `linear-gradient(${p.angle}deg, ${p.from}, ${p.to})` }} />
                <p className="mt-1">{p.label}</p>
              </button>
            ))}
          </div>
        )}
        {local.bgMode === 'gradient-custom' && (
          <div className="mt-3 flex flex-col gap-2 text-xs">
            <label>Desde <input type="color" value={local.gradientCustom?.from} onChange={e => patch({ gradientCustom: { ...(local.gradientCustom || {}), from: e.target.value } })} /></label>
            <label>Hasta <input type="color" value={local.gradientCustom?.to} onChange={e => patch({ gradientCustom: { ...(local.gradientCustom || {}), to: e.target.value } })} /></label>
            <label>Angulo {local.gradientCustom?.angle}° <input type="range" min="0" max="360" value={local.gradientCustom?.angle || 135} onChange={e => patch({ gradientCustom: { ...(local.gradientCustom || {}), angle: +e.target.value } })} className="w-full" /></label>
          </div>
        )}
        {local.bgMode === 'image' && (
          <div className="mt-3 flex flex-col gap-2 text-xs">
            <input type="file" accept="image/*" onChange={onImage} />
            {local.bgImage && <img src={local.bgImage} alt="fondo" className="h-24 w-full rounded object-cover" />}
            <label>Superposicion <input type="color" value={local.bgOverlayColor} onChange={e => patch({ bgOverlayColor: e.target.value })} /></label>
            <label>Transparencia {Math.round((local.bgOverlayOpacity ?? 0.55) * 100)}% <input type="range" min="0" max="1" step="0.05" value={local.bgOverlayOpacity ?? 0.55} onChange={e => patch({ bgOverlayOpacity: +e.target.value })} className="w-full" /></label>
            <label>Difuminado {local.bgBlur}px <input type="range" min="0" max="30" value={local.bgBlur ?? 8} onChange={e => patch({ bgBlur: +e.target.value })} className="w-full" /></label>
          </div>
        )}
      </section>
      <section className="rounded-xl border border-border bg-surface/50 p-4 text-xs">
        <h3 className="text-sm font-semibold">Texto</h3>
        <label>Fuente <select value={local.fontFamily} onChange={e => patch({ fontFamily: e.target.value })} className="ml-2 rounded bg-surface-2 px-2 py-1">
          {FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select></label>
        <label className="mt-2 block">Tamano {Math.round((local.fontScale || 1) * 100)}% <input type="range" min="0.85" max="1.3" step="0.05" value={local.fontScale || 1} onChange={e => patch({ fontScale: +e.target.value })} className="w-full" /></label>
        <button onClick={() => { setTheme({ ...DEFAULT_THEME }); updateTheme({ ...DEFAULT_THEME }); }} className="mt-2 w-fit rounded-full bg-surface-2 px-3 py-1.5">Restablecer</button>
        {!userId && <p className="mt-2 text-muted-foreground">Sin sesion: solo navegador.</p>}
      </section>
    </div>
  );
}