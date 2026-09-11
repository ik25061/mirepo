import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function MetadataEditor({ song, onClose, onSaved }) {
  const [form, setForm] = useState({ title: song?.title || '', artist: song?.artist || '', album: song?.album || '', year: song?.year || '', track: song?.track || '', genres: (song?.genre || []).join(', '), moods: (song?.moods || []).map(m => m.name).join(', '), writeId3: false });
  const [moods, setMoods] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.getMoods().then(d => setMoods(d.moods || [])).catch(() => {}); }, []);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      const payload = { title: form.title, artist: form.artist, album: form.album, year: form.year ? +form.year : null, track: form.track ? +form.track : null, genres: String(form.genres).split(',').map(s => s.trim()).filter(Boolean), moods: String(form.moods).split(',').map(s => s.trim()).filter(Boolean), writeId3: form.writeId3 };
      const r = await api.updateSong(song.id, payload);
      onSaved?.(r.song);
      onClose?.();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-4">
        <h3 className="text-sm font-bold">Editar metadatos</h3>
        <div className="mt-2 flex flex-col gap-2 text-xs">
          <label>Titulo<input value={form.title} onChange={e => set('title', e.target.value)} className="mt-1 w-full rounded bg-surface-2 px-2 py-1.5" /></label>
          <label>Artista<input value={form.artist} onChange={e => set('artist', e.target.value)} className="mt-1 w-full rounded bg-surface-2 px-2 py-1.5" /></label>
          <label>Album<input value={form.album} onChange={e => set('album', e.target.value)} className="mt-1 w-full rounded bg-surface-2 px-2 py-1.5" /></label>
          <div className="flex gap-2">
            <label className="flex-1">Ano<input value={form.year} onChange={e => set('year', e.target.value)} className="mt-1 w-full rounded bg-surface-2 px-2 py-1.5" /></label>
            <label className="flex-1">Track<input value={form.track} onChange={e => set('track', e.target.value)} className="mt-1 w-full rounded bg-surface-2 px-2 py-1.5" /></label>
          </div>
          <label>Generos (coma)<input value={form.genres} onChange={e => set('genres', e.target.value)} placeholder="Rock, Pop" className="mt-1 w-full rounded bg-surface-2 px-2 py-1.5" /></label>
          <label>Animos (coma)<input value={form.moods} onChange={e => set('moods', e.target.value)} placeholder="Fiesta, Relax" className="mt-1 w-full rounded bg-surface-2 px-2 py-1.5" /></label>
          {moods.length > 0 && <div className="flex flex-wrap gap-1">{moods.map(m => <button key={m.id} onClick={() => set('moods', form.moods ? form.moods + ', ' + m.name : m.name)} className="rounded-full bg-surface-2 px-2 py-0.5">{m.name}</button>)}</div>}
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.writeId3} onChange={e => set('writeId3', e.target.checked)} /> Escribir tambien en MP3 (ID3)</label>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full bg-surface-2 px-4 py-1.5 text-xs">Cancelar</button>
          <button onClick={save} disabled={saving} className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}