const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata'); // Para leer artista, género, etc.
const NodeID3 = require('node-id3');
const download = require('image-downloader');

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ CONFIGURACIÓN: Tu carpeta de música
const MUSIC_DIR = path.join('C:', 'Users', 'rafael', 'Music'); // Cambia esto a tu carpeta de música

app.use('/songs', express.static(MUSIC_DIR));

// GET: Listar canciones con metadatos y detección de imágenes locales
app.get('/api/songs', async (req, res) => {
    const limit = parseInt(req.query.limit) || 30;
    const offset = parseInt(req.query.offset) || 0;

    const { parseFile } = await import('music-metadata');

    fs.readdir(MUSIC_DIR, async (err, files) => {
        if (err) return res.status(500).json({ error: 'Error al leer la carpeta' });

        const musicFiles = files.filter(file => 
            ['.mp3', '.wav', '.m4a', '.ogg'].includes(path.extname(file).toLowerCase())
        );

        const slicedFiles = musicFiles.slice(offset, offset + limit);

        const songsWithMeta = await Promise.all(slicedFiles.map(async (file) => {
            const filePath = path.join(MUSIC_DIR, file);
            const baseName = path.parse(file).name;
            const imageFileName = `${baseName}.jpg`;
            
            // Comprobar si existe la imagen física en la carpeta
            const hasImage = fs.existsSync(path.join(MUSIC_DIR, imageFileName));
            // Si existe, creamos la URL pública para el frontend, si no, null
            const imageUrl = hasImage ? `/songs/${encodeURIComponent(imageFileName)}` : null;

            try {
                const metadata = await parseFile(filePath, { skipCovers: true });
                
                let rawGenre = "Desconocido";
                if (metadata.common.genre) {
                    rawGenre = Array.isArray(metadata.common.genre) 
                        ? metadata.common.genre[0] 
                        : metadata.common.genre;
                }

                return {
                    filename: file,
                    title: metadata.common.title || baseName,
                    artist: metadata.common.artist || "Desconocido",
                    album: metadata.common.album || "Desconocido",
                    genre: rawGenre || "Desconocido",
                    duration: metadata.format.duration || 0,
                    imageUrl: imageUrl // <-- Enviamos la foto al frontend
                };
            } catch (err) {
                return {
                    filename: file,
                    title: baseName,
                    artist: "Desconocido",
                    album: "Desconocido",
                    genre: "Desconocido",
                    duration: 0,
                    imageUrl: imageUrl
                };
            }
        }));

        res.json({
            songs: songsWithMeta,
            hasMore: offset + limit < musicFiles.length
        });
    });
});

// PUT: Actualizar metadatos forzando strings limpios
app.put('/api/songs/update-metadata', async (req, res) => {
    const { filename, title, artist, genre, imageUrl } = req.body;
    const filePath = path.join(MUSIC_DIR, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'El archivo no existe.' });
    }

    try {
        // Aseguramos que el género vaya limpio y capitalizado
        const cleanGenre = genre ? String(genre).trim() : "Urbano";

        const tags = {
            title: String(title).trim(),
            artist: String(artist).trim(),
            genre: cleanGenre
        };

        if (imageUrl) {
            const imagePath = path.join(MUSIC_DIR, `${path.parse(filename).name}.jpg`);
            try {
                await download.image({ url: imageUrl, dest: imagePath });
                tags.image = {
                    mime: "image/jpeg",
                    type: { id: 3, name: 'front cover' },
                    description: 'Cover',
                    imageBuffer: fs.readFileSync(imagePath)
                };
            } catch (imgError) {
                console.log("No se pudo incrustar la imagen.");
            }
        }

        // Escribir tags nativos ID3v2.3
        const success = NodeID3.write(tags, filePath);
        
        if (!success) {
            return res.status(500).json({ error: 'Error al escribir tags.' });
        }

        // Devolvemos el objeto exactamente como quedó configurado
        res.json({ 
            message: 'Guardado', 
            updatedSong: { 
                filename, 
                title: tags.title, 
                artist: tags.artist, 
                genre: tags.genre,
                duration: 0
            } 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno.' });
    }
});







// DELETE: Eliminar archivo del disco
app.delete('/api/songs', (req, res) => {
    const { filename } = req.body;
    const filePath = path.join(MUSIC_DIR, filename);
    if (!filePath.startsWith(MUSIC_DIR)) return res.status(403).json({ error: 'Denegado' });

    fs.unlink(filePath, (err) => {
        if (err) return res.status(500).json({ error: 'No se pudo borrar' });
        res.json({ message: 'Eliminado' });
    });
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor con metadatos corriendo en puerto ${PORT}`);
});