/**
 * ============================================================
 * AI RECOMMENDATIONS - ASISTENTE IA
 * ============================================================
 * 
 * Muestra el selector de artistas favoritos y otras
 * funcionalidades de recomendación basadas en IA.
 * ============================================================
 */

import { useAuth } from '../context/AuthContext.jsx';
import ArtistSelector from './ArtistSelector.jsx';

// ============================================================
// 1. COMPONENTE PRINCIPAL
// ============================================================

export default function AIRecommendations() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-4 pb-20 w-full">
      
      {/* ============================================================
      2. HEADER
      ============================================================ */}
      <header className="animate-fade-in">
        <h1 className="text-xl font-700 tracking-tight text-white sm:text-3xl">
          🤖 Asistente IA
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Selecciona tus artistas favoritos para obtener mejores recomendaciones
        </p>
      </header>

      {/* ============================================================
      3. SELECTOR DE ARTISTAS
      ============================================================ */}
      <ArtistSelector userId={user?.id} />

      {/* ============================================================
      4. INFO ADICIONAL
      ============================================================ */}
      <div className="rounded-xl border border-border bg-surface/50 p-4">
        <h3 className="text-sm font-medium text-white mb-2">¿Cómo funciona?</h3>
        <p className="text-xs text-muted-foreground">
          Selecciona tus artistas favoritos para que el sistema pueda
          recomendarte canciones basadas en tus preferencias.
          Las recomendaciones se actualizarán automáticamente.
        </p>
      </div>
    </div>
  );
}