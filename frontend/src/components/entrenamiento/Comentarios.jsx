import { useState } from 'react';
import { api } from '../../api/client.js';

// Nota destacada cuando el comentario tiene "recordarme" activado - se
// muestra sola, sin que haga falta abrir el formulario de comentario, la
// proxima vez que se entra a esta pantalla (ver comentario_recordar en
// dia_rutina/ejercicio_asignado).
export function ComentarioRecordatorio({ comentario }) {
  return (
    <div className="bg-warning-bg text-warning text-[12.5px] leading-relaxed rounded-lg px-3 py-2 border-l-2 border-warning">
      {comentario}
    </div>
  );
}

// Comentario libre (dia o ejercicio, segun el endpoint que reciba) con un
// tilde "recordarme" - si esta tildado, ComentarioRecordatorio lo muestra
// destacado la proxima vez que se abra esta pantalla, sin necesidad de
// tocar nada.
// variante="menu": mismo componente pero con la tipografia/padding de una
// fila de menu colapsado (ver EjercicioAcciones) en vez del link subrayado
// que usan "Comentario del dia" y demas usos sueltos.
export function ComentarioBoton({ endpoint, comentarioActual, recordarActual, onGuardado, etiqueta, variante }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(comentarioActual || '');
  const [recordar, setRecordar] = useState(Boolean(recordarActual));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const comoItemMenu = variante === 'menu';

  async function guardar() {
    setEnviando(true);
    setError('');
    try {
      await api.patch(endpoint, { comentario: texto.trim() || null, recordar });
      setAbierto(false);
      onGuardado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={comoItemMenu ? 'flex flex-col' : 'flex flex-col gap-1.5'}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={comoItemMenu
          ? 'text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg'
          : 'self-start text-[11px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap'}
      >
        {comentarioActual ? 'Editar comentario' : (etiqueta || 'Comentario')}
      </button>
      {abierto && (
        <div className={`flex flex-col gap-2 bg-bg border border-border rounded-lg p-2.5 ${comoItemMenu ? 'mx-3 mb-2' : 'min-w-[220px]'}`}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            placeholder="Escribí un comentario…"
            className="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent resize-none"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={recordar}
              onChange={(e) => setRecordar(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-[12px] text-text-muted">Recordarme en la próxima actualización de entrenamiento</span>
          </label>
          {error && <span className="text-[11px] text-danger">{error}</span>}
          <button
            type="button"
            onClick={guardar}
            disabled={enviando}
            className="self-start h-8 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold disabled:opacity-60"
          >
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  );
}
