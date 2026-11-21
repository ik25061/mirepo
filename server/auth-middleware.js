/**
 * Autenticación Bearer para las rutas privadas de la API.
 * Se inyecta getUserByToken para poder probar el middleware sin abrir la BD.
 */

const PUBLIC_API_PATHS = new Set([
  '/test',
  '/config/ip',
  '/auth/register',
  '/auth/login',
  '/auth/verify',
  '/auth/logout',
  '/playlists/public'
]);

export function createRequireApiAuth({ getUserByToken }) {
  if (typeof getUserByToken !== 'function') {
    throw new TypeError('getUserByToken debe ser una función');
  }

  return async function requireApiAuth(req, res, next) {
    const apiPath = (req.path || '/').replace(/\/+$/, '') || '/';
    if (PUBLIC_API_PATHS.has(apiPath)) return next();

    const authorization = req.get?.('authorization') || req.headers?.authorization || '';
    const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    // EventSource no permite establecer cabeceras personalizadas.
    const token = bearerToken || (apiPath === '/rescan-stream' ? req.query?.token : null);

    if (!token || typeof token !== 'string') {
      return res.status(401).json({ error: 'Autenticación requerida' });
    }

    try {
      const user = await getUserByToken(token);
      if (!user) return res.status(401).json({ error: 'Sesión no válida o caducada' });

      const suppliedUserId = req.query?.userId ?? req.body?.userId;
      if (suppliedUserId != null && String(suppliedUserId) !== String(user.id)) {
        return res.status(403).json({ error: 'No puedes operar sobre otra cuenta' });
      }

      const settingsUser = apiPath.match(/^\/users\/([^/]+)\/settings$/);
      if (settingsUser && String(settingsUser[1]) !== String(user.id)) {
        return res.status(403).json({ error: 'No puedes acceder a los ajustes de otra cuenta' });
      }

      req.authUser = { id: user.id, username: user.username, role: user.role || 'USER' };
      req.authUserId = String(user.id);
      return next();
    } catch (error) {
      return res.status(500).json({ error: 'No se pudo validar la sesión' });
    }
  };
}
