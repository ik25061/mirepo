/**
 * ============================================================
 * DUPLICATE FINDER - BUSCADOR DE CANCIONES DUPLICADAS
 * ============================================================
 * 
 * Permite escanear una carpeta en busca de canciones duplicadas
 * usando metadatos y huella digital (AcoustID).
 */

import { useState, useRef, useEffect } from 'react';
import { FolderOpen, Search, Trash2, AlertTriangle, Loader2, CheckCircle, XCircle, ArrowLeft, Clock } from 'lucide-react';
import { api, serverUrl } from '../lib/api.js';

const DEFAULT_PATH = 'D:\\mreproduccion';

export default function DuplicateFinder({ onBack }) {
  const [folderPath, setFolderPath] = useState(DEFAULT_PATH);
  const [duplicates, setDuplicates] = useState([]);
  const [liveDuplicates, setLiveDuplicates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [progress, setProgress] = useState(0);
  const [deletingIndex, setDeletingIndex] = useState(null);
  const [deletedCount, setDeletedCount] = useState(0);
  const [error, setError] = useState(null);
  const [scanComplete, setScanComplete] = useState(false);
  const eventSourceRef = useRef(null);
  const resultsRef = useRef(null);

  // Limpiar conexión SSE al desmontar
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleScan = async () => {
    if (!folderPath.trim()) {
      setError('Por favor, introduce una ruta de carpeta.');
      return;
    }

    setError(null);
    setDuplicates([]);
    setLiveDuplicates([]);
    setScanComplete(false);
    setProcessed(0);
    setTotal(0);
    setProgress(0);
    setDeletedCount(0);
    setLoading(true);
    setScanning(true);

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const data = await api.scanDuplicates(folderPath);
      
      if (!data.success) {
        setError(data.error || 'Error al iniciar el escaneo');
        setLoading(false);
        setScanning(false);
        return;
      }

      setTotal(data.total);

      const eventSource = new EventSource(`${serverUrl}/api/scan-stream/${data.scanId}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'init':
            setProcessed(msg.processed);
            break;

          case 'progress':
            setProcessed(msg.processed);
            setTotal(msg.total);
            setProgress(msg.total > 0 ? Math.round((msg.processed / msg.total) * 100) : 0);
            break;

          case 'duplicate':
            setLiveDuplicates(prev => [...prev, msg.data]);
            break;

          case 'complete':
            setDuplicates(msg.duplicates);
            setScanComplete(true);
            setScanning(false);
            setLoading(false);
            setProgress(100);
            eventSource.close();
            break;
        }
      };

      eventSource.onerror = () => {
        if (!scanComplete) {
          setError('Se perdió la conexión con el servidor durante el escaneo.');
        }
        setScanning(false);
        setLoading(false);
        eventSource.close();
      };

    } catch (err) {
      setError('Error al conectar con el servidor: ' + err.message);
      setLoading(false);
      setScanning(false);
    }
  };

  const handleDelete = async (filePath, index) => {
    if (!window.confirm('¿Seguro que quieres borrar este archivo duplicado? Se eliminará permanentemente.')) return;

    setDeletingIndex(index);
    try {
      const data = await api.deleteDuplicate(filePath);
      if (data.success) {
        setDuplicates(prev => prev.filter((_, i) => i !== index));
        setLiveDuplicates(prev => prev.filter((_, i) => i !== index));
        setDeletedCount(prev => prev + 1);
      } else {
        alert('Error: ' + (data.error || 'No se pudo eliminar el archivo'));
      }
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    } finally {
      setDeletingIndex(null);
    }
  };

  const handleDeleteAll = async () => {
    const currentDuplicates = scanComplete ? duplicates : liveDuplicates;
    if (!window.confirm(`¿Seguro que quieres borrar TODOS los ${currentDuplicates.length} duplicados? Se eliminarán permanentemente.`)) return;

    setLoading(true);
    let removed = 0;
    for (let i = currentDuplicates.length - 1; i >= 0; i--) {
      try {
        await api.deleteDuplicate(currentDuplicates[i].duplicate.path);
        removed++;
      } catch (err) {
        console.error('Error eliminando:', currentDuplicates[i].title, err);
      }
    }
    setDuplicates([]);
    setLiveDuplicates([]);
    setDeletedCount(prev => prev + removed);
    setLoading(false);
  };

  const currentDuplicates = scanComplete ? duplicates : liveDuplicates;
  const hasResults = currentDuplicates.length > 0;

  return (
    <div className="flex flex-col h-full w-full animate-fade-in">
      
      {/* ===== HEADER ===== */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground transition"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-700 tracking-tight text-white sm:text-2xl">Buscar Duplicados</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Encuentra y elimina canciones duplicadas en tu biblioteca
          </p>
        </div>
      </div>

      {/* ===== INPUT SECTION ===== */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface flex-1 w-full">
          <FolderOpen size={18} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Ej: C:\Usuarios\TuNombre\Musica"
            value={folderPath}
            onChange={(e) => {
              setFolderPath(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            className="flex-1 bg-transparent text-white outline-none text-sm min-w-0"
            disabled={scanning}
          />
        </div>
        <button
          onClick={handleScan}
          disabled={loading || !folderPath.trim()}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Escaneando...
            </>
          ) : (
            <>
              <Search size={18} />
              Buscar Duplicados
            </>
          )}
        </button>
      </div>

      {/* ===== ERROR ===== */}
      {error && (
        <div className="flex items-center gap-2 mb-4 py-3 px-4 rounded-xl bg-danger/10 text-danger text-sm">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* ===== PROGRESS BAR ===== */}
      {scanning && (
        <div className="mb-5 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin text-primary" />
              <span>Analizando archivos de audio...</span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {processed.toLocaleString()} / {total.toLocaleString()}
              {total > 0 && (
                <span className="text-primary ml-1">({progress}%)</span>
              )}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          {liveDuplicates.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-danger">
              <AlertTriangle size={12} />
              <span>
                {liveDuplicates.length} duplicado{liveDuplicates.length !== 1 ? 's' : ''} encontrado{liveDuplicates.length !== 1 ? 's' : ''} hasta ahora
              </span>
            </div>
          )}
        </div>
      )}

      {/* ===== RESULTS ===== */}
      {hasResults && (
        <div className="flex-1 overflow-y-auto" ref={resultsRef}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-muted-foreground">
              {scanComplete ? (
                <>
                  {duplicates.length} {duplicates.length === 1 ? 'duplicado encontrado' : 'duplicados encontrados'}
                </>
              ) : (
                <>
                  {liveDuplicates.length} {liveDuplicates.length === 1 ? 'duplicado' : 'duplicados'} en vivo
                </>
              )}
              {deletedCount > 0 && (
                <span className="text-primary ml-2">
                  · {deletedCount} eliminado{deletedCount !== 1 ? 's' : ''}
                </span>
              )}
            </h2>
            {scanComplete && duplicates.length > 0 && (
              <button
                onClick={handleDeleteAll}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger/20 text-danger text-xs font-medium hover:bg-danger/30 transition disabled:opacity-50"
              >
                <Trash2 size={14} />
                Eliminar todos
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 pb-4">
            {currentDuplicates.map((item, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 p-4 rounded-xl bg-surface border border-border transition hover:border-muted animate-fade-in"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-600 text-white truncate">
                      {item.artist} — {item.title}
                    </p>
                    <p className={`text-xs mt-1 flex items-center gap-1 ${item.autoDeleted ? 'text-primary' : 'text-danger'}`}>
                      {item.autoDeleted ? (
                        <CheckCircle size={12} />
                      ) : (
                        <AlertTriangle size={12} />
                      )}
                      {item.reason}
                    </p>
                  </div>
                  {scanComplete && !item.autoDeleted && (
                    <button
                      onClick={() => handleDelete(item.duplicate.path, index)}
                      disabled={deletingIndex === index}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-danger/20 text-danger text-xs font-medium hover:bg-danger/30 transition shrink-0 disabled:opacity-50 min-w-[100px] justify-center"
                    >
                      {deletingIndex === index ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                      {deletingIndex === index ? 'Eliminando...' : 'Eliminar copia'}
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1 text-xs text-muted-foreground bg-background/50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-primary shrink-0" />
                    <span className="truncate">
                      <span className="text-foreground font-medium">Mantener:</span> {item.original.name}
                      <span className="ml-2 opacity-60">({item.original.bitrate} kbps)</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <XCircle size={14} className="text-danger shrink-0" />
                    <span className="truncate">
                      <span className="text-foreground font-medium">Descartar:</span> {item.duplicate.name}
                      <span className="ml-2 opacity-60">({item.duplicate.bitrate} kbps)</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== SCANNING WITHOUT RESULTS ===== */}
      {scanning && !hasResults && (
        <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-4">
            <Clock size={32} className="text-primary animate-pulse" />
          </div>
          <p className="text-white font-medium mb-1">Escaneando archivos de audio...</p>
          <p className="text-muted-foreground text-sm">
            Buscando coincidencias por artista y título en todas las carpetas.
          </p>
        </div>
      )}

      {/* ===== NO DUPLICATES ===== */}
      {!scanning && scanComplete && duplicates.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-4">
            <CheckCircle size={32} className="text-primary" />
          </div>
          <p className="text-white font-medium mb-1">¡Sin duplicados!</p>
          <p className="text-muted-foreground text-sm">
            No se encontraron canciones duplicadas en esta carpeta.
          </p>
        </div>
      )}

      {/* ===== INITIAL STATE ===== */}
      {!scanning && !scanComplete && !error && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-4">
            <Search size={32} className="text-muted-foreground" />
          </div>
          <p className="text-white font-medium mb-1">Escanea tu biblioteca</p>
          <p className="text-muted-foreground text-sm max-w-xs">
            Introduce la ruta de la carpeta donde tienes tu música y presiona "Buscar Duplicados".
          </p>
        </div>
      )}
    </div>
  );
}