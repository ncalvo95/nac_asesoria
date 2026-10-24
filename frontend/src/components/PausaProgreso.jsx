import { useState } from 'react';
import { api } from '../api/client.js';
import { aIso, fechaCorta } from '../utils/fechas.js';

const CLAVE_VOLVER = (rutinaId) => `nac_volver_${rutinaId}`;
// Desde cuantos dias fuera se recomienda retestear (y desde cuantos, una descarga).
const DIAS_RETESTEO = 14;
const DIAS_DESCARGA = 7;

function leerVolver(rutinaId) {
  try { return JSON.parse(localStorage.getItem(CLAVE_VOLVER(rutinaId))); } catch { return null; }
}
function guardarVolver(rutinaId, valor) {
  try {
    if (valor) localStorage.setItem(CLAVE_VOLVER(rutinaId), JSON.stringify(valor));
    else localStorage.removeItem(CLAVE_VOLVER(rutinaId));
  } catch { /* sin storage: la oferta solo se ve en esta sesion */ }
}

export const MOTIVOS_PAUSA = ['Vacaciones', 'Viaje', 'Lesión', 'Otro'];

// Pausa del progreso (vacaciones, viaje, lesion...): congela el bloque. Ver
// pausaService.js. Mientras dura no se puede anotar ni cerrar bloques.
export function BannerPausa({ rutina, onCambio }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  if (!rutina?.pausa) return null;

  async function reanudar() {
    setEnviando(true);
    setError('');
    try {
      const r = await api.post(`/rutinas/${rutina.id}/reanudar`, { fecha: aIso(new Date()) });
      // Una pausa de 0-1 dias (tocada por error o de un dia para otro) no
      // amerita ofrecer retestear.
      guardarVolver(rutina.id, r.dias_fuera >= 2 ? { dias_fuera: r.dias_fuera, motivo: r.motivo } : null);
      await onCambio();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const { desde, dias, motivo } = rutina.pausa;
  return (
    <div role="status" className="bg-warning-bg text-warning rounded-xl px-4 py-3 flex flex-col gap-2">
      <strong className="text-[14px]">⏸ Progreso en pausa</strong>
      <p className="text-[12.5px] leading-relaxed">
        Desde el {fechaCorta(desde)}{dias > 0 ? ` (${dias} ${dias === 1 ? 'día' : 'días'})` : ''}{motivo ? ` · ${motivo}` : ''}.
        Mientras esté en pausa no se puede anotar ni cerrar bloques, y estos días no cuentan: tu bloque queda congelado en vez de
        vencerse vacío y marcarte estancado.
      </p>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <button
        type="button"
        onClick={reanudar}
        disabled={enviando}
        className="self-start h-10 px-4 rounded-[10px] bg-accent text-accent-fg text-[13.5px] font-semibold disabled:opacity-60"
      >
        {enviando ? 'Reanudando…' : 'Reanudar progreso'}
      </button>
    </div>
  );
}

// Tras reanudar: ofrece retomar tal cual, retestear o hacer una descarga. No
// es obligatorio - queda hasta que se elija una opcion o se cierre.
export function OfertaAlVolver({ rutina, onCambio }) {
  const [volver, setVolver] = useState(() => (rutina?.id ? leerVolver(rutina.id) : null));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  if (!rutina || rutina.pausa || !volver) return null;

  const dias = volver.dias_fuera ?? 0;
  const recomendada = dias >= DIAS_RETESTEO ? 'testeo' : dias >= DIAS_DESCARGA ? 'descarga' : 'seguir';

  function cerrar() {
    guardarVolver(rutina.id, null);
    setVolver(null);
  }

  async function elegir(ruta) {
    setEnviando(true);
    setError('');
    try {
      await api.post(`/rutinas/${rutina.id}/${ruta}`);
      cerrar();
      await onCambio();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const Opcion = ({ clave, titulo, texto, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={enviando}
      className={`text-left rounded-lg border px-3 py-2 disabled:opacity-60 ${
        recomendada === clave ? 'border-accent bg-surface' : 'border-border bg-bg'
      }`}
    >
      <span className="text-[13px] font-semibold block">
        {titulo}{recomendada === clave && <span className="ml-1.5 text-[10.5px] font-semibold text-accent uppercase">Recomendado</span>}
      </span>
      <span className="text-[12px] text-text-muted leading-snug block">{texto}</span>
    </button>
  );

  return (
    <div className="bg-success-bg text-text rounded-xl px-4 py-3 flex flex-col gap-2">
      <strong className="text-[14px] text-success">¡Qué bueno que volviste!</strong>
      <p className="text-[12.5px] leading-relaxed text-text-muted">
        Estuviste {dias} {dias === 1 ? 'día' : 'días'} fuera{volver.motivo ? ` (${volver.motivo})` : ''}. Tu bloque sigue donde lo dejaste.
        {dias >= DIAS_RETESTEO && ' Con una ausencia así de larga conviene volver a medir tus pesos.'}
        {dias >= DIAS_DESCARGA && dias < DIAS_RETESTEO && ' Una semana más liviana ayuda a retomar sin lesionarse.'}
        {' '}¿Cómo querés retomar?
      </p>
      <div className="flex flex-col gap-1.5">
        <Opcion clave="seguir" titulo="Seguir donde quedé" texto="Retomás el bloque con los mismos pesos y objetivos." onClick={cerrar} />
        <Opcion clave="testeo" titulo="Semana de testeo" texto="Volvés a medir peso y reps con 2 series por ejercicio y la rutina se recalibra." onClick={() => elegir('testeo')} />
        <Opcion clave="descarga" titulo="Semana de descarga" texto="Una semana con menos peso y series y después retomás donde estabas." onClick={() => elegir('deload')} />
      </div>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}

// Formulario para pausar: motivo opcional y confirmar.
export function FormularioPausa({ rutina, onCambio }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('Vacaciones');
  const [otro, setOtro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  async function pausar() {
    setEnviando(true);
    setError('');
    try {
      await api.post(`/rutinas/${rutina.id}/pausa`, {
        motivo: motivo === 'Otro' ? (otro.trim() || 'Otro') : motivo,
        fecha: aIso(new Date()),
      });
      guardarVolver(rutina.id, null);
      setAbierto(false);
      await onCambio();
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
        onClick={() => setAbierto(true)}
        className="self-start h-9 px-3.5 rounded-[10px] border border-border bg-surface text-text-muted text-[13px] font-semibold"
      >
        Pausar progreso…
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 bg-bg border border-border rounded-lg p-3">
      <span className="text-[12.5px] font-semibold">¿Por qué pausás?</span>
      <div className="flex flex-wrap gap-1.5">
        {MOTIVOS_PAUSA.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMotivo(m)}
            aria-pressed={motivo === m}
            className={`h-8 px-3 rounded-full border text-[12.5px] font-semibold ${
              motivo === m ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      {motivo === 'Otro' && (
        <input
          value={otro}
          onChange={(e) => setOtro(e.target.value)}
          maxLength={120}
          placeholder="Contá brevemente (opcional)"
          className="h-9 rounded-lg border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-accent"
        />
      )}
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="h-9 px-3 rounded-[10px] border border-border text-text-muted text-[13px] font-semibold">
          Cancelar
        </button>
        <button
          type="button"
          onClick={pausar}
          disabled={enviando}
          className="h-9 px-4 rounded-[10px] bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
        >
          {enviando ? 'Pausando…' : 'Pausar ahora'}
        </button>
      </div>
    </div>
  );
}
