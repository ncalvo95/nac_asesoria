import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import AccountMenu from '../components/AccountMenu.jsx';

const EQUIPO_TAGS = ['barra', 'mancuernas', 'banco', 'polea', 'maquina', 'banda', 'paralelas', 'barra_dominadas', 'peso_corporal'];

export default function CatalogoPage() {
  const [musculos, setMusculos] = useState(null);
  const [ejercicios, setEjercicios] = useState(null);
  const [error, setError] = useState('');
  const [mostrarAlta, setMostrarAlta] = useState(false);

  async function cargar() {
    try {
      const [m, e] = await Promise.all([
        api.get('/catalogo/musculos'),
        api.get('/catalogo/ejercicios?incluir_inactivos=1'),
      ]);
      setMusculos(m);
      setEjercicios(e);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function toggleActivo(id, activo) {
    try {
      await api.patch(`/catalogo/ejercicios/${id}/activo`, { activo });
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const musculosPorId = Object.fromEntries((musculos || []).map((m) => [m.id, m.nombre]));

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      <header className="flex-none bg-surface border-b border-border px-5 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 7v10M17.5 7v10M2 10v4M22 10v4M6.5 12h11" />
          </svg>
          <span className="text-[15px] font-bold">NAC Asesoria · Catálogo</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/coach" className="text-xs font-semibold text-accent">Inicio</Link>
          <AccountMenu />
        </div>
      </header>

      <div className="p-4 flex flex-col gap-5 max-w-xl w-full mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[16px] font-bold">Catálogo de ejercicios</h1>
            <p className="text-[12.5px] text-text-muted mt-0.5">Lo que agregues acá lo ven y lo pueden usar todos los usuarios.</p>
          </div>
          <button
            onClick={() => setMostrarAlta((v) => !v)}
            className="text-[12.5px] font-semibold text-accent border border-accent rounded-lg px-3 py-1.5 whitespace-nowrap"
          >
            {mostrarAlta ? 'Cancelar' : '+ Ejercicio'}
          </button>
        </div>

        {error && <p className="text-[13px] text-danger">{error}</p>}

        {mostrarAlta && musculos && (
          <AltaEjercicio musculos={musculos} onListo={() => { setMostrarAlta(false); cargar(); }} />
        )}

        {ejercicios === null && <p className="text-[13px] text-text-muted">Cargando…</p>}

        <div className="flex flex-col gap-2">
          {ejercicios?.map((e) => (
            <div key={e.id} className="bg-surface border border-border rounded-xl p-3.5 flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className={`text-[13.5px] font-semibold truncate ${!e.activo ? 'text-text-faint line-through' : ''}`}>{e.nombre}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10.5px] font-semibold uppercase text-text-faint bg-bg border border-border rounded-md px-1.5 py-0.5">
                    {e.musculo_nombre}
                  </span>
                  <span className="text-[10.5px] text-text-faint capitalize">{e.tipo}</span>
                </div>
              </div>
              <button
                onClick={() => toggleActivo(e.id, !e.activo)}
                className="text-[11.5px] font-semibold text-text-muted whitespace-nowrap"
              >
                {e.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AltaEjercicio({ musculos, onListo }) {
  const [nombre, setNombre] = useState('');
  const [musculoId, setMusculoId] = useState(musculos[0]?.id ?? '');
  const [tipo, setTipo] = useState('compuesto');
  const [patronMovimiento, setPatronMovimiento] = useState('');
  const [equipo, setEquipo] = useState([]);
  const [esCompuestoFuerza, setEsCompuestoFuerza] = useState(false);
  const [esUnilateral, setEsUnilateral] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  function toggleEquipo(tag) {
    setEquipo((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!nombre.trim() || !patronMovimiento.trim()) {
      setError('Nombre y patrón de movimiento son obligatorios.');
      return;
    }
    setEnviando(true);
    try {
      await api.post('/catalogo/ejercicios', {
        nombre, musculo_id: Number(musculoId), tipo, patron_movimiento: patronMovimiento,
        equipamiento_requerido: equipo,
        es_compuesto_principal_fuerza: esCompuestoFuerza,
        es_unilateral: esUnilateral,
      });
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2.5">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del ejercicio" required
        className="h-10 rounded-lg border border-border bg-bg px-3 text-[13.5px] outline-none focus:border-accent" />

      <select value={musculoId} onChange={(e) => setMusculoId(e.target.value)}
        className="h-10 rounded-lg border border-border bg-bg px-3 text-[13.5px] outline-none focus:border-accent capitalize">
        {musculos.map((m) => (
          <option key={m.id} value={m.id}>{m.nombre}</option>
        ))}
      </select>

      <div className="flex gap-2">
        {['compuesto', 'aislado'].map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTipo(t)}
            className={`flex-1 h-9 rounded-lg border text-[13px] font-semibold capitalize ${tipo === t ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <input value={patronMovimiento} onChange={(e) => setPatronMovimiento(e.target.value)} placeholder="Patrón de movimiento (ej. empuje_horizontal)" required
        className="h-10 rounded-lg border border-border bg-bg px-3 text-[13.5px] outline-none focus:border-accent" />

      <div className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-semibold text-text-muted uppercase tracking-wide">Equipamiento que requiere</span>
        <div className="flex gap-1.5 flex-wrap">
          {EQUIPO_TAGS.map((tag) => (
            <button
              type="button"
              key={tag}
              onClick={() => toggleEquipo(tag)}
              className={`px-2.5 h-7 rounded-full border text-[11.5px] font-medium ${equipo.includes(tag) ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`}
            >
              {tag.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-[12.5px] text-text-muted">
        <input type="checkbox" checked={esCompuestoFuerza} onChange={(e) => setEsCompuestoFuerza(e.target.checked)} className="w-4 h-4 accent-accent" />
        Compuesto principal de fuerza (rango de reps más bajo con objetivo fuerza)
      </label>
      <label className="flex items-center gap-2 text-[12.5px] text-text-muted">
        <input type="checkbox" checked={esUnilateral} onChange={(e) => setEsUnilateral(e.target.checked)} className="w-4 h-4 accent-accent" />
        Unilateral
      </label>

      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <button type="submit" disabled={enviando} className="h-10 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold disabled:opacity-60">
        {enviando ? 'Guardando…' : 'Agregar al catálogo'}
      </button>
    </form>
  );
}
