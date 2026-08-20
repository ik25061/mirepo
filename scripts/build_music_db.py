# ============================================================
# build_music_db.py — Reconstructor de la base de datos musical
# ============================================================
# ALINEADO CON EL SERVER (server/db.js + server/scanner.js):
#   - songs.id        = sha1(relPath)[:16]  (igual que idFor() en scanner.js)
#   - relPath         = ruta relativa NATIVA (path.relative / os.path.relpath)
#   - albums          = UNIQUE(name, year)  (igual que db.js, getOrCreateAlbum)
#   - 'Artista desconocido' / 'Álbum desconocido' no se crean (igual que db.js)
#   - Recrea v_complete_songs y v_playlist_details (las vistas que usa el server)
#   - Genera backup de localfy.db antes de reconstruir
#
# Uso:
#   python scripts/build_music_db.py [--db server/localfy.db] [--music E:/musica] [--hash]
#   --hash : además calcula file_hash (sha256) de cada archivo (más lento)
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

# --- CONFIGURACIÓN DE RUTAS (sobreescribible por CLI) ---
RAIZ_MUSICA = r"E:/musica"
DB_PATH = r"C:/Users/wolf/Documents/GitHub/mirepo/server/localfy.db"

ARTISTA_DESCONOCIDO = 'Artista desconocido'   # mismo casing que el server
ALBUM_DESCONOCIDO = 'Álbum desconocido'        # mismo casing que el server


# ============================================================
# HELPERS DE TEXTO
# ============================================================

def normalizar_para_buscar(texto):
    """Mismo criterio que normalizeText() en db.js (NFD + quitar acentos + lowercase)."""
    if not texto:
        return ""
    return unidecode(str(texto).lower().strip())


def limpiar_texto(texto):
    if not texto:
        return ""
    if isinstance(texto, list):
        texto = texto[0]
    return str(texto).strip()


def id_for(rel_path):
    """id idéntico al del server: sha1(relPath) en hex, 16 caracteres.
    (scanner.js: crypto.createHash('sha1').update(relPath).digest('hex').slice(0, 16))"""
    return hashlib.sha1(rel_path.encode('utf-8')).hexdigest()[:16]


def sha256_archivo(ruta, chunk=1 << 20):
    h = hashlib.sha256()
    with open(ruta, 'rb') as f:
        while True:
            bloque = f.read(chunk)
            if not bloque:
                break
            h.update(bloque)
    return h.hexdigest()
# ============================================================
# ESQUEMA (idéntico al de db.js para tablas compartidas, más extras)
# ============================================================

DDL = {
    'artists': """
    CREATE TABLE IF NOT EXISTS artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""",
    'albums': """
    CREATE TABLE IF NOT EXISTS albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        main_artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
        year INTEGER,
        cover_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, year)
    );""",
    'songs': """
    CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        relPath TEXT NOT NULL,
        duration INTEGER,
        track INTEGER,
        disc INTEGER,
        hasLyrics INTEGER DEFAULT 0 CHECK(hasLyrics IN (0,1)),
        album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
        file_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""",
    'song_artists': """
    CREATE TABLE IF NOT EXISTS song_artists (
        song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
        artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
        is_main INTEGER DEFAULT 0 CHECK(is_main IN (0,1)),
        PRIMARY KEY (song_id, artist_id)
    );""",
    'genres': """
    CREATE TABLE IF NOT EXISTS genres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""",
    'song_genres': """
    CREATE TABLE IF NOT EXISTS song_genres (
        song_id TEXT REFERENCES songs(id) ON DELETE CASCADE,
        genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
        PRIMARY KEY (song_id, genre_id)
    );""",
    'lyrics': """
    CREATE TABLE IF NOT EXISTS lyrics (
        song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
        text TEXT,
        synced_text TEXT,
        translated_text TEXT,
        language TEXT DEFAULT 'es',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );""",
    'file_integrity': """
    CREATE TABLE IF NOT EXISTS file_integrity (
        song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
        last_checked TIMESTAMP,
        exists_on_disk INTEGER DEFAULT 1 CHECK(exists_on_disk IN (0,1))
    );""",
}


