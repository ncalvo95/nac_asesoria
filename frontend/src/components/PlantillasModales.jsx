import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const DIAS = [
  ['lunes', 'Lunes'], ['martes', 'Martes'], ['miercoles', 'Miércoles'], ['jueves', 'Jueves'],
  ['viernes', 'Viernes'], ['sabado', 'Sábado'], ['domingo', 'Domingo'],
];
const ORDEN = DIAS.map(([id]) => id);
const NOMBRE_DIA = Object.fromEntries(DIAS);

function Modal({ titulo, onCerrar, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCerrar}>
      <div
        className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={titulo}
      >
        <h2 className="text-[15px] font-bold">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

// Guarda la estructura de una rutina (dias, ejercicios, series, reps, descanso;
// sin pesos ni historial) como plantilla del coach.
export function GuardarPlantillaModal({ rutina, onCerrar, onGuardada }) {
  const [nombre, setNombre] = useState(rutina.nombre || rutina.split_asignado || '');
  const [descripcion, setDescripcion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  async function guardar() {
    setEnviando(true);
    setError('');
    try {
      const p = await api.post('/plantillas', { rutina_id: rutina.id, nombre, descripcion });
      onGuardada(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Guardar como plantilla" onCerrar={enviando ? () => {} : onCerrar}>
      <p className="text-[12.5px] text-text-muted leading-relaxed">
        Se guarda la estructura de esta rutina: días, ejercicios en orden, series, rango de reps y descanso.
        No se guardan pesos ni historial: cada alumno saca los suyos.
      </p>
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold">
        Nombre
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={80}
          autoFocus
          className="h-10 rounded-lg border border-border bg-bg px-3 text-[14px] font-normal outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold">
        Descripción (opcional)
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder="Ej: para quien recién empieza, 3 días full body"
          className="rounded-lg border border-border bg-bg px-3 py-2 text-[13.5px] font-normal outline-none focus:border-accent"
        />
      </label>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCerrar} disabled={enviando} className="flex-1 h-10 rounded-lg border border-border bg-bg text-text-muted text-[13px] font-semibold">
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={enviando || !nombre.trim()}
          className="flex-[2] h-10 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
        >
          {enviando ? 'Guardando…' : 'Guardar plantilla'}
        </button>
      </div>
    </Modal>
  );
}

// Crea una rutina nueva para el alumno con la estructura de una plantilla,
// dejando elegir en qué día de la semana cae cada día de la plantilla.
export function AplicarPlantillaModal({ usuarioId, hayRutinaActiva, onCerrar, onAplicada }) {
  const [plantillas, setPlantillas] = useState(null);
  const [elegida, setElegida] = useState(null); // detalle completo
  const [mapeo, setMapeo] = useState({});
  const [disponibles, setDisponibles] = useState([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/plantillas').then(setPlantillas).catch((err) => { setError(err.message); setPlantillas([]); });
    api.get(`/usuarios/${usuarioId}/perfil`)
      .then((p) => setDisponibles(JSON.parse(p.disponibilidad?.dias_especificos_json || '[]')))
      .catch(() => {});
  }, [usuarioId]);

  async function elegir(id) {
    setCargandoDetalle(true);
    setError('');
    try {
      const d = await api.get(`/plantillas/${id}`);
      setElegida(d);
      // Si el alumno declaró tantos días como la plantilla, se acomodan en
      // orden sobre sus días; si no, quedan los de la plantilla.
      const origen = d.dias.map((x) => x.dia_semana).sort((a, b) => ORDEN.indexOf(a) - ORDEN.indexOf(b));
      const destino = [...disponibles].sort((a, b) => ORDEN.indexOf(a) - ORDEN.indexOf(b));
      setMapeo(Object.fromEntries(origen.map((o, i) => [o, destino.length === origen.length ? destino[i] : o])));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargandoDetalle(false);
    }
  }

  const destinos = elegida ? elegida.dias.map((d) => mapeo[d.dia_semana] ?? d.dia_semana) : [];
  const repetidos = new Set(destinos).size !== destinos.length;

  async function aplicar() {
    setEnviando(true);
    setError('');
    try {
      const r = await api.post(`/usuarios/${usuarioId}/rutina/plantilla`, { plantilla_id: elegida.id, mapeo_dias: mapeo });
      onAplicada(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Usar plantilla" onCerrar={enviando ? () => {} : onCerrar}>
      {plantillas === null && <p className="text-[13px] text-text-muted">Cargando…</p>}
      {plantillas?.length === 0 && (
        <p className="text-[13px] text-text-muted leading-relaxed">
          Todavía no tenés plantillas. Guardá una desde la rutina de un alumno con el botón “Guardar como plantilla”.
        </p>
      )}

      {plantillas?.length > 0 && !elegida && (
        <div className="flex flex-col gap-2">
          {plantillas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => elegir(p.id)}
              disabled={cargandoDetalle}
              className="text-left rounded-lg border border-border bg-bg px-3 py-2.5 flex flex-col gap-0.5"
            >
              <span className="text-[13.5px] font-semibold">{p.nombre}</span>
              <span className="text-[12px] text-text-muted">{p.cantidad_dias} días · {p.cantidad_ejercicios} ejercicios</span>
              {p.descripcion && <span className="text-[12px] text-text-faint">{p.descripcion}</span>}
            </button>
          ))}
        </div>
      )}

      {elegida && (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="text-[13.5px] font-semibold">{elegida.nombre}</span>
            <button type="button" onClick={() => setElegida(null)} className="self-start text-[12px] text-accent underline underline-offset-2">
              Elegir otra
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-semibold">¿Qué día de la semana va cada día?</span>
            {disponibles.length > 0 && (
              <span className="text-[11.5px] text-text-faint">
                Días que el alumno declaró: {[...disponibles].sort((a, b) => ORDEN.indexOf(a) - ORDEN.indexOf(b)).map((d) => NOMBRE_DIA[d]).join(', ')}.
              </span>
            )}
            {elegida.dias.map((d, i) => (
              <div key={d.dia_semana} className="flex items-center justify-between gap-3 bg-bg border border-border rounded-lg px-3 py-2">
                <span className="text-[12.5px] min-w-0">
                  <strong>Día {i + 1}</strong>
                  <span className="text-text-muted"> · {d.ejercicios.length} ejercicios</span>
                </span>
                <select
                  value={mapeo[d.dia_semana] ?? d.dia_semana}
                  onChange={(e) => setMapeo((m) => ({ ...m, [d.dia_semana]: e.target.value }))}
                  aria-label={`Día de la semana del día ${i + 1}`}
                  className="h-9 rounded-md border border-border bg-surface px-2 text-[13px]"
                >
                  {DIAS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </div>
            ))}
            {repetidos && <p className="text-[12px] text-danger">Hay dos días de la plantilla en el mismo día de la semana.</p>}
          </div>
          <p className="text-[12px] text-text-muted leading-relaxed">
            {hayRutinaActiva ? 'La rutina activa pasa a finalizada y se crea una nueva. ' : ''}
            La nueva rutina arranca en Semana 0 de testeo para sacar los pesos de este alumno.
          </p>
        </>
      )}

      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCerrar} disabled={enviando} className="flex-1 h-10 rounded-lg border border-border bg-bg text-text-muted text-[13px] font-semibold">
          Cancelar
        </button>
        {elegida && (
          <button
            type="button"
            onClick={aplicar}
            disabled={enviando || repetidos}
            className="flex-[2] h-10 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
          >
            {enviando ? 'Creando…' : 'Crear rutina'}
          </button>
        )}
      </div>
    </Modal>
  );
}
