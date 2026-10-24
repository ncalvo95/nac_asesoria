import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { NumberField } from './NumberField.jsx';

export function SustituirEjercicio({ ejercicio, onListo }) {
  const [candidatos, setCandidatos] = useState(null);
  const [elegido, setElegido] = useState('');
  const [particular, setParticular] = useState(false);
  const [nombreParticular, setNombreParticular] = useState('');
  const [peso, setPeso] = useState('');
  const [reps, setReps] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get(`/ejercicios/${ejercicio.id}/candidatos`).then(setCandidatos).catch((err) => setError(err.message));
  }, [ejercicio.id]);

  async function confirmar() {
    const faltaEjercicio = particular ? !nombreParticular.trim() : !elegido;
    if (faltaEjercicio || peso === '' || reps === '') {
      setError('Completá el ejercicio nuevo, el peso y la serie de referencia.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.post(`/ejercicios/${ejercicio.id}/sustituir`, {
        nuevo_ejercicio_id: particular ? undefined : Number(elegido),
        nombre_personalizado: particular ? nombreParticular.trim() : undefined,
        peso: Number(peso),
        reps: Number(reps),
      });
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="bg-bg border border-border rounded-xl p-3 flex flex-col gap-2.5">
      <span className="text-[12px] font-semibold">Sustituir por otro ejercicio del mismo músculo</span>
      <p className="text-[11.5px] text-text-muted leading-relaxed">
        Probá un peso con el que puedas hacer entre 12 y 16 reps, y cargá esa serie de referencia — se usa como piso para lo que queda de este microciclo.
      </p>

      {!particular && candidatos === null && <span className="text-[12px] text-text-muted">Cargando opciones…</span>}
      {!particular && candidatos?.length === 0 && (
        <span className="text-[12px] text-text-muted">No hay alternativas para este músculo con tu equipamiento actual.</span>
      )}
      {!particular && candidatos?.length > 0 && (
        <select
          value={elegido}
          onChange={(e) => setElegido(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface px-2 text-[13px] outline-none focus:border-accent"
        >
          <option value="">Elegí un ejercicio…</option>
          {candidatos.map((c) => (
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

      {error && <span className="text-[12px] text-danger">{error}</span>}

      <button
        type="button"
        onClick={confirmar}
        disabled={enviando || (particular ? !nombreParticular.trim() : !candidatos?.length)}
        className="h-9 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
      >
        {enviando ? 'Guardando…' : 'Confirmar sustitución'}
      </button>
    </div>
  );
}