# Vistas idénticas a las de db.js (v_complete_songs, v_playlist_details)
DDL_VIEWS = {
    'v_complete_songs': """
    CREATE VIEW v_complete_songs AS
    SELECT
      s.id AS song_id,
      s.title AS song_title,
      s.relPath AS relative_path,
      s.duration,
      s.track,
      s.hasLyrics,
      al.id AS album_id,
      al.name AS album_name,
      al.year AS album_year,
      al.cover_path,
      GROUP_CONCAT(art.name, ', ') AS artists_names,
      MAX(CASE WHEN sa.is_main = 1 THEN art.id END) AS main_artist_id,
      MAX(CASE WHEN sa.is_main = 1 THEN art.name END) AS main_artist_name
    FROM songs s
    LEFT JOIN albums al ON s.album_id = al.id
    LEFT JOIN song_artists sa ON s.id = sa.song_id
    LEFT JOIN artists art ON sa.artist_id = art.id
    GROUP BY s.id
    """,
    'v_playlist_details': """
    CREATE VIEW v_playlist_details AS
    SELECT
      ps.playlist_id,
      p.name AS playlist_name,
      p.user_id AS owner_id,
      ps.position,
      vcs.*
    FROM playlist_songs ps
    JOIN playlists p ON ps.playlist_id = p.id
    JOIN v_complete_songs vcs ON ps.song_id = vcs.song_id
    ORDER BY ps.playlist_id, ps.position
    """,
}

ORDEN_BORRADO = ['file_integrity', 'lyrics', 'song_genres', 'song_artists',
                 'songs', 'albums', 'artists', 'genres']


def reconstruir_esquema(cursor):
    """Borra datos y recrea las tablas de música con el esquema EXACTO deseado.
    Garantiza el esquema independientemente de quién creó las tablas antes
    (Python o db.js) y recrea las vistas que consume el server."""
    # 1. Quitar vistas (se recrean al final con el DDL exacto)
    for vista in ('v_playlist_details', 'v_complete_songs'):
        cursor.execute(f"DROP VIEW IF EXISTS {vista}")

    # 2. Asegurar que existan las tablas de música (por si la BD es nueva)
    for tabla in ORDEN_BORRADO:
        cursor.execute(DDL[tabla])

    # 3. Borrar datos en orden respetuoso de FKs (los DELETE en cascada vacían
    #    playlist_songs, lyrics, song_genres, song_artists, file_integrity).
    for tabla in ORDEN_BORRADO:
        cursor.execute(f"DELETE FROM {tabla};")

    # 4. Recrear las tablas de música (seguro: ya están vacías).
    #    Orden inverso a las FKs (hijos primero). Como las tablas que referencian
    #    (playlist_songs, user_*) se vaciaron por cascada, DROP no falla.
    for tabla in ['file_integrity', 'lyrics', 'song_genres', 'song_artists',
                  'songs', 'albums', 'artists', 'genres']:
        cursor.execute(f"DROP TABLE IF EXISTS {tabla}")
        cursor.execute(DDL[tabla])

    # 5. Recrear las vistas (orden: v_complete_songs primero)
    cursor.execute(DDL_VIEWS['v_complete_songs'])
    cursor.execute(DDL_VIEWS['v_playlist_details'])


# ============================================================
# BUSCAR / CREAR ARTISTA, ÁLBUM, GÉNERO
# ============================================================

def buscar_o_crear_artista(cursor, nombre_artista):
    nombre = limpiar_texto(nombre_artista) or ARTISTA_DESCONOCIDO
    if nombre == ARTISTA_DESCONOCIDO:
        # Mismo comportamiento que db.js.getOrCreateArtist -> null
        return None
    cursor.execute("SELECT id FROM artists WHERE LOWER(name) = LOWER(?)", (nombre,))
    res = cursor.fetchone()
    if res:
        return res[0]
    cursor.execute("INSERT INTO artists (name) VALUES (?)", (nombre,))
    return cursor.lastrowid


