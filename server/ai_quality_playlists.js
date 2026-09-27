// ============================================================
// ai_quality_playlists.js - LISTAS AUTOMATICAS DE CALIDAD IA
// (genero + BPM + tonalidad, incrementales y sin duplicados)
// ------------------------------------------------------------
// Port a Node.js de build_quality_playlists.py:
//
//  * Fuente de canciones analizadas: la tabla `songs`
//    (columnas bpm / key_name) MAS analyze_audio.log (JSONL),
//    por si el log trae analisis aun no volcados a la BD.
//  * Estado incremental: playlist_log.json junto a la BD, con
//    la misma forma que genera el script Python:
//      { playlists: { nombre: [songIds...] },
//        assigned_songs: [songIds...],
//        playlist_ids: { nombre: playlistId } }   <-- extension propia
//    Una cancion que ya aparece en `assigned_songs` NO se vuelve
//    a tocar ni se duplica en siguientes ejecuciones.
//  * Idempotencia en la BD: cada nombre de lista se resuelve a
//    UNA sola playlist (primero por el id guardado en el estado,
//    si no por nombre exacto) y solo se insertan las canciones
//    que falten, con su posicion final. Ejecutarlo N veces con
//    los mismos datos no crea listas nuevas ni duplica canciones.
//  * Exporta tambien playlists_calidad.md (igual que el script).
//
// Funciones exportadas:
//   runAiQualityPlaylists({ userId, bandWidth, minBandSize,
//                           dryRun, syncAudio, paths }) -> resumen
//   getAiQualityStatus() -> { analyzed, assigned, pending, ... }
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PATHS = {
  log: path.join(__dirname, 'analyze_audio.log'),
  state: path.join(__dirname, 'playlist_log.json'),
  md: path.join(__dirname, 'playlists_calidad.md'),
};

// Marca que identifica las listas creadas por este generador.
export const AI_PLAYLIST_TAG = 'IA · calidad (BPM+tonalidad) · auto-generada por localFly';

// Misma limpieza de generos que el script Python, para que las
// etiquetas sigan siendo consistentes con playlists_calidad.md.
const EXCLUDE_GENRES = new Set([
  'Desconocido', 'Music', 'Entertainment', 'People & Blogs',
  'Sycano', 'Xonazz', 'Mex', 'Tex', 'Regional',
]);
const MERGE_GENRES = {
  Latina: 'Latin',
  'Norteña': 'Norteño',
  Rb: 'R&B',
  'R&b': 'R&B',
  Texano: 'Tejano',
  Alternativo: 'Alternative',
};

// Orden circular de tonalidades (circulo de quintas) para encadenar
// armonicamente las canciones dentro de cada franja de BPM.
const CIRCLE_OF_FIFTHS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
const KEY_ORDER = new Map(CIRCLE_OF_FIFTHS.map((name, i) => [name, i]));

export function bpmBand(bpm, width = 10) {
  if (bpm === null || bpm === undefined || Number.isNaN(Number(bpm))) return null;
  const low = Math.floor(Number(bpm) / width) * width;
  return `${low}-${low + width - 1} BPM`;
}

export function keySortValue(keyName) {
  if (!keyName) return [99, 99];
  const root = String(keyName).split(' ')[0];
  const mode = String(keyName).endsWith('major') ? 0 : 1;
  const order = KEY_ORDER.has(root) ? KEY_ORDER.get(root) : 50;
  return [order, mode];
}

// Candado en memoria: evita dos generaciones concurrentes que
// podrian crear la misma lista dos veces antes de guardar el estado.
let RUN_LOCK = false;

function readAnalyzedFromLog(logPath) {
  // Lee el JSONL de analyze_audio.py y se queda con el ULTIMO
  // resultado 'ok' de cada song_id. No falla si el archivo no existe.
  const latest = new Map();
  if (!logPath || !fs.existsSync(logPath)) return latest;
  const raw = fs.readFileSync(logPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec;
    try { rec = JSON.parse(trimmed); } catch { continue; }
    if (rec && rec.status === 'ok' && rec.bpm !== null && rec.bpm !== undefined && rec.song_id) {
      latest.set(String(rec.song_id), {
        song_id: String(rec.song_id),
        bpm: Number(rec.bpm),
        key_name: rec.key_name ?? null,
      });
    }
  }
  return latest;
}

