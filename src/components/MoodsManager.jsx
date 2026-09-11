import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function MoodsManager({ userId, onOpenSongs }) {
  const [moods, setMoods] = useState([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#8b5cf6');
  const load = async () => {
    try { const d = await api.getMoods(); setMoods(d.moods || []); } catch (e) {}
  };
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!name.trim()) return;
    try { await api.createMood(name.trim(), color); setName(''); await load(); } catch (e) { alert(e.message); }
  };
  const remove = async (id) => {
    if (!confirm('Eliminar animo?')) return;
    try { await api.deleteMood(id); await load(); } catch (e) { alert(e.message); }
  };
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4">
      <h3 className="text-sm font-bold">Estados de animo ({moods.length})</h3>
      <div className="mt-2 flex gap-2 text-xs">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Fiesta, Relax..." className="flex-1 rounded bg-surface-2 px-2 py-1.5" onKeyDown={e => e.key === 'Enter' && create()} />
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-10 rounded" />
        <button onClick={create} className="rounded-full bg-primary px-3 py-1.5 font-bold">Crear</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {moods.map(m => (
          <span key={m.id} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs" style={{ background: (m.color || '#8b5cf6') + '33', border: `1px solid ${m.color || '#8b5cf6'}` }}>
            <button onClick={() => onOpenSongs?.(m)}>{m.name} ({m.song_count})</button>
            <button onClick={() => remove(m.id)} className="ml-1 opacity-60 hover:opacity-100">x</button>
          </span>
        ))}
        {moods.length === 0 && <p className="text-xs text-muted-foreground">Sin animos. Crea el primero.</p>}
      </div>
    </div>
  );
}