# ============================================================
# build_music_db.py — Reconstructor de la base de datos musical
# ============================================================
# ALINEADO CON EL SERVER (server/db.js + server/scanner.js):
#   - songs.id        = sha1(relPath)[:16]  (igual que idFor() en scanner.js)
#   - relPath         = ruta relativa NATIVA (path.relative / os.path.relpath)
#   - albums          = UNIQUE(name, year)  (igual que db.js, getOrCreateAlbum)
#   - Recrea v_complete_songs y v_playlist_details (las vistas que usa el server)
#   - Genera backup de localfy.db antes de reconstruir
#
# Uso:
#   python scripts/build_music_db.py [--db server/localfy.db] [--music E:/musica] [--hash]
# ============================================================

import os
import re
import sys
import shutil
import tempfile
import argparse
import hashlib
import sqlite3
import json
import time
from mutagen import File, id3
from mutagen.easyid3 import EasyID3
from mutagen.mp3 import MP3
from unidecode import unidecode

# La consola de Windows (cp1252) no puede imprimir emojis/acentos: forzar UTF-8
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# --- CONFIGURACIÓN DE RUTAS ---
RAIZ_MUSICA = r"E:/musica"
DB_PATH = r"C:/Users/wolf/Documents/GitHub/mirepo/server/localfy.db"

ARTISTA_DESCONOCIDO = 'Artista desconocido'
ALBUM_DESCONOCIDO = 'Álbum desconocido'

def normalizar_para_buscar(texto):
    if not texto: return ""
    return unidecode(str(texto).lower().strip())

def limpiar_texto(texto):
    if not texto: return ""
    if isinstance(texto, list): texto = texto[0]
    return str(texto).strip()

def id_for(rel_path):
    return hashlib.sha1(rel_path.encode('utf-8')).hexdigest()[:16]

def sha256_archivo(ruta, chunk=1 << 20):
    h = hashlib.sha256()
    with open(ruta, 'rb') as f:
        while True:
            bloque = f.read(chunk)
            if not bloque: break
            h.update(bloque)
    return h.hexdigest()

DDL = {
    'artists': "CREATE TABLE IF NOT EXISTS artists (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);",
    'albums': "CREATE TABLE IF NOT EXISTS albums (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, main_artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE, year INTEGER, cover_path TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(name, year));",
    'songs': """
    CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        relPath TEXT NOT NULL,
        duration INTEGER,
        track INTEGER,
        disc INTEGER,
        bpm REAL,
        key_name TEXT,
        hasLyrics INTEGER DEFAULT 0 CHECK(hasLyrics IN (0,1)),
        album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
        file_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""",
    'song_artists': "CREATE TABLE IF NOT EXISTS song_artists (song_id TEXT REFERENCES songs(id) ON DELETE CASCADE, artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE, is_main INTEGER DEFAULT 0 CHECK(is_main IN (0,1)), PRIMARY KEY (song_id, artist_id));",
    'genres': "CREATE TABLE IF NOT EXISTS genres (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);",
    'song_genres': "CREATE TABLE IF NOT EXISTS song_genres (song_id TEXT REFERENCES songs(id) ON DELETE CASCADE, genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE, PRIMARY KEY (song_id, genre_id));",
    'lyrics': "CREATE TABLE IF NOT EXISTS lyrics (song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE, text TEXT, synced_text TEXT, translated_text TEXT, language TEXT DEFAULT 'es', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);",
    'file_integrity': "CREATE TABLE IF NOT EXISTS file_integrity (song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE, last_checked TIMESTAMP, exists_on_disk INTEGER DEFAULT 1 CHECK(exists_on_disk IN (0,1)));",
}

DDL_VIEWS = {
    'v_complete_songs': """
    CREATE VIEW IF NOT EXISTS v_complete_songs AS
    SELECT s.id AS song_id, s.title AS song_title, s.relPath AS relative_path, s.duration, s.track, s.bpm, s.key_name, s.hasLyrics, al.id AS album_id, al.name AS album_name, al.year AS album_year, al.cover_path, GROUP_CONCAT(art.name, ', ') AS artists_names, MAX(CASE WHEN sa.is_main = 1 THEN art.id END) AS main_artist_id, MAX(CASE WHEN sa.is_main = 1 THEN art.name END) AS main_artist_name
    FROM songs s LEFT JOIN albums al ON s.album_id = al.id LEFT JOIN song_artists sa ON s.id = sa.song_id LEFT JOIN artists art ON sa.artist_id = art.id GROUP BY s.id
    """,
    'v_playlist_details': """
    CREATE VIEW IF NOT EXISTS v_playlist_details AS
    SELECT ps.playlist_id, p.name AS playlist_name, p.user_id AS owner_id, ps.position, vcs.* FROM playlist_songs ps JOIN playlists p ON ps.playlist_id = p.id JOIN v_complete_songs vcs ON ps.song_id = vcs.song_id ORDER BY ps.playlist_id, ps.position
    """,
}

