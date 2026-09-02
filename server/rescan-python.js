// ============================================================
// server/rescan-python.js — Ejecutor de scripts/build_music_db.py
// ============================================================
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_BUILD_SCRIPT = path.join(__dirname, '..', 'scripts', 'build_music_db.py');
const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_DB = path.join(__dirname, 'localfy.db');
const DEFAULT_MUSIC = process.env.VITE_MUSIC_PATH || 'E:/musica';

/**
 * Ejecuta scripts/build_music_db.py usando spawn para flujo en tiempo real.
 */
export async function runBuildDbPython({ dbPath, musicDir, progressPath } = {}) {
  const candidates = [process.env.PYTHON, 'python', 'python3', 'py'].filter(Boolean);
  const args = [PYTHON_BUILD_SCRIPT, '--db', dbPath || DEFAULT_DB, '--music', musicDir || DEFAULT_MUSIC];
  if (progressPath) args.push('--progress', progressPath);

  const tryPython = (cmd) => new Promise((resolve, reject) => {
    console.log(`[python] 🚀 Intentando con: ${cmd}`);
    const child = spawn(cmd, args, { cwd: PROJECT_ROOT });

    child.stdout.on('data', (data) => {
      process.stdout.write(`[python] ${data}`);
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(`[python-err] ${data}`);
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`El script terminó con código ${code}`));
    });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') resolve('NEXT'); // Probar el siguiente comando
      else reject(err);
    });
  });

  for (const cmd of candidates) {
    const result = await tryPython(cmd);
    if (result !== 'NEXT') return { stdout: 'Completado', stderr: '' };
  }

  throw new Error("No se encontró un intérprete de Python (python, python3 o py).");
}
