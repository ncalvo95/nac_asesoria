import { useState } from 'react';
import { api } from '../../api/client.js';
import { formatearMusculo } from '../../utils/musculo.js';
import { CAPITALIZAR } from '../../utils/entrenamiento.js';

// Corrige el nombre de un ejercicio "particular" (cargado a mano) por si
// se anoto mal - solo aparece para esos, nunca para uno del catalogo.
export function EditarNombreParticular({ ejercicioId, nombreActual, onEditado }) {
  const [nombre, setNombre] = useState(nombreActual);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    if (!nombre.trim()) {
      setError('El nombre no puede estar vacío.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.patch(`/ejercicios/${ejercicioId}/nombre-particular`, { nombre: nombre.trim() });
      onEditado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="w-40 h-8 rounded-md border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent"
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

// Corrige el musculo principal de un ejercicio "particular" (ver
// EjercicioAcciones: solo visible para coach/admin, y solo en ejercicios
// particulares) - para cuando un alumno, o el propio coach, lo cargo bajo
// el musculo equivocado. A diferencia de "Cambiar ejercicio", esto NO pasa
// por un mini-testeo ni toca el peso/techo ya registrado: solo corrige la
// clasificacion (ver cambiarMusculoEjercicioParticular en rutinaService.js,
// que tambien actualiza cualquier otro ejercicio_asignado que ya use este
// mismo ejercicio particular, en cualquier rutina).
export function CorregirMusculoPrincipal({ ejercicioId, musculoActual, todosMusculos, onCorregido }) {
  const [musculoId, setMusculoId] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const opciones = (todosMusculos || []).filter((m) => m.nombre !== musculoActual);

  async function confirmar() {
    if (!musculoId) {
      setError('Elegí el músculo correcto.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.patch(`/ejercicios/${ejercicioId}/musculo-principal`, { musculo_id: Number(musculoId) });
      onCorregido();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="bg-bg border border-border rounded-xl p-3 flex flex-col gap-2.5 max-w-xs">
      <span className="text-[12px] font-semibold">Corregir músculo principal</span>
      <p className="text-[11.5px] text-text-muted leading-relaxed">
        Está cargado como {formatearMusculo(musculoActual)}. Esto corrige la clasificación de este ejercicio particular
        -y la de cualquier otro día que ya lo tenga puesto-, sin tocar su peso ni sus series registradas.
      </p>
      <select
        value={musculoId}
        onChange={(e) => setMusculoId(e.target.value)}
        className="h-9 rounded-lg border border-border bg-surface px-2 text-[13px] outline-none focus:border-accent"
      >
        <option value="">Elegí el músculo correcto…</option>
        {opciones.map((m) => (
          <option key={m.id} value={m.id}>{formatearMusculo(m.nombre)}</option>
        ))}
      </select>
      {error && <span className="text-[12px] text-danger">{error}</span>}
      <button
        type="button"
        onClick={confirmar}
        disabled={enviando || !musculoId}
        className="h-9 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
      >
        {enviando ? 'Guardando…' : 'Corregir'}
      </button>
    </div>
  );
}

// Mueve (conserva peso/series, solo cambia de dia) o copia (queda una
// instancia nueva a testear) un ejercicio ya asignado a otro dia de la
// misma rutina - por si durante el entrenamiento se decide que queda mejor
// en otro dia, o que conviene repetirlo en dos.
// Antes de mover/copiar, si el dia destino ya tiene un ejercicio_asignado
// del mismo ejercicio_id (ver ejercicioCatalogoId), el backend rechaza con
// 409 a menos que mandemos reemplazar:true - en vez de esperar ese rechazo,
// nos fijamos de una en diasHermanos[].ejercicios (que ya tenemos en
// memoria) y le preguntamos al usuario antes de mandar nada.
export function MoverCopiarEjercicio({ ejercicioId, ejercicioCatalogoId, diasHermanos, onListo, onError }) {
  const [modo, setModo] = useState('mover');
  const [enviando, setEnviando] = useState(null);
  const [confirmarConflicto, setConfirmarConflicto] = useState(null);

  async function enviar(diaRutinaId, reemplazar) {
    setEnviando(diaRutinaId);
    onError('');
    try {
      await api.post(`/ejercicios/${ejercicioId}/${modo === 'mover' ? 'mover' : 'copiar'}`, {
        dia_rutina_id: diaRutinaId,
        reemplazar,
      });
      onListo();
    } catch (err) {
      onError(err.message);
    } finally {
      setEnviando(null);
      setConfirmarConflicto(null);
    }
  }

  function elegirDia(d) {
    const conflicto = d.ejercicios?.find((e) => e.ejercicio_id === ejercicioCatalogoId);
    if (conflicto) {
      setConfirmarConflicto({ dia: d, nombreExistente: conflicto.ejercicio_nombre });
      return;
    }
    enviar(d.id, false);
  }

  if (confirmarConflicto) {
    return (
      <div className="flex flex-col gap-2 bg-bg border border-border rounded-lg p-2.5 max-w-[260px]">
        <span className="text-[12px] text-warning leading-relaxed">
          {CAPITALIZAR(confirmarConflicto.dia.dia_semana)} ya tiene "{confirmarConflicto.nombreExistente}" — ¿lo reemplazás?
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmarConflicto(null)}
            className="flex-1 h-8 rounded-md border border-border bg-surface text-text-muted text-[12px] font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={enviando !== null}
            onClick={() => enviar(confirmarConflicto.dia.id, true)}
            className="flex-1 h-8 rounded-md bg-danger text-white text-[12px] font-semibold disabled:opacity-60"
          >
            {enviando !== null ? 'Guardando…' : 'Reemplazar'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        {[{ id: 'mover', label: 'Mover' }, { id: 'copiar', label: 'Copiar' }].map((m) => (
          <button
            type="button"
            key={m.id}
            onClick={() => setModo(m.id)}
            className={`px-2.5 h-7 rounded-full border text-[11.5px] font-medium ${
              modo === m.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {diasHermanos.map((d) => (
          <button
            type="button"
            key={d.id}
            disabled={enviando !== null}
            onClick={() => elegirDia(d)}
            className="px-2.5 h-7 rounded-full border border-border bg-bg text-text-muted text-[11.5px] font-medium capitalize disabled:opacity-60"
          >
            {enviando === d.id ? 'Guardando…' : CAPITALIZAR(d.dia_semana)}
          </button>
        ))}
      </div>
    </div>
  );
}
