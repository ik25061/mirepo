// ============================================================
// server/rescan-python.js — Ejecutor de scripts/build_music_db.py
// ============================================================
// Reconstruye localfy.db ejecutando el script Python (que genera IDs
// sha1(relPath), relPath nativos, UNIQUE(name, year), vistas y backup),
// alineado con server/db.js + server/scanner.js.
//
// Uso desde el server:
//   import { runBuildDbPython } from './rescan-python.js';
//   await runBuildDbPython();                       // DB real + E:/musica
//   await runBuildDbPython({ dbPath, musicDir });   // rutas personalizadas
// ============================================================

import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BUILD_SCRIPT = path.join(__dirname, '..', 'scripts', 'build_music_db.py');
const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_DB = path.join(__dirname, 'localfy.db');
const DEFAULT_MUSIC = process.env.VITE_MUSIC_PATH || 'E:/musica';

/**
 * Ejecuta scripts/build_music_db.py --db <dbPath> --music <musicDir>.
 * Prueba los intérpretes 'python', 'python3' y 'py' (en ese orden, o con
 * process.env.PYTHON si está configurado).
 *
 * @param {object} [opts]
 * @param {string} [opts.dbPath]  Ruta de la BD a reconstruir (default: server/localfy.db)
 * @param {string} [opts.musicDir] Carpeta de música (default: VITE_MUSIC_PATH o E:/musica)
 * @param {string} [opts.progressPath] Archivo JSON donde el script escribe el progreso (para el SSE del server)
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
export async function runBuildDbPython({ dbPath, musicDir, progressPath } = {}) {
  const candidates = [process.env.PYTHON, 'python', 'python3', 'py'].filter(Boolean);
  const args = ['--db', dbPath || DEFAULT_DB, '--music', musicDir || DEFAULT_MUSIC];
  if (progressPath) args.push('--progress', progressPath);

  const execOnce = (pythonCmd) => new Promise((resolve, reject) => {
    execFile(pythonCmd, [PYTHON_BUILD_SCRIPT, ...args], {
      cwd: PROJECT_ROOT,
      maxBuffer: 32 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });

  let lastNotFound = null;
  for (const pythonCmd of candidates) {
    try {
      return await execOnce(pythonCmd);
    } catch (err) {
      if (err.code === 'ENOENT') {
        lastNotFound = err;
        continue; // ese intérprete no existe en el PATH: probar el siguiente
      }
      // El script sí corrió pero falló: error real del build
      const detail = String(err.stderr || err.stdout || '')
        .trim()
        .split('\n')
        .slice(-10)
        .join('\n');
      throw new Error(`build_music_db.py falló (${pythonCmd}): ${detail}`);
    }
  }

  throw new Error(
    `No se encontró un intérprete de Python (python, python3 o py).` +
    ` Configura process.env.PYTHON si Python no está en el PATH. ${lastNotFound?.message || ''}`
  );
}