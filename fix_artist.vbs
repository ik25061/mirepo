Const ForReading = 1  
Const ForWriting = 2  
Set fso = CreateObject(\"Scripting.FileSystemObject\")  
Set f = fso.OpenTextFile(\"C:\Users\wolf\OneDrive\Documentos\GitHub\mirepo\frontend\src\components\MobileHomeView.jsx\", ForReading)  
content = f.ReadAll  
f.Close  
oldText = \"            onPlay() => {\" & vbCrLf & _  
\"              // Reproducir primera canci\" & Chr(243) & \"n del artista\" & vbCrLf & _  
\"              const firstTrack = tracks.find(t =^> t.artist === artist.name);\" & vbCrLf & _  
\"              if (firstTrack) {\" & vbCrLf & _  
\"                const idx = tracks.indexOf(firstTrack);\" & vbCrLf & _  
