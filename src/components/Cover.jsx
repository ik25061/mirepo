import { useState, useEffect } from 'react';
import { Music2 } from 'lucide-react';
import { coverUrl } from '../lib/api.js';

export default function Cover({ song, size = 'md', rounded = 'rounded-lg', className = '' }) {
  const [failed, setFailed] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const id = song?.coverId || song?.id;
  const showImage = song && song.hasCover !== false && !failed;

  useEffect(() => {
    if (id && showImage) {
      const url = coverUrl(id);
      console.log('[Cover] Cargando imagen:', url);
      setImageUrl(url);
    }
  }, [id, showImage]);

  const iconSize = size === 'lg' ? 48 : size === 'sm' ? 16 : 24;

  return (
    <div
      className={`relative overflow-hidden bg-surface-2 ${rounded} ${className}`}
      aria-hidden="true"
    >
      {showImage && imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          onError={() => {
            console.warn('[Cover] Error cargando imagen:', imageUrl);
            setFailed(true);
          }}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-2 to-muted text-muted-foreground">
          <Music2 size={iconSize} />
        </div>
      )}
    </div>
  );
}