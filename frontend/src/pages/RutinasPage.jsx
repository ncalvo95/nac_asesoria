import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';

function formatearFecha(fechaIso) {
  const f = new Date(`${fechaIso}T00:00:00`);
  return f.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function descripcionMicrociclo(rutina) {
  if (rutina.ultimo_microciclo == null) return 'Sin actividad todavía';
  if (rutina.ultimo_microciclo === 0) return 'En semana 0 (testeo)';
  return `Llegó al microciclo ${rutina.ultimo_microciclo}`;
}

// Historial de rutinas del usuario: solo una puede estar "activa" a la vez
// (se finaliza sola al crear/reactivar otra) - acá se puede volver a una
// finalizada o borrarla para siempre.
export default function RutinasPage() {
  const { usuario: sesion } = useAuth();
  const { usuarioId: usuarioIdParam } = useParams();
  const usuario = usuarioIdParam ? { id: Number(usuarioIdParam) } : sesion;
  const navigate = useNavigate();
  const [rutinas, setRutinas] = useState(null);
  const [error, setError] = useState('');
  const [ocupada, setOcupada] = useState(null);
  const [aBorrar, setABorrar] = useState(null); // rutina completa o null
  const [editandoId, setEditandoId] = useState(null);
  const [nombreDraft, setNombreDraft] = useState('');

  const linkNuevaRutina = usuarioIdParam ? `/coach/clientes/${usuarioIdParam}/onboarding` : '/onboarding';
  const linkEntrenamiento = usuarioIdParam ? `/coach/clientes/${usuarioIdParam}/entrenamiento` : '/entrenamiento';

  async function cargar() {
    try {
      const r = await api.get(`/usuarios/${usuario.id}/rutinas`);
      setRutinas(r);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [usuario.id]);

  async function reactivar(rutinaId) {
    setOcupada(rutinaId);
    setError('');
    try {
      await api.post(`/rutinas/${rutinaId}/reactivar`);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupada(null);
    }
  }

  function editar(rutina) {
    setEditandoId(rutina.id);
    setNombreDraft(rutina.nombre || '');
  }

  async function guardarNombre(rutinaId) {
    setOcupada(rutinaId);
    setError('');
    try {
      await api.patch(`/rutinas/${rutinaId}/nombre`, { nombre: nombreDraft });
      setEditandoId(null);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupada(null);
    }
  }

  async function borrar(rutinaId) {
    setOcupada(rutinaId);
    setError('');
    try {
      await api.del(`/rutinas/${rutinaId}`);
      setABorrar(null);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupada(null);
    }
  }

  if (rutinas === null) return <div className="p-6 text-sm text-text-muted">Cargando…</div>;

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <div className="px-1 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[17px] font-bold">Mis rutinas</h1>
          <p className="text-[13px] text-text-muted leading-relaxed">
            Solo una rutina puede estar activa a la vez. Las anteriores quedan acá - podés retomar una vieja o borrarla.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(linkNuevaRutina)}
          className="flex-none text-[12.5px] font-semibold text-accent border border-accent rounded-lg px-3 py-1.5 whitespace-nowrap"
        >
          + Nueva rutina
        </button>
      </div>

      {error && <p className="text-[13px] text-danger px-1">{error}</p>}

      {rutinas.length === 0 && (
        <p className="text-[13px] text-text-muted px-1">Todavía no generaste ninguna rutina.</p>
      )}

      <div className="flex flex-col gap-3">
        {rutinas.map((r) => {
          const activa = r.estado === 'activa';
          return (
            <div key={r.id} className="bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  {editandoId === r.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={nombreDraft}
                        onChange={(e) => setNombreDraft(e.target.value)}
                        placeholder={r.split_asignado}
                        maxLength={60}
                        className="min-w-0 flex-1 h-8 rounded-md border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={() => guardarNombre(r.id)}
                        disabled={ocupada === r.id}
                        className="flex-none text-[12px] font-semibold text-accent disabled:opacity-60"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditandoId(null)}
                        disabled={ocupada === r.id}
                        className="flex-none text-[12px] text-text-muted disabled:opacity-60"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-semibold truncate">{r.nombre || r.split_asignado}</span>
                      <button
                        type="button"
                        onClick={() => editar(r)}
                        title="Renombrar"
                        className="flex-none text-[11px] text-text-faint underline underline-offset-2"
                      >
                        Renombrar
                      </button>
                    </div>
                  )}
                  <span className="text-[12px] text-text-muted">Empezó el {formatearFecha(r.fecha_inicio)}</span>
                </div>
                <span
                  className={`flex-none text-[10.5px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 ${
                    activa ? 'bg-success-bg text-success' : 'bg-bg border border-border text-text-faint'
                  }`}
                >
                  {activa ? 'Activa' : 'Finalizada'}
                </span>
              </div>

              <div className="flex gap-3 text-[12px] text-text-muted">
                <span>{r.cantidad_dias} días/semana</span>
                <span>·</span>
                <span>{descripcionMicrociclo(r)}</span>
              </div>

              <div className="flex gap-2 pt-1">
                {activa && (
                  <button
                    type="button"
                    onClick={() => navigate(linkEntrenamiento)}
                    className="flex-1 h-9 rounded-lg bg-accent text-accent-fg text-[12.5px] font-semibold"
                  >
                    Ver rutina
                  </button>
                )}
                {!activa && (
                  <button
                    type="button"
                    onClick={() => reactivar(r.id)}
                    disabled={ocupada === r.id}
                    className="flex-1 h-9 rounded-lg bg-accent text-accent-fg text-[12.5px] font-semibold disabled:opacity-60"
                  >
                    {ocupada === r.id ? 'Reactivando…' : 'Reactivar'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setABorrar(r)}
                  disabled={ocupada === r.id}
                  className="flex-1 h-9 rounded-lg border border-danger text-danger text-[12.5px] font-semibold disabled:opacity-60"
                >
                  {ocupada === r.id ? 'Borrando…' : 'Borrar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {aBorrar && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => ocupada !== aBorrar.id && setABorrar(null)}
        >
          <div
            className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-bold">Borrar rutina</h2>
            <p className="text-[13px] text-text-muted leading-relaxed">
              {aBorrar.estado === 'activa'
                ? '¿Borrar esta rutina para siempre? Es la rutina activa - vas a quedarte sin ninguna, como si nunca hubieras generado una. No se puede deshacer.'
                : '¿Borrar esta rutina para siempre? No se puede deshacer.'}
            </p>
            {error && <p className="text-[12.5px] text-danger">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setABorrar(null)}
                disabled={ocupada === aBorrar.id}
                className="flex-1 h-10 rounded-lg border border-border bg-bg text-text-muted text-[13px] font-semibold disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => borrar(aBorrar.id)}
                disabled={ocupada === aBorrar.id}
                className="flex-[2] h-10 rounded-lg border border-danger text-danger text-[13px] font-semibold disabled:opacity-60"
              >
                {ocupada === aBorrar.id ? 'Borrando…' : 'Sí, borrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
