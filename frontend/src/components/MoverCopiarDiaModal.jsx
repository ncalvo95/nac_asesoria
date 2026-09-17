import { useState } from 'react';
import { api } from '../api/client.js';

const DIAS = [
  { id: 'lunes', label: 'Lunes' },
  { id: 'martes', label: 'Martes' },
  { id: 'miercoles', label: 'Miércoles' },
  { id: 'jueves', label: 'Jueves' },
  { id: 'viernes', label: 'Viernes' },
  { id: 'sabado', label: 'Sábado' },
  { id: 'domingo', label: 'Domingo' },
];
const CAPITALIZAR = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Dos operaciones sobre un dia completo que CambiarDiaModal no cubre:
// - Intercambiar: swap directo de dia_semana entre dos dias activos (ver
//   intercambiarDias/POST /dias/:id/intercambiar) - a diferencia de
//   "Cambiar dia", que MUEVE lo de un dia a otro slot y pregunta que hacer
//   con lo que ya estaba ahi, esto canjea ambos de una sin pisar nada.
// - Copiar: duplica TODO el dia (ejercicios con su peso/progreso, ver
//   copiarDia/POST /dias/:id/copiar) a un dia de la semana que este libre -
//   para entrenar el mismo dia mas de una vez por semana.
// diasHermanos: dias activos de la rutina, sin el actual (misma forma que
// usa MoverCopiarEjercicio - [{id, dia_semana}, ...]).
export default function MoverCopiarDiaModal({ diaRutinaId, diaSemanaActual, diasHermanos, onClose, onListo }) {
  const [modo, setModo] = useState('intercambiar');
  const [diaSemanaElegido, setDiaSemanaElegido] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const diasActivos = diasHermanos.map((d) => d.dia_semana);
  const diasLibresParaCopiar = DIAS.filter((d) => d.id !== diaSemanaActual && !diasActivos.includes(d.id));
  const diasElegibles = modo === 'intercambiar' ? diasHermanos.map((d) => ({ id: d.dia_semana, label: CAPITALIZAR(d.dia_semana) })) : diasLibresParaCopiar;

  async function confirmar() {
    if (!diaSemanaElegido) {
      setError(modo === 'intercambiar' ? 'Elegí con qué día intercambiarlo.' : 'Elegí a qué día libre copiarlo.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      if (modo === 'intercambiar') {
        const diaDestino = diasHermanos.find((d) => d.dia_semana === diaSemanaElegido);
        const rutina = await api.post(`/dias/${diaRutinaId}/intercambiar`, {
          dia_rutina_id_destino: diaDestino?.id,
        });
        onListo(rutina);
      } else {
        const rutina = await api.post(`/dias/${diaRutinaId}/copiar`, { dia_semana_destino: diaSemanaElegido });
        onListo(rutina);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Intercambiar/copiar {CAPITALIZAR(diaSemanaActual)}</h2>
          <button type="button" onClick={onClose} className="text-text-faint text-[13px]">✕</button>
        </div>

        <div className="flex gap-1.5">
          {[
            { id: 'intercambiar', label: 'Intercambiar' },
            { id: 'copiar', label: 'Copiar a otro día' },
          ].map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => { setModo(m.id); setDiaSemanaElegido(''); setError(''); }}
              className={`flex-1 h-8 rounded-lg border text-[12.5px] font-semibold ${
                modo === m.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <p className="text-[12px] text-text-muted leading-relaxed">
          {modo === 'intercambiar'
            ? `Canjea todos los ejercicios (con su peso y progreso) entre ${CAPITALIZAR(diaSemanaActual)} y el día que elijas.`
            : `Duplica todos los ejercicios de ${CAPITALIZAR(diaSemanaActual)} (con su peso y progreso) a un día libre — útil si querés entrenar el mismo día más de una vez por semana.`}
        </p>

        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-text-muted">
            {modo === 'intercambiar' ? 'Intercambiar con' : 'Copiar a'}
          </span>
          {diasElegibles.length === 0 && (
            <span className="text-[12px] text-text-faint">
              {modo === 'intercambiar' ? 'No hay otro día activo con el que intercambiar.' : 'No queda ningún día libre.'}
            </span>
          )}
          <div className="flex gap-1.5 flex-wrap">
            {diasElegibles.map((d) => (
              <button
                type="button"
                key={d.id}
                onClick={() => { setDiaSemanaElegido(d.id); setError(''); }}
                className={`px-3 h-8 rounded-full border text-[12.5px] font-semibold ${
                  diaSemanaElegido === d.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-[12.5px] text-danger">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-border bg-surface text-text-muted text-[13px] font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={enviando || diasElegibles.length === 0}
            className="flex-[2] h-10 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
          >
            {enviando ? 'Guardando…' : modo === 'intercambiar' ? 'Confirmar intercambio' : 'Confirmar copia'}
          </button>
        </div>
      </div>
    </div>
  );
}
