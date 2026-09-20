f = \"C:\Users\wolf\OneDrive\Documentos\GitHub\mirepo\frontend\src\components\MobileHomeView.jsx\"  
import re  
with open(f, encoding='utf-8') as fh: c = fh.read()  
old = \"\"\"          onPlay=() => { >> replace_artist.py && echo               // Reproducir primera canci\xf3n del artista >> replace_artist.py && echo               const firstTrack = tracks.find(t =^> t.artist === artist.name); >> replace_artist.py && echo               if (firstTrack) { >> replace_artist.py && echo                 const idx = tracks.indexOf(firstTrack); >> replace_artist.py && echo                 onPlay(firstTrack, idx); >> replace_artist.py && echo               } >> replace_artist.py && echo             }\"\"\"  
new = \"\"\"          onClick=() => onSelectArtist && onSelectArtist(artist.name) >> replace_artist.py && echo           />\"\"\"  
c = c.replace(old, new)  
with open(f, 'w', encoding='utf-8') as fh: fh.write(c) 
