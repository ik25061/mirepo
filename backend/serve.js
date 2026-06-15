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
const MUSIC_DIR = path.join('C:', 'Users', 'rafael', 'Documents', 'musica'); // Cambia esto a tu carpeta de música

app.use('/songs', express.static(MUSIC_DIR));

// GET: Listar canciones con Metadatos (Soporta paginación / Lazy Load)
app.get('/api/songs', async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    fs.readdir(MUSIC_DIR, async (err, files) => {
        if (err) return res.status(500).json({ error: 'Error al leer la carpeta' });

        const musicFiles = files.filter(file => 
            ['.mp3', '.wav', '.m4a', '.ogg'].includes(path.extname(file).toLowerCase())
        );

        // Segmento para Lazy Load
        const slicedFiles = musicFiles.slice(offset, offset + limit);

        // Promesas para leer los metadatos de este lote en paralelo
        const songsWithMeta = await Promise.all(slicedFiles.map(async (file) => {
            const filePath = path.join(MUSIC_DIR, file);
            try {
                const metadata = await mm.parseFile(filePath);
                return {
                    filename: file,
                    title: metadata.common.title || file.replace(/\.[^/.]+$/, ""),
                    artist: metadata.common.artist || "Desconocido",
                    album: metadata.common.album || "Desconocido",
                    genre: metadata.common.genre?.[0] || "Desconocido",
                    duration: metadata.format.duration || 0
                };
            } catch {
                // Si falla al leer los tags, enviamos datos genéricos
                return {
                    filename: file,
                    title: file.replace(/\.[^/.]+$/, ""),
                    artist: "Desconocido",
                    album: "Desconocido",
                    genre: "Desconocido",
                    duration: 0
                };
            }
        }));

        res.json({
            songs: songsWithMeta,
            hasMore: offset + limit < musicFiles.length
        });
    });
});




// ... (Todo tu código anterior se mantiene igual) ...

// PUT: Actualizar metadatos del archivo físico y descargar portada
app.put('/api/songs/update-metadata', async (req, res) => {
    const { filename, title, artist, genre, imageUrl } = req.body;
    const filePath = path.join(MUSIC_DIR, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'El archivo de música no existe en el disco.' });
    }

    try {
        // 1. Preparar las etiquetas básicas
        const tags = {
            title: title,
            artist: artist,
            genre: genre
        };

        // 2. Si MusicBrainz nos da una carátula, la descargamos y la incrustamos
        if (imageUrl) {
            const imagePath = path.join(MUSIC_DIR, `${path.parse(filename).name}.jpg`);
            
            try {
                // Descargar imagen de internet de forma local
                await download.image({ url: imageUrl, dest: imagePath });
                
                // Añadir la imagen a los tags ID3 del MP3
                tags.image = {
                    mime: "image/jpeg",
                    type: { id: 3, name: 'front cover' },
                    description: 'Portada Autodescargada',
                    imageBuffer: fs.readFileSync(imagePath)
                };
            } catch (imgError) {
                console.log("No se pudo procesar la carátula, guardando solo texto...", imgError);
            }
        }

        // 3. Escribir físicamente las etiquetas en el archivo MP3
        const success = NodeID3.write(tags, filePath);
        
        if (!success) {
            return res.status(500).json({ error: 'Error al escribir las etiquetas ID3 en el archivo.' });
        }

        res.json({ 
            message: 'Archivo actualizado físicamente con éxito.', 
            updatedSong: { filename, title, artist, genre } 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno al procesar el archivo.' });
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