import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Disc3, Loader2, Eye, EyeOff } from 'lucide-react';

export default function LoginScreen({ onOpenLocal, offlineSupported }) {
  const { login, register, loading } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (username.length < 3 || password.length < 3) {
      setError('Usuario y contraseña deben tener al menos 3 caracteres');
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setIsSubmitting(true);

    if (isRegister) {
      const result = await register(username, password);
      if (result.success) {
        const loginResult = await login(username, password);
        if (!loginResult.success) {
          setError('Error al iniciar sesión después del registro');
        }
      } else {
        setError(result.error);
      }
    } else {
      const result = await login(username, password);
      if (!result.success) {
        setError(result.error);
      }
    }

    setIsSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4" style={{ background: '#121212' }}>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-8 shadow-xl" style={{ background: '#1a1a1a' }}>
        
        {/* Logo y título */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary" style={{ background: '#1db954' }}>
            <Disc3 size={28} className="text-black" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Mirepo</h1>
          <p className="mt-1 text-sm text-muted-foreground" style={{ color: '#a7a7a7' }}>
            {isRegister ? 'Crea tu cuenta y empieza a gestionar tu música' : 'Inicia sesión y disfruta de tu música'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Campo: Usuario */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" style={{ color: '#e5e5e5' }}>
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-white outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              style={{ background: '#282828', borderColor: '#333' }}
              placeholder="Tu usuario"
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          {/* Campo: Contraseña */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" style={{ color: '#e5e5e5' }}>
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 pr-10 text-white outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                style={{ background: '#282828', borderColor: '#333' }}
                placeholder="••••••••"
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                style={{ color: '#727272' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Confirmar contraseña (solo registro) */}
          {isRegister && (
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground" style={{ color: '#e5e5e5' }}>
                Confirmar contraseña
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-white outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                style={{ background: '#282828', borderColor: '#333' }}
                placeholder="••••••••"
                disabled={isSubmitting}
              />
            </div>
          )}

          {/* Recordarme + Olvidé contraseña */}
          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground" style={{ color: '#a7a7a7' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-surface-2 text-primary focus:ring-1 focus:ring-primary"
                style={{ accentColor: '#1db954' }}
              />
              Recordarme
            </label>
            {!isRegister && (
              <button
                type="button"
                className="text-sm text-primary transition hover:brightness-110"
                style={{ color: '#1db954' }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-danger/10 p-3 text-center text-sm text-danger" style={{ background: 'rgba(226,33,52,0.1)', color: '#e22134' }}>
              {error}
            </div>
          )}

          {/* Botón principal */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
            style={{ background: '#1db954', color: '#000' }}
          >
            {isSubmitting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              isRegister ? 'Crear cuenta' : 'Iniciar sesión'
            )}
          </button>
        </form>

        {/* Enlace para cambiar entre login/registro */}
        <div className="mt-5 text-center flex flex-col gap-3">
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="text-sm text-muted-foreground transition hover:text-foreground"
            style={{ color: '#a7a7a7' }}
            disabled={isSubmitting}
          >
            {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
          </button>
          {offlineSupported && (
            <button
              type="button"
              onClick={onOpenLocal}
              className="mx-auto mt-2 inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm text-foreground transition hover:bg-surface-3"
            >
              Abrir carpeta de música local
            </button>
          )}
        </div>

        {/* Separador decorativo */}
        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <span className="text-xs text-muted-foreground" style={{ color: '#535353' }}>Mirepo</span>
          <div className="h-px flex-1 bg-border" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </div>
      </div>
    </div>
  );
}