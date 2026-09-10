import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import InstallButton from '../components/InstallButton.jsx';

export default function LoginPage() {
  const { usuario, login } = useAuth();
  const navigate = useNavigate();
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await login(nombreUsuario, password, remember);
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
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 7v10M17.5 7v10M2 10v4M22 10v4M6.5 12h11" />
            </svg>
            <span className="text-xl font-bold tracking-tight">NAC Asesoria</span>
          </div>
          <div className="flex items-center gap-2">
            <InstallButton />
            <ThemeToggle />
          </div>
        </div>
        <p className="text-[13.5px] text-text-muted leading-relaxed">
          Programación de entrenamientos con progresión automática.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-text-muted">Usuario</span>
          <input
            type="text"
            required
            autoComplete="username"
            value={nombreUsuario}
            onChange={(e) => setNombreUsuario(e.target.value)}
            placeholder="tu usuario"
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

        <label className="flex items-center gap-2 -mt-1">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
          <span className="text-[13px] text-text-muted">Recordarme en este dispositivo</span>
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

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[11.5px] text-text-faint">O</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <Link to="/invitado" className="text-[13px] text-center text-text-muted">
        <span className="text-accent font-semibold">Probá el plan de 6 meses sin registro →</span>
      </Link>

      <Link to="/invitacion" className="text-[13px] text-center text-text-muted">
        ¿Tenés un código de invitación? <span className="text-accent font-semibold">Usalo acá →</span>
      </Link>
    </div>
  );
}