def buscar_o_crear_album(cursor, nombre_album, artist_id, anio):
    """Mismo criterio que db.js.getOrCreateAlbum: UNIQUE(name, year)."""
    nombre = limpiar_texto(nombre_album) or ALBUM_DESCONOCIDO
    if nombre == ALBUM_DESCONOCIDO:
        # Mismo comportamiento que db.js -> null (no se crea álbum desconocido)
        return None

    if anio is None:
        cursor.execute("SELECT id FROM albums WHERE LOWER(name) = LOWER(?) AND year IS NULL", (nombre,))
    else:
        cursor.execute("SELECT id FROM albums WHERE LOWER(name) = LOWER(?) AND year = ?", (nombre, anio))
    res = cursor.fetchone()
    if res:
        return res[0]

    try:
        cursor.execute("INSERT INTO albums (name, year, main_artist_id) VALUES (?, ?, ?)",
                       (nombre, anio, artist_id))
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        # Carrera/duplicado: re-sacar el existente
        if anio is None:
            cursor.execute("SELECT id FROM albums WHERE LOWER(name) = LOWER(?) AND year IS NULL", (nombre,))
        else:
            cursor.execute("SELECT id FROM albums WHERE LOWER(name) = LOWER(?) AND year = ?", (nombre, anio))
        res = cursor.fetchone()
        return res[0] if res else None


def buscar_o_crear_genero(cursor, nombre_genero):
    nombre = limpiar_texto(nombre_genero)
    if not nombre or nombre == 'Sin género':
        return None
    cursor.execute("SELECT id FROM genres WHERE LOWER(name) = LOWER(?)", (nombre,))
    res = cursor.fetchone()
    if res:
        return res[0]
    cursor.execute("INSERT INTO genres (name) VALUES (?)", (nombre,))
    return cursor.lastrowid


def dividir_generos(valor):
    """Parte el género por ';' o bytes nulos (géneros multi-etiqueta), como el server."""
    if not valor:
        return []
    if isinstance(valor, list):
        valor = valor[0]
    partes = re.split(r'[;\x00]', str(valor))
    return [p.strip() for p in partes if p.strip()]
# ============================================================
# EXTRACCIÓN DE METADATOS
# ============================================================

def extraer_artista_titulo_desde_nombre(nombre_archivo):
    """Fallback: extrae artista y título del nombre de archivo.
        'Maná - Oye Mi Amor.mp3'                -> ('Maná', 'Oye Mi Amor')
        'Desconocido - La Mejor (2)_12345.mp3'  -> ('Desconocido', 'La Mejor (2)')
        'SUEÑOS DEL INCA_1784113044.mp3'        -> (None, 'SUEÑOS DEL INCA')
    """
    nombre_sin_ext = os.path.splitext(nombre_archivo)[0]
    if " - " in nombre_sin_ext:
        partes = nombre_sin_ext.split(" - ", 1)
        artista = partes[0].strip()
        titulo = partes[1].strip()
        titulo = re.sub(r'(_\d+)+$', '', titulo).strip()
        titulo = re.sub(r'\(\d+\)$', '', titulo).strip()
        return artista, titulo
    return None, nombre_sin_ext


