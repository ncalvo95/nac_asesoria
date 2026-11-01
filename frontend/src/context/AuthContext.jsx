import { createContext, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client.js';
import { fijarActor, guardarCopia, borrarCopias } from '../offline/cache.js';
import { fijarActorCola, iniciarSincronizacionAutomatica } from '../offline/cola.js';

// A partir de acá hay una persona identificada: sus copias sin conexión y su cola
// de sesiones pendientes quedan a su nombre.
function identificar(u) {
  fijarActor(u?.id ?? null);
  fijarActorCola(u?.id ?? null);
  return u;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    iniciarSincronizacionAutomatica();
    api.get('/auth/me')
      .then((u) => setUsuario(identificar(u)))
      .catch((err) => {
        // 401 con conexión = la sesión venció de verdad: no se conserva nada de
        // esa persona. Sin conexión, api.get ya devolvió la copia guardada.
        if (err.status === 401) borrarCopias();
        setUsuario(null);
      })
      .finally(() => setCargando(false));
  }, []);

  async function login(usuario, password, remember) {
    const u = await api.post('/auth/login', { usuario, password, remember });
    identificar(u);
    guardarCopia('/auth/me', u);
    setUsuario(u);
    return u;
  }

  async function claimInvite(payload) {
    const u = await api.post('/auth/claim-invite', payload);
    identificar(u);
    guardarCopia('/auth/me', u);
    setUsuario(u);
    return u;
  }

  async function logout() {
    await api.post('/auth/logout').catch(() => {});
    await borrarCopias();
    fijarActor(null);
    fijarActorCola(null);
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout, claimInvite }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

export { ApiError };
