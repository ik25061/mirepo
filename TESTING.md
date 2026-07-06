# ✅ Guía de Testing - Sistema de Música Mejorado

## 🧪 Testing Básico

### 1. Verificar Backend

```bash
cd backend
node serve.js
```

**Esperado:**
```
🎵 Servidor de música corriendo en puerto 5001
📁 Carpeta de música: C:\Users\rafael\Music
```

### 2. Probar Endpoint GET

```bash
curl http://localhost:5001/api/songs?limit=5&offset=0
```

**Esperado:** JSON con array de canciones incluyendo `imageUrl`

### 3. Probar Sincronización

```bash
curl -X PUT http://localhost:5001/api/songs/sync-metadata \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "cancion.mp3"
  }'
```

**Esperado:**
```json
{
  "message": "Sincronización completada",
  "updatedSong": {
    "title": "Song Title",
    "artist": "Artist Name",
    "genre": "Genre",
    "hasAlbumImage": true,
    "hasArtistImage": true
  }
}
```

---

## 🎨 Testing Frontend

### 1. Iniciar Frontend

```bash
cd frontend
npm run dev
```

**Esperado:** Vite abre en `http://localhost:5171`

### 2. Verificar Carga de Canciones

1. Abre `http://localhost:5171`
2. Debería mostrar:
   - ✅ Sección de Géneros (bloques)
   - ✅ Sección de Artistas (círculos)
   - ✅ Lista de canciones con miniaturas

### 3. Verificar Miniaturas

- Canciones SIN sincronizar: ícono de música gris
- Canciones CON fotos: miniatura visible en 40x40px

### 4. Testing de Sincronización

1. Click en ícono 🔍 Search de una canción
2. Espera 2-5 segundos
3. Verifica alerta de éxito/error
4. Recarga página (debe mostrar nueva imagen)

---

## 🖼️ Testing de Imágenes

### Verificar Archivos Generados

```bash
# En PowerShell
cd "C:\Users\rafael\Music"
dir *.jpg | head -20
```

**Debería mostrar:**
```
cancion.jpg          # Portada del álbum
cancion_artist.jpg   # Foto del artista
otra_cancion.jpg
otra_cancion_artist.jpg
```

### Verificar Formato

```bash
# Ver propiedades de imagen
Get-Item "C:\Users\rafael\Music\cancion_artist.jpg" | Select-Object Length, LastWriteTime
```

**Esperado:** Archivo > 5KB con fecha reciente

---

## 🔊 Testing de Reproducción

### 1. Reproducir Canción

1. Click en cualquier fila de canción
2. Debería mostrar play button activo
3. Reproductor flotante inferior muestra:
   - Miniatura (con imagen si existe)
   - Título
   - Artista

### 2. Controles de Reproducción

- ⏮️ **Anterior:** Salta a canción anterior
- ▶️ **Play/Pause:** Toggle reproducción
- ⏭️ **Siguiente:** Salta a siguiente

### 3. Crossfade

1. Toca una canción hasta el final (~5 segundos antes)
2. Debería iniciar siguiente automáticamente con fade suave
3. No hay saltos abruptos

---

## 🎯 Testing Completo (Scenario)

### Scenario 1: Primera Sincronización

1. ✅ Backend corriendo en puerto 5001
2. ✅ Frontend corriendo en puerto 5171
3. ✅ Carpeta de música tiene canciones sin sincronizar
4. Click en 🔍 Search de canción
5. Esperar respuesta de MusicBrainz (2-5 segundos)
6. **Esperado:** 
   - ✅ Alerta con título/artista/género
   - ✅ Archivos `.jpg` creados en carpeta
   - ✅ Página recargada con nueva miniatura

### Scenario 2: Filtrar por Género

1. ✅ Haber sincronizado al menos 5 canciones
2. Click en bloque de género
3. **Esperado:**
   - ✅ Lista filtra a solo esas canciones
   - ✅ Botón "Ver todas" aparece
   - ✅ Contador muestra resultados

### Scenario 3: Filtrar por Artista

1. ✅ Haber sincronizado canciones con fotos
2. Click en círculo de artista
3. **Esperado:**
   - ✅ Foto visible en círculo
   - ✅ Lista filtra a ese artista
   - ✅ Solo sus canciones visibles

### Scenario 4: Reproducción Continua

1. ✅ Click en primera canción
2. Esperar fin de canción
3. **Esperado:**
   - ✅ Segunda canción inicia automáticamente
   - ✅ Fade suave entre ambas
   - ✅ Miniatura actualiza

