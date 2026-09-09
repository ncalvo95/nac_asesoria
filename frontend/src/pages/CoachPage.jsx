import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';

export default function CoachPage() {
  const { usuario, logout } = useAuth();
  const [usuarios, setUsuarios] = useState(null);
  const [error, setError] = useState('');
  const [mostrarAlta, setMostrarAlta] = useState(false);

  async function cargar() {
    try {
      setUsuarios(await api.get('/auth/usuarios'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      <header className="flex-none bg-surface border-b border-border px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 7v10M17.5 7v10M2 10v4M22 10v4M6.5 12h11" />
          </svg>
          <span className="text-[15px] font-bold">Bitácora {usuario.rol === 'admin' ? '· Admin' : '· Coach'}</span>
        </div>
        <button onClick={logout} className="text-xs font-semibold text-text-muted">{usuario.nombre} · Salir</button>
      </header>

      <div className="p-4 flex flex-col gap-5 max-w-xl w-full mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-[16px] font-bold">{usuario.rol === 'admin' ? 'Cuentas' : 'Mis clientes'}</h1>
          <button
            onClick={() => setMostrarAlta((v) => !v)}
            className="text-[12.5px] font-semibold text-accent border border-accent rounded-lg px-3 py-1.5"
          >
            {mostrarAlta ? 'Cancelar' : '+ Nueva cuenta'}
          </button>
        </div>

        {mostrarAlta && <AltaCuenta rolActor={usuario.rol} onListo={() => { setMostrarAlta(false); cargar(); }} />}

        {error && <p className="text-[13px] text-danger">{error}</p>}

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
                  to={`/coach/clientes/${u.id}/entrenamiento`}
                  className="text-[12.5px] font-semibold text-accent whitespace-nowrap"
                >
                  Ver →
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
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
