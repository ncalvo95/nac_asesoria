import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import AccountMenu from '../components/AccountMenu.jsx';

const TIPO_LABEL = {
  objetivo: 'Objetivo',
  disponibilidad: 'Disponibilidad',
  equipamiento: 'Equipamiento',
  rutina_auto: 'Generar rutina (automática)',
  rutina_manual: 'Generar rutina (manual)',
  rutina_split: 'Generar rutina (split personalizado)',
};

export default function CoachPage() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState(null);
  const [solicitudes, setSolicitudes] = useState(null);
  const [invitesPendientes, setInvitesPendientes] = useState(null);
  const [error, setError] = useState('');
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [mostrarInvitar, setMostrarInvitar] = useState(false);

  async function cargar() {
    try {
      const [u, s, i] = await Promise.all([
        api.get('/auth/usuarios'),
        api.get('/solicitudes'),
        api.get('/auth/invites'),
      ]);
      setUsuarios(u);
      setSolicitudes(s);
      setInvitesPendientes(i);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Un coach (o admin) tambien puede entrenar para si mismo, exactamente
  // igual que un cliente - el backend ya lo permite (puedeAccederAUsuario
  // deja que cualquier cuenta toque sus propios datos), pero HomePage.jsx
  // manda a cualquier no-cliente derecho a /coach sin ofrecer este camino.
  async function irAMiEntrenamiento() {
    try {
      await api.get(`/usuarios/${usuario.id}/rutina`);
      navigate('/entrenamiento');
    } catch {
      navigate('/onboarding');
    }
  }

  async function resolverSolicitud(id, accion) {
    try {
      await api.post(`/solicitudes/${id}/${accion}`);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      <header className="flex-none bg-surface border-b border-border px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 7v10M17.5 7v10M2 10v4M22 10v4M6.5 12h11" />
          </svg>
          <span className="text-[15px] font-bold">Bitácora {usuario.rol === 'admin' ? '· Admin' : '· Coach'}</span>
        </div>
        <div className="flex items-center gap-3">
          {usuario.rol === 'admin' && (
            <Link to="/catalogo" className="text-xs font-semibold text-accent">Catálogo</Link>
          )}
          <AccountMenu />
        </div>
      </header>

      <div className="p-4 flex flex-col gap-6 max-w-xl w-full mx-auto">
        {error && <p className="text-[13px] text-danger">{error}</p>}

        <button
          type="button"
          onClick={irAMiEntrenamiento}
          className="bg-surface border border-accent rounded-xl p-4 flex items-center justify-between gap-3 text-left"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] font-semibold">Tu propio entrenamiento</span>
            <span className="text-[12px] text-text-muted">
              Como {usuario.rol === 'admin' ? 'admin' : 'coach'} también podés tener tu propia rutina.
            </span>
          </div>
          <span className="flex-none text-[13px] font-semibold text-accent whitespace-nowrap">Ir →</span>
        </button>

        {solicitudes?.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[13px] font-bold text-text-muted uppercase tracking-wide">
              Cambios esperando tu aprobación ({solicitudes.length})
            </h2>
            <div className="flex flex-col gap-2">
              {solicitudes.map((s) => (
                <div key={s.id} className="bg-surface border border-border rounded-xl p-3.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold">{s.usuario_nombre}</span>
                    <span className="text-[11px] text-text-faint">@{s.usuario_usuario}</span>
                  </div>
                  <span className="text-[12.5px] text-text-muted">{TIPO_LABEL[s.tipo] || s.tipo}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolverSolicitud(s.id, 'aprobar')}
                      className="flex-1 h-8 rounded-lg bg-accent text-accent-fg text-[12.5px] font-semibold"
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => resolverSolicitud(s.id, 'rechazar')}
                      className="flex-1 h-8 rounded-lg border border-border text-text-muted text-[12.5px] font-semibold"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h1 className="text-[16px] font-bold">{usuario.rol === 'admin' ? 'Cuentas' : 'Mis clientes'}</h1>
            <div className="flex gap-2">
              <button
                onClick={() => { setMostrarInvitar((v) => !v); setMostrarAlta(false); }}
                className="text-[12.5px] font-semibold text-accent border border-accent rounded-lg px-3 py-1.5"
              >
                {mostrarInvitar ? 'Cancelar' : '+ Invitar'}
              </button>
              <button
                onClick={() => { setMostrarAlta((v) => !v); setMostrarInvitar(false); }}
                className="text-[12.5px] font-semibold text-text-muted border border-border rounded-lg px-3 py-1.5"
              >
                {mostrarAlta ? 'Cancelar' : '+ Cuenta directa'}
              </button>
            </div>
          </div>

          {mostrarInvitar && <GenerarInvitacion rolActor={usuario.rol} onListo={cargar} />}
          {mostrarAlta && <AltaCuenta rolActor={usuario.rol} onListo={() => { setMostrarAlta(false); cargar(); }} />}

          {invitesPendientes?.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-semibold text-text-faint uppercase tracking-wide">
                Invitaciones sin reclamar
              </span>
              {invitesPendientes.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between bg-bg border border-border rounded-lg px-3 h-9">
                  <span className="text-[11.5px] text-text-muted capitalize">{inv.rol}</span>
                  <code className="text-[11px] font-mono text-text-faint truncate">{inv.code}</code>
                </div>
              ))}
            </div>
          )}

          {usuarios === null && <p className="text-[13px] text-text-muted">Cargando…</p>}
          {usuarios?.length === 0 && <p className="text-[13px] text-text-muted">Todavía no hay cuentas cargadas.</p>}

          <div className="flex flex-col gap-2">
            {usuarios?.map((u) => (
              <div key={u.id} className="bg-surface border border-border rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[13.5px] font-semibold truncate">{u.nombre}</span>
                  <span className="text-[12px] text-text-muted truncate">{u.usuario}</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10.5px] font-semibold uppercase text-text-faint bg-bg border border-border rounded-md px-1.5 py-0.5">
                      {u.rol}
                    </span>
                    {u.rol === 'cliente' && (
                      <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md ${u.tiene_rutina_activa ? 'bg-success-bg text-success' : 'bg-bg border border-border text-text-faint'}`}>
                        {u.tiene_rutina_activa ? 'Con rutina' : 'Sin rutina'}
                      </span>
                    )}
                  </div>
                </div>
                {u.rol === 'cliente' && (
                  <Link
                    to={`/coach/clientes/${u.id}/${u.tiene_rutina_activa ? 'entrenamiento' : 'onboarding'}`}
                    className="text-[12.5px] font-semibold text-accent whitespace-nowrap"
                  >
                    {u.tiene_rutina_activa ? 'Ver →' : 'Armar rutina →'}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function GenerarInvitacion({ rolActor, onListo }) {
  const [rol, setRol] = useState('cliente');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function onGenerar() {
    setError('');
    setEnviando(true);
    try {
      const invite = await api.post('/auth/invites', { rol });
      setResultado(invite);
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const link = resultado ? `${window.location.origin}${import.meta.env.BASE_URL}invitacion/${resultado.code}` : '';

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2.5">
      {!resultado && (
        <>
          {rolActor === 'admin' && (
            <div className="flex gap-2">
              {['coach', 'cliente'].map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRol(r)}
                  className={`flex-1 h-9 rounded-lg border text-[13px] font-semibold capitalize ${rol === r ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-[12.5px] text-danger">{error}</p>}
          <button
            type="button"
            onClick={onGenerar}
            disabled={enviando}
            className="h-10 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold disabled:opacity-60"
          >
            {enviando ? 'Generando…' : `Generar código de invitación (${rolActor === 'admin' ? rol : 'cliente'})`}
          </button>
        </>
      )}
      {resultado && (
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] text-text-muted">
            Pasale este código o link a la persona que invitaste:
          </span>
          <div className="flex items-center justify-between bg-bg border border-border rounded-lg px-3 h-10">
            <code className="text-[13px] font-mono truncate">{resultado.code}</code>
          </div>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            className="h-9 rounded-lg border border-border bg-bg px-3 text-[11.5px] text-text-muted outline-none"
          />
          <button
            type="button"
            onClick={() => setResultado(null)}
            className="h-9 rounded-lg border border-border text-text-muted text-[12.5px] font-semibold"
          >
            Generar otra
          </button>
        </div>
      )}
    </div>
  );
}

function AltaCuenta({ rolActor, onListo }) {
  const [nombre, setNombre] = useState('');
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('cliente');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await api.post('/auth/usuarios', { nombre, usuario: nombreUsuario, password, rol });
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2.5">
      {rolActor === 'admin' && (
        <div className="flex gap-2">
          {['coach', 'cliente'].map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => setRol(r)}
              className={`flex-1 h-9 rounded-lg border text-[13px] font-semibold capitalize ${rol === r ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`}
            >
              {r}
            </button>
          ))}
        </div>
      )}
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" required
        className="h-10 rounded-lg border border-border bg-bg px-3 text-[13.5px] outline-none focus:border-accent" />
      <input value={nombreUsuario} onChange={(e) => setNombreUsuario(e.target.value)} type="text" placeholder="Usuario (4-10 caracteres)" required
        minLength={4} maxLength={10} pattern="[A-Za-z0-9._-]+"
        className="h-10 rounded-lg border border-border bg-bg px-3 text-[13.5px] outline-none focus:border-accent" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Contraseña" required
        className="h-10 rounded-lg border border-border bg-bg px-3 text-[13.5px] outline-none focus:border-accent" />
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <button type="submit" disabled={enviando} className="h-10 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold disabled:opacity-60">
        {enviando ? 'Creando…' : 'Crear cuenta'}
      </button>
    </form>
  );
}
