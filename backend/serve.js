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

const MUSIC_DIR = path.join('C:', 'Users', 'rafael', 'Music');
const DB_PATH = path.join(__dirname, 'songs_db.json');
const ALBUM_ART_DIR = path.join(MUSIC_DIR, 'album');
const ARTIST_IMG_DIR = path.join(MUSIC_DIR, 'artista');

// Ensure subdirectories exist
[ALBUM_ART_DIR, ARTIST_IMG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use('/songs', express.static(MUSIC_DIR));

// ====== FUNCIONES AUXILIARES ======
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

const searchArtistImage = async (artistName) => {
    return new Promise((resolve) => {
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

// ====== BASE DE DATOS JSON CON SOPORTE PARA MÚLTIPLES GÉNEROS ======
const syncDatabase = async () => {
    console.log("🔄 Sincronizando base de datos de canciones...");
    const { parseFile } = await import('music-metadata');
    const files = fs.readdirSync(MUSIC_DIR);
    const musicFiles = files.filter(file => 
        ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac'].includes(path.extname(file).toLowerCase())
    );

    const songsList = [];

    for (const file of musicFiles) {
        const filePath = path.join(MUSIC_DIR, file);
        const baseName = path.parse(file).name;

        // Buscar imágenes en orden de prioridad:
        // 1. album/{basename}.jpg (nueva ubicación para portadas de álbum)
        // 2. artista/{basename}.jpg (nueva ubicación para imágenes de artista)
        // 3. {basename}.jpg (ubicación legacy)
        // 4. {basename}_artist.jpg (ubicación legacy)
        const albumArtPath = path.join(ALBUM_ART_DIR, `${baseName}.jpg`);
        const artistImgPath = path.join(ARTIST_IMG_DIR, `${baseName}.jpg`);
        const legacyAlbumPath = path.join(MUSIC_DIR, `${baseName}.jpg`);
        const legacyArtistPath = path.join(MUSIC_DIR, `${baseName}_artist.jpg`);

        let imageUrl = null;
        if (fs.existsSync(albumArtPath)) {
            imageUrl = `/songs/album/${encodeURIComponent(baseName)}.jpg`;
        } else if (fs.existsSync(artistImgPath)) {
            imageUrl = `/songs/artista/${encodeURIComponent(baseName)}.jpg`;
        } else if (fs.existsSync(legacyAlbumPath)) {
            imageUrl = `/songs/${encodeURIComponent(baseName)}.jpg`;
        } else if (fs.existsSync(legacyArtistPath)) {
            imageUrl = `/songs/${encodeURIComponent(baseName)}_artist.jpg`;
        }

        try {
            const metadata = await parseFile(filePath, { skipCovers: true });
            
            // Soporte para múltiples géneros
            let genresArray = ["Desconocido"];
            if (metadata.common.genre) {
                if (Array.isArray(metadata.common.genre)) {
                    genresArray = metadata.common.genre;
                } else if (typeof metadata.common.genre === 'string') {
                    genresArray = metadata.common.genre.split(/[\/,]/).map(g => g.trim());
                }
            }
            genresArray = genresArray.filter(g => g && g !== "");
            if (genresArray.length === 0) genresArray = ["Desconocido"];

            songsList.push({
                filename: file,
                title: metadata.common.title || baseName,
                artist: metadata.common.artist || "Desconocido",
                album: metadata.common.album || "Desconocido",
                genre: genresArray,
                duration: metadata.format.duration || 0,
                imageUrl: imageUrl,
                lastUpdated: new Date().toISOString()
            });
        } catch (err) {
            songsList.push({
                filename: file,
                title: baseName,
                artist: "Desconocido",
                album: "Desconocido",
                genre: ["Desconocido"],
                duration: 0,
                imageUrl: imageUrl,
                lastUpdated: new Date().toISOString()
            });
        }
    }

    fs.writeFileSync(DB_PATH, JSON.stringify(songsList, null, 2));
    console.log(`✅ Base de datos sincronizada: ${songsList.length} canciones`);
    return songsList;
};

// ====== ENDPOINTS ======

app.get('/api/songs', async (req, res) => {
    const limit = parseInt(req.query.limit) || 30;
    const offset = parseInt(req.query.offset) || 0;
    const genre = req.query.genre;
    const album = req.query.album;
    const artist = req.query.artist;

    if (!fs.existsSync(DB_PATH)) {
        await syncDatabase();
    }

    let songs = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

    // Filtrar por género (soporta múltiples)
    if (genre) {
        songs = songs.filter(s => {
            if (Array.isArray(s.genre)) {
                return s.genre.some(g => g.toLowerCase() === genre.toLowerCase());
            } else if (typeof s.genre === 'string') {
                return s.genre.toLowerCase().split(/[\/,]/).map(g => g.trim()).includes(genre.toLowerCase());
            }
            return false;
        });
    }
    
    if (album) {
        songs = songs.filter(s => s.album.toLowerCase() === album.toLowerCase());
    }
    
    if (artist) {
        songs = songs.filter(s => s.artist.toLowerCase() === artist.toLowerCase());
    }

    const sliced = songs.slice(offset, offset + limit);
    res.json({
        songs: sliced,
        total: songs.length,
        hasMore: offset + limit < songs.length
    });
});

app.post('/api/sync-db', async (req, res) => {
    try {
        const songs = await syncDatabase();
        res.json({ message: `Sincronizado: ${songs.length} canciones`, songs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/genres', (req, res) => {
    if (!fs.existsSync(DB_PATH)) return res.json([]);
    const songs = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const genreSet = new Set();
    songs.forEach(song => {
        let genres = [];
        if (Array.isArray(song.genre)) {
            genres = song.genre;
        } else if (typeof song.genre === 'string') {
            genres = song.genre.split(/[\/,]/).map(g => g.trim());
        }
        
        genres.forEach(g => {
            if (g && g !== "Desconocido") {
                genreSet.add(g.charAt(0).toUpperCase() + g.slice(1).toLowerCase());
            }
        });
    });
    res.json([...genreSet]);
});

app.get('/api/albums', (req, res) => {
    if (!fs.existsSync(DB_PATH)) return res.json([]);
    const songs = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const albums = [...new Set(songs.map(s => s.album).filter(a => a !== "Desconocido"))];
    res.json(albums);
});

app.get('/api/artists', (req, res) => {
    if (!fs.existsSync(DB_PATH)) return res.json([]);
    const songs = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const artists = [...new Set(songs.map(s => s.artist).filter(a => a !== "Desconocido"))];
    res.json(artists);
});

// PUT: Sincronizar con MusicBrainz
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
        
        // Obtener múltiples géneros
        let newGenres = ["Urbano"];
        if (recording.tags && recording.tags.length > 0) {
            newGenres = recording.tags
                .sort((a, b) => (b.count || 0) - (a.count || 0))
                .slice(0, 3)
                .map(tag => tag.name)
                .filter(name => name && name !== "");
        }
        if (newGenres.length === 0) newGenres = ["Urbano"];

        console.log(`✅ Encontrado: ${newArtist} - ${newTitle} (${newGenres.join(", ")})`);

        const baseName = path.parse(filename).name;

        // Obtener imagen del álbum → guardar en /album/
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

        // Obtener imagen del artista → guardar en /artista/
        let artistImageUrl = await searchArtistImage(newArtist);
        console.log(`🎭 Imagen del artista: ${artistImageUrl ? 'Encontrada' : 'No encontrada'}`);

        const tags = {
            title: newTitle,
            artist: newArtist,
            genre: newGenres.join(" / ")
        };

        // Descargar portada del álbum en /album/
        if (albumImageUrl) {
            try {
                if (!fs.existsSync(ALBUM_ART_DIR)) fs.mkdirSync(ALBUM_ART_DIR, { recursive: true });
                const albumImagePath = path.join(ALBUM_ART_DIR, `${baseName}.jpg`);
                await downloadImage(albumImageUrl, albumImagePath);
                const imageBuffer = fs.readFileSync(albumImagePath);
                tags.image = {
                    mime: "image/jpeg",
                    type: { id: 3, name: 'front cover' },
                    description: 'Album Cover',
                    imageBuffer: imageBuffer
                };
                console.log("✅ Portada del álbum descargada en /album/");
            } catch (imgErr) {
                console.log("⚠️ No se pudo descargar portada del álbum:", imgErr.message);
            }
        }

        // Descargar imagen del artista en /artista/
        if (artistImageUrl) {
            try {
                if (!fs.existsSync(ARTIST_IMG_DIR)) fs.mkdirSync(ARTIST_IMG_DIR, { recursive: true });
                const artistImagePath = path.join(ARTIST_IMG_DIR, `${baseName}.jpg`);
                await downloadImage(artistImageUrl, artistImagePath);
                console.log("✅ Foto del artista descargada en /artista/");
            } catch (imgErr) {
                console.log("⚠️ No se pudo descargar foto del artista:", imgErr.message);
            }
        }

        const success = NodeID3.write(tags, filePath);
        if (!success) {
            return res.status(500).json({ error: 'Error al escribir tags.' });
        }

        await syncDatabase();

        res.json({
            message: 'Sincronización completada',
            updatedSong: {
                filename: convertedFilename,
                title: newTitle,
                artist: newArtist,
                genre: newGenres,
                hasAlbumImage: !!albumImageUrl,
                hasArtistImage: !!artistImageUrl
            }
        });

    } catch (error) {
        console.error("Error en sincronización:", error);
        res.status(500).json({ error: 'Error interno en sincronización.' });
    }
});

// PUT: Editar metadatos localmente
app.put('/api/songs/local-metadata', async (req, res) => {
    const { filename, title, artist, genre, album } = req.body;
    const filePath = path.join(MUSIC_DIR, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'El archivo no existe.' });
    }

    try {
        const cleanTitle = title ? String(title).trim() : "Título desconocido";
        const cleanArtist = artist ? String(artist).trim() : "Artista desconocido";
        const cleanAlbum = album ? String(album).trim() : "Desconocido";
        
        // Procesar género (puede venir como array o string)
        let cleanGenre = "Desconocido";
        if (genre) {
            if (Array.isArray(genre)) {
                cleanGenre = genre.join(" / ");
            } else {
                cleanGenre = String(genre).trim();
            }
        }

        const tags = {
            title: cleanTitle,
            artist: cleanArtist,
            genre: cleanGenre,
            album: cleanAlbum
        };

        const success = NodeID3.write(tags, filePath);
        
        if (!success) {
            return res.status(500).json({ error: 'Error al escribir los tags ID3.' });
        }

        await syncDatabase();

        res.json({ 
            message: '✅ Metadatos actualizados correctamente',
            updatedSong: { 
                filename, 
                title: cleanTitle, 
                artist: cleanArtist, 
                genre: cleanGenre.split(" / "),
                album: cleanAlbum
            } 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno al actualizar metadatos.' });
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
        let cleanGenre = "Urbano";
        if (genre) {
            if (Array.isArray(genre)) {
                cleanGenre = genre.join(" / ");
            } else {
                cleanGenre = String(genre).trim();
            }
        }

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

        await syncDatabase();

        res.json({ 
            message: 'Guardado', 
            updatedSong: { 
                filename, 
                title: tags.title, 
                artist: tags.artist, 
                genre: cleanGenre.split(" / "),
                duration: 0
            } 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno.' });
    }
});

// DELETE: Enviar a la papelera en vez de eliminar permanentemente
app.delete('/api/songs', async (req, res) => {
    const { filename } = req.body;
    const filePath = path.join(MUSIC_DIR, filename);
    if (!filePath.startsWith(MUSIC_DIR)) return res.status(403).json({ error: 'Denegado' });

    try {
        // Enviar el archivo de música a la papelera
        const { trash } = await import('trash');
        await trash(filePath);
        
        const baseName = path.parse(filename).name;
        
        // Enviar imágenes asociadas a la papelera (nuevas ubicaciones y legacy)
        const possibleImages = [
            path.join(ALBUM_ART_DIR, `${baseName}.jpg`),
            path.join(ARTIST_IMG_DIR, `${baseName}.jpg`),
            path.join(MUSIC_DIR, `${baseName}.jpg`),
            path.join(MUSIC_DIR, `${baseName}_artist.jpg`),
        ];
        
        for (const imgPath of possibleImages) {
            if (fs.existsSync(imgPath)) {
                await trash(imgPath);
            }
        }
        
        await syncDatabase();
        
        res.json({ message: 'Enviado a la papelera' });
    } catch (err) {
        // Fallback: si trash falla, intentar con unlinkSync
        try {
            fs.unlinkSync(filePath);
            const baseName = path.parse(filename).name;
            const possibleImages = [
                path.join(ALBUM_ART_DIR, `${baseName}.jpg`),
                path.join(ARTIST_IMG_DIR, `${baseName}.jpg`),
                path.join(MUSIC_DIR, `${baseName}.jpg`),
                path.join(MUSIC_DIR, `${baseName}_artist.jpg`),
            ];
            for (const imgPath of possibleImages) {
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
            }
            await syncDatabase();
            res.json({ message: 'Eliminado (fallback)' });
        } catch (fallbackErr) {
            res.status(500).json({ error: 'No se pudo borrar: ' + fallbackErr.message });
        }
    }
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎵 Servidor de música corriendo en puerto ${PORT}`);
    console.log(`📁 Carpeta de música: ${MUSIC_DIR}`);
});