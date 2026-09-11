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

// Pasa TODO lo que se entrena un dia (todos sus ejercicios, con su peso y
// progreso intactos) a otro dia de la semana, sin tener que mover ejercicio
// por ejercicio (ver moverEjercicioADia, que es por-ejercicio). Si el dia
// elegido ya tiene otro dia activo, pregunta que hacer con ese antes de
// confirmar - ver cambiarDiaSemana/PATCH /dias/:id/dia-semana.
export default function CambiarDiaModal({ diaRutinaId, diaSemanaActual, diasActivos, onClose, onCambiado }) {
  const diasElegibles = DIAS.filter((d) => d.id !== diaSemanaActual);
  const [diaSemana, setDiaSemana] = useState('');
  const [accionConflicto, setAccionConflicto] = useState('mover');
  const [destinoConflicto, setDestinoConflicto] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const diaEnConflicto = diaSemana && diasActivos.includes(diaSemana);
  const diasLibresParaConflicto = DIAS.filter((d) => d.id !== diaSemana && !diasActivos.includes(d.id));

  async function confirmar() {
    if (!diaSemana) {
      setError('Elegí a qué día pasarlo.');
      return;
    }
    if (diaEnConflicto && accionConflicto === 'mover' && !destinoConflicto) {
      setError('Elegí a qué día mover lo que ya está ahí.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const rutina = await api.patch(`/dias/${diaRutinaId}/dia-semana`, {
        dia_semana: diaSemana,
        conflicto: diaEnConflicto
          ? { accion: accionConflicto, dia_semana_destino: accionConflicto === 'mover' ? destinoConflicto : undefined }
          : undefined,
      });
      onCambiado(rutina);
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
          <h2 className="text-[15px] font-bold">Cambiar {CAPITALIZAR(diaSemanaActual)} a otro día</h2>
          <button type="button" onClick={onClose} className="text-text-faint text-[13px]">✕</button>
        </div>
        <p className="text-[12px] text-text-muted leading-relaxed">
          Todos los ejercicios de {CAPITALIZAR(diaSemanaActual)} (con su peso y progreso) pasan al día que elijas.
        </p>

        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-text-muted">Pasarlo a</span>
          <div className="flex gap-1.5 flex-wrap">
            {diasElegibles.map((d) => (
              <button
                type="button"
                key={d.id}
                onClick={() => { setDiaSemana(d.id); setDestinoConflicto(''); setError(''); }}
                className={`px-3 h-8 rounded-full border text-[12.5px] font-semibold ${
                  diaSemana === d.id ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
                }`}
              >
                {d.label}
                {diasActivos.includes(d.id) && <span className="opacity-70"> ·ocupado</span>}
              </button>
            ))}
          </div>
        </div>

        {diaEnConflicto && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-semibold text-warning">
              {CAPITALIZAR(diaSemana)} ya tiene una rutina asignada — ¿qué hacemos con ella?
            </span>
            {[
              { v: 'mover', label: 'Moverla a otro día', hint: 'Esa rutina pasa a un día que esté libre, con su peso y progreso intactos.' },
              { v: 'eliminar', label: 'Eliminarla', hint: 'Se borra (o se desactiva, si ya tiene historial) - dejaría de entrenarse hasta que agregues algo ahí de nuevo.' },
            ].map((opt) => (
              <button
                type="button"
                key={opt.v}
                onClick={() => { setAccionConflicto(opt.v); setError(''); }}
                className={`text-left rounded-lg border px-3 py-2 ${
                  accionConflicto === opt.v ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'
                }`}
              >
                <div className="text-[12.5px] font-semibold">{opt.label}</div>
                <div className={`text-[11px] ${accionConflicto === opt.v ? 'opacity-90' : 'text-text-faint'}`}>{opt.hint}</div>
              </button>
            ))}

            {accionConflicto === 'mover' && (
              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[11px] text-text-faint">¿A qué día libre?</span>
                <div className="flex gap-1.5 flex-wrap">
                  {diasLibresParaConflicto.length === 0 && (
                    <span className="text-[12px] text-danger">No queda ningún día libre - elegí eliminarla.</span>
                  )}
                  {diasLibresParaConflicto.map((d) => (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => setDestinoConflicto(d.id)}
                      className={`px-3 h-8 rounded-full border text-[12.5px] font-semibold ${
                        destinoConflicto === d.id ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
            disabled={enviando}
            className="flex-[2] h-10 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold disabled:opacity-60"
          >
            {enviando ? 'Cambiando…' : 'Confirmar cambio'}
          </button>
        </div>
      </div>
    </div>
  );
}