def obtener_metadatos_archivo(ruta_mp3):
    """Metadatos robustos: ID3 -> EasyID3 -> nombre de archivo."""
    metadatos = {
        'artista': ARTISTA_DESCONOCIDO,
        'album': ALBUM_DESCONOCIDO,
        'titulo': None,
        'anio': None,
        'genero': None,
        'track': None,
        'disc': None,
        'duracion': 0
    }

    tag = None

    # 1. Duración con MP3() (falla con archivos corruptos; luego File() genérico)
    try:
        audio = MP3(ruta_mp3)
        metadatos['duracion'] = int(audio.info.length) if audio.info else 0
        try:
            tag = EasyID3(ruta_mp3)
        except Exception:
            tag = None
    except Exception:
        try:
            audio = File(ruta_mp3)
            if audio and hasattr(audio.info, 'length'):
                metadatos['duracion'] = int(audio.info.length)
        except Exception:
            pass
        # ID3 crudo aunque el MP3 no sea válido
        try:
            raw = id3.ID3(ruta_mp3)
            tag_dict = {}
            for frame in raw.values():
                texto_frame = frame.text[0] if hasattr(frame, 'text') and frame.text else None
                if frame.FrameID == 'TPE1':
                    tag_dict['artist'] = texto_frame
                elif frame.FrameID == 'TALB':
                    tag_dict['album'] = texto_frame
                elif frame.FrameID == 'TIT2':
                    tag_dict['title'] = texto_frame
                elif frame.FrameID == 'TDRC':
                    tag_dict['date'] = texto_frame
                elif frame.FrameID == 'TCON':
                    tag_dict['genre'] = texto_frame
                elif frame.FrameID == 'TRCK':
                    tag_dict['tracknumber'] = texto_frame
                elif frame.FrameID == 'TPOS':
                    tag_dict['discnumber'] = texto_frame
            tag = tag_dict
        except Exception:
            tag = None

# 2. Último intento con EasyID3
    if not tag:
        try:
            tag = EasyID3(ruta_mp3)
        except Exception:
            tag = {}

    artista = tag.get('artist') or tag.get('performer') or tag.get('albumartist')
    if artista:
        metadatos['artista'] = limpiar_texto(artista)

    album = tag.get('album')
    if album:
        metadatos['album'] = limpiar_texto(album)

    titulo = tag.get('title')
    if titulo:
        metadatos['titulo'] = limpiar_texto(titulo)

    year_val = tag.get('date') or tag.get('originaldate')
    if year_val:
        str_year = str(year_val)
        digits = [c for c in str_year if c.isdigit()]
        if len(digits) >= 4:
            metadatos['anio'] = int("".join(digits[:4]))

    generos = dividir_generos(tag.get('genre'))
    if generos:
        metadatos['genero'] = generos

    track_val = tag.get('tracknumber')
    if track_val:
        try:
            metadatos['track'] = int(str(track_val).split('/')[0])
        except Exception:
            pass

    disc_val = tag.get('discnumber')
    if disc_val:
        try:
            metadatos['disc'] = int(str(disc_val).split('/')[0])
        except Exception:
            pass

    # 3. Fallback a nombre de archivo si falta el título
    if not metadatos['titulo']:
        nombre_base = os.path.splitext(os.path.basename(ruta_mp3))[0]
        artista_arch, titulo_arch = extraer_artista_titulo_desde_nombre(nombre_base)
        metadatos['titulo'] = titulo_arch or nombre_base
        if artista_arch and metadatos['artista'] == ARTISTA_DESCONOCIDO:
            metadatos['artista'] = artista_arch

    return metadatos


# ============================================================
# CONSTRUCCIÓN DE LA BASE DE DATOS
# ============================================================

