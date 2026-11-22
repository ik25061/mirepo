import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, 'lyrics_worker.py');
let child = null;
let reader = null;
let sequence = 0;
const pending = new Map();

function rejectPending(error) {
  for (const [id, callbacks] of pending) {
    callbacks.reject(error);
    pending.delete(id);
  }
}

function ensureWorker() {
  if (child && child.exitCode === null && !child.killed) return child;

  const python = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3');
  child = spawn(python, [workerPath], {
    cwd: __dirname,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  reader = readline.createInterface({ input: child.stdout });
  reader.on('line', line => {
    let response;
    try { response = JSON.parse(line); }
    catch {
      console.warn('[lyrics-worker] Invalid worker output:', line.slice(0, 300));
      return;
    }
    const callbacks = pending.get(String(response.requestId));
    if (!callbacks) return;
    pending.delete(String(response.requestId));
    if (response.status === 'error') callbacks.reject(new Error(response.error || 'Whisper transcription failed'));
    else callbacks.resolve(response);
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => console.log(String(chunk).trimEnd()));
  child.on('error', error => {
    rejectPending(error);
    child = null;
    reader = null;
  });
  child.on('exit', (code, signal) => {
    rejectPending(new Error(`Whisper worker stopped (code=${code}, signal=${signal})`));
    child = null;
    reader = null;
  });
  return child;
}

export function transcribeSong(songPath, options = {}) {
  const processRef = ensureWorker();
  const requestId = String(++sequence);
  const payload = {
    requestId,
    path: songPath,
    title: options.title || null,
    artist: options.artist || null,
    force: options.force === true,
    translate: options.translate !== false,
    model: process.env.LYRICS_MODEL || 'large-v3',
    device: process.env.LYRICS_DEVICE || 'auto',
    computeType: process.env.LYRICS_COMPUTE_TYPE || 'auto',
    language: options.language || null
  };

  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    try {
      processRef.stdin.write(JSON.stringify(payload) + '\n', 'utf8');
    } catch (error) {
      pending.delete(requestId);
      reject(error);
    }
  });
}

export async function shutdownLyricsWorker() {
  const current = child;
  if (!current) return;
  await new Promise(resolve => {
    const done = () => resolve();
    current.once('exit', done);
    try { current.stdin.end(); }
    catch { current.kill(); resolve(); }
    const fallback = setTimeout(() => {
      try { current.kill(); } catch {}
      resolve();
    }, 5000);
    fallback.unref?.();
  });
  if (reader) reader.close();
  child = null;
  reader = null;
}
