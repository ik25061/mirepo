const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const NodeID3 = require('node-id3');
const download = require('image-downloader');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ CONFIGURACIÓN: Tu carpeta de música
const MUSIC_DIR = path.join('C:', 'Users', 'rafael', 'Music');

app.use('/songs', express.static(MUSIC_DIR));

// ====== FUNCIONES AUXILIARES ======
// Buscar artista en MusicBrainz y obtener información
const searchMusicBrainz = async (query) => {
    return new Promise((resolve) => {
        const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
        https.get(url, { headers: { 'User-Agent': 'MusicPlayer/1.0' } }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
};

// Buscar imagen del artista en Wikimedia Commons
const searchArtistImage = async (artistName) => {
    return new Promise((resolve) => {
        const query = encodeURIComponent(artistName + ' musician');
        const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(artistName)}&prop=pageimages&pithumbsize=500&format=json`;
        
        https.get(url, { headers: { 'User-Agent': 'MusicPlayer/1.0' } }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    const pages = result.query.pages;
                    const page = Object.values(pages)[0];
                    if (page && page.thumbnail) {
                        resolve(page.thumbnail.source);
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
};

// Descargar imagen desde URL
const downloadImage = async (imageUrl, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(imageUrl, { headers: { 'User-Agent': 'MusicPlayer/1.0' } }, (res) => {
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(dest);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
};

// Convertir audio a MP3 y borrar el original
const convertToMp3 = async (sourcePath) => {
    const ext = path.extname(sourcePath).toLowerCase();
    if (ext === '.mp3') return sourcePath;

    const outputPath = sourcePath.replace(ext, '.mp3');
    return new Promise((resolve, reject) => {
        ffmpeg(sourcePath)
            .setFfmpegPath(ffmpegStatic)
            .format('mp3')
            .audioCodec('libmp3lame')
            .audioBitrate(192)
            .on('end', () => {
                try {
                    fs.unlinkSync(sourcePath);
                } catch (err) {
                    console.warn('No se pudo borrar original:', err.message);
                }
                resolve(outputPath);
            })
            .on('error', (err) => {
                reject(err);
            })
            .save(outputPath);
    });
};

// Limpiar nombre para archivo
const cleanFileName = (name) => {
    return name.replace(/[<>:"/\\|?*]/g, '').substring(0, 100).trim();
};

// GET: Listar canciones con metadatos y detección de imágenes locales
app.get('/api/songs', async (req, res) => {
    const limit = parseInt(req.query.limit) || 30;
    const offset = parseInt(req.query.offset) || 0;

    const { parseFile } = await import('music-metadata');

    fs.readdir(MUSIC_DIR, async (err, files) => {
        if (err) return res.status(500).json({ error: 'Error al leer la carpeta' });

        const musicFiles = files.filter(file => 
            ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.wma', '.alac', '.aiff'].includes(path.extname(file).toLowerCase())
        );

        const slicedFiles = musicFiles.slice(offset, offset + limit);

        const songsWithMeta = await Promise.all(slicedFiles.map(async (file) => {
            const filePath = path.join(MUSIC_DIR, file);
            const baseName = path.parse(file).name;
            const imageFileName = `${baseName}.jpg`;
            const artistImageFileName = `${baseName}_artist.jpg`;
            
            // Buscar imágenes (portada o foto del artista)
            const hasImage = fs.existsSync(path.join(MUSIC_DIR, imageFileName));
            const hasArtistImage = fs.existsSync(path.join(MUSIC_DIR, artistImageFileName));
            
            const imageUrl = hasImage ? `/songs/${encodeURIComponent(imageFileName)}` : 
                            hasArtistImage ? `/songs/${encodeURIComponent(artistImageFileName)}` : null;

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
                    imageUrl: imageUrl
                };
            } catch (err) {
                const hasAnyImage = fs.existsSync(path.join(MUSIC_DIR, imageFileName)) || 
                                   fs.existsSync(path.join(MUSIC_DIR, artistImageFileName));
                const imageUrl = hasImage ? `/songs/${encodeURIComponent(imageFileName)}` : 
                                hasArtistImage ? `/songs/${encodeURIComponent(artistImageFileName)}` : null;
                
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

// PUT: Sincronizar con MusicBrainz y descargar metadatos/imágenes
app.put('/api/songs/sync-metadata', async (req, res) => {
    const { filename } = req.body;
    const originalFilePath = path.join(MUSIC_DIR, filename);

    if (!fs.existsSync(originalFilePath)) {
        return res.status(404).json({ error: 'El archivo no existe.' });
    }

    try {
        const filePath = await convertToMp3(originalFilePath);
        const convertedFilename = path.basename(filePath);
        const { parseFile } = await import('music-metadata');
        const currentMetadata = await parseFile(filePath);
        
        const title = currentMetadata.common.title || path.parse(convertedFilename).name;
        const searchQuery = `${title}`;

        console.log(`🔍 Buscando en MusicBrainz: "${searchQuery}"`);
        const mbData = await searchMusicBrainz(searchQuery);

        if (!mbData || !mbData.recordings || mbData.recordings.length === 0) {
            return res.status(404).json({ error: 'No se encontraron coincidencias en MusicBrainz' });
        }

        const recording = mbData.recordings[0];
        const newTitle = recording.title || title;
        const newArtist = recording['artist-credit']?.[0]?.name || "Desconocido";
        
        // Extraer género de tags
        let newGenre = "Urbano";
        if (recording.tags && recording.tags.length > 0) {
            const topTag = recording.tags.sort((a, b) => (b.count || 0) - (a.count || 0))[0];
            newGenre = topTag.name || "Urbano";
        }

        console.log(`✅ Encontrado: ${newArtist} - ${newTitle} (${newGenre})`);

        // Obtener imagen del álbum
        let albumImageUrl = null;
        const releaseId = recording.releases?.[0]?.id;
        if (releaseId) {
            try {
                const coverResponse = await new Promise((resolve) => {
                    https.get(`https://coverartarchive.org/release/${releaseId}`, 
                        { headers: { 'User-Agent': 'MusicPlayer/1.0' } }, (res) => {
                        let data = '';
                        res.on('data', chunk => { data += chunk; });
                        res.on('end', () => {
                            try {
                                const json = JSON.parse(data);
                                resolve(json.images?.[0]?.image || null);
                            } catch (e) {
                                resolve(null);
                            }
                        });
                    }).on('error', () => resolve(null));
                });
                albumImageUrl = coverResponse;
            } catch (err) {
                console.log("No se encontró portada de álbum");
            }
        }

        // Obtener imagen del artista
        let artistImageUrl = await searchArtistImage(newArtist);
        console.log(`🎭 Imagen del artista: ${artistImageUrl ? 'Encontrada' : 'No encontrada'}`);

        // Actualizar tags ID3
        const baseName = path.parse(filename).name;
        const tags = {
            title: newTitle,
            artist: newArtist,
            genre: newGenre
        };

        // Descargar y embeber portada del álbum si existe
        if (albumImageUrl) {
            try {
                const albumImagePath = path.join(MUSIC_DIR, `${baseName}.jpg`);
                await downloadImage(albumImageUrl, albumImagePath);
                const imageBuffer = fs.readFileSync(albumImagePath);
                tags.image = {
                    mime: "image/jpeg",
                    type: { id: 3, name: 'front cover' },
                    description: 'Album Cover',
                    imageBuffer: imageBuffer
                };
                console.log("✅ Portada del álbum descargada");
            } catch (imgErr) {
                console.log("⚠️ No se pudo descargar portada del álbum:", imgErr.message);
            }
        }

        // Descargar imagen del artista separadamente
        if (artistImageUrl) {
            try {
                const artistImagePath = path.join(MUSIC_DIR, `${baseName}_artist.jpg`);
                await downloadImage(artistImageUrl, artistImagePath);
                console.log("✅ Foto del artista descargada");
            } catch (imgErr) {
                console.log("⚠️ No se pudo descargar foto del artista:", imgErr.message);
            }
        }

        // Escribir tags
        const success = NodeID3.write(tags, filePath);
        if (!success) {
            return res.status(500).json({ error: 'Error al escribir tags.' });
        }

        res.json({
            message: 'Sincronización completada',
            updatedSong: {
                filename: convertedFilename,
                title: newTitle,
                artist: newArtist,
                genre: newGenre,
                hasAlbumImage: !!albumImageUrl,
                hasArtistImage: !!artistImageUrl
            }
        });

    } catch (error) {
        console.error("Error en sincronización:", error);
        res.status(500).json({ error: 'Error interno en sincronización.' });
    }
});

// PUT: Actualizar metadatos manualmente (legacy)
app.put('/api/songs/update-metadata', async (req, res) => {
    const { filename, title, artist, genre, imageUrl } = req.body;
    const filePath = path.join(MUSIC_DIR, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'El archivo no existe.' });
    }

    try {
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

        const success = NodeID3.write(tags, filePath);
        
        if (!success) {
            return res.status(500).json({ error: 'Error al escribir tags.' });
        }

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

    try {
        fs.unlinkSync(filePath);
        
        // Intentar eliminar archivos de imagen asociados
        const baseName = path.parse(filename).name;
        const albumImagePath = path.join(MUSIC_DIR, `${baseName}.jpg`);
        const artistImagePath = path.join(MUSIC_DIR, `${baseName}_artist.jpg`);
        
        if (fs.existsSync(albumImagePath)) fs.unlinkSync(albumImagePath);
        if (fs.existsSync(artistImagePath)) fs.unlinkSync(artistImagePath);
        
        res.json({ message: 'Eliminado' });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo borrar: ' + err.message });
    }
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎵 Servidor de música corriendo en puerto ${PORT}`);
    console.log(`📁 Carpeta de música: ${MUSIC_DIR}`);
});