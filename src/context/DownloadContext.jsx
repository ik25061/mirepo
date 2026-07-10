/**
 * ============================================================
 * DOWNLOAD CONTEXT - PROVEEDOR DE ESTADO DE DESCARGAS
 * ============================================================
 */

import { createContext, useContext } from 'react';
import { useDownloads } from '../hooks/useDownloads';

const DownloadContext = createContext(null);

export function DownloadProvider({ children }) {
  const downloads = useDownloads();
  
  return (
    <DownloadContext.Provider value={downloads}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownload() {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownload debe usarse dentro de DownloadProvider');
  }
  return context;
}