async function readAnalyzedFromDb(database, syncAudio) {
  // Lee bpm/key_name guardados en songs. Si syncAudio=true, primero
  // vuelca a la BD los analisis del log que falten (mismo efecto que
  // haberlos importado antes; no toca los que ya tienen valores).
  if (syncAudio) {
    const fromLog = readAnalyzedFromLog(DEFAULT_PATHS.log);
    for (const rec of fromLog.values()) {
      try {
        await database.run(
          `UPDATE songs SET bpm = COALESCE(bpm, ?), key_name = COALESCE(key_name, ?)
           WHERE id = ? AND (bpm IS NULL OR key_name IS NULL)`,
          [rec.bpm, rec.key_name, rec.song_id],
        );
      } catch { /* una fila mala no aborta la sincronizacion */ }
    }
  }
  const rows = await database.all(
    `SELECT id, bpm, key_name FROM songs WHERE bpm IS NOT NULL`,
  );
  return new Map(rows.map((r) => [String(r.id), {
    song_id: String(r.id),
    bpm: Number(r.bpm),
    key_name: r.key_name ?? null,
  }]));
}

function mergeAnalyzed(fromDb, fromLog) {
  // El log manda (es lo mas reciente calculado por analyze_audio.py);
  // la BD aporta las que el log ya no trae.
  const merged = new Map(fromDb);
  for (const [sid, rec] of fromLog) merged.set(sid, rec);
  return merged;
}

async function loadGenreData(database) {
  // Nombres de genero canonicos (con EXCLUDE/MERGE) y votos por artista.
  const genreRows = await database.all(`SELECT id, name FROM genres`);
  const canonByGid = new Map();
  for (const { id, name } of genreRows) {
    if (!name || EXCLUDE_GENRES.has(name)) continue;
    canonByGid.set(id, MERGE_GENRES[name] ?? name);
  }
  const sgRows = await database.all(`SELECT song_id, genre_id FROM song_genres`);
  const songGenre = new Map();
  for (const { song_id, genre_id } of sgRows) {
    const canon = canonByGid.get(genre_id);
    if (!canon) continue;
    if (!songGenre.has(song_id)) songGenre.set(song_id, new Set());
    songGenre.get(song_id).add(canon);
  }
  const saRows = await database.all(`SELECT song_id, artist_id FROM song_artists WHERE is_main = 1`);
  const mainArtist = new Map(saRows.map((r) => [String(r.song_id), r.artist_id]));
  const artistVotes = new Map(); // artistId -> Map(genre -> count)
  for (const [sid, genres] of songGenre) {
    const aid = mainArtist.get(String(sid));
    if (aid === undefined || aid === null) continue;
    if (!artistVotes.has(aid)) artistVotes.set(aid, new Map());
    const votes = artistVotes.get(aid);
    for (const g of genres) votes.set(g, (votes.get(g) ?? 0) + 1);
  }
  return { songGenre, mainArtist, artistVotes };
}

function chooseGenre(songId, songGenre, artistVotes, mainArtist) {
  // Genero principal: el propio si lo tiene (alfabetico si hay varios,
  // determinista), si no el mas comun del artista principal.
  const genres = songGenre.get(String(songId));
  if (genres && genres.size > 0) return [...genres].sort()[0];
  const aid = mainArtist.get(String(songId));
  const votes = aid !== undefined && aid !== null ? artistVotes.get(aid) : null;
  if (votes && votes.size > 0) {
    let best = null;
    let bestCount = -1;
    for (const [g, c] of votes) {
      if (c > bestCount || (c === bestCount && (best === null || g < best))) {
        best = g; bestCount = c;
      }
    }
    return best;
  }
  return 'Sin genero';
}

function loadState(statePath) {
  // Estado incremental con la forma del script Python + playlist_ids
  // (extension propia para no buscar por nombre en cada ejecucion).
  if (statePath && fs.existsSync(statePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      return {
        playlists: raw.playlists && typeof raw.playlists === 'object' ? raw.playlists : {},
        assigned: new Set(Array.isArray(raw.assigned_songs) ? raw.assigned_songs.map(String) : []),
        playlistIds: raw.playlist_ids && typeof raw.playlist_ids === 'object' ? raw.playlist_ids : {},
        migrated: false,
      };
    } catch {
      // estado corrupto: se reconstruye desde cero sin perder la BD
    }
  }
  return { playlists: {}, assigned: new Set(), playlistIds: {}, migrated: false };
}