def asegurar_tablas(cursor):
    """Asegura que las tablas existan sin borrar datos existentes."""
    for tabla, sql in DDL.items():
        cursor.execute(sql)
    for vista, sql in DDL_VIEWS.items():
        cursor.execute(f"DROP VIEW IF EXISTS {vista}")
        cursor.execute(sql)

def buscar_o_crear_artista(cursor, nombre_artista):
    nombre = limpiar_texto(nombre_artista) or ARTISTA_DESCONOCIDO
    if nombre == ARTISTA_DESCONOCIDO: return None
    cursor.execute("SELECT id FROM artists WHERE LOWER(name) = LOWER(?)", (nombre,))
    res = cursor.fetchone()
    if res: return res[0]
    cursor.execute("INSERT INTO artists (name) VALUES (?)", (nombre,))
    return cursor.lastrowid

def buscar_o_crear_album(cursor, nombre_album, artist_id, anio):
    nombre = limpiar_texto(nombre_album) or ALBUM_DESCONOCIDO
    if nombre == ALBUM_DESCONOCIDO: return None
    if anio is None: cursor.execute("SELECT id FROM albums WHERE LOWER(name) = LOWER(?) AND year IS NULL", (nombre,))
    else: cursor.execute("SELECT id FROM albums WHERE LOWER(name) = LOWER(?) AND year = ?", (nombre, anio))
    res = cursor.fetchone()
    if res: return res[0]
    try:
        cursor.execute("INSERT INTO albums (name, year, main_artist_id) VALUES (?, ?, ?)", (nombre, anio, artist_id))
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        if anio is None: cursor.execute("SELECT id FROM albums WHERE LOWER(name) = LOWER(?) AND year IS NULL", (nombre,))
        else: cursor.execute("SELECT id FROM albums WHERE LOWER(name) = LOWER(?) AND year = ?", (nombre, anio))
        res = cursor.fetchone()
        return res[0] if res else None

def buscar_o_crear_genero(cursor, nombre_genero):
    nombre = limpiar_texto(nombre_genero)
    if not nombre or nombre == 'Sin género': return None
    cursor.execute("SELECT id FROM genres WHERE LOWER(name) = LOWER(?)", (nombre,))
    res = cursor.fetchone()
    if res: return res[0]
    cursor.execute("INSERT INTO genres (name) VALUES (?)", (nombre,))
    return cursor.lastrowid

def obtener_metadatos_archivo(ruta_mp3):
    metadatos = {'artista': ARTISTA_DESCONOCIDO, 'album': ALBUM_DESCONOCIDO, 'titulo': None, 'anio': None, 'genero': None, 'track': None, 'disc': None, 'duracion': 0}
    try:
        audio = MP3(ruta_mp3)
        metadatos['duracion'] = int(audio.info.length) if audio.info else 0
        tag = EasyID3(ruta_mp3)
    except Exception:
        try:
            audio = File(ruta_mp3)
            if audio and hasattr(audio.info, 'length'): metadatos['duracion'] = int(audio.info.length)
        except Exception: pass
        tag = {}

    if tag:
        artista = tag.get('artist') or tag.get('performer') or tag.get('albumartist')
        if artista: metadatos['artista'] = limpiar_texto(artista)
        album = tag.get('album')
        if album: metadatos['album'] = limpiar_texto(album)
        titulo = tag.get('title')
        if titulo: metadatos['titulo'] = limpiar_texto(titulo)
        year_val = tag.get('date') or tag.get('originaldate')
        if year_val:
            str_year = str(year_val)
            digits = [c for c in str_year if c.isdigit()]
            if len(digits) >= 4: metadatos['anio'] = int("".join(digits[:4]))
        generos = tag.get('genre')
        if generos: metadatos['genero'] = [p.strip() for p in re.split(r'[;\x00]', str(generos[0])) if p.strip()]
        track_val = tag.get('tracknumber')
        if track_val:
            try: metadatos['track'] = int(str(track_val[0]).split('/')[0])
            except Exception: pass

    if not metadatos['titulo']:
        nombre_base = os.path.splitext(os.path.basename(ruta_mp3))[0]
        if " - " in nombre_base:
            partes = nombre_base.split(" - ", 1)
            if metadatos['artista'] == ARTISTA_DESCONOCIDO: metadatos['artista'] = partes[0].strip()
            metadatos['titulo'] = partes[1].strip()
        else: metadatos['titulo'] = nombre_base
    return metadatos

