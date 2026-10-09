import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';

function leerPath(obj, path) {
  return path.reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function escribirPath(obj, path, valor) {
  if (path.length === 0) return valor;
  const [k, ...resto] = path;
  const clon = { ...obj };
  clon[k] = escribirPath(obj?.[k] ?? {}, resto, valor);
  return clon;
}

// Campos personalizables por dominio - subconjunto deliberadamente mas
// chico que el panel de admin (ver discusion de alcance en la sesion que
// agrego esto): entrenamiento deja afuera repsEfectivasUmbral (el motor
// SIEMPRE lo lee del global, nunca del override - personalizarlo ahi no
// haria nada); nutricion deja afuera las tablas de g/kg (el estandar
// nutricional en si, nunca por alumno). Mismo orden/alcance que
// ALCANCE_OVERRIDE_NUTRICION en src/routes/nutricion.js.
const CAMPOS_POR_DOMINIO = {
  entrenamiento: [
    { path: ['incrementoKg'], label: 'Incremento de peso (kg)' },
    { path: ['seriesMinimo'], label: 'Series iniciales', step: '1' },
    { path: ['rangoReps', 'rendimientoPierna', 'min'], label: 'Rango reps · rendimiento/pierna: mínimo', step: '1' },
    { path: ['rangoReps', 'rendimientoPierna', 'max'], label: 'Rango reps · rendimiento/pierna: máximo', step: '1' },
    { path: ['rangoReps', 'fuerzaCompuesto', 'min'], label: 'Rango reps · fuerza/compuesto: mínimo', step: '1' },
    { path: ['rangoReps', 'fuerzaCompuesto', 'max'], label: 'Rango reps · fuerza/compuesto: máximo', step: '1' },
    { path: ['rangoReps', 'default', 'min'], label: 'Rango reps · resto: mínimo', step: '1' },
    { path: ['rangoReps', 'default', 'max'], label: 'Rango reps · resto: máximo', step: '1' },
    { path: ['topeSeries', 'fuerzaCompuesto'], label: 'Tope de series · fuerza/compuesto', step: '1' },
    { path: ['topeSeries', 'default'], label: 'Tope de series · resto', step: '1' },
    { path: ['umbralesTecho', 'variacionPorcentual'], label: 'Umbral techo · variación (%)' },
    { path: ['umbralesTecho', 'variacionRepsAbs'], label: 'Umbral techo · piso absoluto (reps)', step: '1' },
    { path: ['umbralesTecho', 'serieLarga'], label: 'Umbral techo · serie larga desde (reps)', step: '1' },
    { path: ['descarga', 'seriesMinimo'], label: 'Descarga · series mínimas', step: '1' },
    { path: ['descarga', 'fraccionSeries'], label: 'Descarga · fracción de series' },
    { path: ['descarga', 'pesoRestoFraccion'], label: 'Descarga · fracción de peso' },
  ],
  nutricion: [
    { path: ['tendenciaPeso', 'ventanaDias'], label: 'Tendencia de peso · ventana (días)', step: '1' },
    { path: ['tendenciaPeso', 'minPuntos'], label: 'Tendencia de peso · mínimo de pesajes', step: '1' },
    { path: ['tendenciaPeso', 'toleranciaPct'], label: 'Tendencia de peso · tolerancia (%)', step: '1' },
    { path: ['tendenciaPeso', 'bandaEstablePctSemana'], label: 'Tendencia de peso · banda estable (% peso/semana)' },
    { path: ['tendenciaPeso', 'semanasHistorial'], label: 'Tendencia de peso · semanas de historial', step: '1' },
    { path: ['objetivo', 'ritmoSugeridoPctSemana'], label: 'Ritmo sugerido (% peso/semana)' },
    { path: ['objetivo', 'adaptacionMetabolica', 'activa'], label: 'Adaptación metabólica activa', checkbox: true },
    { path: ['objetivo', 'adaptacionMetabolica', 'porcentajePorSemana'], label: 'Adaptación metabólica · % por semana' },
    { path: ['objetivo', 'adaptacionMetabolica', 'topePorcentaje'], label: 'Adaptación metabólica · tope (%)' },
    { path: ['objetivo', 'semaforo', 'muyLentoMax'], label: 'Semáforo · muy lento hasta' },
    { path: ['objetivo', 'semaforo', 'optimoMin'], label: 'Semáforo · óptimo desde' },
    { path: ['objetivo', 'semaforo', 'optimoMax'], label: 'Semáforo · óptimo hasta' },
    { path: ['objetivo', 'semaforo', 'agresivoMax'], label: 'Semáforo · agresivo hasta' },
    { path: ['objetivo', 'semaforo', 'agresivoDeficitPctKcalMax'], label: 'Semáforo · déficit máximo agresivo (% kcal)', step: '1' },
    { path: ['objetivo', 'semaforo', 'noRecomendableKcalMinHombre'], label: 'Semáforo · no recomendable bajo (hombres, kcal)', step: '1' },
    { path: ['objetivo', 'semaforo', 'noRecomendableKcalMinMujer'], label: 'Semáforo · no recomendable bajo (mujeres, kcal)', step: '1' },
    { path: ['objetivo', 'semaforo', 'advertenciaGrasaFinalMinHombre'], label: 'Semáforo · advertencia % graso mín. (hombres)' },
    { path: ['objetivo', 'semaforo', 'advertenciaGrasaFinalMinMujer'], label: 'Semáforo · advertencia % graso mín. (mujeres)' },
    { path: ['pisosCalorias', 'hombre'], label: 'Piso calórico (hombres)', step: '1' },
    { path: ['pisosCalorias', 'mujer'], label: 'Piso calórico (mujeres)', step: '1' },
  ],
};

// Seccion "Parametros de progresion/recalibracion" para la ficha de un
// usuario puntual (coach viendo su propio entrenamiento/nutricion, o el de
// un alumno) - muestra el efectivo (global + override, si personalizo
// algo), y deja Personalizar/Volver al global/Copiar desde otro usuario.
// Nunca se la muestra a un cliente viendo su propia ficha (ver permisos en
// verificarPermisoOverride, backend): es una herramienta del coach, no del
// alumno.
export default function ParametrosProgresion({ usuarioId, dominio, titulo }) {
  const { usuario: sesion } = useAuth();
  const apiBase = dominio === 'entrenamiento' ? '/entrenamiento' : '/nutricion';
  const campos = CAMPOS_POR_DOMINIO[dominio];

  const [estado, setEstado] = useState(null);
  const [alumnos, setAlumnos] = useState(null);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [copiarDesde, setCopiarDesde] = useState('');

  const puedeAdministrar = sesion.rol === 'admin' || sesion.rol === 'coach';

  async function cargar() {
    setError('');
    try {
      setEstado(await api.get(`${apiBase}/usuarios/${usuarioId}/config`));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!puedeAdministrar) return;
    cargar();
    api.get('/auth/usuarios?rol=cliente').then(setAlumnos).catch(() => setAlumnos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId, dominio]);

  if (!puedeAdministrar || !estado) return null;

  function empezarEdicion() {
    // Precarga con el EFECTIVO actual (global + override ya aplicado) -
    // editar y guardar siempre deja un override explícito y completo con
    // estos campos, nunca uno parcial a mitad de camino.
    const inicial = {};
    for (const c of campos) inicial[c.path.join('.')] = leerPath(estado.efectivo, c.path);
    setBorrador(escribirPathDesdeClaves(inicial, campos));
    setEditando(true);
  }

  function escribirPathDesdeClaves(valoresPorClave, lista) {
    let obj = {};
    for (const c of lista) obj = escribirPath(obj, c.path, valoresPorClave[c.path.join('.')]);
    return obj;
  }

  function cambiar(path, valor) {
    setBorrador((prev) => escribirPath(prev, path, valor));
  }

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      setEstado(await api.put(`${apiBase}/usuarios/${usuarioId}/config`, { config: borrador }));
      setEditando(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function volverAlGlobal() {
    if (!window.confirm('¿Volver a los valores globales para este usuario? Se pierde la personalización actual.')) return;
    setError('');
    try {
      setEstado(await api.del(`${apiBase}/usuarios/${usuarioId}/config`));
      setEditando(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function copiar() {
    if (!copiarDesde) return;
    setError('');
    try {
      setEstado(await api.post(`${apiBase}/usuarios/${usuarioId}/config/copiar`, { usuarioOrigenId: Number(copiarDesde) }));
      setCopiarDesde('');
    } catch (err) {
      setError(err.message);
    }
  }

  const opcionesCopiar = [
    sesion.id !== usuarioId ? { id: sesion.id, nombre: `${sesion.nombre} (vos)` } : null,
    ...(alumnos || []).filter((a) => a.id !== usuarioId),
  ].filter(Boolean);

  return (
    <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">{titulo}</span>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${estado.personalizado ? 'bg-success-bg text-success' : 'bg-bg border border-border text-text-muted'}`}>
          {estado.personalizado ? 'Personalizado' : 'Usa los valores globales'}
        </span>
      </div>

      {error && <p className="text-[12px] text-danger">{error}</p>}

      {!editando ? (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={empezarEdicion} className="text-[12px] font-semibold text-accent">Personalizar</button>
          {estado.personalizado && (
            <button onClick={volverAlGlobal} className="text-[12px] font-semibold text-text-muted">Volver al global</button>
          )}
          {opcionesCopiar.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <select
                value={copiarDesde}
                onChange={(e) => setCopiarDesde(e.target.value)}
                className="h-8 rounded-lg border border-border bg-bg px-2 text-[12px] outline-none focus:border-accent"
              >
                <option value="">Copiar desde…</option>
                {opcionesCopiar.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
              <button onClick={copiar} disabled={!copiarDesde} className="text-[12px] font-semibold text-accent disabled:opacity-40">
                Copiar
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            {campos.map((c) => (
              <CampoOverride key={c.path.join('.')} campo={c} valor={leerPath(borrador, c.path)} onCambiar={cambiar} />
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditando(false)} className="h-9 px-3 rounded-lg border border-border text-text-muted text-[12.5px] font-semibold">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando} className="h-9 px-3 rounded-lg bg-accent text-accent-fg text-[12.5px] font-semibold disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function CampoOverride({ campo, valor, onCambiar }) {
  if (campo.checkbox) {
    return (
      <label className="flex items-center gap-2 text-[12.5px] text-text-muted col-span-2">
        <input type="checkbox" checked={Boolean(valor)} onChange={(e) => onCambiar(campo.path, e.target.checked)} className="w-4 h-4 accent-accent" />
        {campo.label}
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-text-muted">{campo.label}</span>
      <input
        type="number"
        step={campo.step || '0.1'}
        value={valor ?? ''}
        onChange={(e) => onCambiar(campo.path, e.target.value === '' ? '' : Number(e.target.value))}
        className="h-9 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent"
      />
    </label>
  );
}