function saveState(statePath, playlists, assigned, playlistIds) {
  const payload = {
    playlists,
    assigned_songs: [...assigned].sort(),
    playlist_ids: playlistIds,
  };
  const tmp = `${statePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 1), 'utf8');
  fs.renameSync(tmp, statePath); // escritura atomica
}

function sortPlaylistSongIds(songIds, analyzed) {
  // Orden de "mezcla DJ": primero BPM ascendente, luego tonalidad
  // segun el circulo de quintas (igual que el script Python).
  const val = (sid) => {
    const rec = analyzed.get(String(sid));
    const bpm = rec ? rec.bpm : 9999;
    const [ko, mode] = keySortValue(rec ? rec.key_name : null);
    return [bpm, ko, mode];
  };
  return [...songIds].sort((a, b) => {
    const [ba, ka, ma] = val(a);
    const [bb, kb, mb] = val(b);
    return ba - bb || ka - kb || ma - mb || String(a).localeCompare(String(b));
  });
}

async function resolveOwnerUserId(database, userId) {
  // Las listas quedan a nombre del usuario que pulso el boton IA.
  // Si no existe (o no se indico), se hereda el primer ADMIN y en
  // ultimo caso el usuario mas antiguo, para no dejarlas huerfanas.
  if (userId !== null && userId !== undefined && String(userId) !== '') {
    const row = await database.get(`SELECT id FROM users WHERE id = ?`, [userId]);
    if (row) return row.id;
  }
  const admin = await database.get(`SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1`);
  if (admin) return admin.id;
  const first = await database.get(`SELECT id FROM users ORDER BY id LIMIT 1`);
  return first ? first.id : null;
}

async function resolvePlaylistId(database, name, ownerId, statePlaylistIds) {
  // 1) id guardado en el estado (superviviente entre ejecuciones).
  // 2) busqueda por nombre exacto (cubre estados perdidos o listas
  //    importadas a mano con el mismo nombre).
  const saved = statePlaylistIds[name];
  if (saved) {
    const row = await database.get(`SELECT id FROM playlists WHERE id = ?`, [saved]);
    if (row) return { id: row.id, reused: true };
    delete statePlaylistIds[name]; // la lista se borro a mano: se recreara
  }
  const byName = await database.get(
    `SELECT id, user_id FROM playlists WHERE name = ? ORDER BY created_at LIMIT 1`,
    [name],
  );
  if (byName) {
    // Si era de otro usuario, se reasigna al que pulso el boton IA para
    // que la vea en "Mis listas"; las canciones se conservan.
    if (ownerId !== null && byName.user_id !== ownerId) {
      await database.run(`UPDATE playlists SET user_id = ? WHERE id = ?`, [ownerId, byName.id]);
    }
    return { id: byName.id, reused: true };
  }
  return { id: null, reused: false };
}

async function applyPlaylistToDb(database, { playlistId, name, description, ownerId, isPublic, orderedSongIds }) {
  // Crea la lista si no existe y deja playlist_songs EXACTAMENTE con
  // orderedSongIds en ese orden: inserta lo que falte (INSERT OR IGNORE)
  // y reescribe posiciones del resto (sin borrar aportaciones del
  // usuario que ya estuvieran dentro).
  let created = false;
  if (!playlistId) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await database.run(
      `INSERT INTO playlists (id, name, description, user_id, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, name, description, ownerId, isPublic ? 1 : 0],
    );
    playlistId = id;
    created = true;
  } else {
    await database.run(
      `UPDATE playlists SET description = ?, user_id = ?, is_public = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [description, ownerId, isPublic ? 1 : 0, playlistId],
    );
  }

  const haveRows = await database.all(
    `SELECT song_id FROM playlist_songs WHERE playlist_id = ?`, [playlistId],
  );
  const have = new Set(haveRows.map((r) => String(r.song_id)));
  let added = 0;
  for (const sid of orderedSongIds) {
    if (have.has(String(sid))) continue;
    try {
      await database.run(
        `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position, added_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [playlistId, String(sid), have.size + added],
      );
      added += 1;
    } catch { /* cancion inexistente (FK): se salta sin abortar */ }
  }
  // Reordena TODA la lista segun el orden calculado (BPM + tonalidad).
  // Las canciones que el usuario agrego a mano y no estan en el estado
  // conservan su sitio al final, en su orden previo.
  const current = await database.all(
    `SELECT song_id FROM playlist_songs WHERE playlist_id = ? ORDER BY position`, [playlistId],
  );
  const currentIds = current.map((r) => String(r.song_id));
  const orderedSet = new Set(orderedSongIds.map(String));
  const extras = currentIds.filter((sid) => !orderedSet.has(sid));
  const finalOrder = [...orderedSongIds.map(String), ...extras];
  let pos = 0;
  for (const sid of finalOrder) {
    await database.run(
      `UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND song_id = ?`,
      [pos++, playlistId, sid],
    );
  }
  await database.run(`UPDATE playlists SET updated_at = datetime('now') WHERE id = ?`, [playlistId]);
  return { playlistId, created, added };
}

