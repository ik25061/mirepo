const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ CONFIGURACIÓN: Cambia esta ruta por la carpeta donde tienes tu música
// C:\Users\rafael\Documents\musica
const MUSIC_DIR = path.join('C:', 'Users', 'rafael', 'Documents','musica'); 

// 1. Servir los archivos de audio de forma estática
app.use('/songs', express.static(MUSIC_DIR));

// 2. Obtener la lista de canciones (solo archivos .mp3)
app.get('/api/songs', (req, res) => {
    fs.readdir(MUSIC_DIR, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'No se pudo acceder a la carpeta de música' });
        }
        // Filtramos para asegurarnos de enviar solo archivos de audio soportados
        const musicFiles = files.filter(file => 
            ['.mp3', '.wav', '.m4a', '.ogg'].includes(path.extname(file).toLowerCase())
        );
        res.json(musicFiles);
    });
});

// 3. Eliminar una canción directamente del disco duro
app.delete('/api/songs', (req, res) => {
    const { filename } = req.body;
    
    if (!filename) {
        return res.status(400).json({ error: 'Nombre de archivo no proporcionado' });
    }

    const filePath = path.join(MUSIC_DIR, filename);

    // Seguridad: Evitar que salgan de la carpeta permitida usando ".."
    if (!filePath.startsWith(MUSIC_DIR)) {
        return res.status(403).json({ error: 'Acceso denegado' });
    }

    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'No se pudo eliminar el archivo físico' });
        }
        res.json({ message: `Canción ${filename} eliminada correctamente del disco.` });
    });
});

const PORT = 5000;
// Al no especificar IP, Express escucha en toda la red local (0.0.0.0)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor de música corriendo en red local`);
    console.log(`Accede desde tu teléfono usando: http://TU_IP_DE_PC:5000/api/songs`);
});