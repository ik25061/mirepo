# Escaneo rapido de muestra - itera artistas de primer nivel y muestrea archivos
import os
from mutagen.mp3 import MP3
from mutagen.easyid3 import EasyID3

MUSIC = r"E:\musica"
AUDIO_EXT = {".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".opus", ".webm"}
MAX_FILES = 600          # total de archivos a examinar
MAX_PER_ARTIST = 3

stats = {"nul_genre":0,"nul_album":0,"nul_title":0,"moji":0,"multi":0,"placeholder":0,
         "space_album":0,"space_title":0,"total":0, "corrupt_tag_error":0}
samples = {"multi":[],"nul_genre":[],"moji":[],"placeholder":[],"space_album":[]}
placeholders = {"music","other","genre","mix","unknown","none","misc","remix","single",
                "sin genero","sin género","desconocido","n/a","va","various","cover"}

def clean(s): return (s or "").replace("\x00","|")

n=0
try:
    artists = [d for d in os.listdir(MUSIC) if os.path.isdir(os.path.join(MUSIC,d)) and not d.lower() in ("trash",)]
except Exception as e:
    print("Error listando artistas:", e); artists=[]

for artist in artists:
    if n>=MAX_FILES: break
    adir = os.path.join(MUSIC, artist)
    try:
        files = [os.path.join(adir,f) for f in os.listdir(adir) if os.path.splitext(f)[1].lower() in AUDIO_EXT]
    except Exception:
        continue
    files = files[:MAX_PER_ARTIST]
    for fp in files:
        if n>=MAX_FILES: break
        n+=1
        stats["total"]=n
        try:
            m = MP3(fp, ID3=EasyID3); t = m.tags
            genre = ";".join(t.get("genre",[])) if t else ""
            album = " ".join(t.get("album",[])) if t else ""
            title = " ".join(t.get("title",[])) if t else ""
            artist = " ".join(t.get("artist",[])) if t else ""
        except Exception:
            stats["corrupt_tag_error"]+=1
            continue
        if "\x00" in genre: stats["nul_genre"]+=1; samples["nul_genre"].append((artist, clean(genre)[:60]))
        if "\x00" in album: stats["nul_album"]+=1
        if "\x00" in title: stats["nul_title"]+=1
        blob = genre+album+title+artist
        if any(c in blob for c in ["Ã","‚","â€","¤","\ufffd"]): stats["moji"]+=1; samples["moji"].append((artist, (genre+'|'+album)[:70]))
        parts = [p for p in genre.replace("\x00",";").replace("/",";").split(";") if p.strip()]
        if len(parts)>1: stats["multi"]+=1; samples["multi"].append((artist, " ; ".join(parts)[:70]))
        low = [p.strip().lower() for p in parts]
        if low and any(p in placeholders for p in low): stats["placeholder"]+=1; samples["placeholder"].append((artist, " ; ".join(parts)[:50]))
        if album != album.strip() or "  " in album: stats["space_album"]+=1; samples["space_album"].append((artist, repr(album)[:50]))
        if title != title.strip() or "  " in title: stats["space_title"]+=1

print(f"Archivos examinados (muestra): {n}  (artistas: {len(artists)})")
for k,v in stats.items():
    if k!="total": print(f"  {k}: {v}")
for label, arr in samples.items():
    print(f"\n--- MUESTRAS {label} ({len(arr)}) ---")
    for f,s in arr[:8]: print(f"  {f} : {s}")