function describePlaylistName(name) {
  return `Lista automatica IA — ${name}. ${AI_PLAYLIST_TAG}`;
}

export async function getAiQualityStatus(paths = {}) {
  // Solo lectura: para el dialogo previo del boton IA ("hay X canciones
  // nuevas por clasificar"). No escribe nada.
  const logPath = paths.log ?? DEFAULT_PATHS.log;
  const statePath = paths.state ?? DEFAULT_PATHS.state;
  const database = await db.getDb();
  const fromDb = await readAnalyzedFromDb(database, false);
  const merged = mergeAnalyzed(fromDb, readAnalyzedFromLog(logPath));
  const state = loadState(statePath);
  let pending = 0;
  for (const sid of merged.keys()) {
    if (!state.assigned.has(String(sid))) pending += 1;
  }
  return {
    analyzed: merged.size,
    assigned: state.assigned.size,
    pending,
    playlists: Object.keys(state.playlists).length,
    stateExists: !!(statePath && fs.existsSync(statePath)),
  };
}

export async function runAiQualityPlaylists(options = {}) {
  // Ejecuta el generador incremental y vuelca el resultado a la BD.
  // Garantias anti-duplicados:
  //   1. Las canciones ya presentes en `assigned_songs` no se reclasifican.
  //   2. Cada nombre de lista se resuelve a UNA playlist existente
  //      (por id guardado, si no por nombre) antes de crear nada.
  //   3. En playlist_songs solo se inserta lo que falte (INSERT OR IGNORE).
  //   4. Candado en memoria contra ejecuciones concurrentes.
  const {
    userId = null,
    bandWidth = 10,
    minBandSize = 6,
    isPublic = true,
    dryRun = false,
  } = options;
  const paths = options.paths ?? {};
  const logPath = paths.log ?? DEFAULT_PATHS.log;
  const statePath = paths.state ?? DEFAULT_PATHS.state;
  const mdPath = paths.md ?? DEFAULT_PATHS.md;

  if (RUN_LOCK) {
    const err = new Error('Ya hay una generacion de listas IA en curso');
    err.code = 'AI_BUSY';
    throw err;
  }
  RUN_LOCK = true;
  try {
    const database = await db.getDb();
    const ownerId = dryRun ? null : await resolveOwnerUserId(database, userId);

    // Canciones que existen de verdad (evita asignar ids huerfanos si la
    // biblioteca cambio desde el ultimo analisis).
    const existingRows = await database.all(`SELECT id FROM songs`);
    const existingSongs = new Set(existingRows.map((r) => String(r.id)));

    const fromDb = await readAnalyzedFromDb(database, false);
    const analyzed = mergeAnalyzed(fromDb, readAnalyzedFromLog(logPath));
    const { songGenre, mainArtist, artistVotes } = await loadGenreData(database);
    const state = loadState(statePath);
    const assigned = state.assigned;
    const playlists = {};
    for (const [name, ids] of Object.entries(state.playlists)) {
      playlists[name] = (Array.isArray(ids) ? ids : []).map(String).filter((sid) => existingSongs.has(sid));
    }
    const playlistIds = { ...state.playlistIds };

    // Solo canciones NUEVAS (no asignadas) y que existan en la BD.
    const newSongIds = [...analyzed.keys()]
      .map(String)
      .filter((sid) => !assigned.has(sid) && existingSongs.has(sid));

    // Tamanos de franja (genero, banda) con TODAS las analizadas
    // (viejas + nuevas), igual que el script Python.
    const genreBandCounts = new Map();
    const bandKey = (g, b) => `${g}||${b}`;
    for (const sid of analyzed.keys()) {
      const s = String(sid);
      if (!existingSongs.has(s)) continue;
      const rec = analyzed.get(s);
      const g = chooseGenre(s, songGenre, artistVotes, mainArtist);
      const b = bpmBand(rec.bpm, bandWidth);
      const k = bandKey(g, b);
      genreBandCounts.set(k, (genreBandCounts.get(k) ?? 0) + 1);
    }

    const addedPerPlaylist = {};
    for (const sid of newSongIds) {
      const rec = analyzed.get(sid);
      const genre = chooseGenre(sid, songGenre, artistVotes, mainArtist);
      const band = bpmBand(rec.bpm, bandWidth);
      const name = (genreBandCounts.get(bandKey(genre, band)) ?? 0) >= minBandSize
        ? `${genre} - ${band}`
        : `${genre} - Variado`;
      if (!playlists[name]) playlists[name] = [];
      if (!playlists[name].includes(sid)) playlists[name].push(sid);
      assigned.add(sid);
      addedPerPlaylist[name] = (addedPerPlaylist[name] ?? 0) + 1;
    }

    // Orden "mezcla DJ" dentro de cada lista (BPM + tonalidad).
    for (const name of Object.keys(playlists)) {
      playlists[name] = sortPlaylistSongIds(playlists[name], analyzed);
    }

    // Volcado a la BD (omitido en dryRun): crea/reutiliza cada lista
    // y agrega solo las canciones que falten, con el orden calculado.
    const applied = [];
    let createdCount = 0;
    let reusedCount = 0;
    let songsAdded = 0;
    // Solo se tocan las listas nuevas o cambiadas: una re-ejecucion sin
    // datos nuevos no escribe NADA en la BD (ni updated_at).
    const prevPlaylists = state.playlists ?? {};
    const sameOrder = (a, b) => {
      if (!Array.isArray(a) || a.length !== b.length) return false;
      for (let i = 0; i < b.length; i += 1) {
        if (String(a[i]) !== String(b[i])) return false;
      }
      return true;
    };
    const changedPlaylists = new Set(Object.keys(addedPerPlaylist));
    for (const name of Object.keys(playlists)) {
      if (!sameOrder(prevPlaylists[name], playlists[name])) changedPlaylists.add(name);
    }
    if (!dryRun) {
      await database.run('BEGIN IMMEDIATE');
      try {
        for (const name of Object.keys(playlists).sort()) {
          if (!changedPlaylists.has(name) && playlistIds[name]) continue; // intacta: ni se toca
          const { id } = await resolvePlaylistId(database, name, ownerId, playlistIds);
          const res = await applyPlaylistToDb(database, {
            playlistId: id,
            name,
            description: describePlaylistName(name),
            ownerId,
            isPublic,
            orderedSongIds: playlists[name],
          });
          playlistIds[name] = res.playlistId;
          if (res.created) createdCount += 1; else reusedCount += 1;
          songsAdded += res.added;
          applied.push({ name, playlistId: res.playlistId, total: playlists[name].length, added: res.added, created: res.created });
        }
        await database.run('COMMIT');
      } catch (err) {
        try { await database.run('ROLLBACK'); } catch {}
        throw err;
      }
      saveState(statePath, playlists, assigned, playlistIds);
      await writeQualityMarkdown(mdPath, playlists, analyzed, database, { bandWidth, statePath });
    }

    return {
      ok: true,
      dryRun,
      analyzed: analyzed.size,
      newClassified: newSongIds.length,
      totalAssigned: assigned.size,
      totalPlaylists: Object.keys(playlists).length,
      playlistsCreated: createdCount,
      playlistsReused: reusedCount,
      songsAdded,
      addedPerPlaylist,
      applied,
    };
  } finally {
    RUN_LOCK = false;
  }
}

