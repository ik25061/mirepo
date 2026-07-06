/**
 * ============================================================
 * ADD TO PLAYLIST MODAL - MODAL PARA AGREGAR CANCIÓN A LISTA
 * ============================================================
 * 
 * Modal que permite al usuario seleccionar una lista de
 * reproducción para agregar la canción actual.
 */

import { useState, useEffect } from 'react';
import { X, Plus, ListMusic, Check } from 'lucide-react';
import { api } from '../lib/api.js';

export default function AddToPlayListModal({ song, userId, onClose, onAdded }) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getPlayLists(userId);
        setPlaylists(data.playlists || []);
      } catch (err) {
        console.error('Error cargando playlists:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const handleAdd = async (playlistId) => {
    if (!song) return;
    setAdding(playlistId);
    try {
      await api.addSongToPlayList(playlistId, song.id);
      await new Promise(r => setTimeout(r, 800));
      onAdded?.(playlistId);
    } catch (err) {
      console.error('Error agregando a playlist:', err);
    } finally {
      setAdding(null);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newName.trim() || !song) return;
    try {
      const data = await api.createPlayList(newName, '', userId);
      const pl = data.playlist;
      await api.addSongToPlayList(pl.id, song.id);
      onAdded?.(pl.id);
      onClose();
    } catch (err) {
      console.error('Error creando y agregando:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative w-full max-w-sm rounded-t-2xl bg-surface p-5 shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            Agregar a lista
          </h3>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-surface-2"
          >
            <X size={16} />
          </button>
        </div>

        {/* Canción actual */}
        {song && (
          <div className="mb-4 flex items-center gap-3 rounded-lg bg-surface-2 p-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{song.title}</p>
              <p className="truncate text-[10px] text-muted-foreground">{song.artist}</p>
            </div>
          </div>
        )}

        {/* Lista de playlists */}
        <div className="max-h-56 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
            </div>
          ) : playlists.length > 0 ? (
            <div className="flex flex-col gap-1">
              {playlists.map(pl => (
                <button
                  key={pl.id}
                  onClick={() => handleAdd(pl.id)}
                  disabled={adding === pl.id}
                  className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm text-foreground transition hover:bg-surface-2 disabled:opacity-70"
                >
                  <ListMusic size={16} className="shrink-0 text-blue-400" />
                  <span className="flex-1 truncate">{pl.name}</span>
                  {adding === pl.id ? (
                    <Check size={16} className="shrink-0 text-primary" />
                  ) : (
                    <Plus size={14} className="shrink-0 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No hay listas disponibles
            </p>
          )}
        </div>

        {/* Crear nueva lista */}
        {showNewForm ? (
          <div className="mt-3 border-t border-border pt-3">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nombre de la nueva lista"
              className="w-full rounded-lg bg-surface-2 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-primary"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreateAndAdd()}
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleCreateAndAdd}
                disabled={!newName.trim()}
                className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Crear y agregar
              </button>
              <button
                onClick={() => { setShowNewForm(false); setNewName(''); }}
                className="rounded-full bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNewForm(true)}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-primary transition hover:bg-surface-2"
          >
            <Plus size={16} /> Nueva lista
          </button>
        )}
      </div>
    </div>
  );
}