import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children }) {
  const { usuario, cargando } = useAuth();

  if (cargando) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-text-muted text-sm">
        Cargando…
      </div>
    );
  }
  if (!usuario) return <Navigate to="/login" replace />;
  return children;
}
