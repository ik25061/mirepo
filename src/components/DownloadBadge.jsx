/**
 * ============================================================
 * DOWNLOAD BADGE - INDICADOR DE CANCIÓN DESCARGADA
 * ============================================================
 */

import { Download } from 'lucide-react';

export default function DownloadBadge({ size = 'sm', className = '' }) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  
  return (
    <div 
      className={`absolute top-1 right-1 rounded-full bg-primary flex items-center justify-center ${className}`}
      style={{ width: size === 'sm' ? 16 : 20, height: size === 'sm' ? 16 : 20 }}
    >
      <Download 
        size={size === 'sm' ? 10 : 14} 
        className="text-primary-foreground"
        fill="currentColor"
      />
    </div>
  );
}