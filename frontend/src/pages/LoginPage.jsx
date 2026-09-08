import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { usuario, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center px-8 py-20 gap-9 max-w-sm mx-auto">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 7v10M17.5 7v10M2 10v4M22 10v4M6.5 12h11" />
          </svg>
          <span className="text-xl font-bold tracking-tight">Bitácora</span>
        </div>
        <p className="text-[13.5px] text-text-muted leading-relaxed">
          Programación de entrenamientos con progresión automática.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-text-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vos@ejemplo.com"
            className="h-11.5 rounded-[10px] border border-border bg-surface px-3.5 text-[14.5px] text-text outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-text-muted">Contraseña</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="h-11.5 rounded-[10px] border border-border bg-surface px-3.5 text-[14.5px] text-text outline-none focus:border-accent"
          />
        </label>

        {error && <p className="text-[13px] text-danger">{error}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="mt-1.5 h-12 rounded-[10px] bg-accent text-accent-fg text-[15px] font-semibold disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
