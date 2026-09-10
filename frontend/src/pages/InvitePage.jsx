import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import InstallButton from '../components/InstallButton.jsx';

export default function InvitePage() {
  const { usuario, claimInvite } = useAuth();
  const navigate = useNavigate();
  const { code: codeDeUrl } = useParams();

  const [code, setCode] = useState(codeDeUrl || '');
  const [info, setInfo] = useState(null); // { rol, coach_id } una vez validado
  const [coaches, setCoaches] = useState([]);
  const [coachElegido, setCoachElegido] = useState('');
  const [nombre, setNombre] = useState('');
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [validando, setValidando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/" replace />;

  async function validarCodigo(e) {
    e?.preventDefault();
    setError('');
    if (!code.trim()) return;
    setValidando(true);
    try {
      const data = await api.get(`/auth/invite/${encodeURIComponent(code.trim())}`);
      setInfo(data);
      if (data.rol === 'cliente' && data.coach_id == null) {
        const lista = await api.get('/auth/coaches-disponibles');
        setCoaches(lista);
      }
    } catch (err) {
      setError(err.message || 'Código inválido.');
      setInfo(null);
    } finally {
      setValidando(false);
    }
  }

  useEffect(() => {
    if (codeDeUrl) validarCodigo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await claimInvite({
        code: code.trim(),
        nombre,
        usuario: nombreUsuario,
        password,
        coach_id: coachElegido ? Number(coachElegido) : undefined,
      });
      navigate('/onboarding');
    } catch (err) {
      setError(err.message || 'No se pudo completar el registro.');
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
          <InstallButton />
        </div>
        <p className="text-[13.5px] text-text-muted leading-relaxed">
          {info ? `Te invitaron como ${info.rol}. Completá tus datos.` : 'Pegá el código de invitación que te pasaron.'}
        </p>
      </div>

      {!info && (
        <form onSubmit={validarCodigo} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Código de invitación</span>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="código"
              className="h-11.5 rounded-[10px] border border-border bg-surface px-3.5 text-[14.5px] text-text outline-none focus:border-accent font-mono"
            />
          </label>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <button
            type="submit"
            disabled={validando}
            className="mt-1.5 h-12 rounded-[10px] bg-accent text-accent-fg text-[15px] font-semibold disabled:opacity-60"
          >
            {validando ? 'Validando…' : 'Continuar'}
          </button>
        </form>
      )}

      {info && (
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Tu nombre</span>
            <input
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="h-11.5 rounded-[10px] border border-border bg-surface px-3.5 text-[14.5px] text-text outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Usuario (4-10 caracteres)</span>
            <input
              type="text"
              required
              minLength={4}
              maxLength={10}
              pattern="[A-Za-z0-9._-]+"
              value={nombreUsuario}
              onChange={(e) => setNombreUsuario(e.target.value)}
              className="h-11.5 rounded-[10px] border border-border bg-surface px-3.5 text-[14.5px] text-text outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Contraseña</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11.5 rounded-[10px] border border-border bg-surface px-3.5 text-[14.5px] text-text outline-none focus:border-accent"
            />
          </label>

          {info.rol === 'cliente' && info.coach_id == null && coaches.length > 0 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-muted">Coach (opcional)</span>
              <select
                value={coachElegido}
                onChange={(e) => setCoachElegido(e.target.value)}
                className="h-11.5 rounded-[10px] border border-border bg-surface px-3.5 text-[14.5px] text-text outline-none focus:border-accent"
              >
                <option value="">Sin coach por ahora</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
          )}

          {error && <p className="text-[13px] text-danger">{error}</p>}

          <button
            type="submit"
            disabled={enviando}
            className="mt-1.5 h-12 rounded-[10px] bg-accent text-accent-fg text-[15px] font-semibold disabled:opacity-60"
          >
            {enviando ? 'Creando cuenta…' : 'Crear mi cuenta'}
          </button>
        </form>
      )}

      <Link to="/login" className="text-[13px] text-center text-text-muted">
        Ya tenés cuenta — <span className="text-accent font-semibold">entrar</span>
      </Link>
    </div>
  );
}
