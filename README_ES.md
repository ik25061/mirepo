# 🎵 Sistema de Música Local con MusicBrainz

Un reproductor de música local estilo YouTube Music con sincronización automática de metadatos, descargar fotos de artistas y gestión inteligente de tags.

## 🚀 Características

- 🎯 **Sincronización MusicBrainz** - Busca automática de metadatos correctos
- 👤 **Fotos de Artistas** - Descarga y muestra imágenes de Wikipedia
- 🖼️ **Portadas de Álbumes** - Integración con Cover Art Archive
- 🎨 **Interfaz YouTube Music** - UI moderna y responsiva
- 🎵 **Crossfade Suave** - Transiciones entre canciones (Web Audio API)
- 📁 **Gestión de Biblioteca** - Filtrar por género/artista
- 🏷️ **Tags ID3 Automáticos** - Actualización automática de metadatos

## 📋 Requisitos Previos

### Backend
- Node.js 14+
- npm

### Frontend
- Node.js 14+
- npm

## 🔧 Instalación

### 1. Backend

```bash
cd backend
npm install
```

**Configurar carpeta de música** en `serve.js` línea 15:
```javascript
const MUSIC_DIR = path.join('C:', 'Users', 'TU_USUARIO', 'Music');
```

**Iniciar servidor:**
```bash
node serve.js
```

Verá: `🎵 Servidor de música corriendo en puerto 5001`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Abre `http://localhost:5172` en tu navegador

## 📱 Acceso Remoto (Teléfono/Tablet)

1. En `frontend/src/App.jsx` línea 5, cambia:
```javascript
// De:
const API_URL = 'http://localhost:5001';

// A:
const API_URL = 'http://192.168.1.100:5001'; // Tu IP local
```

2. Accede desde otro dispositivo: `http://192.168.1.100:5172`

## 🎮 Cómo Usar

### Sincronizar una Canción

1. **Haz click en el ícono 🔍 Search** en cualquier canción
2. El sistema buscará en MusicBrainz automáticamente
3. Descargará:
   - ✅ Título correcto
   - ✅ Nombre del artista
   - ✅ Género
   - ✅ Portada del álbum (si existe)
   - ✅ Foto del artista (si existe)
4. La lista se recargará automáticamente

### Filtrar Canciones

- **Por Género:** Click en el bloque del género
- **Por Artista:** Click en la foto del artista
- **Ver Todo:** Click en "Ver todas" o filtro activo nuevamente

### Reproducir Música

- **Play/Pause:** Click central o botón ▶️
- **Siguiente:** ⏭️ o espera el fin de la canción (crossfade automático)
- **Anterior:** ⏮️
- **Cargar más:** Scroll abajo + "Cargar más música"

### Eliminar Canción

Click en el ícono 🗑️ Trash - se eliminará del disco

## 📁 Estructura de Carpetas

```
mirepo/
├── backend/
│   ├── serve.js              # 🎵 Servidor Express
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # 🎨 Componente principal
│   │   ├── App.css           # 🎨 Estilos
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
└── CHANGELOG.md              # 📋 Historial de cambios
```

## 🎵 Archivos Generados

El sistema crea automáticamente:

```
C:\Users\TU_USUARIO\Music\
├── Canción1.mp3
├── Canción1.jpg              ← Portada del álbum
├── Canción1_artist.jpg       ← Foto del artista
├── Canción2.m4a
├── Canción2.jpg
└── Canción2_artist.jpg
```

## 🔌 APIs Externas Utilizadas

| API | Propósito | Endpoint |
|-----|-----------|----------|
| MusicBrainz | Metadatos de canciones | `musicbrainz.org/ws/2/` |
| Cover Art Archive | Portadas de álbumes | `coverartarchive.org` |
| Wikipedia | Fotos de artistas | `en.wikipedia.org/w/api.php` |

## 🔒 Privacidad

- ✅ Todas las búsquedas se hacen localmente
- ✅ No se almacenan datos de búsqueda
- ✅ Las imágenes se guardan en tu carpeta de música local
- ✅ User-Agent identificado para respeto de rate limits

## ⚙️ Configuración Avanzada

### Cambiar Puerto del Servidor

En `backend/serve.js` línea 190:
```javascript
const PORT = 5001 // Cambiar aquí
```

### Cambiar Límite de Canciones por Página

En `frontend/src/App.jsx` línea 30:
```javascript
const response = await fetch(`${API_URL}/api/songs?limit=30&offset=${currentOffset}`);
                                                    // ↑ Cambiar aquí
```

### Cambiar Tiempo de Crossfade

En `frontend/src/App.jsx` línea 6:
```javascript
const CROSSFADE_TIME = 4; // Segundos (cambiar aquí)
```

## 🐛 Solución de Problemas

### "Error al leer la carpeta"
- Verifica que la ruta en `MUSIC_DIR` existe
- Asegúrate de tener permisos de lectura

### "No se encontraron coincidencias en MusicBrainz"
- El título de la canción podría no coincidir exactamente
- Edita el nombre del archivo manualmente e intenta nuevamente

### "Error de red"
- Verifica conexión a Internet
- MusicBrainz requiere HTTPS

### Imágenes no se muestran
- Espera a que se descarguen (toma unos segundos)
- Recarga la página
- Verifica que existan los archivos `.jpg` en la carpeta de música

## 📊 Rendimiento

- **Carga inicial:** ~2-3 segundos (30 canciones)
- **Sincronización:** ~1-2 segundos por canción
- **Reproducción:** Sin latencia (Web Audio API)

## 🎨 Personalización de UI

Todos los colores están en variables CSS en `frontend/src/App.css`:

```css
:root {
  --bg-pure: #030303;      /* Fondo principal */
  --bg-surface: #121212;   /* Fondo de componentes */
  --bg-card: #1a1a1a;      /* Fondo de tarjetas */
  --yt-red: #ff0000;        /* Color de énfasis */
  --text-main: #ffffff;    /* Texto principal */
  --text-muted: #aaaaaa;   /* Texto secundario */
}
```

## 📝 Licencia

Proyecto personal - Uso libre

## 🤝 Contribuciones

Sugerencias bienvenidas. Por favor crear issues o PRs.

---

**Versión:** 2.0.0
**Última actualización:** 2026-06-15
