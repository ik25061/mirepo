// src/services/AIWriter.js
import { pipeline } from '@xenova/transformers';

let textGenerator = null;
let loadingPromise = null;

export async function loadAIModel() {
  if (textGenerator) return textGenerator;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      console.log('🧠 Cargando modelo de IA (Transformers)...');
      // Usamos un modelo pequeño para generación de texto (inglés/espanglés)
      // 'Xenova/distilgpt2' es ligero y funciona offline
      const generator = await pipeline('text-generation', 'Xenova/distilgpt2', {
        // Opcional: reducir el tamaño para mejor rendimiento
        // quantized: true,
      });
      textGenerator = generator;
      console.log('✅ Modelo de IA cargado correctamente');
      return generator;
    } catch (err) {
      console.warn('❌ Error cargando modelo:', err);
      textGenerator = null;
      return null;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/**
 * Genera un resumen mensual usando IA
 */
export async function generateMonthlySummary(summaryData) {
  try {
    const generator = await loadAIModel();
    if (!generator) return getFallbackSummary(summaryData);

    // Prompt en español (aunque el modelo sea en inglés, puede entender algo)
    const prompt = `
      You are a music assistant. Monthly summary:
      - Songs listened: ${summaryData.totalSongs}
      - Minutes: ${summaryData.totalMinutes}
      - Top artist: ${summaryData.topArtist}
      - Top genre: ${summaryData.topGenre}
      Write a warm, encouraging summary in Spanish (max 40 words).
    `;

    const result = await generator(prompt, {
      max_new_tokens: 60,
      temperature: 0.7,
      do_sample: true,
    });

    // Limpiar la salida (a veces repite el prompt)
    let text = result[0].generated_text;
    text = text.replace(prompt, '').trim();
    if (text.length < 10) text = getFallbackSummary(summaryData);
    return text;

  } catch (err) {
    console.warn('⚠️ Error en IA, usando resumen por defecto:', err);
    return getFallbackSummary(summaryData);
  }
}

/**
 * Fallback cuando la IA no está disponible
 */
function getFallbackSummary(data) {
  return `🎵 Este mes escuchaste ${data.totalSongs} canciones (${data.totalMinutes} min). Tu artista favorito fue ${data.topArtist} y tu género preferido ${data.topGenre}. ¡Sigue explorando música!`;
}

/**
 * Genera un nombre creativo para una playlist
 */
export async function generatePlaylistName(songs) {
  try {
    const generator = await loadAIModel();
    if (!generator) return 'Playlist recomendada';

    const artists = [...new Set(songs.map(s => s.artist))].slice(0, 2).join(' and ');
    const prompt = `Write a catchy short playlist name (max 5 words) for songs by ${artists}:`;

    const result = await generator(prompt, {
      max_new_tokens: 15,
      temperature: 0.8,
      do_sample: true,
    });

    let name = result[0].generated_text.replace(prompt, '').trim();
    if (!name || name.length < 2) return 'Playlist recomendada';
    return name;
  } catch {
    return 'Playlist recomendada';
  }
}

/**
 * Función para liberar el modelo (si se desea)
 */
export function unloadAIModel() {
  textGenerator = null;
  loadingPromise = null;
}