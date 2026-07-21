/**
 * ============================================================
 * DOWNLOAD ALL BUTTON - DESCARGA MASIVA DE CANCIONES
 * ============================================================
 */

import { useState } from 'react';
import { Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useDownload } from '../context/DownloadContext';

export default function DownloadAllButton({ songs, onComplete }) {
  const { downloadSongs, isDownloading, downloadProgress, downloadedIds } = useDownload();
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState(null);

  const allDownloaded = songs.every(s => downloadedIds.has(s.id));
  const visibleSongs = songs;
  const downloadableCount = visibleSongs.filter(s => !downloadedIds.has(s.id)).length;

  const handleDownloadAll = async () => {
    if (isDownloading || downloadableCount === 0) return;
    
    setShowResult(false);
    const result = await downloadSongs(visibleSongs);
    
    setResult(result);
    setShowResult(true);
    if (onComplete) onComplete(result);
    
    setTimeout(() => setShowResult(false), 5000);
  };

  if (allDownloaded) {
    return (
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-2 text-muted-foreground text-sm font-medium opacity-60 cursor-not-allowed"
      >
        <CheckCircle size={16} className="text-primary" />
        Todas descargadas
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleDownloadAll}
        disabled={isDownloading || downloadableCount === 0}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${
          isDownloading 
            ? 'bg-primary/20 text-primary cursor-wait'
            : downloadableCount > 0 
              ? 'bg-primary text-primary-foreground hover:brightness-110'
              : 'bg-surface-2 text-muted-foreground opacity-50 cursor-not-allowed'
        }`}
      >
        {isDownloading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Descargando {downloadProgress.current}/{downloadProgress.total}
          </>
        ) : (
          <>
            <Download size={16} />
             {downloadableCount}
          </>
        )}
      </button>

      {showResult && result && (
        <div className="flex items-center gap-2 text-xs">
          {result.failedIds.length === 0 ? (
            <span className="text-primary">✅ {result.successCount} descargadas</span>
          ) : (
            <span className="text-danger">⚠️ {result.successCount} descargadas, {result.failedIds.length} fallaron</span>
          )}
        </div>
      )}
    </div>
  );
}