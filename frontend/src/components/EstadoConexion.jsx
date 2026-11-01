import { Link } from 'react-router-dom';
import { useConexion } from '../offline/conexion.js';
import { sincronizar, reintentar, descartar } from '../offline/cola.js';

function hace(iso) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

// Cartel fijo arriba: avisa cuando no hay conexión (y de cuándo son los datos
// que se están viendo), cuántas sesiones esperan para enviarse y cuáles no se
// pudieron enviar. No aparece si todo está en orden.
export default function EstadoConexion() {
  const e = useConexion();
  const hayAlgo = e.sinConexion || e.pendientes > 0 || e.conError.length > 0 || e.sesionVencida;
  if (!hayAlgo) return null;

  return (
    <div role="status" className="sticky top-0 z-40 flex flex-col text-[12.5px] leading-snug">
      {e.sinConexion && (
        <div className="bg-warning-bg text-warning px-4 py-2">
          <strong>Sin conexión.</strong>{' '}
          {e.datosDesde ? `Estás viendo datos guardados ${hace(e.datosDesde)}. ` : ''}
          Podés entrenar y anotar igual: se envía todo cuando vuelva internet.
        </div>
      )}
      {e.pendientes > 0 && (
        <div className="bg-surface border-b border-border px-4 py-2 flex items-center justify-between gap-3">
          <span>
            <strong>{e.pendientes} {e.pendientes === 1 ? 'sesión' : 'sesiones'}</strong> guardada{e.pendientes === 1 ? '' : 's'} en el celular, pendiente{e.pendientes === 1 ? '' : 's'} de enviar.
          </span>
          <button
            type="button"
            onClick={() => sincronizar()}
            disabled={e.sincronizando}
            className="flex-none h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-semibold disabled:opacity-60"
          >
            {e.sincronizando ? 'Enviando…' : 'Enviar ahora'}
          </button>
        </div>
      )}
      {e.sesionVencida && (
        <div className="bg-warning-bg text-warning px-4 py-2">
          Tu sesión venció con cosas sin enviar. <Link to="/login" className="font-semibold underline">Ingresá de nuevo</Link> y se envían solas.
        </div>
      )}
      {e.conError.map((it) => (
        <div key={it.id} className="bg-danger-bg text-danger px-4 py-2 flex flex-col gap-1.5">
          <span><strong>No se pudo enviar:</strong> {it.resumen}. {it.error}</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => reintentar(it.id)} className="h-7 px-2.5 rounded-md border border-danger font-semibold">Reintentar</button>
            <button
              type="button"
              onClick={() => { if (window.confirm('Se descarta esta sesión y no se envía. ¿Seguro?')) descartar(it.id); }}
              className="h-7 px-2.5 rounded-md border border-danger font-semibold"
            >
              Descartar
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