def procesar_directorio(db_path, raiz_musica, calcular_hash=False, progress_path=None):
    db_path = os.path.abspath(db_path)
    raiz_musica = os.path.abspath(raiz_musica)

    # ============================================================
    # ESTRATEGIA "FUERA DEL ARBOL VIGILADO POR VITE"
    # ============================================================
    # El watcher de archivos de Vite (dev) se cae con EBUSY cuando se
    # crea un archivo grande nuevo (ej: backup de 66MB) o se reescribe
    # localfy.db de golpe dentro de server/ (que está en la raíz vigilada).
    # Por eso aquí se construye TODO en el directorio temporal del sistema
    # (fuera del proyecto) y solo al final se hace UN os.replace() atómico
    # de la BD hacia server/localfy.db: un único evento del watcher.
    # ============================================================

    build_dir = tempfile.gettempdir()
    os.makedirs(build_dir, exist_ok=True)

    # 1. Backup de seguridad (en TEMP, fuera del árbol vigilado)
    if os.path.exists(db_path):
        stamp = __import__('datetime').datetime.now().strftime('%Y%m%d-%H%M%S')
        backup = os.path.join(build_dir, f"localfy-backup-{stamp}.db")
        shutil.copy2(db_path, backup)
        print(f"📦 Backup creado: {backup}")
    else:
        os.makedirs(os.path.dirname(db_path), exist_ok=True)

    if not os.path.isdir(raiz_musica):
        print(f"❌ Error: La ruta {raiz_musica} no existe.")
        return

    # 2. BD de trabajo temporal (también en TEMP: no genera eventos en server/)
    build_db = os.path.join(build_dir, f"localfy-build-{os.getpid()}.db")
    for sufijo in ('', '-journal', '-wal', '-shm'):
        ruta_ver = build_db + sufijo
        if os.path.exists(ruta_ver):
            try:
                os.remove(ruta_ver)
            except OSError:
                pass

    conn = sqlite3.connect(build_db)
    conn.execute("PRAGMA foreign_keys = ON")  # igual que db.js
    conn.create_function("normalizar", 1, normalizar_para_buscar)
    cursor = conn.cursor()

    print("Verificando y reconstruyendo estructura de tablas...")
    reconstruir_esquema(cursor)

    insertados = 0
    con_letra = 0
    errores = 0

    # Contar total de .mp3 una sola vez para poder mostrar % de progreso.
    total_mp3 = _total_mp3(raiz_musica)
    escribir_progreso(progress_path, 0, total_mp3, 'scanning')
    procesados = 0

    # Recorrer recursivamente (como walk() en scanner.js):
    #   mus/letra/.../cancion.mp3
    for letra in sorted(os.listdir(raiz_musica)):
        ruta_letra = os.path.join(raiz_musica, letra)
        if not os.path.isdir(ruta_letra):
            continue
        if os.path.abspath(ruta_letra) == os.path.abspath(os.path.join(raiz_musica, 'trash')):
            continue
        print(f"Escaneando directorio: {letra}")

        for ruta_mp3 in sorted(_caminar_mp3(ruta_letra)):
            procesados += 1
            # Escribir avance periódicamente (cada 15 archivos y al final).
            if procesados % 15 == 0 or procesados == total_mp3:
                escribir_progreso(progress_path, procesados, total_mp3, 'scanning')
            archivo = os.path.basename(ruta_mp3)
            rel_path = os.path.relpath(ruta_mp3, raiz_musica)  # separadores nativos, como path.relative

            meta = obtener_metadatos_archivo(ruta_mp3)

            # Letra .lrc junto al audio
            nombre_base, _ = os.path.splitext(archivo)
            ruta_lrc = os.path.join(os.path.dirname(ruta_mp3), f"{nombre_base}.lrc")
            tiene_letra = 1 if os.path.exists(ruta_lrc) else 0

            artist_id = buscar_o_crear_artista(cursor, meta['artista'])
            album_id = buscar_o_crear_album(cursor, meta['album'], artist_id, meta['anio'])
            ids_genero = [g for g in (buscar_o_crear_genero(cursor, gen)
                                      for gen in (meta['genero'] or [])) if g]

            # id = sha1(relPath)[:16], idéntico al server -> sin colisiones
            song_id = id_for(rel_path)
            file_hash = sha256_archivo(ruta_mp3) if calcular_hash else None

            cursor.execute("""
                INSERT OR IGNORE INTO songs
                  (id, title, relPath, duration, track, disc, hasLyrics, album_id, file_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (song_id, meta['titulo'], rel_path, meta['duracion'],
                  meta['track'], meta['disc'], tiene_letra, album_id, file_hash))

            if cursor.rowcount == 0:
                # Mismo id para la misma relPath: ya estaba (no debe ocurrir)
                continue

            if artist_id:
                cursor.execute("""
                    INSERT OR IGNORE INTO song_artists (song_id, artist_id, is_main)
                    VALUES (?, ?, 1)
                """, (song_id, artist_id))

            for genre_id in ids_genero:
                cursor.execute("""
                    INSERT OR IGNORE INTO song_genres (song_id, genre_id)
                    VALUES (?, ?)
                """, (song_id, genre_id))

            if tiene_letra:
                try:
                    with open(ruta_lrc, 'r', encoding='utf-8', errors='ignore') as f:
                        contenido = f.read()
                    cursor.execute("""
                        INSERT OR REPLACE INTO lyrics (song_id, text, language)
                        VALUES (?, ?, 'es')
                    """, (song_id, contenido))
                    con_letra += 1
                except Exception as e:
                    print(f"Error al leer letra de {archivo}: {e}")
                    errores += 1

            cursor.execute("""
                INSERT OR REPLACE INTO file_integrity (song_id, last_checked, exists_on_disk)
                VALUES (?, CURRENT_TIMESTAMP, 1)
            """, (song_id,))

            insertados += 1

    conn.commit()
    conn.close()

    # 3. Reemplazo atómico de la BD temporal -> server/localfy.db
    #    (1 solo evento del watcher en lugar de miles). El server cierra la
    #    conexión antes de reescanear, así que no hay handle bloqueando.
    try:
        os.replace(build_db, db_path)
    except OSError as e:
        # No perder el trabajo: el temp queda disponible para recuperarlo
        print(f"❌ No se pudo mover la BD temporal a {db_path}: {e}")
        print(f"   La BD construida quedó en: {build_db}")
        raise

    # Limpiar WAL/SHM antiguos de la BD anterior (pertenecían al archivo viejo;
    # el server re-abre con PRAGMA journal_mode=WAL y los recrea limpios).
    for sufijo in ('-wal', '-shm'):
        ruta_stale = db_path + sufijo
        try:
            if os.path.exists(ruta_stale):
                os.remove(ruta_stale)
        except OSError:
            pass

    print(f"\n🎉 Base de datos reconstruida exitosamente en: {db_path}")
    print(f"   Canciones insertadas: {insertados}")
    print(f"   Con letra (.lrc):     {con_letra}")
    if errores:
        print(f"   Errores menores:      {errores}")


def _caminar_mp3(ruta):
    """Genera las rutas .mp3 dentro de una carpeta (recursivo)."""
    for dirpath, _dirnames, filenames in os.walk(ruta):
        for f in sorted(filenames):
            if f.lower().endswith('.mp3'):
                yield os.path.join(dirpath, f)


# ============================================================
# PROGRESO (archivo JSON para el SSE del server)
# ============================================================

def _total_mp3(raiz):
    """Cuenta todos los .mp3 bajo `raiz`, sin bajar por trash (igual que el server)."""
    total = 0
    raiz_abs = os.path.abspath(raiz)
    for dirpath, dirnames, filenames in os.walk(raiz_abs):
        if os.path.abspath(dirpath).lower() == os.path.abspath(os.path.join(raiz_abs, 'trash')).lower():
            dirnames[:] = []
            continue
        for f in filenames:
            if f.lower().endswith('.mp3'):
                total += 1
    return total


def escribir_progreso(path, processed, total, phase='scanning'):
    """Escribe el estado del rescan en un JSON que el server consulta (SSE)."""
    try:
        if not path:
            return
        pct = round(processed * 100 / total) if total else 0
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump({
                'phase': phase,
                'processed': processed,
                'total': total,
                'pct': pct,
            }, f, ensure_ascii=False)
        os.replace(tmp, path)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(description="Reconstruye la base de datos musical alineada con el server.")
    parser.add_argument('--db', default=DB_PATH, help=f"Ruta de la base de datos (default: {DB_PATH})")
    parser.add_argument('--music', default=RAIZ_MUSICA, help=f"Carpeta de música (default: {RAIZ_MUSICA})")
    parser.add_argument('--hash', action='store_true', help="Calcular file_hash (sha256) de cada archivo")
    parser.add_argument('--progress', default=None, help="Archivo JSON donde escribir el progreso (para el SSE del server)")
    args = parser.parse_args()
    procesar_directorio(args.db, args.music, calcular_hash=args.hash, progress_path=args.progress)


if __name__ == "__main__":
    main()