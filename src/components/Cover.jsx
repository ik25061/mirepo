import { useState } from 'react';
import { Music2 } from 'lucide-react';
import { coverUrl } from '../lib/api.js';

export default function Cover({ song, size = 'md', rounded = 'rounded-lg', className = '' }) {
  const [failed, setFailed] = useState(false);
  const id = song?.coverId || song?.id;
  const showImage = song && song.hasCover !== false && !failed;

  const iconSize = size === 'lg' ? 48 : size === 'sm' ? 16 : 24;

  return (
    <div
      className={`relative overflow-hidden bg-surface-2 ${rounded} ${className}`}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={coverUrl(id) || '/placeholder.svg'}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
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