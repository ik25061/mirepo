// ============================================================
// fix-db-names.mjs - CORRIGE NOMBRES DE ARTISTAS, GÉNEROS Y ÁLBUMES
// ------------------------------------------------------------
// Qué hace:
//   1. BACKUP de localfy.db
//   2. GÉNEROS: parte los géneros con byte nulo (fusionaban varios
//      géneros), re-vincula canciones a los géneros limpios reales,
//      fusiona duplicados por acento/caso.
//   3. ARTISTAS: fusiona grupos duplicados (mayúsculas/puntuación/
//      acentos) y repara los artistas con byte nulo eligiendo el
//      nombre real de artista.
//   4. ÁLBUMES: repara nombres con byte nulo, espacios extra y
//      codificación dañada (mojibake), y vuelve a fusionar duplicados.
// Ejecutar: node fix-db-names.mjs
// Con DRY_RUN=1 solo simula sin escribir.
// ============================================================
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'localfy.db');
const DRY_RUN = process.env.DRY_RUN === '1';

// ============================================================
// HELPERS
// ============================================================

function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Arregla cadenas que son UTF-8 leído como Latin-1 (mojibake): "Ã³"->"ó", "Ã±"->"ñ"
function decodeMojibake(str) {
  if (!str) return str;
  if (!/[ÃÂâ€â€™ÃƒÂ¬]/.test(str)) return str;
  if ([...str].some(ch => ch.codePointAt(0) > 0xFF)) return str;
  try {
    const decoded = Buffer.from(str, 'latin1').toString('utf8');
    if (decoded.includes('\uFFFD')) return str;
    return decoded;
  } catch {
    return str;
  }
}

// Limpia un nombre: trim, colapsa espacios, arregla mojibake
function cleanName(name) {
  if (!name) return '';
  let s = String(name);
  s = decodeMojibake(s);
  s = s.replace(/\u0000/g, ' ').trim();
  s = s.replace(/\s{2,}/g, ' ');
  return s.trim();
}

// ¿Es un marcador de posición / basura dentro de géneros, no un género real?
function isGenrePlaceholder(piece) {
  const p = piece.trim().toLowerCase();
  if (!p) return true;
  if (p.length <= 2) return true;
  if (/^[\d\W_]+$/.test(p)) return true;
  const placeholders = new Set([
    'other', 'genre', 'music', 'mix', 'mixes', 'unknown', 'none', 'various',
    'va', 'otro', 'otros', 'misc', 'miscellaneous', 'desconocido', 'n/a', 'na',
    'undefined', 'null', 'various artists', 'various artist', 'no genre',
    'sin genero', 'sin género', 'unknown genre', 'www', 'by', 'recommended',
    'tm', 'imm', 'cover', 'remix', 'single', 'sgenero', 'general',
  ]);
  return placeholders.has(p);
}

