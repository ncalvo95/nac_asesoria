import { useEffect, useState } from 'react';
import { api, API_BASE } from '../api/client.js';

const CAPITALIZAR = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function formatearFechaSesion(fecha) {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR');
}

// Alcance de la exportacion: toda la rutina, un rango de microciclos
// ("mesociclo"), un solo microciclo, o una sesion puntual - todo pega
// contra el mismo endpoint (GET .../export.xlsx?microciclo_desde=&
// microciclo_hasta=&sesion_id=), ver rutina.js. "Un microciclo" es solo
// un mesociclo con desde=hasta, pero se muestran como opciones separadas
// porque es como el usuario las nombro.
export default function ExportarExcelModal({ rutinaId, usuarioId, microciclos, onClose }) {
  const [alcance, setAlcance] = useState('rutina');
  const numerosDisponibles = [...microciclos].map((m) => m.numero).sort((a, b) => a - b);
  const [desde, setDesde] = useState(numerosDisponibles[0] ?? 0);
  const [hasta, setHasta] = useState(numerosDisponibles[numerosDisponibles.length - 1] ?? 0);
  const [microciclo, setMicrociclo] = useState(numerosDisponibles[numerosDisponibles.length - 1] ?? 0);
  const [sesiones, setSesiones] = useState(null);
  const [sesionId, setSesionId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (alcance !== 'sesion' || sesiones !== null) return;
    api.get(`/usuarios/${usuarioId}/sesiones`)
      .then((s) => {
        const registradas = s.filter((x) => !x.salteada);
        setSesiones(registradas);
        if (registradas[0]) setSesionId(String(registradas[0].id));
      })
      .catch((err) => setError(err.message));
  }, [alcance, sesiones, usuarioId]);

  function construirUrl() {
    const params = new URLSearchParams();
    if (alcance === 'mesociclo') {
      params.set('microciclo_desde', desde);
      params.set('microciclo_hasta', hasta);
    } else if (alcance === 'microciclo') {
      params.set('microciclo_desde', microciclo);
      params.set('microciclo_hasta', microciclo);
    } else if (alcance === 'sesion' && sesionId) {
      params.set('sesion_id', sesionId);
    }
    const query = params.toString();
    return `${API_BASE}/rutinas/${rutinaId}/export.xlsx${query ? `?${query}` : ''}`;
  }

  const deshabilitado = alcance === 'sesion' && !sesionId;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Exportar a Excel</h2>
          <button type="button" onClick={onClose} className="text-text-faint text-[13px]">✕</button>
        </div>
        <p className="text-[12.5px] text-text-muted -mt-1">
          Historial de lo que ya entrenaste, listo para seguir de corrido - elegí qué parte exportar.
        </p>

        {error && <p className="text-[12.5px] text-danger">{error}</p>}

        <div className="flex flex-col gap-1.5">
          {[
            { id: 'rutina', label: 'Toda la rutina' },
            { id: 'mesociclo', label: 'Un mesociclo (rango de microciclos)' },
            { id: 'microciclo', label: 'Un microciclo' },
            { id: 'sesion', label: 'Una sesión' },
          ].map((op) => (
            <label key={op.id} className="flex items-center gap-2 text-[13px]">
              <input type="radio" name="alcance" checked={alcance === op.id} onChange={() => setAlcance(op.id)} className="w-4 h-4 accent-accent" />
              {op.label}
            </label>
          ))}
        </div>

        {alcance === 'mesociclo' && (
          <div className="flex items-center gap-2">
            <select value={desde} onChange={(e) => setDesde(Number(e.target.value))} className="flex-1 h-9 rounded-lg border border-border bg-bg px-2 text-[13px]">
              {numerosDisponibles.map((n) => <option key={n} value={n}>Desde microciclo {n}</option>)}
            </select>
            <select value={hasta} onChange={(e) => setHasta(Number(e.target.value))} className="flex-1 h-9 rounded-lg border border-border bg-bg px-2 text-[13px]">
              {numerosDisponibles.map((n) => <option key={n} value={n}>Hasta microciclo {n}</option>)}
            </select>
          </div>
        )}

        {alcance === 'microciclo' && (
          <select value={microciclo} onChange={(e) => setMicrociclo(Number(e.target.value))} className="h-9 rounded-lg border border-border bg-bg px-2 text-[13px]">
            {numerosDisponibles.map((n) => <option key={n} value={n}>Microciclo {n}</option>)}
          </select>
        )}

        {alcance === 'sesion' && (
          <select
            value={sesionId}
            onChange={(e) => setSesionId(e.target.value)}
            className="h-9 rounded-lg border border-border bg-bg px-2 text-[13px]"
          >
            {sesiones === null && <option>Cargando…</option>}
            {sesiones?.length === 0 && <option value="">No hay sesiones registradas</option>}
            {sesiones?.map((s) => (
              <option key={s.id} value={s.id}>
                {formatearFechaSesion(s.fecha)} · {CAPITALIZAR(s.dia_semana || '')}
              </option>
            ))}
          </select>
        )}

        <a
          href={deshabilitado ? undefined : construirUrl()}
          onClick={(e) => { if (deshabilitado) e.preventDefault(); else onClose(); }}
          aria-disabled={deshabilitado}
          className={`h-10 rounded-lg text-[13.5px] font-semibold flex items-center justify-center ${
            deshabilitado ? 'bg-track text-text-faint cursor-not-allowed' : 'bg-accent text-accent-fg'
          }`}
        >
          Descargar
        </a>
      </div>
    </div>
  );
}
