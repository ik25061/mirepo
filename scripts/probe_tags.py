# Probe de etiquetas ID3 en archivos reales
from mutagen.mp3 import MP3
from mutagen.easyid3 import EasyID3
import os, sys

FILES = [
    r"E:\musica\Lords Of Acid\The Crablouse (Remastered).mp3",
    r"E:\musica\Lords Of Acid\The Crablouse (Ludo's -No Visible Symptoms-).mp3",
]

def show(file):
    print("="*70)
    print("FILE:", file)
    try:
        m = MP3(file, ID3=EasyID3)
        for k in ["title","album","artist","genre","date","tracknumber"]:
            v = m.tags.get(k) if m.tags else None
            print(f"  {k}: {v!r}")
    except Exception as e:
        print("  ERROR:", e)

for f in FILES:
    if os.path.exists(f):
        show(f)
    else:
        print("NO EXISTE:", f)