// Calidad del nombre (menor = mejor) para elegir el nombre canónico
function nameQuality(name) {
  let s = 0;
  if (/[\uFFFDÃ‚Â¨â‚¬]/.test(name)) s += 4; // artefactos de codificación
  const letters = name.replace(/[^A-Za-z\u00D1\u00F1\u00C0-\u00FF]/g, '');
  if (letters.length > 3 && letters === letters.toUpperCase()) s += 2; // TODO EN MAYÚSCULAS
  if (/\s{2,}/.test(name)) s += 2; // espacios dobles
  if (name !== name.trim()) s += 2; // espacios al inicio/final
  if (/'{2,}/.test(name)) s += 2; // ''x''
  if (/^[-–—.]|[-–—.]$/.test(name.trim())) s += 1; // guión al inicio/final
  return s;
}

function hasAccents(name) { return /[áéíóúüÁÉÍÓÚÜñÑ]/.test(name); }

// Elige el mejor nombre de un grupo (menor calidad -> más canciones -> más corto)
function pickBestName(candidates, songCounts) {
  let best = null;
  for (const c of candidates) {
    if (!best) { best = c; continue; }
    const cq = nameQuality(c);
    const bq = nameQuality(best);
    if (cq < bq) { best = c; continue; }
    if (cq > bq) continue;
    const ca = hasAccents(c) ? 1 : 0;
    const ba = hasAccents(best) ? 1 : 0;
    if (ca !== ba) { if (ca > ba) best = c; continue; }
    const cs = songCounts.get(c) || 0;
    const bs = songCounts.get(best) || 0;
    if (cs !== bs) { if (cs > bs) best = c; continue; }
    if (c.length !== best.length) { if (c.length < best.length) best = c; }
  }
  return best;
}


// ============================================================
// ABRIR BD + BACKUP
// ============================================================

async function main() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = OFF');

  // Tablas existentes (para re-apuntar referencias de forma segura)
  const tableExists = {};
  {
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of tables) tableExists[t.name] = true;
  }

  if (!DRY_RUN) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(__dirname, `localfy.db.bak-${stamp}`);
    fs.copyFileSync(DB_PATH, backup);
    console.log(`📦 Backup creado: ${backup}`);
  } else {
    console.log('🧪 MODO SIMULACIÓN (DRY_RUN) — no se escribe nada.');
  }

  let genresSplit = 0, genresCleanedLinks = 0, genresMerged = 0;
  let artistsFixed = 0, artistGroupsMerged = 0;
  let albumsFixed = 0, albumsMerged = 0;

  // ============================================================
  // PASO 2: GÉNEROS
  // ============================================================
  console.log('\n===== PASO 2: GÉNEROS =====');

  // 2a. Géneros limpios existentes (sin byte nulo) para reutilizar
  const cleanGenres = await db.all('SELECT id, name FROM genres WHERE INSTR(name, char(0)) = 0');
  const cleanNormMap = new Map(); // normalized name -> genre
  for (const g of cleanGenres) {
    const norm = normalizeText(g.name);
    if (!cleanNormMap.has(norm)) cleanNormMap.set(norm, g);
  }

  // 2b. Partir géneros con byte nulo y re-vincular canciones
  const corrGenres = await db.all('SELECT id, name FROM genres WHERE INSTR(name, char(0)) > 0');
  const pendingGenreDeletes = [];

  for (const cg of corrGenres) {
    const pieces = String(cg.name).split('\u0000').map(p => cleanName(p)).filter(p => p && p.toLowerCase() !== 'sin genero' && p !== 'Sin género');
    const resolved = new Set();
    const skipped = [];
    for (const piece of pieces) {
      const norm = normalizeText(piece);
      if (isGenrePlaceholder(piece)) { skipped.push(piece); continue; }
      if (cleanNormMap.has(norm)) {
        resolved.add(cleanNormMap.get(norm).id);
      } else {
        let gid;
        if (DRY_RUN) {
          gid = -(100000 + cleanGenres.length); // id sintético para simulación
        } else {
          const ins = await db.run('INSERT INTO genres (name) VALUES (?)', [piece]);
          gid = ins.lastID;
        }
        const g = { id: gid, name: piece };
        cleanGenres.push(g);
        cleanNormMap.set(norm, g);
        resolved.add(gid);
      }
    }
    if (resolved.size === 0) {
      pendingGenreDeletes.push(cg);
      continue;
    }
    const songIds = await db.all('SELECT DISTINCT song_id FROM song_genres WHERE genre_id = ?', [cg.id]);
    if (!DRY_RUN) {
      for (const sidRow of songIds) {
        for (const gid of resolved) {
          await db.run('INSERT OR IGNORE INTO song_genres (song_id, genre_id) VALUES (?, ?)', [sidRow.song_id, gid]);
        }
      }
    }
    genresCleanedLinks += songIds.length;
    pendingGenreDeletes.push(cg);
    genresSplit++;
    console.log(`  ✂️  Género corrupto id=${cg.id} → [${[...resolved].join(', ')}] (piezas: ${pieces.join(' | ')})${skipped.length ? ` | omitidas: ${skipped.join(', ')}` : ''}`);
  }

  if (!DRY_RUN) {
    for (const cg of pendingGenreDeletes) {
      await db.run('DELETE FROM genres WHERE id = ?', [cg.id]);
    }
  }

  // 2c. Fusionar géneros duplicados por nombre normalizado
  const genreList = await db.all('SELECT id, name FROM genres WHERE INSTR(name, char(0)) = 0');
  const gMap = new Map();
  for (const g of genreList) {
    const norm = normalizeText(g.name);
    if (norm) {
      if (!gMap.has(norm)) gMap.set(norm, []);
      gMap.get(norm).push(g);
    }
  }
  const gCounts = new Map();
  const gc = await db.all('SELECT genre_id, COUNT(*) AS c FROM song_genres GROUP BY genre_id');
  for (const r of gc) gCounts.set(r.genre_id, r.c);

  for (const [norm, group] of gMap) {
    if (group.length > 1) {
      const target = pickBestName(group.map(g => g.name), new Map(group.map(g => [g.name, gCounts.get(g.id) || 0])));
      const targetGenre = group.find(g => g.name === target);
      const dups = group.filter(g => g.id !== targetGenre.id);
      console.log(`  🔀 Género duplicado "${norm}": "${target}"(id=${targetGenre.id}) ← ${group.map(g=>`"${g.name}"(id=${g.id})`).join(', ')}`);
      if (!DRY_RUN) {
        for (const d of dups) {
          await db.run('INSERT OR IGNORE INTO song_genres (song_id, genre_id) SELECT song_id, ? FROM song_genres WHERE genre_id = ?', [targetGenre.id, d.id]);
          await db.run('DELETE FROM song_genres WHERE genre_id = ?', [d.id]);
          if (tableExists['user_favorite_genres']) {
            await db.run('INSERT OR IGNORE INTO user_favorite_genres (user_id, genre_id) SELECT user_id, ? FROM user_favorite_genres WHERE genre_id = ?', [targetGenre.id, d.id]);
            await db.run('DELETE FROM user_favorite_genres WHERE genre_id = ?', [d.id]);
          }
          await db.run('DELETE FROM genres WHERE id = ?', [d.id]);
        }
      }
      genresMerged += dups.length;
    }
  }

  console.log(`\n📊 Géneros: ${genresSplit} partidos, ${genresCleanedLinks} enlaces re-vinculados, ${genresMerged} duplicados fusionados.`);

  // ============================================================
  // PASO 3: ARTISTAS
  // ============================================================
  console.log('\n===== PASO 3: ARTISTAS =====');

  const mergeArtists = async (targetId, dupId) => {
    await db.run('INSERT OR IGNORE INTO song_artists (song_id, artist_id, is_main) SELECT song_id, ?, is_main FROM song_artists WHERE artist_id = ?', [targetId, dupId]);
    await db.run('DELETE FROM song_artists WHERE artist_id = ?', [dupId]);
    await db.run('INSERT OR IGNORE INTO album_artists (album_id, artist_id, is_main) SELECT album_id, ?, is_main FROM album_artists WHERE artist_id = ?', [targetId, dupId]);
    await db.run('DELETE FROM album_artists WHERE artist_id = ?', [dupId]);
    await db.run('UPDATE albums SET main_artist_id = ? WHERE main_artist_id = ?', [targetId, dupId]);
    // Interacciones de usuario por artista (LIKE/HIDE) - mantener la referencia
    if (tableExists['user_artist_interactions']) {
      await db.run('INSERT OR IGNORE INTO user_artist_interactions (user_id, artist_id, interaction_type, created_at) SELECT user_id, ?, interaction_type, created_at FROM user_artist_interactions WHERE artist_id = ?', [targetId, dupId]);
      await db.run('DELETE FROM user_artist_interactions WHERE artist_id = ?', [dupId]);
    }
    await db.run('DELETE FROM artists WHERE id = ?', [dupId]);
  };

  const unlinkArtist = async (artistId) => {
    await db.run('UPDATE albums SET main_artist_id = NULL WHERE main_artist_id = ?', [artistId]);
    await db.run('DELETE FROM album_artists WHERE artist_id = ?', [artistId]);
    await db.run('DELETE FROM song_artists WHERE artist_id = ?', [artistId]);
    await db.run('DELETE FROM artists WHERE id = ?', [artistId]);
  };


  // 3a. Reparar artistas con byte nulo
  const nullArtists = await db.all('SELECT id, name FROM artists WHERE INSTR(name, char(0)) > 0');
  const anorm = new Map();
  const aAll = await db.all('SELECT id, name FROM artists WHERE INSTR(name, char(0)) = 0');
  for (const a of aAll) {
    const n = normalizeText(a.name);
    if (n && !anorm.has(n)) anorm.set(n, a);
  }

  for (const na of nullArtists) {
    const parts = String(na.name).split('\u0000').map(p => cleanName(p)).map(p => decodeMojibake(p)).filter(Boolean);
    // 1) ¿Alguna parte coincide con un artista existente ya limpio?
    let matchedName = null;
    for (const part of parts) {
      const norm = normalizeText(part);
      if (anorm.has(norm)) { matchedName = anorm.get(norm); break; }
    }
    // 2) ¿Partes que se normalizan igual (corrupción de codificación)? -> ortografía limpia
    if (!matchedName) {
      const normParts = [...new Set(parts.map(p => normalizeText(p)).filter(Boolean))];
      if (normParts.length === 1 && parts.length > 1) {
        const cleanSpelling = parts.map(p => normalizeText(p) === normParts[0] ? p : '').filter(Boolean)[0] ||
          parts.sort((a, b) => nameQuality(a) - nameQuality(b))[0];
        matchedName = { id: na.id, name: cleanSpelling };
      }
    }
    if (matchedName && matchedName.name && matchedName.id !== na.id) {
      console.log(`  🧩 Artista corrupto id=${na.id} "${na.name.replace(/\u0000/g,'|')}" → fusionar en "${matchedName.name}"(id=${matchedName.id})`);
      if (!DRY_RUN) await mergeArtists(matchedName.id, na.id);
      artistsFixed++;
    } else if (matchedName && matchedName.id === na.id) {
      const newName = matchedName.name;
      console.log(`  ✨ Artista corrupto id=${na.id} → renombrar a "${newName}"`);
      if (!DRY_RUN) await db.run('UPDATE artists SET name = ? WHERE id = ?', [newName, na.id]);
      artistsFixed++;
    } else {
      const meaty = parts.filter(p => !isGenrePlaceholder(p) && !/^\d+$/.test(p) && p.length > 2);
      if (meaty.length === 0) {
        console.log(`  🗑️  Artista corrupto id=${na.id} "${na.name.replace(/\u0000/g,'|')}" sin nombre válido → eliminar enlaces`);
        if (!DRY_RUN) await unlinkArtist(na.id);
        artistsFixed++;
      } else {
        const candidate = meaty.sort((x, y) => x.length - y.length)[0];
        console.log(`  🧩 Artista corrupto id=${na.id} "${na.name.replace(/\u0000/g,'|')}" → usar "${candidate}"`);
        if (!DRY_RUN) await db.run('UPDATE artists SET name = ? WHERE id = ?', [candidate, na.id]);
        artistsFixed++;
      }
    }
  }

  // 3b. Fusionar grupos de artistas duplicados (fuzzy: mayúsculas/puntuación/acentos)
  const fuzzyKey = (name) => String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[&\-'.()_]/g, '').replace(/\s+/g, ' ').trim();
  const artistList = await db.all('SELECT id, name FROM artists WHERE INSTR(name, char(0)) = 0');
  const fMap = new Map();
  for (const a of artistList) {
    const k = fuzzyKey(a.name);
    if (!k) continue;
    if (!fMap.has(k)) fMap.set(k, []);
    fMap.get(k).push(a);
  }
  const aCounts = new Map();
  const ac = await db.all('SELECT artist_id, COUNT(*) AS c FROM song_artists GROUP BY artist_id');
  for (const r of ac) aCounts.set(r.artist_id, r.c);

  for (const [key, group] of fMap) {
    const distinctNames = [...new Set(group.map(g => g.name))];
    if (group.length > 1 && distinctNames.length > 1) {
      const target = pickBestName(distinctNames, new Map(distinctNames.map(nm => [nm, aCounts.get(group.find(g => g.name === nm).id) || 0])));
      const targetArtist = group.find(g => g.name === target);
      const dups = group.filter(g => g.id !== targetArtist.id);
      console.log(`  🔀 Grupo artista "${key}": "${target}"(id=${targetArtist.id}) ← ${dups.map(d=>`"${d.name}"(id=${d.id})`).join(', ')}`);
      if (!DRY_RUN) {
        for (const d of dups) await mergeArtists(targetArtist.id, d.id);
      }
      artistGroupsMerged += dups.length;
    }
  }

  console.log(`\n📊 Artistas: ${artistsFixed} corruptos reparados, ${artistGroupsMerged} duplicados fusionados.`);



  // ============================================================
  // PASO 4: ÁLBUMES
  // ============================================================
  console.log('\n===== PASO 4: ÁLBUMES =====');

  // 4a+b. Helpers para álbumes (rename con fusión ante conflicto de unicidad)
  const mergeAlbums = async (targetId, dupId) => {
    await db.run('UPDATE songs SET album_id = ? WHERE album_id = ?', [targetId, dupId]);
    const dup = await db.get('SELECT cover_path FROM albums WHERE id = ?', [dupId]);
    if (dup && dup.cover_path) {
      await db.run('UPDATE albums SET cover_path = ? WHERE id = ? AND (cover_path IS NULL OR cover_path = "")', [dup.cover_path, targetId]);
    }
    await db.run('DELETE FROM album_artists WHERE album_id = ?', [dupId]);
    if (tableExists['user_favorite_albums']) {
      await db.run('DELETE FROM user_favorite_albums WHERE album_id = ?', [dupId]);
    }
    await db.run('DELETE FROM albums WHERE id = ?', [dupId]);
  };

  // Asigna nombre limpio a un álbum; si ya existe otro con el mismo (name, main_artist_id)
  // (restricción UNIQUE) fusiona el actual en ese otro.
  const assignAlbumName = async (albumId, proposedName) => {
    const ab = await db.get('SELECT id, name, year, main_artist_id, cover_path FROM albums WHERE id = ?', [albumId]);
    if (!ab) return;
    const clean = cleanName(proposedName);
    if (!clean || clean === ab.name) return;
    const existing = await db.get(
      'SELECT * FROM albums WHERE name = ? AND (main_artist_id = ? OR (main_artist_id IS NULL AND ? IS NULL)) AND id != ? LIMIT 1',
      [clean, ab.main_artist_id, ab.main_artist_id, albumId]
    );
    if (existing) {
      console.log(`  🔀 Álbum id=${albumId} "${ab.name}" → fusión en "${existing.name}"(id=${existing.id})`);
      if (!DRY_RUN) await mergeAlbums(existing.id, albumId);
      albumsMerged++;
      return;
    }
    console.log(`  ✨ Álbum id=${albumId} "${ab.name.replace(/\u0000/g,'|')}" → "${clean}"`);
    if (!DRY_RUN) await db.run('UPDATE albums SET name = ? WHERE id = ?', [clean, albumId]);
    albumsFixed++;
  };

  // 4a. Álbumes con byte nulo
  const nullAlbums = await db.all('SELECT id, name FROM albums WHERE INSTR(name, char(0)) > 0');
  for (const ab of nullAlbums) {
    const parts = String(ab.name).split('\u0000').map(p => cleanName(p)).filter(Boolean);
    const meaty = parts.filter(p => !isGenrePlaceholder(p) && p.length > 2);
    const candidates = meaty.length ? meaty : parts;
    let newName;
    const distinctNorm = [...new Set(candidates.map(p => normalizeText(p)).filter(Boolean))];
    if (distinctNorm.length === 1 && candidates.length > 1) {
      newName = candidates.slice().sort((a, b) => {
        const d = nameQuality(a) - nameQuality(b);
        if (d !== 0) return d;
        return (hasAccents(b) ? 1 : 0) - (hasAccents(a) ? 1 : 0);
      })[0];
    } else {
      newName = candidates[0];
    }
    if (!newName) newName = 'Álbum desconocido';
    await assignAlbumName(ab.id, newName);
  }

  // 4b. Álbumes con espacios dobles / trailing / mojibake
  const messyAlbums = await db.all('SELECT id, name FROM albums WHERE INSTR(name, char(0)) = 0 AND (name != trim(name) OR name LIKE "%  %" OR name LIKE "%Ã%" OR name LIKE "%â€%" OR name LIKE "%‚%")');
  for (const ab of messyAlbums) {
    const cleaned = cleanName(ab.name);
    if (cleaned && cleaned !== ab.name) {
      await assignAlbumName(ab.id, cleaned);
    }
  }

  // 4c. Fusionar álbumes duplicados restantes (mismo nombre normalizado + año + artista principal)
  const albumList = await db.all('SELECT id, name, year, main_artist_id, cover_path FROM albums');
  const albMap = new Map();
  for (const ab of albumList) {
    const norm = normalizeText(ab.name);
    if (!norm) continue;
    const key = `${norm}|${ab.year || 'null'}|${ab.main_artist_id || 'null'}`;
    if (!albMap.has(key)) albMap.set(key, []);
    albMap.get(key).push(ab);
  }
  for (const [key, group] of albMap) {
    if (group.length > 1) {
      const target = group.find(a => a.cover_path) || group.sort((a,b) => a.id - b.id)[0];
      const dups = group.filter(a => a.id !== target.id);
      console.log(`  🔀 Álbum duplicado "${target.name}"(id=${target.id}) ← ${dups.map(d=>`"${d.name}"(id=${d.id})`).join(', ')}`);
      for (const d of dups) {
        if (DRY_RUN) { albumsMerged++; continue; }
        await mergeAlbums(target.id, d.id);
        albumsMerged++;
      }
    }
  }

  console.log(`\n📊 Álbumes: ${albumsFixed} reparados, ${albumsMerged} duplicados fusionados.`);


  // ============================================================
  // LIMPIEZA DE REFERENCIAS HUÉRFANAS
  // ============================================================
  console.log('\n===== LIMPIEZA DE HUÉRFANOS =====');
  if (!DRY_RUN) {
    await db.run('DELETE FROM song_genres WHERE genre_id NOT IN (SELECT id FROM genres)');
    await db.run('DELETE FROM song_artists WHERE artist_id NOT IN (SELECT id FROM artists)');
    await db.run('DELETE FROM album_artists WHERE artist_id NOT IN (SELECT id FROM artists) OR album_id NOT IN (SELECT id FROM albums)');
    await db.run('UPDATE albums SET main_artist_id = NULL WHERE main_artist_id NOT IN (SELECT id FROM artists)');
    await db.run('UPDATE songs SET album_id = NULL WHERE album_id IS NOT NULL AND album_id NOT IN (SELECT id FROM albums)');
  }
  const orphanStats = await db.get(`SELECT
    (SELECT COUNT(*) FROM song_genres WHERE genre_id NOT IN (SELECT id FROM genres))
    + (SELECT COUNT(*) FROM song_artists WHERE artist_id NOT IN (SELECT id FROM artists))
    + (SELECT COUNT(*) FROM album_artists WHERE (artist_id NOT IN (SELECT id FROM artists) OR album_id NOT IN (SELECT id FROM albums)))
    AS orphans`);
  console.log(`  🧹 Referencias huérfanas restantes: ${orphanStats.orphans}`);

  // ============================================================
  // RESUMEN FINAL
  // ============================================================
  console.log('\n' + '='.repeat(64));
  console.log(DRY_RUN ? '🧪 RESUMEN (SIMULACIÓN — no aplicado)' : '✅ RESUMEN DE CORRECCIÓN:');
  console.log('='.repeat(64));
  console.log(`  🎵 Géneros: ${genresSplit} partidos, ${genresCleanedLinks} enlaces re-vinculados, ${genresMerged} fusionados`);
  console.log(`  🎤 Artistas: ${artistsFixed} corruptos reparados, ${artistGroupsMerged} duplicados fusionados`);
  console.log(`  💿 Álbumes: ${albumsFixed} reparados, ${albumsMerged} duplicados fusionados`);

  if (!DRY_RUN) console.log('\n🎉 Corrección completada. Puedes ejecutar un rescan (POST /api/rescan) para refrescar la app.');
  await db.close();
}

main().catch((e) => { console.error('❌ Error:', e); process.exit(1); });
