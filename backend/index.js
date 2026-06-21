import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { parseFile } from "music-metadata";
import {
  scanLibrary,
  getCache,
  getSongById,
  absolutePath,
  MUSIC_DIR,
  TRASH_DIR,
  forceRescan
} from "./scanner.js";
import {
  getUserPrefs,
  setSongPref,
  setArtistHidden,
  setAlbumHidden,
  getOrCreateUser,
  getUserById,
  initDatabase
} from "./db.js";
import { authenticate, generateToken } from "./auth.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS para desarrollo
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// ====== RUTAS DE AUTENTICACIÓN ======

/**
 * POST /api/auth/google
 * Recibe el perfil de Google desde el frontend y genera un token
 */
app.post("/api/auth/google", async (req, res) => {
  try {
    const { profile } = req.body;
    
    if (!profile || !profile.id || !profile.email) {
      return res.status(400).json({ error: "Perfil inválido" });
    }

    // Guardar o actualizar usuario
    const user = await getOrCreateUser({
      id: profile.id,
      email: profile.email,
      name: profile.name || profile.email.split("@")[0],
      picture: profile.picture || null
    });

    // Generar token
    const token = generateToken(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture
      },
      token
    });
  } catch (error) {
    console.error("[auth/google]", error);
    res.status(500).json({ error: "Error en autenticación" });
  }
});

/**
 * GET /api/auth/me
 * Obtiene el usuario actual desde el token
 */
app.get("/api/auth/me", authenticate, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture
    });
  } catch (error) {
    console.error("[auth/me]", error);
    res.status(500).json({ error: "Error al obtener usuario" });
  }
});

// ====== RUTAS DE BIBLIOTECA (protegidas) ======

/**
 * GET /api/library
 * Devuelve la biblioteca con las preferencias del usuario
 */
app.get("/api/library", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { songs } = getCache();
    
    if (songs.length === 0) {
      await scanLibrary();
    }

    const { songPrefs, hiddenArtists, hiddenAlbums } = await getUserPrefs(userId);

    // Filtrar canciones
    const visible = [];
    const hiddenAlbumNames = new Set(hiddenAlbums.map(a => a.album));
    const hiddenArtistNames = new Set(hiddenArtists);

    for (const s of getCache().songs) {
      const prefs = songPrefs[s.id];
      
      // Ocultar si está marcada como eliminada u oculta por el usuario
      if (prefs && (prefs.deleted || prefs.hidden)) continue;
      
      // Ocultar si el artista está en la lista de ocultos
      if (hiddenArtistNames.has(s.artist)) continue;
      
      // Ocultar si el álbum está en la lista de ocultos
      if (hiddenAlbumNames.has(s.album)) continue;
      
      visible.push({
        ...s,
        liked: Boolean(prefs && prefs.liked),
        relPath: s.relPath,
        path: undefined // No enviar la ruta completa al frontend
      });
    }

    // Contar archivos en papelera
    let trashCount = 0;
    try {
      trashCount = fs.readdirSync(TRASH_DIR).filter(f => !f.startsWith(".")).length;
    } catch {}

    res.json({
      songs: visible,
      total: songs.length,
      counts: {
        visible: visible.length,
        trash: trashCount
      },
      hiddenArtists: [...hiddenArtistNames],
      hiddenAlbums: hiddenAlbums
    });
  } catch (error) {
    console.error("[api/library]", error);
    res.status(500).json({ error: "No se pudo cargar la biblioteca" });
  }
});

/**
 * POST /api/rescan
 * Fuerza un rescan de la biblioteca
 */
app.post("/api/rescan", authenticate, async (req, res) => {
  try {
    await forceRescan();
    res.json({ ok: true, message: "Biblioteca reescaneada" });
  } catch (error) {
    console.error("[api/rescan]", error);
    res.status(500).json({ error: "Error al reescanear" });
  }
});

// ====== RUTAS DE PREFERENCIAS ======

/**
 * POST /api/songs/:id/like
 * Marca/desmarca una canción como favorita
 */
app.post("/api/songs/:id/like", authenticate, async (req, res) => {
  try {
    const song = getSongById(req.params.id);
    if (!song) {
      return res.status(404).json({ error: "Canción no encontrada" });
    }
    await setSongPref(req.user.id, song, "liked", Boolean(req.body.liked));
    res.json({ ok: true });
  } catch (error) {
    console.error("[api/like]", error);
    res.status(500).json({ error: "Error al actualizar preferencia" });
  }
});

/**
 * POST /api/songs/:id/hide
 * Oculta una canción (no me gusta)
 */
app.post("/api/songs/:id/hide", authenticate, async (req, res) => {
  try {
    const song = getSongById(req.params.id);
    if (!song) {
      return res.status(404).json({ error: "Canción no encontrada" });
    }
    await setSongPref(req.user.id, song, "hidden", true);
    res.json({ ok: true });
  } catch (error) {
    console.error("[api/hide]", error);
    res.status(500).json({ error: "Error al ocultar canción" });
  }
});

/**
 * POST /api/songs/:id/delete
 * Mueve una canción a la papelera
 */
