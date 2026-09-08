import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';

export default function HomePage() {
  const { usuario } = useAuth();
  const [destino, setDestino] = useState(usuario.rol !== 'cliente' ? '/coach' : null);

  useEffect(() => {
    if (usuario.rol !== 'cliente') return;
    api.get(`/usuarios/${usuario.id}/rutina`)
      .then(() => setDestino('/entrenamiento'))
      .catch(() => setDestino('/onboarding'));
  }, [usuario.id, usuario.rol]);

  if (!destino) {
    return <div className="min-h-dvh flex items-center justify-center text-text-muted text-sm">Cargando…</div>;
  }
  return <Navigate to={destino} replace />;
}
