import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { formatearMusculo } from '../utils/musculo.js';

const TIPOS = [
  { id: 'exclusion', label: 'Excluir', hint: 'Este ejercicio nunca se le va a asignar.' },
  { id: 'preferencia', label: 'Preferir', hint: 'Se prioriza sobre otros del mismo músculo.' },
  { id: 'agregado_personalizado', label: 'Agregar propio', hint: 'Un ejercicio que no está en el catálogo, para el pool de sustitución.' },
];

export default function PreferenciasPage() {
  const { usuarioId } = useParams();
  const [preferencias, setPreferencias] = useState(null);
  const [musculos, setMusculos] = useState(null);
  const [ejercicios, setEjercicios] = useState(null);
  const [error, setError] = useState('');

  async function cargar() {
    try {
      const [prefs, mus, ejs] = await Promise.all([
        api.get(`/usuarios/${usuarioId}/preferencias-ejercicio`),
        api.get('/catalogo/musculos'),
        api.get('/catalogo/ejercicios'),
      ]);
      setPreferencias(prefs);
      setMusculos(mus);
      setEjercicios(ejs);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [usuarioId]);

  const ejerciciosPorNombre = useMemo(() => {
    const map = new Map(ejercicios?.map((e) => [e.id, e]) ?? []);
    return map;
  }, [ejercicios]);
  const musculosPorId = useMemo(() => new Map(musculos?.map((m) => [m.id, m]) ?? []), [musculos]);

  async function eliminar(id) {
    try {
      await api.del(`/usuarios/${usuarioId}/preferencias-ejercicio/${id}`);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 pb-8">
      <div>
        <h1 className="text-[17px] font-bold">Preferencias de ejercicios</h1>
        <p className="text-[12px] text-text-muted mt-0.5 leading-relaxed">
          Las exclusiones rigen desde la próxima rutina que se genere (no reescriben la actual). Un ejercicio "propio" entra al pool de sustitución del músculo que le asignes.
        </p>
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <NuevaPreferencia usuarioId={usuarioId} ejercicios={ejercicios} musculos={musculos} onCreada={cargar} />

      <div className="flex flex-col gap-2">
        {preferencias?.length === 0 && (
          <p className="text-[13px] text-text-muted">Todavía no hay preferencias cargadas.</p>
        )}
        {preferencias?.map((p) => (
          <div key={p.id} className="bg-surface border border-border rounded-xl p-3.5 flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[13px] font-semibold truncate">
                {p.tipo === 'agregado_personalizado' ? p.nombre_personalizado : ejerciciosPorNombre.get(p.ejercicio_id)?.nombre ?? `Ejercicio #${p.ejercicio_id}`}
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10.5px] font-semibold uppercase rounded-md px-1.5 py-0.5 ${
                  p.tipo === 'exclusion' ? 'bg-danger-bg text-danger' : p.tipo === 'preferencia' ? 'bg-success-bg text-success' : 'bg-bg border border-border text-text-faint'
                }`}>
                  {TIPOS.find((t) => t.id === p.tipo)?.label}
                </span>
                {p.tipo === 'agregado_personalizado' && (
                  <span className="text-[11px] text-text-faint capitalize">{formatearMusculo(musculosPorId.get(p.musculo_asignado_id)?.nombre)}</span>
                )}
              </div>
            </div>
            <button onClick={() => eliminar(p.id)} className="text-[12px] font-semibold text-danger whitespace-nowrap">
              Quitar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NuevaPreferencia({ usuarioId, ejercicios, musculos, onCreada }) {
  const [tipo, setTipo] = useState('exclusion');
  const [ejercicioId, setEjercicioId] = useState('');
  const [nombre, setNombre] = useState('');
  const [musculoId, setMusculoId] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (tipo === 'agregado_personalizado' && (!nombre.trim() || !musculoId)) {
      setError('Completá el nombre y el músculo del ejercicio propio.');
      return;
    }
    if (tipo !== 'agregado_personalizado' && !ejercicioId) {
      setError('Elegí un ejercicio del catálogo.');
      return;
    }
    setEnviando(true);
    try {
      await api.post(`/usuarios/${usuarioId}/preferencias-ejercicio`, {
        tipo,
        ejercicio_id: tipo !== 'agregado_personalizado' ? Number(ejercicioId) : undefined,
        nombre_personalizado: tipo === 'agregado_personalizado' ? nombre : undefined,
        musculo_asignado_id: tipo === 'agregado_personalizado' ? Number(musculoId) : undefined,
      });
      setEjercicioId(''); setNombre(''); setMusculoId('');
      onCreada();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface border border-border rounded-xl p-3.5 flex flex-col gap-2.5">
      <div className="flex gap-1.5">
        {TIPOS.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => setTipo(t.id)}
            className={`flex-1 h-9 rounded-lg border text-[12px] font-semibold ${tipo === t.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-[11.5px] text-text-faint -mt-1">{TIPOS.find((t) => t.id === tipo)?.hint}</p>

      {tipo !== 'agregado_personalizado' ? (
        <select
          value={ejercicioId}
          onChange={(e) => setEjercicioId(e.target.value)}
          className="h-10 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent"
        >
          <option value="">Elegí un ejercicio…</option>
          {ejercicios?.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre} ({formatearMusculo(e.musculo_nombre)})</option>
          ))}
        </select>
      ) : (
        <>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del ejercicio"
            className="h-10 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent"
          />
          <select
            value={musculoId}
            onChange={(e) => setMusculoId(e.target.value)}
            className="h-10 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent"
          >
            <option value="">Músculo objetivo…</option>
            {musculos?.map((m) => (
              <option key={m.id} value={m.id} className="capitalize">{formatearMusculo(m.nombre)}</option>
            ))}
          </select>
        </>
      )}

      {error && <p className="text-[12px] text-danger">{error}</p>}

      <button type="submit" disabled={enviando} className="h-10 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60">
        {enviando ? 'Guardando…' : 'Agregar'}
      </button>
    </form>
  );
}