app.post("/api/songs/:id/delete", authenticate, async (req, res) => {
  try {
    const song = getSongById(req.params.id);
    if (!song) {
      return res.status(404).json({ error: "Canción no encontrada" });
    }

    const src = absolutePath(song.relPath);
    const dest = path.join(TRASH_DIR, path.basename(song.relPath));
    
    fs.mkdirSync(TRASH_DIR, { recursive: true });
    
    // Evitar sobrescribir
    let finalDest = dest;
    let i = 1;
    while (fs.existsSync(finalDest)) {
      const ext = path.extname(dest);
      finalDest = path.join(TRASH_DIR, `${path.basename(dest, ext)} (${i})${ext}`);
      i++;
    }
    
    if (fs.existsSync(src)) {
      fs.renameSync(src, finalDest);
    }
    
    await setSongPref(req.user.id, song, "hidden", true);
    await forceRescan(); // Refrescar cache
    
    res.json({ ok: true });
  } catch (error) {
    console.error("[api/delete]", error);
    res.status(500).json({ error: "No se pudo mover a la papelera" });
  }
});

/**
 * POST /api/artists/hide
 * Oculta un artista completo
 */
app.post("/api/artists/hide", authenticate, async (req, res) => {
  try {
    const { artist } = req.body;
    if (!artist) {
      return res.status(400).json({ error: "Falta el artista" });
    }
    await setArtistHidden(req.user.id, artist, true);
    res.json({ ok: true });
  } catch (error) {
    console.error("[api/artist/hide]", error);
    res.status(500).json({ error: "Error al ocultar artista" });
  }
});

/**
 * POST /api/albums/hide
 * Oculta un álbum completo
 */
app.post("/api/albums/hide", authenticate, async (req, res) => {
  try {
    const { album, artist } = req.body;
    if (!album) {
      return res.status(400).json({ error: "Falta el álbum" });
    }
    await setAlbumHidden(req.user.id, album, artist, true);
    res.json({ ok: true });
  } catch (error) {
    console.error("[api/album/hide]", error);
    res.status(500).json({ error: "Error al ocultar álbum" });
  }
});

// ====== RUTAS DE AUDIO Y PORTADAS ======

/**
 * GET /cover/:id
 * Sirve la portada embebida de una canción
 */
app.get("/cover/:id", async (req, res) => {
  const song = getSongById(req.params.id);
  if (!song || !song.hasCover) {
    return res.status(404).end();
  }
  
  try {
    const meta = await parseFile(absolutePath(song.relPath));
    const pic = meta.common.picture && meta.common.picture[0];
    if (!pic) return res.status(404).end();
    
    res.set("Content-Type", pic.format || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(pic.data));
  } catch {
    res.status(404).end();
  }
});

/**
 * GET /audio/:id
 * Stream de audio con soporte Range
 */
app.get("/audio/:id", (req, res) => {
  const song = getSongById(req.params.id);
  if (!song) return res.status(404).end();
  
  const filePath = absolutePath(song.relPath);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  const ext = path.extname(filePath).toLowerCase();
  
  const mimeTypes = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".webm": "audio/webm"
  };
  const mime = mimeTypes[ext] || "audio/mpeg";

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
    
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": mime,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": stat.size,
      "Content-Type": mime,
      "Accept-Ranges": "bytes"
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ====== INICIO DEL SERVIDOR ======

async function start() {
  try {
    // Inicializar base de datos
    await initDatabase();
    console.log("[server] Base de datos inicializada");
    
    // Escanear biblioteca
    await scanLibrary();
    console.log("[server] Biblioteca escaneada");
    
    // Obtener IP local
    const { networkInterfaces } = await import("os");
    const nets = networkInterfaces();
    let localIP = "127.0.0.1";
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === "IPv4" && !net.internal) {
          localIP = net.address;
          break;
        }
      }
    }
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log("\n🎵 ==========================================");
      console.log("   🎵 LUMINA - SERVIDOR DE MÚSICA");
      console.log("   ==========================================");
      console.log(`   📡 Local:    http://localhost:${PORT}`);
      console.log(`   📡 Red:      http://${localIP}:${PORT}`);
      console.log(`   📂 Música:   ${MUSIC_DIR}`);
      console.log(`   🗑️ Papelera: ${TRASH_DIR}`);
      console.log("   ==========================================");
      console.log("   📋 Endpoints:");
      console.log("   POST /api/auth/google    - Login con Google");
      console.log("   GET  /api/library        - Biblioteca");
      console.log("   POST /api/songs/:id/like - Like");
      console.log("   POST /api/songs/:id/hide - Ocultar");
      console.log("   POST /api/artists/hide   - Ocultar artista");
      console.log("   GET  /audio/:id          - Audio");
      console.log("   GET  /cover/:id          - Portada");
      console.log("   ==========================================\n");
    });
  } catch (error) {
    console.error("[server] Error al iniciar:", error);
    process.exit(1);
  }
}

// Manejo de señales
process.on("SIGINT", () => {
  console.log("\n🛑 Servidor detenido");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Servidor detenido");
  process.exit(0);
});

start();