def procesar_directorio(db_path, raiz_musica, calcular_hash=False, progress_path=None):
    db_path = os.path.abspath(db_path)
    raiz_musica = os.path.abspath(raiz_musica)
    build_dir = tempfile.gettempdir()
    build_db = os.path.join(build_dir, f"localfy-build-{os.getpid()}.db")

    # 1. Copiar base de datos actual para actualizarla sin perder likes/usuarios
    if os.path.exists(db_path):
        # Backup en la carpeta del servidor para visibilidad
        backup_name = f"localfy.db.bak-{time.strftime('%Y%m%d-%H%M%S')}"
        shutil.copy2(db_path, os.path.join(os.path.dirname(db_path), backup_name))
        shutil.copy2(db_path, build_db)
        print(f"📂 Usando base de datos existente. Backup: {backup_name}")

    conn = sqlite3.connect(build_db)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.create_function("normalizar", 1, normalizar_para_buscar)
    cursor = conn.cursor()

    asegurar_tablas(cursor)

    # 2. Marcar canciones como no encontradas para detectarlas luego
    cursor.execute("UPDATE file_integrity SET exists_on_disk = 0")

    total_mp3 = 0
    for dirpath, dirnames, filenames in os.walk(raiz_musica):
        if 'trash' in dirpath.lower(): continue
        total_mp3 += sum(1 for f in filenames if f.lower().endswith('.mp3'))

    escribir_progreso(progress_path, 0, total_mp3, 'scanning')
    procesados = 0
    insertados = 0

    for dirpath, dirnames, filenames in os.walk(raiz_musica):
        if 'trash' in dirpath.lower(): continue
        for f in sorted(filenames):
            if not f.lower().endswith('.mp3'): continue

            procesados += 1
            if procesados % 20 == 0 or procesados == total_mp3:
                escribir_progreso(progress_path, procesados, total_mp3, 'scanning')

            ruta_mp3 = os.path.join(dirpath, f)
            rel_path = os.path.relpath(ruta_mp3, raiz_musica)
            song_id = id_for(rel_path)

            meta = obtener_metadatos_archivo(ruta_mp3)
            artist_id = buscar_o_crear_artista(cursor, meta['artista'])
            album_id = buscar_o_crear_album(cursor, meta['album'], artist_id, meta['anio'])

            cursor.execute("""
                INSERT INTO songs (id, title, relPath, duration, track, disc, album_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    relPath=excluded.relPath,
                    duration=excluded.duration,
                    track=excluded.track,
                    album_id=excluded.album_id
            """, (song_id, meta['titulo'], rel_path, meta['duracion'], meta['track'], meta['disc'], album_id))

            if artist_id:
                cursor.execute("INSERT OR IGNORE INTO song_artists (song_id, artist_id, is_main) VALUES (?, ?, 1)", (song_id, artist_id))

            if meta['genero']:
                for g in meta['genero']:
                    gid = buscar_o_crear_genero(cursor, g)
                    if gid: cursor.execute("INSERT OR IGNORE INTO song_genres (song_id, genre_id) VALUES (?, ?)", (song_id, gid))

            cursor.execute("INSERT OR REPLACE INTO file_integrity (song_id, last_checked, exists_on_disk) VALUES (?, CURRENT_TIMESTAMP, 1)", (song_id,))
            insertados += 1

    # 3. Limpiar canciones que ya no existen (OPCIONAL: podrías no borrarlas para mantener likes históricos)
    # Por ahora solo limpiamos file_integrity; las canciones se quedan pero marcadas como missing si quisiéramos.
    # Si quieres borrarlas de verdad: cursor.execute("DELETE FROM songs WHERE id IN (SELECT song_id FROM file_integrity WHERE exists_on_disk = 0)")

    conn.commit()
    conn.close()

    # Reemplazo atómico
    max_retries = 5
    for attempt in range(max_retries):
        try:
            os.replace(build_db, db_path)
            print(f"✅ Proceso completado exitosamente.")
            break
        except OSError as e:
            if attempt < max_retries - 1:
                time.sleep(1)
            else: raise

def escribir_progreso(path, processed, total, phase='scanning'):
    try:
        if not path: return
        pct = round(processed * 100 / total) if total else 0
        with open(path, 'w', encoding='utf-8') as f:
            json.dump({'phase': phase, 'processed': processed, 'total': total, 'pct': pct, 'ts': time.time() * 1000}, f)
    except Exception: pass

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default=DB_PATH)
    parser.add_argument('--music', default=RAIZ_MUSICA)
    parser.add_argument('--hash', action='store_true')
    parser.add_argument('--progress', default=None)
    args = parser.parse_args()
    procesar_directorio(args.db, args.music, calcular_hash=args.hash, progress_path=args.progress)

if __name__ == "__main__": main()
