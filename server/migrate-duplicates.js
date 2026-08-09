// ============================================================
// migrate-duplicates.js - MIGRACIÓN DE DUPLICADOS
// ============================================================
// Este script fusiona artistas y álbumes duplicados
// Ejecutar una sola vez: node server/migrate-duplicates.js
// ============================================================

import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'localfy.db');

// Función helper para normalizar texto
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function migrate() {
  console.log('🔍 Iniciando migración de duplicados...');
  
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  await db.exec('PRAGMA foreign_keys = ON');

  try {
    // ============================================================
    // 1. MIGRACIÓN DE ARTISTAS DUPLICADOS
    // ============================================================
    
    console.log('\n📋 Paso 1: Detectando artistas duplicados...');
    
    const artists = await db.all('SELECT id, name FROM artists ORDER BY name');
    const artistGroups = new Map();
    
    // Agrupar artistas por nombre normalizado
    for (const artist of artists) {
      const normalized = normalizeText(artist.name);
      const baseName = normalized.split(/\s*&\s*|\s+con\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+vs\.?\s+/i)[0].trim();
      
      if (!artistGroups.has(baseName)) {
        artistGroups.set(baseName, []);
      }
      artistGroups.get(baseName).push(artist);
    }
    
    // Fusionar grupos con más de un artista
    let artistsMerged = 0;
    for (const [baseName, group] of artistGroups) {
      if (group.length > 1) {
        // Ordenar: el nombre más corto (más genérico) va primero
        group.sort((a, b) => a.name.length - b.name.length);
        
        const primaryArtist = group[0]; // El más corto/generico
        const duplicateArtists = group.slice(1);
        
        console.log(`\n  Fusión de artistas:`);
        console.log(`    ✅ Principal: "${primaryArtist.name}" (ID: ${primaryArtist.id})`);
        
        for (const dup of duplicateArtists) {
          console.log(`    🔄 Fusionando: "${dup.name}" (ID: ${dup.id}) → "${primaryArtist.name}"`);
          
          // Actualizar song_artists
          await db.run(
            'UPDATE song_artists SET artist_id = ? WHERE artist_id = ?',
            [primaryArtist.id, dup.id]
          );
          
          // Para album_artists, primero eliminamos las filas del duplicado
          // y luego insertamos las que faltan (evitando constraints)
          await db.run(
            'DELETE FROM album_artists WHERE artist_id = ?',
            [dup.id]
          );
          
          // Insertar relaciones que puedan faltar - manejar duplicados
          const albumArtists = await db.all(
            'SELECT album_id, is_main FROM album_artists WHERE artist_id = ?',
            [dup.id]
          );
          
          for (const aa of albumArtists) {
            await db.run(
              'INSERT OR IGNORE INTO album_artists (album_id, artist_id, is_main) VALUES (?, ?, ?)',
              [aa.album_id, primaryArtist.id, aa.is_main]
            );
          }
          
          // Actualizar user_artist_interactions
          await db.run(
            'UPDATE user_artist_interactions SET artist_id = ? WHERE artist_id = ?',
            [primaryArtist.id, dup.id]
          );
          
          // Eliminar el artista duplicado
          await db.run('DELETE FROM artists WHERE id = ?', [dup.id]);
          
          artistsMerged++;
        }
      }
    }
    
    console.log(`\n✅ Artistas fusionados: ${artistsMerged}`);
    
    // ============================================================
    // 2. MIGRACIÓN DE ÁLBUMES DUPLICADOS
    // ============================================================
    
    console.log('\n📋 Paso 2: Detectando álbumes duplicados...');
    
    const albums = await db.all(`
      SELECT al.id, al.name, al.year, al.main_artist_id, al.cover_path, a.name as artist_name
      FROM albums al
      LEFT JOIN artists a ON al.main_artist_id = a.id
      ORDER BY al.name, al.year
    `);
    
    const albumGroups = new Map();
    
    // Agrupar álbumes por nombre normalizado + año
    for (const album of albums) {
      const normalizedName = normalizeText(album.name);
      const key = `${normalizedName}|${album.year || 'null'}`;
      
      if (!albumGroups.has(key)) {
        albumGroups.set(key, []);
      }
      albumGroups.get(key).push(album);
    }
    
    let albumsMerged = 0;
    
    for (const [key, group] of albumGroups) {
      if (group.length > 1) {
        // Ordenar: priorizar el que tiene cover_path
        group.sort((a, b) => {
          if (a.cover_path && !b.cover_path) return -1;
          if (!a.cover_path && b.cover_path) return 1;
          return a.id - b.id;
        });
        
        const primaryAlbum = group[0];
        const duplicateAlbums = group.slice(1);
        
        console.log(`\n  Fusión de álbumes:`);
        console.log(`    ✅ Principal: "${primaryAlbum.name}" (ID: ${primaryAlbum.id})`);
        
        for (const dup of duplicateAlbums) {
          console.log(`    🔄 Fusionando: "${dup.name}" (ID: ${dup.id}) → "${primaryAlbum.name}" (ID: ${primaryAlbum.id})`);
          
          // Actualizar canciones para apuntar al álbum principal
          await db.run(
            'UPDATE songs SET album_id = ? WHERE album_id = ?',
            [primaryAlbum.id, dup.id]
          );
          
          // Actualizar portada si el principal no tiene y el duplicado sí
          if (!primaryAlbum.cover_path && dup.cover_path) {
            await db.run(
              'UPDATE albums SET cover_path = ? WHERE id = ?',
              [dup.cover_path, primaryAlbum.id]
            );
          }
          
          // Eliminar el álbum duplicado
          await db.run('DELETE FROM albums WHERE id = ?', [dup.id]);
          
          albumsMerged++;
        }
      }
    }
    
    console.log(`\n✅ Álbumes fusionados: ${albumsMerged}`);
    
    // ============================================================
    // 3. LIMPIAR REFERENCIAS HUÉRFANAS
    // ============================================================
    
    console.log('\n📋 Paso 3: Limpiando referencias huérfanas...');
    
    // Establecer main_artist_id a NULL para álbumes con artistas que ya no existen
    await db.exec(`
      UPDATE albums 
      SET main_artist_id = NULL 
      WHERE main_artist_id NOT IN (SELECT id FROM artists)
    `);
    
    // Eliminar álbumes sin artista principal
    await db.exec(`
      DELETE FROM albums 
      WHERE main_artist_id IS NULL
    `);
    
    console.log('✅ Referencias limpias');
    
    // ============================================================
    // 4. RESUMEN
    // ============================================================
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE MIGRACIÓN:');
    console.log('='.repeat(60));
    console.log(`  ✅ Artistas fusionados: ${artistsMerged}`);
    console.log(`  ✅ Álbumes fusionados: ${albumsMerged}`);
    console.log('\n🎉 Migración completada exitosamente!');
    console.log('\nAhora ejecuta un rescan de la biblioteca para aplicar los cambios:');
    console.log('  POST http://172.16.12.4:5002/api/rescan');
    
    await db.close();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error en la migración:', error);
    await db.close();
    process.exit(1);
  }
}

migrate();