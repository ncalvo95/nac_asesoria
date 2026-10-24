import { useState } from 'react';
import { api } from '../../api/client.js';
import { formatearMusculo } from '../../utils/musculo.js';

// Sumar/restar una serie a mano, sin esperar al cierre de microciclo - el
// backend valida el piso (SERIES_MINIMO) y el tope segun objetivo/ejercicio.
export function AjusteSeries({ ejercicioId, seriesActuales, onAjustado, onError }) {
  const [enviando, setEnviando] = useState(false);

  async function ajustar(delta) {
    setEnviando(true);
    onError('');
    try {
      await api.patch(`/ejercicios/${ejercicioId}/series`, { delta });
      onAjustado();
    } catch (err) {
      onError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[11px] text-text-faint whitespace-nowrap">Series</span>
      <button
        type="button"
        onClick={() => ajustar(-1)}
        disabled={enviando}
        className="w-6 h-6 rounded-md border border-border bg-surface text-text-muted text-[13px] leading-none disabled:opacity-40"
      >
        −
      </button>
      <span className="tabular text-[13px] font-semibold w-4 text-center">{seriesActuales}</span>
      <button
        type="button"
        onClick={() => ajustar(1)}
        disabled={enviando}
        className="w-6 h-6 rounded-md border border-border bg-surface text-text-muted text-[13px] leading-none disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

// Cambiar el peso base (el que se precarga la proxima sesion) sin esperar
// al cierre de microciclo.
export function AjustePeso({ ejercicioId, pesoActual, onAjustado }) {
  const [peso, setPeso] = useState(pesoActual ?? '');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    const valor = Number(peso);
    if (!peso || !Number.isFinite(valor) || valor <= 0) {
      setError('Ingresá un peso válido.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.patch(`/ejercicios/${ejercicioId}/peso`, { peso: valor });
      onAjustado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number" inputMode="decimal" value={peso}
        onChange={(e) => setPeso(e.target.value)}
        className="w-20 h-8 rounded-md border border-border bg-bg px-2 tabular text-[13px] outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={confirmar}
        disabled={enviando}
        className="h-8 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold disabled:opacity-60"
      >
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}

// Ajuste manual del piso de reps (el objetivo sugerido en gris para la 1ra
// serie) del microciclo EN CURSO, sin esperar al proximo cierre - mismo
// patron que AjustePeso, pero para piso_reps. Hasta ahora la unica forma
// de corregirlo era "Editar Semana 0", que solo funciona en el primer
// microciclo despues de un testeo - esto cubre cualquier microciclo mas
// adelante (ej. volver a lo que se tenia antes de un ajuste automatico no
// deseado - ver Progreso para consultar el piso pactado del ultimo cierre).
export function AjustePisoReps({ ejercicioId, pisoActual, onAjustado }) {
  const [piso, setPiso] = useState(pisoActual ?? '');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    const valor = Number(piso);
    if (!piso || !Number.isInteger(valor) || valor <= 0) {
      setError('Ingresá un número entero mayor a 0.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.patch(`/ejercicios/${ejercicioId}/piso-reps`, { piso_reps: valor });
      onAjustado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number" inputMode="numeric" value={piso}
        onChange={(e) => setPiso(e.target.value)}
        className="w-20 h-8 rounded-md border border-border bg-bg px-2 tabular text-[13px] outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={confirmar}
        disabled={enviando}
        className="h-8 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold disabled:opacity-60"
      >
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}

// Descanso entre series, en segundos - solo informativo (no lo toca el
// motor de progresion), para que el usuario sepa cuanto descansar.
export function AjusteDescanso({ ejercicioId, descansoSegundos, onAjustado }) {
  const [descanso, setDescanso] = useState(descansoSegundos ?? 90);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    const valor = Number(descanso);
    if (!Number.isInteger(valor) || valor < 10 || valor > 600) {
      setError('Ingresá un descanso entre 10 y 600 segundos.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.patch(`/ejercicios/${ejercicioId}/descanso`, { descanso_segundos: valor });
      onAjustado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number" inputMode="numeric" step={5} min={10} max={600} value={descanso}
        onChange={(e) => setDescanso(e.target.value)}
        className="w-20 h-8 rounded-md border border-border bg-bg px-2 tabular text-[13px] outline-none focus:border-accent"
      />
      <span className="text-[11px] text-text-faint">segundos</span>
      <button
        type="button"
        onClick={confirmar}
        disabled={enviando}
        className="h-8 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold disabled:opacity-60"
      >
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}

// Hasta 2 musculos secundarios elegidos a mano para ESTE ejercicio puntual -
// se suman a los que ya trae el catalogo (no los reemplazan), para cuando
// el catalogo no capta bien lo que el ejercicio le pega a un musculo, o
// para un ejercicio "particular" sin dato de catalogo. Se usan para
// discriminar reps efectivas directas/indirectas por musculo en Progreso.
export function AjusteMusculosSecundarios({ ejercicio, todosMusculos, onAjustado }) {
  const [elegidos, setElegidos] = useState(() => {
    try {
      return JSON.parse(ejercicio.musculos_secundarios_json || '[]');
    } catch {
      return [];
    }
  });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  function toggle(nombre) {
    setElegidos((prev) => {
      if (prev.includes(nombre)) return prev.filter((m) => m !== nombre);
      if (prev.length >= 2) return prev;
      return [...prev, nombre];
    });
  }

  async function confirmar() {
    setEnviando(true);
    setError('');
    try {
      await api.patch(`/ejercicios/${ejercicio.id}/musculos-secundarios`, { musculos: elegidos });
      onAjustado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const opciones = (todosMusculos || []).filter((m) => m.nombre !== ejercicio.musculo_nombre);

  return (
    <div className="flex flex-col gap-2 items-end">
      <span className="text-[11px] text-text-faint">Hasta 2, además de los que ya trae el ejercicio</span>
      <div className="flex gap-1.5 flex-wrap justify-end max-w-xs">
        {opciones.map((m) => {
          const activo = elegidos.includes(m.nombre);
          return (
            <button
              key={m.nombre}
              type="button"
              onClick={() => toggle(m.nombre)}
              disabled={!activo && elegidos.length >= 2}
              className={`px-2.5 h-7 rounded-full border text-[11px] font-medium disabled:opacity-40 ${
                activo ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
              }`}
            >
              {formatearMusculo(m.nombre)}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={confirmar}
        disabled={enviando}
        className="h-8 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold disabled:opacity-60"
      >
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
