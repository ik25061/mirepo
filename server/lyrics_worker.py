#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Persistent JSON-lines worker for LocalFly lyrics transcription.

The Whisper model is loaded once per process and reused for every song.
Only JSON responses are written to stdout; diagnostics go to stderr.
"""
import json
import os
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

TIME_RE = re.compile(r"^\[(\d{1,3}):(\d{2})[.:](\d{2,3})\](.*)$")
MODEL = None
MODEL_ERROR = None


def log(message):
    print(message, file=sys.stderr, flush=True)


def seconds_from_match(match):
    minutes = int(match.group(1))
    seconds = int(match.group(2))
    fraction = match.group(3)
    scale = 1000 if len(fraction) == 3 else 100
    return minutes * 60 + seconds + int(fraction) / scale


def parse_lrc(text):
    rows = []
    for raw in text.splitlines():
        match = TIME_RE.match(raw.strip())
        if not match:
            continue
        lyric = match.group(4).strip()
        if lyric:
            rows.append((seconds_from_match(match), lyric))
    return sorted(rows, key=lambda row: row[0])


def format_lrc_time(seconds):
    centiseconds = int(round(max(0.0, seconds) * 100))
    minutes, remainder = divmod(centiseconds, 6000)
    secs, cents = divmod(remainder, 100)
    return f"[{minutes:02d}:{secs:02d}.{cents:02d}]"


def audio_duration(path):
    try:
        from mutagen import File
        audio = File(str(path))
        if audio and audio.info:
            return float(audio.info.length)
    except Exception:
        pass
    return None


def lrc_is_valid(path, duration):
    try:
        text = path.read_text(encoding="utf-8-sig")
    except Exception:
        return False
    rows = parse_lrc(text)
    if len(rows) < 8:
        return False
    times = [row[0] for row in rows]
    texts = [row[1].strip().lower() for row in rows]
    if len(set(round(value, 1) for value in times)) < len(times) * 0.5:
        return False
    if len(set(texts)) < max(4, int(len(texts) * 0.45)):
        return False
    if duration and duration > 0:
        if times[-1] > duration + 5 or times[0] > duration * 0.5:
            return False
        if times[-1] - times[0] < duration * 0.35:
            return False
    return True


def load_model(request):
    global MODEL, MODEL_ERROR
    if MODEL is not None:
        return MODEL
    if MODEL_ERROR:
        raise RuntimeError(MODEL_ERROR)
    from faster_whisper import WhisperModel
    model_name = request.get("model") or os.getenv("LYRICS_MODEL", "large-v3")
    device = request.get("device") or os.getenv("LYRICS_DEVICE", "auto")
    compute_type = request.get("computeType") or os.getenv("LYRICS_COMPUTE_TYPE", "auto")
    if device == "auto":
        try:
            import ctranslate2
            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:
            device = "cpu"
    if compute_type == "auto":
        compute_type = "float16" if device == "cuda" else "int8"
    # CPU large-v3 can be prohibitively slow; allow env override, use medium by default on CPU.
    if device == "cpu" and model_name == "large-v3" and not os.getenv("LYRICS_FORCE_LARGE_CPU"):
        model_name = os.getenv("LYRICS_CPU_MODEL", "medium")
    log(f"[lyrics-worker] Loading {model_name} on {device} ({compute_type})")
    try:
        MODEL = WhisperModel(model_name, device=device, compute_type=compute_type)
        return MODEL
    except Exception as exc:
        MODEL_ERROR = str(exc)
        raise


def remove_repeated_segments(segments):
    cleaned = []
    previous = None
    streak = 0
    for segment in segments:
        current = re.sub(r"\s+", " ", segment[2]).strip().lower()
        streak = streak + 1 if current == previous else 1
        previous = current
        if streak <= 3:
            cleaned.append(segment)
    return cleaned


def translate_lines(lines, source_language):
    if not lines or source_language == "es":
        return None
    try:
        from deep_translator import GoogleTranslator
        translator = GoogleTranslator(source=source_language or "auto", target="es")
        translated = []
        for start in range(0, len(lines), 20):
            batch = lines[start:start + 20]
            result = translator.translate_batch(batch)
            if not isinstance(result, list) or len(result) != len(batch):
                return None
            translated.extend([str(value).strip() if value else "" for value in result])
        return translated
    except Exception as exc:
        log(f"[lyrics-worker] Translation unavailable: {exc}")
        return None


def process(request):
    path = Path(request.get("path", "")).expanduser()
    if not path.is_file():
        raise FileNotFoundError(f"Audio file not found: {path}")
    lrc_path = path.with_suffix(".lrc")
    duration = audio_duration(path)
    force = bool(request.get("force", False))

    if lrc_path.exists() and not force and lrc_is_valid(lrc_path, duration):
        text = lrc_path.read_text(encoding="utf-8-sig")
        rows = parse_lrc(text)
        is_auto = "[by:auto-whisper]" in text
        language = next((line[4:-1].strip() for line in text.splitlines()
                         if line.startswith("[la:") and line.endswith("]")), None)
        if is_auto:
            grouped = {}
            for timestamp, lyric in rows:
                grouped.setdefault(timestamp, []).append(lyric)
            original_rows = []
            translated_rows = []
            has_translation = False
            for timestamp, pair in grouped.items():
                original_rows.append((timestamp, pair[0]))
                translation = pair[1] if len(pair) > 1 else ""
                if translation and translation.lower() != pair[0].lower():
                    has_translation = True
                else:
                    translation = ""
                translated_rows.append(translation)
            lyrics = "\\n".join(row[1] for row in original_rows)
            synced = [{"time": row[0], "text": row[1]} for row in original_rows]
            translated = "\\n".join(translated_rows) if has_translation else None
            translation_complete = language == "es" or (has_translation and all(translated_rows))
        else:
            lyrics = "\\n".join(row[1] for row in rows)
            synced = [{"time": row[0], "text": row[1]} for row in rows]
            translated = None
            translation_complete = language == "es" or language is None
        return {
            "status": "generated",
            "source": "local-file",
            "lyrics": lyrics,
            "syncedLines": synced,
            "translatedLyrics": translated,
            "translationComplete": translation_complete,
            "language": language,
            "quality": {"lineCount": len(synced), "structurallyValid": True}
        }

    model = load_model(request)
    segments, info = model.transcribe(
        str(path),
        language=request.get("language") or None,
        task="transcribe",
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 800, "speech_pad_ms": 300},
        condition_on_previous_text=False,
        beam_size=5,
        temperature=0.0,
        word_timestamps=False,
        no_speech_threshold=0.92,
    )
    rows = []
    for segment in segments:
        text = str(segment.text or "").strip()
        if not text or getattr(segment, "no_speech_prob", 0) > 0.92:
            continue
        rows.append((float(segment.start), float(segment.end), text))
    rows = remove_repeated_segments(rows)

    if not rows:
        return {
            "status": "instrumental",
            "instrumental": True,
            "source": "whisper",
            "lyrics": None,
            "syncedLines": [],
            "translatedLyrics": None,
            "language": getattr(info, "language", None),
            "quality": {"lineCount": len(rows), "reason": "No se detectó voz suficiente"}
        }

    language = getattr(info, "language", None) or "unknown"
    original_lines = [row[2] for row in rows]
    translations = translate_lines(original_lines, language) if request.get("translate", True) else None

    title = str(request.get("title") or path.stem).strip()
    artist = str(request.get("artist") or "").strip()
    output = [f"[ti:{title}]"]
    if artist:
        output.append(f"[ar:{artist}]")
    if duration:
        output.append(f"[length:{int(duration // 60):02d}:{int(duration % 60):02d}]")
    output.extend([f"[la:{language}]", "[by:auto-whisper]"])
    synced = []
    for index, (start, _end, text) in enumerate(rows):
        output.append(f"{format_lrc_time(start)}{text}")
        synced.append({"time": start, "text": text})
        if translations and index < len(translations) and translations[index]:
            output.append(f"{format_lrc_time(start)}{translations[index]}")

    # Keep the first backup; subsequent regenerations receive timestamped backups.
    if lrc_path.exists():
        backup = lrc_path.with_suffix(".lrc.bak")
        if backup.exists():
            backup = lrc_path.with_name(lrc_path.name + ".bak." + datetime.now().strftime("%Y%m%d_%H%M%S"))
        shutil.copy2(lrc_path, backup)

    temporary = lrc_path.with_name(lrc_path.name + ".tmp")
    temporary.write_text("\n".join(output) + "\n", encoding="utf-8")
    os.replace(temporary, lrc_path)

    unique_ratio = len(set(line.lower() for line in original_lines)) / max(1, len(original_lines))
    quality = {
        "lineCount": len(rows),
        "uniqueLineRatio": round(unique_ratio, 3),
        "duration": duration,
        "languageProbability": getattr(info, "language_probability", None)
    }
    return {
        "status": "generated",
        "source": "whisper",
        "lyrics": "\n".join(original_lines),
        "syncedLines": synced,
        "translatedLyrics": "\n".join(translations) if translations else None,
        "language": language,
        "quality": quality
    }


def main():
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    for raw in sys.stdin:
        request = {}
        try:
            request = json.loads(raw)
            request_id = request.get("requestId")
            result = process(request)
            response = {"requestId": request_id, **result}
        except Exception as exc:
            response = {"requestId": request.get("requestId") if "request" in locals() else None,
                        "status": "error", "error": str(exc)}
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