### Scenario 5: Eliminar Canción

1. ✅ Click en 🗑️ Trash de cualquier canción
2. Confirmar en modal
3. **Esperado:**
   - ✅ Archivo `.mp3` eliminado
   - ✅ Archivos `.jpg` eliminados
   - ✅ Lista se actualiza
   - ✅ Canción desaparece

---

## 🚨 Testing de Errores

### Error: "No se encontraron coincidencias en MusicBrainz"

**Causas posibles:**
- Título mal formateado
- Canción muy obscura
- MusicBrainz offline

**Testing:**
```bash
# Probar con canción famosa
# Ej: "Blinding Lights" → The Weeknd
```

### Error: "Error de red"

**Causas posibles:**
- Sin conexión Internet
- MusicBrainz/Wikipedia caído
- Firewall bloqueando

**Testing:**
```bash
# Verificar conexión
Test-NetConnection -ComputerName musicbrainz.org -Port 443

# Verificar acceso
Invoke-WebRequest https://musicbrainz.org/ws/2/recording/?query=test
```

### Error: "Carpeta de música no encontrada"

**Causas posibles:**
- Ruta incorrecta en `MUSIC_DIR`
- Permisos insuficientes

**Testing:**
```bash
Test-Path "C:\Users\rafael\Music"
Get-ChildItem "C:\Users\rafael\Music" -Filter "*.mp3" | Measure-Object
```

---

## 📊 Métricas de Performance

### Medir Tiempo de Sincronización

```bash
# En DevTools del navegador
console.time('sync');
// Click en Search
// Esperar alerta
console.timeEnd('sync');
```

**Esperado:** 2-5 segundos

### Medir Carga Inicial

```bash
# En DevTools
console.time('fetchSongs');
// Esperar a que carguen canciones
console.timeEnd('fetchSongs');
```

**Esperado:** < 3 segundos para 30 canciones

### Monitorear Memoria

```bash
# En Chrome DevTools → Performance
# Grabar mientras:
# - Carga inicial
# - Sincronización
# - Cambio de filtros
```

**Esperado:** < 100MB de uso

---

## ✅ Checklist de Validación

### Backend
- [ ] Servidor inicia sin errores
- [ ] Endpoint GET retorna canciones con `imageUrl`
- [ ] Endpoint PUT sincroniza correctamente
- [ ] Descarga portadas de álbumes
- [ ] Descarga fotos de artistas
- [ ] Crea archivos `.jpg` en carpeta
- [ ] Actualiza tags ID3

### Frontend
- [ ] Carga lista de canciones
- [ ] Muestra géneros disponibles
- [ ] Muestra artistas con fotos
- [ ] Miniaturas se cargan correctamente
- [ ] Filtros funcionan (género/artista)
- [ ] Reproducción inicia correctamente
- [ ] Crossfade automático funciona

### Imágenes
- [ ] Portadas visibles en miniaturas
- [ ] Fotos de artistas visibles en círculos
- [ ] Fotos visibles en reproductor flotante
- [ ] Imágenes no se distorsionan

### Integración
- [ ] MusicBrainz busca correctamente
- [ ] Wikipedia encuentra artistas
- [ ] Cover Art Archive descarga portadas
- [ ] Sincronización end-to-end completa

---

## 🔍 Debugging

### Logs del Backend

```javascript
// Ya incluidos en el código:
console.log(`🔍 Buscando en MusicBrainz: "${searchQuery}"`);
console.log(`✅ Encontrado: ${newArtist} - ${newTitle} (${newGenre})`);
console.log(`🎭 Imagen del artista: ${artistImageUrl ? 'Encontrada' : 'No encontrada'}`);
```

### Logs del Frontend

```javascript
// En Console:
console.error() - Errores de red
console.log() - Flujo de sincronización
```

### Inspeccionar Red

En Chrome DevTools → Network:
1. Filter: `sync-metadata`
2. Click Search en canción
3. Ver Request/Response completo
4. Verificar tiempos

---

## 📝 Reporte de Issues

Si algo falla, recopila:
1. **Navegador/Versión:** `navigator.userAgent`
2. **Canción:** Nombre del archivo
3. **Logs:** Console del navegador + Terminal backend
4. **Error:** Screenshot del mensaje
5. **Pasos:** Cómo reproducir

---

**Testing versión:** 2.0.0
**Actualizado:** 2026-06-15
