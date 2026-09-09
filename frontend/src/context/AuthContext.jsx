import { createContext, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get('/auth/me')
      .then(setUsuario)
      .catch(() => setUsuario(null))
      .finally(() => setCargando(false));
  }, []);

  async function login(email, password, remember) {
    const u = await api.post('/auth/login', { email, password, remember });
    setUsuario(u);
    return u;
  }

  async function logout() {
    await api.post('/auth/logout').catch(() => {});
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout }}>
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
