$f = \"C:\Users\wolf\OneDrive\Documentos\GitHub\mirepo\frontend\src\components\MobileHomeView.jsx\" 
$c = [System.IO.File]::ReadAllText($f)  
$old = @\" >> fix_artist.ps1 && echo             onPlay() => { >> fix_artist.ps1 && echo               // Reproducir primera canci?n del artista >> fix_artist.ps1 && echo               const firstTrack = tracks.find(t =^> t.artist === artist.name); >> fix_artist.ps1 && echo               if (firstTrack) { >> fix_artist.ps1 && echo                 const idx = tracks.indexOf(firstTrack); >> fix_artist.ps1 && echo                 onPlay(firstTrack, idx); >> fix_artist.ps1 && echo               } >> fix_artist.ps1 && echo             } >> fix_artist.ps1 && echo \"@  
$new = @\" >> fix_artist.ps1 && echo             onClick=() => onSelectArtist ^&^& onSelectArtist(artist.name) >> fix_artist.ps1 && echo           /> >> fix_artist.ps1 && echo \"@  
$c = $c.Replace($old, $new)  
[System.IO.File]::WriteAllText($f, $c) 
