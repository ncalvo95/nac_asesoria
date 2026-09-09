import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { etiquetaDispositivo } from '../utils/parseUserAgent.js';

function formatearFecha(iso) {
  return new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z')).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function SessionsModal({ onClose }) {
  const [sesiones, setSesiones] = useState(null);
  const [error, setError] = useState('');
  const [ocupada, setOcupada] = useState(null);
  const [editando, setEditando] = useState(null);
  const [nombreEditado, setNombreEditado] = useState('');

  async function cargar() {
    try {
      const s = await api.get('/auth/sesiones');
      setSesiones(s);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function cerrarSesion(id) {
    setOcupada(id);
    setError('');
    try {
      await api.del(`/auth/sesiones/${id}`);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupada(null);
    }
  }

  async function cerrarTodasLasDemas() {
    if (!confirm('¿Cerrar todas las demás sesiones? Vas a seguir logueado solo en este dispositivo.')) return;
    setOcupada('todas');
    setError('');
    try {
      await api.post('/auth/sesiones/revocar-otras');
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupada(null);
    }
  }

  function empezarEdicion(s) {
    setEditando(s.id);
    setNombreEditado(s.etiqueta || etiquetaDispositivo(s.user_agent));
  }

  async function guardarEtiqueta(id) {
    setOcupada(id);
    setError('');
    try {
      await api.patch(`/auth/sesiones/${id}`, { etiqueta: nombreEditado });
      setEditando(null);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupada(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 w-full max-w-sm max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Mis sesiones</h2>
          <button type="button" onClick={onClose} className="text-text-faint text-[13px]">✕</button>
        </div>

        {error && <p className="text-[12.5px] text-danger">{error}</p>}
        {sesiones === null && <p className="text-[13px] text-text-muted">Cargando…</p>}

        <div className="flex flex-col gap-2">
          {sesiones?.map((s) => (
            <div key={s.id} className="bg-bg border border-border rounded-lg p-3 flex flex-col gap-1.5">
              {editando === s.id ? (
                <div className="flex gap-1.5">
                  <input
                    value={nombreEditado}
                    onChange={(e) => setNombreEditado(e.target.value)}
                    autoFocus
                    className="flex-1 h-8 rounded-md border border-border bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => guardarEtiqueta(s.id)}
                    disabled={ocupada === s.id}
                    className="text-[11.5px] font-semibold text-accent px-2"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    className="text-[11.5px] text-text-muted px-1"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-semibold">{s.etiqueta || etiquetaDispositivo(s.user_agent)}</span>
                  <button type="button" onClick={() => empezarEdicion(s)} className="text-[11px] text-text-faint underline underline-offset-2 whitespace-nowrap">
                    Renombrar
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5 flex-wrap">
                {s.es_actual && (
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-success-bg text-success rounded-full px-2 py-0.5">
                    Este dispositivo
                  </span>
                )}
                {Boolean(s.recordar) && (
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-bg border border-border text-text-faint rounded-full px-2 py-0.5">
                    Recordada
                  </span>
                )}
              </div>

              <span className="text-[11px] text-text-faint">Última actividad: {formatearFecha(s.last_seen_at)}</span>

              {!s.es_actual && (
                <button
                  type="button"
                  onClick={() => cerrarSesion(s.id)}
                  disabled={ocupada === s.id}
                  className="self-start text-[11.5px] font-semibold text-danger disabled:opacity-60"
                >
                  {ocupada === s.id ? 'Cerrando…' : 'Cerrar esta sesión'}
                </button>
              )}
            </div>
          ))}
        </div>

        {sesiones?.length > 1 && (
          <button
            type="button"
            onClick={cerrarTodasLasDemas}
            disabled={ocupada === 'todas'}
            className="h-10 rounded-lg border border-danger text-danger text-[13px] font-semibold disabled:opacity-60"
          >
            {ocupada === 'todas' ? 'Cerrando…' : 'Cerrar todas las demás sesiones'}
          </button>
        )}
      </div>
    </div>
  );
}
