import { useState } from 'react';
import { api } from '../../api/client.js';

// Siempre pide confirmacion con un modal antes de quitar un ejercicio (no
// un window.confirm ni solo en el caso top/unico) - si ademas ya tiene
// series registradas, avisa fuerte que se pierden en cascada (ver
// quitarEjercicioAsignado en rutinaService.js).
export function QuitarEjercicioBoton({ ejercicioAsignadoId, nombreEjercicio, onQuitado, advertencia, tieneSeries }) {
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  async function quitar() {
    setEnviando(true);
    setError('');
    try {
      await api.del(`/ejercicios-asignados/${ejercicioAsignadoId}`);
      setMostrarConfirmar(false);
      onQuitado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={() => setMostrarConfirmar(true)}
        className="text-[11px] font-medium text-danger underline underline-offset-2"
      >
        Quitar ejercicio
      </button>
      {mostrarConfirmar && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !enviando && setMostrarConfirmar(false)}
        >
          <div
            className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-bold">Quitar {nombreEjercicio}</h2>
            <p className="text-[13px] text-text-muted leading-relaxed">¿Seguro que querés quitar este ejercicio del día?</p>
            {advertencia && <p className="text-[12.5px] text-warning leading-relaxed">{advertencia}</p>}
            {tieneSeries && (
              <p className="text-[12.5px] text-danger font-semibold leading-relaxed">
                Ya tiene series registradas — se van a perder esos datos de entrenamiento.
              </p>
            )}
            {error && <p className="text-[12.5px] text-danger">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMostrarConfirmar(false)}
                disabled={enviando}
                className="flex-1 h-10 rounded-lg border border-border bg-bg text-text-muted text-[13px] font-semibold disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={quitar}
                disabled={enviando}
                className="flex-[2] h-10 rounded-lg border border-danger text-danger text-[13px] font-semibold disabled:opacity-60"
              >
                {enviando ? 'Quitando…' : 'Sí, quitar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
