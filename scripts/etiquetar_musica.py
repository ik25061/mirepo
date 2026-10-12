# ============================================================
# etiquetar_musica.py — ESTADOS DE ÁNIMO, ESTILOS Y OCASIONES
# ============================================================
# Añade, SIN tocar nunca las canciones, la clasificación de cada canción en
# la base de datos (SQLite, localfy.db):
#
#   * ESTADOS DE ÁNIMO  -> Alegre, Energética, Bailable, Relajada, Triste /
#                           Melancólica, Romántica, Nostálgica, Intensa / Oscura
#   * ESTILOS          -> Reguetón, Salsa, Rock, Pop, Electrónica / Dance,
#                           Balada, Cumbia... (y más, según el género)
#   * OCASIONES        -> Para tomar, Fiesta infantil, Fiesta noventera,
#                           Fiesta de jóvenes, Fiesta de ochentera, Cena
#                           tranquila, Concentración, Entrenar, Navidad...
#
# HECHO CON BASURA LOCAL (sin internet):
#   - bpm y tonalidad de la tabla songs
#   - energy / valence / danceability de song_features (lo que genera
#     analyze_audio.py)
#   - género del tag, carpetas de la ruta, título/álbum/artista
#   - año de lanzamiento (para fiestas por década)
#
# NO DESTRUCTIVO
#   * Solo CREA las tablas song_moods y song_moods_meta (no toca songs ni
#     song_features).
#   * Por defecto SÓLO etiqueta canciones nuevas (las que aún no tienen
#     etiquetas), así que un reescaneo no pierde nada: vuelve a ejecutar y
#     completa lo que falte.
#   * Las etiquetas que pongas a mano (source='manual') nunca se
#     sobrescriben.
#   * Hace una copia de seguridad de la base antes de escribir
#     (desactivable con --no-backup).
#   * Idempotente: ejecutar más veces no crea filas duplicadas, solo
#     completa lo que falta.
#
# Uso rápido:
#   python scripts/etiquetar_musica.py                  # etiqueta lo que falte
#   python scripts/etiquetar_musica.py --db server/localfy.db --forzar
#   python scripts/etiquetar_musica.py --db server/localfy.db --resumen
#   python scripts/etiquetar_musica.py --db server/localfy.db --listar "Fiesta noventera" --m3u noventera.m3u
#   python scripts/etiquetar_musica.py --no-backup
#
# Dependencias:
#   pip install mutagen           # opcional: leer género/año de los MP3/FLAC
#                                   directamente cuando la BD no los tiene
# """
from __future__ import annotations

import argparse
import re
import sqlite3
import sys
import unicodedata
import shutil
from datetime import datetime
from pathlib import Path

VERSION = 1  # sube este número si cambias las reglas y quieres recalcular
             # con --forzar

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def norm(s) -> str:
    """minúsculas, sin acentos, espacios normalizados."""
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower()).strip()


def q(ident: str) -> str:
    return '"' + ident.replace('"', '""') + '"'


def clip(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def ramp(x: float, lo: float, hi: float) -> float:
    """0 si x<=lo, 1 si x>=hi, lineal entre medias."""
    if hi == lo:
        return 1.0 if x >= hi else 0.0
    return clip((x - lo) / (hi - lo))


def to_float(v):
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def unit(v):
    """Normaliza a 0..1 (acepta 0..1 o 0..100)."""
    v = to_float(v)
    if v is None:
        return None
    return clip(v / 100.0 if v > 1.5 else v)


def extract_year(v):
    if v is None:
        return None
    m = re.search(r"(19|20)\d{2}", str(v))
    return int(m.group(0)) if m else None


def has_word(text: str, kw: str) -> bool:
    return re.search(rf"(?<![a-z0-9]){re.escape(kw)}(?![a-z0-9])", text) is not None
