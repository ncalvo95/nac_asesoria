import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { NumberField } from './NumberField.jsx';

// Panel de "Agregar/elegir variante": lista el titular y las variantes ya
// guardadas (cada una con su propio peso/techo, independiente del titular -
// ver ejercicio_variante en schema.sql) para activar cualquiera con un
// toque, mas un mini formulario para agregar una nueva (mismo flujo que
// SustituirEjercicio: catalogo del mismo musculo, o un nombre particular,
// con un peso+reps de referencia). Elegir una dura solo hasta la proxima
// sesion registrada/salteada de este dia (ver resetVarianteActivaDia en
// progressionEngine.js) - por eso no hace falta "volver al titular" al
// cerrar el panel, ya vuelve sola.
export function VariantePanel({ ejercicio, onListo, onError }) {
  const [candidatos, setCandidatos] = useState(null);
  const [elegido, setElegido] = useState('');
  const [particular, setParticular] = useState(false);
  const [nombreParticular, setNombreParticular] = useState('');
  const [peso, setPeso] = useState('');
  const [reps, setReps] = useState('');
  const [mostrarForm, setMostrarForm] = useState(ejercicio.variantes?.length === 0);
  const [enviando, setEnviando] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!mostrarForm || candidatos !== null) return;
    api.get(`/ejercicios/${ejercicio.id}/candidatos`).then(setCandidatos).catch((err) => setError(err.message));
  }, [mostrarForm, candidatos, ejercicio.id]);

  const yaAgregados = new Set((ejercicio.variantes || []).map((v) => v.ejercicio_id));
  const opciones = (candidatos || []).filter((c) => !yaAgregados.has(c.id));

  async function activar(varianteId) {
    setEnviando(varianteId ?? 'titular');
    setError('');
    try {
      await api.patch(`/ejercicios/${ejercicio.id}/variante-activa`, { variante_id: varianteId });
      onListo();
    } catch (err) {
      setError(err.message);
      onError(err.message);
    } finally {
      setEnviando(null);
    }
  }

  async function borrar(varianteId) {
    setEnviando(varianteId);
    setError('');
    try {
      await api.del(`/variantes/${varianteId}`);
      onListo();
    } catch (err) {
      setError(err.message);
      onError(err.message);
    } finally {
      setEnviando(null);
    }
  }

  async function agregar() {
    const faltaEjercicio = particular ? !nombreParticular.trim() : !elegido;
    if (faltaEjercicio || peso === '' || reps === '') {
      setError('Completá el ejercicio, el peso y las reps de referencia.');
      return;
    }
    setEnviando('nueva');
    setError('');
    try {
      await api.post(`/ejercicios/${ejercicio.id}/variantes`, {
        nuevo_ejercicio_id: particular ? undefined : Number(elegido),
        nombre_personalizado: particular ? nombreParticular.trim() : undefined,
        peso: Number(peso),
        reps: Number(reps),
      });
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="bg-bg border border-border rounded-xl p-3 flex flex-col gap-2.5">
      <span className="text-[12px] font-semibold">Variante para esta sesión</span>
      <p className="text-[11.5px] text-text-muted leading-relaxed">
        Para cuando el ejercicio de siempre no está disponible (máquina rota/ocupada): elegí otro que trabaje el mismo músculo,
        con su propio peso guardado. Vuelve sola al titular después de esta sesión - las series/reps siguen contando igual para el músculo.
      </p>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => activar(null)}
          disabled={enviando != null || ejercicio.variante_activa_id == null}
          className={`text-left px-2.5 py-2 rounded-lg border text-[13px] flex items-center justify-between gap-2 disabled:opacity-60 ${
            ejercicio.variante_activa_id == null ? 'border-accent bg-accent/10 font-semibold' : 'border-border bg-surface'
          }`}
        >
          <span>Titular: {ejercicio.titular_ejercicio_nombre}</span>
          <span className="text-[11px] text-text-faint whitespace-nowrap">
            {ejercicio.titular_peso_actual != null ? `${ejercicio.titular_peso_actual}kg` : '—'}
            {ejercicio.titular_piso_reps != null ? ` × ${ejercicio.titular_piso_reps}` : ''}
          </span>
        </button>
        {(ejercicio.variantes || []).map((v) => (
          <div
            key={v.id}
            className={`flex items-center gap-1.5 rounded-lg border ${
              ejercicio.variante_activa_id === v.id ? 'border-accent bg-accent/10' : 'border-border bg-surface'
            }`}
          >
            <button
              type="button"
              onClick={() => activar(v.id)}
              disabled={enviando != null || ejercicio.variante_activa_id === v.id}
              className={`flex-1 text-left px-2.5 py-2 text-[13px] flex items-center justify-between gap-2 disabled:opacity-60 ${
                ejercicio.variante_activa_id === v.id ? 'font-semibold' : ''
              }`}
            >
              <span>{v.ejercicio_nombre}</span>
              <span className="text-[11px] text-text-faint whitespace-nowrap">
                {v.peso_actual != null ? `${v.peso_actual}kg` : '—'}{v.piso_reps != null ? ` × ${v.piso_reps}` : ''}
              </span>
            </button>
            <button
              type="button"
              onClick={() => borrar(v.id)}
              disabled={enviando != null}
              title="Quitar esta variante"
              className="px-2.5 text-[11px] text-danger shrink-0 disabled:opacity-60"
            >
              Quitar
            </button>
          </div>
        ))}
      </div>

      {!mostrarForm && (
        <button
          type="button"
          onClick={() => setMostrarForm(true)}
          className="self-start text-[11.5px] text-accent underline underline-offset-2"
        >
          + Agregar una variante nueva
        </button>
      )}

      {mostrarForm && (
        <div className="flex flex-col gap-2 pt-1 border-t border-border">
          {!particular && candidatos === null && <span className="text-[12px] text-text-muted">Cargando opciones…</span>}
          {!particular && candidatos !== null && opciones.length === 0 && (
            <span className="text-[12px] text-text-muted">No hay más alternativas para este músculo con tu equipamiento actual.</span>
          )}
          {!particular && opciones.length > 0 && (
            <select
              value={elegido}
              onChange={(e) => setElegido(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-[13px] outline-none focus:border-accent"
            >
              <option value="">Elegí un ejercicio…</option>
              {opciones.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          )}
          {particular && (
            <input
              value={nombreParticular}
              onChange={(e) => setNombreParticular(e.target.value)}
              placeholder="Nombre del ejercicio particular"
              className="h-9 rounded-lg border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-accent"
            />
          )}
          <button
            type="button"
            onClick={() => { setParticular((v) => !v); setError(''); }}
            className="self-start text-[11.5px] text-text-muted underline underline-offset-2"
          >
            {particular ? '← Elegir del catálogo' : 'No está en la lista, cargar uno particular'}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Peso (kg)" value={peso} onChange={setPeso} />
            <NumberField label="Reps" value={reps} onChange={setReps} />
          </div>

          <button
            type="button"
            onClick={agregar}
            disabled={enviando != null || (particular ? !nombreParticular.trim() : !opciones.length)}
            className="h-9 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
          >
            {enviando === 'nueva' ? 'Guardando…' : 'Agregar y usar esta sesión'}
          </button>
        </div>
      )}

      {error && <span className="text-[12px] text-danger">{error}</span>}
    </div>
  );
}
