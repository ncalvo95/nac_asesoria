import { useState } from 'react';
import { api } from '../../api/client.js';
import { formatearMusculo } from '../../utils/musculo.js';
import { NumberField } from './NumberField.jsx';

// Suma un ejercicio EXTRA a un musculo ya presente ese dia (no reemplaza
// nada) - usa GET /dias/:id/musculos/:id/candidatos + POST /dias/:id/ejercicios.
// Compartido entre Semana0Form (estado local) y RegistroDia (recarga completa).
export function AgregarEjercicioDia({ diaRutinaId, musculos, onAgregado }) {
  const [abierto, setAbierto] = useState(false);
  const [musculoId, setMusculoId] = useState(musculos.length === 1 ? musculos[0].id : '');
  const [candidatos, setCandidatos] = useState(null);
  const [elegido, setElegido] = useState('');
  const [particular, setParticular] = useState(false);
  const [nombreParticular, setNombreParticular] = useState('');
  const [peso, setPeso] = useState('');
  const [reps, setReps] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  function cargarCandidatos(id) {
    setMusculoId(id);
    setCandidatos(null);
    setElegido('');
    setError('');
    api.get(`/dias/${diaRutinaId}/musculos/${id}/candidatos`).then(setCandidatos).catch((err) => setError(err.message));
  }

  function abrir() {
    setAbierto(true);
    setError('');
    if (musculos.length === 1) cargarCandidatos(musculos[0].id);
  }

  function cerrar() {
    setAbierto(false);
    setParticular(false);
    setNombreParticular('');
    setPeso('');
    setReps('');
  }

  async function confirmar() {
    const faltaEjercicio = particular ? !nombreParticular.trim() : !elegido;
    if (!musculoId || faltaEjercicio || peso === '' || reps === '') {
      setError('Elegí el ejercicio y cargá el peso y la serie de referencia.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const body = {
        musculo_id: Number(musculoId),
        ...(particular ? { nombre_personalizado: nombreParticular.trim() } : { ejercicio_id: Number(elegido) }),
        peso: Number(peso),
        reps: Number(reps),
      };
      const nuevo = await api.post(`/dias/${diaRutinaId}/ejercicios`, body);
      const musculoNombre = musculos.find((m) => m.id === Number(musculoId))?.nombre;
      onAgregado(nuevo, musculoNombre);
      cerrar();
      setMusculoId(musculos.length === 1 ? musculos[0].id : '');
      setCandidatos(null);
      setElegido('');
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="self-start text-[12.5px] font-semibold text-accent underline underline-offset-2 px-1"
      >
        + Agregar ejercicio
      </button>
    );
  }

  return (
    <div className="bg-surface border border-dashed border-border rounded-xl p-3.5 flex flex-col gap-2.5">
      <span className="text-[12px] font-semibold">Agregar un ejercicio extra a este día</span>

      {musculos.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {musculos.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => cargarCandidatos(m.id)}
              className={`px-2.5 h-8 rounded-full border text-[12px] font-medium capitalize ${
                Number(musculoId) === m.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
              }`}
            >
              {formatearMusculo(m.nombre)}
            </button>
          ))}
        </div>
      )}

      {!particular && musculoId && candidatos === null && <span className="text-[12px] text-text-muted">Cargando opciones…</span>}
      {!particular && musculoId && candidatos?.length === 0 && (
        <span className="text-[12px] text-text-muted">No hay más ejercicios para ese músculo con tu equipamiento actual.</span>
      )}
      {!particular && musculoId && candidatos?.length > 0 && (
        <select
          value={elegido}
          onChange={(e) => setElegido(e.target.value)}
          className="h-9 rounded-lg border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent"
        >
          <option value="">Elegí un ejercicio…</option>
          {candidatos.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      )}

      {particular && musculoId && (
        <input
          value={nombreParticular}
          onChange={(e) => setNombreParticular(e.target.value)}
          placeholder="Nombre del ejercicio particular"
          className="h-9 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent"
        />
      )}

      {musculoId && (
        <button
          type="button"
          onClick={() => { setParticular((v) => !v); setError(''); }}
          className="self-start text-[11.5px] text-text-muted underline underline-offset-2"
        >
          {particular ? '← Elegir del catálogo' : 'No está en la lista, cargar uno particular'}
        </button>
      )}

      {musculoId && (particular ? nombreParticular.trim() : elegido) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] text-text-muted leading-relaxed">
            Probá un peso con el que puedas hacer entre 12 y 16 reps, y cargá esa serie de referencia.
          </span>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Peso (kg)" value={peso} onChange={setPeso} />
            <NumberField label="Reps" value={reps} onChange={setReps} />
          </div>
        </div>
      )}

      {error && <span className="text-[12px] text-danger">{error}</span>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={cerrar}
          className="flex-1 h-9 rounded-lg border border-border text-text-muted text-[12.5px] font-semibold"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={enviando || (particular ? !nombreParticular.trim() : !elegido) || peso === '' || reps === ''}
          className="flex-1 h-9 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
        >
          {enviando ? 'Agregando…' : 'Agregar'}
        </button>
      </div>
    </div>
  );
}
