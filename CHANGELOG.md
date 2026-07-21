# 📋 CHANGELOG - Sistema de Música

## v2.0.0 - Integración Completa de MusicBrainz y Fotos de Artistas

### 🎯 Objetivos Completados
- ✅ Búsqueda automática en MusicBrainz
- ✅ Descarga de metadatos (título, artista, género)
- ✅ Descarga de fotos de artistas desde Wikipedia
- ✅ Descarga de portadas de álbumes desde Cover Art Archive
- ✅ Miniaturas mejoradas con imágenes en la lista de canciones
- ✅ Fotos de artistas en círculos de categorías
- ✅ Tags ID3 automáticos

### Backend (`serve.js`)

#### ✨ Nuevas Funciones
```javascript
searchMusicBrainz(query)        // Busca en MusicBrainz
searchArtistImage(artistName)   // Busca foto del artista en Wikipedia
downloadImage(imageUrl, dest)   // Descarga imagen HTTPS
cleanFileName(name)             // Limpia nombres de archivo
```

#### 🆕 Nuevos Endpoints
- **PUT `/api/songs/sync-metadata`** - Sincronización completa con MusicBrainz
  - Busca metadatos automáticamente
  - Descarga portada del álbum
  - Descarga foto del artista
  - Actualiza tags ID3
  - Retorna estado de descargas

#### 🔧 Endpoints Mejorados
- **GET `/api/songs`** - Ahora detecta fotos de artistas además de portadas
- **DELETE `/api/songs`** - Elimina también archivos de imagen asociados

#### 📦 Archivos Generados Automáticamente
- `{filename}.jpg` - Portada del álbum
- `{filename}_artist.jpg` - Foto del artista

### Frontend (`src/App.jsx`)

#### 🔄 Función Actualizada
- **`fetchMusicBrainzData(index, e)`** - Ahora usa endpoint `/api/songs/sync-metadata`
  - Sincronización más robusta
  - Refresco automático de lista
  - Mensajes de éxito/error mejorados con emojis

#### 🎨 Interfaz Mejorada
- Miniaturas de canciones muestran fotos del artista
- Fallback a ícono de música si no hay imagen
- Mayor integración visual con imágenes

### Estilos (`src/App.css`)

#### 📐 Nuevas Clases
```css
.track-img-thumb           /* Miniatura redimensionada */
.track-img-placeholder     /* Contenedor para ícono */
```

#### 🎨 Mejoras Visuales
- `object-fit: cover` para miniaturas
- `overflow: hidden` para bordes redondeados correctos
- Mejor presentación de imágenes

---

## Cómo Sincronizar Canciones

### Opción 1: Una por una
1. Click en el ícono 🔍 Search en cualquier canción
2. Sistema busca en MusicBrainz automáticamente
3. Descarga metadatos y fotos
4. Se actualiza la vista al instante

### Resultado de la Sincronización
```
✅ ¡Sincronización Completa!

🎵 Título: [Nuevo Título]
🎤 Artista: [Nombre Artista]
📀 Género: [Género]

🖼️ Portada del álbum descargada
👤 Foto del artista descargada
```

---

## Configuración

### Carpeta de Música (Backend)
En `backend/serve.js` línea 15:
```javascript
const MUSIC_DIR = path.join('C:', 'Users', 'rafael', 'Music');
```

### URL de API (Frontend)
En `frontend/src/App.jsx` línea 5:
```javascript
const API_URL = 'http://localhost:5002';
```

Cambiar a tu IP para acceso remoto:
```javascript
const API_URL = 'http://192.168.1.100:5002';
```

---

## Dependencias Backend

```json
{
  "cors": "^2.8.6",
  "dotenv": "^17.4.2",
  "express": "^5.2.1",
  "image-downloader": "^4.3.0",
  "music-metadata": "^11.13.0",
  "node-id3": "^0.2.9"
}
```

---

## ⚠️ Consideraciones Importantes

1. **MusicBrainz Rate Limit:** 1 solicitud por segundo
2. **Conexión HTTPS:** Requerida para búsquedas de metadatos
3. **Almacenamiento:** Las imágenes se guardan en la carpeta de música
4. **Tags ID3:** Se escriben en v2.3 (compatible)

---

## 🔍 Estructura de Archivos Generada

```
E:\musica\
├── cancion.mp3
├── cancion.jpg              ← Portada del álbum
├── cancion_artist.jpg       ← Foto del artista
├── otra_cancion.m4a
├── otra_cancion.jpg
└── otra_cancion_artist.jpg
```

---

## 📊 Estadísticas

- **Líneas Backend Agregadas:** ~150
- **Líneas Frontend Simplificadas:** -60
- **Nuevas Funciones:** 4
- **Nuevos Endpoints:** 1
- **APIs Externas Integradas:** 3 (MusicBrainz, CoverArtArchive, Wikipedia)

---

## Versión Anterior (v1.0.0)

- Sincronización básica con MusicBrainz
- Solo portadas de álbumes
- Tags ID3 manual
- Interfaz con ícono genérico en miniaturas

---

## Próximas Mejoras Previstas

- [ ] Sincronización masiva de todas las canciones
- [ ] Caché local de búsquedas
- [ ] Integración con Last.fm para stats
- [ ] Soporte para Letras (Genius API)
- [ ] Descarga de listas de reproducción
- [ ] Sincronización con Spotify

---

**Última actualización:** 2026-06-15