async function writeQualityMarkdown(mdPath, playlists, analyzed, database, { bandWidth, statePath }) {
  // Regenera playlists_calidad.md entero a partir del estado,
  // igual que el script Python (para la IA local / consulta manual).
  const metaRows = await database.all(
    `SELECT s.id, s.title, al.year, ar.name AS artist
     FROM songs s
     LEFT JOIN albums al ON al.id = s.album_id
     LEFT JOIN song_artists sa ON sa.song_id = s.id AND sa.is_main = 1
     LEFT JOIN artists ar ON ar.id = sa.artist_id`,
  );
  const meta = new Map(metaRows.map((r) => [String(r.id), r]));
  const playlistSortKey = (name) => {
    const idx = name.lastIndexOf(' - ');
    const base = idx >= 0 ? name.slice(0, idx) : name;
    const suffix = idx >= 0 ? name.slice(idx) : '';
    return [base, suffix.includes('Variado') ? 1 : 0, suffix];
  };
  const namesSorted = Object.keys(playlists).sort((a, b) => {
    const [ba, oa, sa] = playlistSortKey(a);
    const [bb, ob, sb] = playlistSortKey(b);
    return ba.localeCompare(bb) || oa - ob || sa.localeCompare(sb);
  });
  const totalAssigned = Object.values(playlists).reduce((acc, ids) => acc + ids.length, 0);
  const out = [];
  out.push('# Playlists de calidad (genero + BPM + tonalidad) - LocalFly\n');
  out.push('Generadas a partir del analisis de audio real: solo incluyen canciones que ya tienen BPM y tonalidad calculados. Dentro de cada lista, las canciones estan ordenadas por BPM y luego por tonalidad (circulo de quintas) para que la transicion entre canciones sea mas suave, como en un mix de DJ.\n');
  out.push(`- Canciones analizadas disponibles: ${analyzed.size}`);
  out.push(`- Canciones clasificadas en listas: ${totalAssigned}`);
  out.push(`- Total de listas: ${namesSorted.length}`);
  out.push(`- Ancho de franja de BPM: ${bandWidth}`);
  out.push(`- Este archivo se regenera completo en cada ejecucion, pero el archivo de estado (\`${path.basename(statePath)}\`) es incremental: solo agrega canciones nuevas y nunca duplica ni reordena lo que ya estaba.\n`);
  out.push('## Indice\n');
  for (const name of namesSorted) out.push(`- ${name} (${playlists[name].length} canciones)`);
  out.push('');
  for (const name of namesSorted) {
    out.push(`## ${name} (${playlists[name].length} canciones)\n`);
    for (const sid of playlists[name]) {
      const info = meta.get(String(sid)) ?? {};
      const rec = analyzed.get(String(sid));
      const yr = info.year ?? 's/f';
      out.push(`- \`${sid}\` — ${info.title ?? '?'} — ${info.artist ?? 'Artista desconocido'} (${yr}) — ${rec ? rec.bpm : '?'} BPM, ${rec ? rec.key_name : '?'}`);
    }
    out.push('');
  }
  const tmp = `${mdPath}.tmp`;
  fs.writeFileSync(tmp, out.join('\n'), 'utf8');
  fs.renameSync(tmp, mdPath);
}

// Uso directo desde terminal (equivalente al script Python):
//   node ai_quality_playlists.js [--user=1] [--dry-run] [--no-md]
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const argVal = (name, def) => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(`--${name}=`.length) : def;
  };
  const has = (name) => args.includes(`--${name}`);
  runAiQualityPlaylists({
    userId: argVal('user', null),
    dryRun: has('dry-run'),
    paths: has('no-md') ? { md: path.join(__dirname, '.ai_quality_nomd.md') } : {},
  }).then((res) => {
    console.log(`analizadas=${res.analyzed} nuevas=${res.newClassified} listas=${res.totalPlaylists} (creadas=${res.playlistsCreated} reutilizadas=${res.playlistsReused}) canciones agregadas=${res.songsAdded}`);
    process.exit(0);
  }).catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
