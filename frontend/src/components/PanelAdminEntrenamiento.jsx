import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import AccountMenu from './AccountMenu.jsx';
import AppIcon from './AppIcon.jsx';

function leerPath(obj, path) {
  return path.reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

// Clona solo la rama que cambia - mismo helper que PanelAdminNutricion.jsx.
function escribirPath(obj, path, valor) {
  if (path.length === 0) return valor;
  const [k, ...resto] = path;
  const clon = { ...obj };
  clon[k] = escribirPath(obj?.[k] ?? {}, resto, valor);
  return clon;
}

function formatearFecha(iso) {
  return new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z')).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function PanelAdminEntrenamiento() {
  const [config, setConfig] = useState(null);
  const [versionActivaId, setVersionActivaId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [errores, setErrores] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [comentario, setComentario] = useState('');
  const [aviso, setAviso] = useState('');
  const [historial, setHistorial] = useState(null);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  async function cargarConfig() {
    setCargando(true);
    setError('');
    try {
      const activa = await api.get('/entrenamiento/config');
      setConfig(activa.config);
      setVersionActivaId(activa.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargarConfig(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function cargarHistorial() {
    try {
      setHistorial(await api.get('/entrenamiento/config/historial'));
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleHistorial() {
    setMostrarHistorial((v) => !v);
    if (!historial) cargarHistorial();
  }

  function cambiar(path, valor) {
    setAviso('');
    setConfig((prev) => escribirPath(prev, path, valor));
  }

  async function guardar() {
    setGuardando(true);
    setError('');
    setErrores([]);
    setAviso('');
    try {
      const guardada = await api.post('/entrenamiento/config', { config, comment: comentario.trim() || undefined });
      setConfig(guardada.config);
      setVersionActivaId(guardada.id);
      setComentario('');
      setAviso(`Guardado como versión #${guardada.id}.`);
      if (mostrarHistorial) cargarHistorial();
    } catch (err) {
      setError(err.message);
      setErrores(err.body?.errores || []);
    } finally {
      setGuardando(false);
    }
  }

  async function restaurarVersion(id) {
    if (!window.confirm(`¿Volver a los valores de la versión #${id}? Queda guardado como una versión nueva (no se pierde el historial).`)) return;
    setGuardando(true);
    setError('');
    try {
      const restaurada = await api.post(`/entrenamiento/config/restaurar/${id}`, {});
      setConfig(restaurada.config);
      setVersionActivaId(restaurada.id);
      setAviso(`Restaurada la versión #${id} (ahora es la #${restaurada.id}).`);
      cargarHistorial();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function restaurarDeFabrica() {
    if (!window.confirm('¿Restaurar todos los valores de fábrica? Queda guardado como una versión nueva (no se pierde el historial).')) return;
    setGuardando(true);
    setError('');
    try {
      const restaurada = await api.post('/entrenamiento/config/restaurar-fabrica', {});
      setConfig(restaurada.config);
      setVersionActivaId(restaurada.id);
      setAviso(`Restaurados los valores de fábrica (versión #${restaurada.id}).`);
      if (mostrarHistorial) cargarHistorial();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      <header className="flex-none bg-surface border-b border-border px-5 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <AppIcon size={22} />
          <span className="text-[15px] font-bold">NAC Asesoria · Progresión</span>
        </Link>
        <AccountMenu />
      </header>

      <div className="p-4 flex flex-col gap-5 max-w-2xl w-full mx-auto pb-24">
        <div>
          <h1 className="text-[16px] font-bold">Núcleo de progresión de entrenamiento</h1>
          <p className="text-[12.5px] text-text-muted mt-0.5">
            Estos valores son el default para todos los usuarios. Cada coach puede personalizarlos para sí mismo o para un alumno puntual, sin tocar este global (ver "Parámetros de progresión" en cada ficha). Guardar crea una versión nueva (nunca se pierde el historial).
          </p>
        </div>

        {cargando && <p className="text-[13px] text-text-muted">Cargando…</p>}
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {errores.length > 0 && (
          <ul className="text-[12.5px] text-danger list-disc pl-4">
            {errores.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
        {aviso && <p className="text-[12.5px] text-accent">{aviso}</p>}

        {config && (
          <>
            <p className="text-[11.5px] text-text-faint">Versión activa: #{versionActivaId}</p>

            <Seccion titulo="Incremento y series" descripcion="Cuánto sube/baja el peso al cerrar un microciclo, y con cuántas series arranca cualquier ejercicio nuevo.">
              <div className="grid grid-cols-2 gap-2.5">
                <Campo config={config} onCambiar={cambiar} path={['incrementoKg']} label="Incremento de peso (kg)" />
                <Campo config={config} onCambiar={cambiar} path={['seriesMinimo']} label="Series iniciales" step="1" />
              </div>
            </Seccion>

            <Seccion titulo="Rango de reps por objetivo" descripcion="Determina cuándo el techo de reps 'se pasó' (sube peso) o 'no llegó' (baja peso). Se evalúa en orden: el primer caso que matchea gana.">
              <RangoReps config={config} onCambiar={cambiar} campo="rendimientoPierna" label="Objetivo rendimiento, músculo de pierna" />
              <RangoReps config={config} onCambiar={cambiar} campo="fuerzaCompuesto" label="Objetivo fuerza, compuesto principal" />
              <RangoReps config={config} onCambiar={cambiar} campo="default" label="Resto de los casos" />
            </Seccion>

            <Seccion titulo="Tope de series" descripcion="Tope por ejercicio antes de que la progresión deje de sumar más series ante un músculo estancado.">
              <div className="grid grid-cols-2 gap-2.5">
                <Campo config={config} onCambiar={cambiar} path={['topeSeries', 'fuerzaCompuesto']} label="Fuerza, compuesto principal" step="1" />
                <Campo config={config} onCambiar={cambiar} path={['topeSeries', 'default']} label="Resto de los casos" step="1" />
              </div>
            </Seccion>

            <Seccion titulo="Umbrales del techo de reps" descripcion="Si la variación entre semana 1 y semana 2 es grande, el techo es el promedio (más conservador) en vez del máximo.">
              <div className="grid grid-cols-2 gap-2.5">
                <Campo config={config} onCambiar={cambiar} path={['umbralesTecho', 'variacionPorcentual']} label="Variación (% del valor más alto)" />
                <Campo config={config} onCambiar={cambiar} path={['umbralesTecho', 'variacionRepsAbs']} label="Piso absoluto (reps)" step="1" />
                <Campo config={config} onCambiar={cambiar} path={['umbralesTecho', 'serieLarga']} label="Serie 'larga' desde (reps)" step="1" />
              </div>
            </Seccion>

            <Seccion titulo="Reps efectivas" descripcion="Métrica informativa de reportes/export - nunca cambia el peso/series que se le prescribe a nadie, así que es la única sección sin personalización por usuario.">
              <Campo config={config} onCambiar={cambiar} path={['repsEfectivasUmbral']} label="Ventana antes del fallo (reps)" step="1" />
            </Seccion>

            <Seccion titulo="Semana de descarga" descripcion="Series y peso de la semana de descarga manual, como fracción de lo prescripto.">
              <div className="grid grid-cols-2 gap-2.5">
                <Campo config={config} onCambiar={cambiar} path={['descarga', 'seriesMinimo']} label="Series mínimas" step="1" />
                <Campo config={config} onCambiar={cambiar} path={['descarga', 'fraccionSeries']} label="Fracción de las series" />
                <Campo config={config} onCambiar={cambiar} path={['descarga', 'pesoRestoFraccion']} label="Fracción del peso (resto de series)" />
              </div>
            </Seccion>

            <div className="flex flex-col gap-2">
              <input
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Comentario para esta versión (opcional)"
                className="h-10 rounded-lg border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent"
              />
              <button
                onClick={guardar}
                disabled={guardando}
                className="h-11 rounded-lg bg-accent text-accent-fg text-[14px] font-semibold disabled:opacity-60"
              >
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <div className="flex items-center justify-between">
                <button onClick={restaurarDeFabrica} className="text-[12px] font-semibold text-text-muted">
                  Restaurar valores de fábrica
                </button>
                <button onClick={toggleHistorial} className="text-[12px] font-semibold text-accent">
                  {mostrarHistorial ? 'Ocultar historial' : 'Ver historial'}
                </button>
              </div>
            </div>

            {mostrarHistorial && (
              <section className="flex flex-col gap-2">
                <h2 className="text-[13px] font-bold text-text-muted uppercase tracking-wide">Historial de versiones</h2>
                {historial === null && <p className="text-[12.5px] text-text-muted">Cargando…</p>}
                {historial?.map((v) => (
                  <div key={v.id} className="bg-surface border border-border rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[13px] font-semibold">
                        #{v.id}{v.id === versionActivaId ? ' · activa' : ''}
                      </span>
                      <span className="text-[11.5px] text-text-faint">
                        {formatearFecha(v.created_at)}{v.created_by_nombre ? ` · ${v.created_by_nombre}` : ''}
                      </span>
                      {v.comment && <span className="text-[11.5px] text-text-muted truncate">{v.comment}</span>}
                    </div>
                    {v.id !== versionActivaId && (
                      <button
                        onClick={() => restaurarVersion(v.id)}
                        className="text-[11.5px] font-semibold text-accent whitespace-nowrap"
                      >
                        Restaurar
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Seccion({ titulo, descripcion, children }) {
  return (
    <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div>
        <h2 className="text-[13px] font-bold text-text-muted uppercase tracking-wide">{titulo}</h2>
        {descripcion && <p className="text-[11.5px] text-text-faint mt-0.5">{descripcion}</p>}
      </div>
      {children}
    </section>
  );
}

function Campo({ config, path, label, step = '0.1', onCambiar }) {
  const valor = leerPath(config, path);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-text-muted">{label}</span>
      <input
        type="number"
        step={step}
        value={valor ?? ''}
        onChange={(e) => onCambiar(path, e.target.value === '' ? '' : Number(e.target.value))}
        className="h-9 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent"
      />
    </label>
  );
}

function RangoReps({ config, onCambiar, campo, label }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-text-muted">{label}</span>
      <div className="grid grid-cols-2 gap-2.5">
        <Campo config={config} onCambiar={onCambiar} path={['rangoReps', campo, 'min']} label="Mínimo (reps)" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['rangoReps', campo, 'max']} label="Máximo (reps)" step="1" />
      </div>
    </div>
  );
}
