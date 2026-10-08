import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import AccountMenu from './AccountMenu.jsx';
import AppIcon from './AppIcon.jsx';
import {
  calcularMacrosFase,
  resolverReferenciaDefinicion,
  SEXOS,
  ENFOQUES,
  FASES,
  NIVELES,
} from '@shared/nutrition/nutritionEngine.js';
import { LABEL_SEXO, LABEL_NIVEL, LABEL_ENFOQUE, LABEL_FASE } from '../utils/nutricionLabels.js';

function leerPath(obj, path) {
  return path.reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

// Clona solo la rama que cambia (el resto del arbol queda igual) - alcanza
// para este panel, que nunca comparte referencias entre renders fuera de
// esta funcion.
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

export default function PanelAdminNutricion() {
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
      const activa = await api.get('/nutricion/config');
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
      setHistorial(await api.get('/nutricion/config/historial'));
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
      const guardada = await api.post('/nutricion/config', { config, comment: comentario.trim() || undefined });
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
      const restaurada = await api.post(`/nutricion/config/restaurar/${id}`, {});
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
      const restaurada = await api.post('/nutricion/config/restaurar-fabrica', {});
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
          <span className="text-[15px] font-bold">NAC Asesoria · Nutrición</span>
        </Link>
        <AccountMenu />
      </header>

      <div className="p-4 flex flex-col gap-5 max-w-2xl w-full mx-auto pb-24">
        <div>
          <h1 className="text-[16px] font-bold">Configuración de la calculadora de calorías y macros</h1>
          <p className="text-[12.5px] text-text-muted mt-0.5">
            Estos valores alimentan el cálculo de todos los planes de nutrición. Guardar crea una versión nueva (nunca se pierde el historial).
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

            <SeccionEnergia config={config} onCambiar={cambiar} />
            <SeccionTablaBase config={config} onCambiar={cambiar} />
            <SeccionIncrementos config={config} onCambiar={cambiar} />
            <SeccionDefinicion config={config} onCambiar={cambiar} />
            <SeccionExcepciones config={config} onCambiar={cambiar} />
            <SeccionActividad config={config} onCambiar={cambiar} />
            <SeccionObjetivo config={config} onCambiar={cambiar} />
            <SeccionTendenciaPeso config={config} onCambiar={cambiar} />
            <SeccionOtros config={config} onCambiar={cambiar} />
            <VistaPrevia config={config} />

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

function CampoCheckbox({ config, path, label, onCambiar }) {
  const valor = Boolean(leerPath(config, path));
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-text-muted">
      <input type="checkbox" checked={valor} onChange={(e) => onCambiar(path, e.target.checked)} className="w-4 h-4 accent-accent" />
      {label}
    </label>
  );
}

// Grilla fila x columna de inputs numericos - usada para las tablas de g/kg
// (base, incrementos de carbohidratos), que tienen demasiadas combinaciones
// para poner un <Campo> suelto por cada una.
function TablaGrid({ filas, columnas, getPath, config, onCambiar, step = '0.1' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr>
            <th className="text-left"></th>
            {columnas.map((c) => (
              <th key={c.key} className="text-text-faint font-normal pb-1 px-1 whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.key}>
              <td className="text-text-muted pr-2 whitespace-nowrap">{f.label}</td>
              {columnas.map((c) => {
                const path = getPath(f.key, c.key);
                const valor = leerPath(config, path);
                return (
                  <td key={c.key} className="px-1 py-0.5">
                    <input
                      type="number"
                      step={step}
                      value={valor ?? ''}
                      onChange={(e) => onCambiar(path, e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full h-8 rounded-md border border-border bg-bg px-1.5 text-[12px] outline-none focus:border-accent"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeccionEnergia({ config, onCambiar }) {
  return (
    <Seccion titulo="Energía" descripcion="kcal por gramo de cada macro y por kg de grasa corporal (kcal = proteína×4 + carbohidratos×4 + grasa×9).">
      <div className="grid grid-cols-2 gap-2.5">
        <Campo config={config} onCambiar={onCambiar} path={['energia', 'kcalPorGProteina']} label="kcal / g proteína" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['energia', 'kcalPorGCarbohidrato']} label="kcal / g carbohidrato" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['energia', 'kcalPorGGrasa']} label="kcal / g grasa" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['energia', 'kcalPorKgGrasa']} label="kcal / kg grasa corporal" step="1" />
      </div>
    </Seccion>
  );
}

function SeccionTablaBase({ config, onCambiar }) {
  const filas = SEXOS.map((sexo) => ({ key: sexo, label: LABEL_SEXO[sexo] }));
  const columnas = [
    { key: 'proteina', label: 'Proteína (g/kg)' },
    { key: 'grasa', label: 'Grasa (g/kg)' },
    { key: 'carbohidratos', label: 'Carbohidratos (g/kg)' },
  ];
  return (
    <Seccion titulo="Tabla base" descripcion="Mantenimiento, sin entrenar - el punto de partida sobre el que se suman los incrementos del resto de las secciones.">
      {ENFOQUES.map((enfoque) => (
        <div key={enfoque} className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-semibold text-text-muted">{LABEL_ENFOQUE[enfoque]}</span>
          <TablaGrid
            config={config} onCambiar={onCambiar} filas={filas} columnas={columnas}
            getPath={(sexo, macro) => ['base', enfoque, sexo, macro]}
          />
        </div>
      ))}
    </Seccion>
  );
}

function SeccionIncrementos({ config, onCambiar }) {
  const filas = SEXOS.map((sexo) => ({ key: sexo, label: LABEL_SEXO[sexo] }));
  const columnas = NIVELES.map((nivel) => ({ key: nivel, label: LABEL_NIVEL[nivel] }));
  return (
    <Seccion titulo="Incrementos de carbohidratos" descripcion="Suma (g/kg) sobre la tabla base, según fase y nivel de actividad - iguales para ambos enfoques.">
      {['mantenimiento', 'volumen'].map((fase) => (
        <div key={fase} className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-semibold text-text-muted">{LABEL_FASE[fase]}</span>
          <TablaGrid
            config={config} onCambiar={onCambiar} filas={filas} columnas={columnas}
            getPath={(sexo, nivel) => ['incrementosCarbohidratos', fase, sexo, nivel]}
          />
        </div>
      ))}
    </Seccion>
  );
}

function SeccionDefinicion({ config, onCambiar }) {
  return (
    <Seccion titulo="Definición" descripcion="Decremento de carbohidratos (g/kg) respecto de la referencia, según nivel de actividad - igual para ambos sexos y enfoques.">
      <div className="grid grid-cols-2 gap-2.5">
        {NIVELES.map((nivel) => (
          <Campo
            key={nivel} config={config} onCambiar={onCambiar}
            path={['decrementoDefinicionCarbohidratos', nivel]} label={LABEL_NIVEL[nivel]}
          />
        ))}
      </div>
      <CampoCheckbox
        config={config} onCambiar={onCambiar} path={['pisoProteinaDefinicionActivo']}
        label="Usar la proteína de la tabla base como piso (si la referencia da menos)"
      />
    </Seccion>
  );
}

function SeccionExcepciones({ config, onCambiar }) {
  return (
    <Seccion titulo="Excepciones">
      <Campo
        config={config} onCambiar={onCambiar} path={['excepciones', 'grasaVolumenMujerAltoDelta']}
        label="Volumen, mujeres, nivel Alto: delta extra de grasa (g/kg)"
      />
      <div className="grid grid-cols-2 gap-2.5">
        <Campo
          config={config} onCambiar={onCambiar} path={['excepciones', 'definicionLargaHombreSemanasMinimo']}
          label="Definición larga (hombres): semanas mínimas del plan" step="1"
        />
        <Campo
          config={config} onCambiar={onCambiar} path={['excepciones', 'definicionLargaHombreUltimasSemanas']}
          label="…últimas N semanas con el ajuste" step="1"
        />
      </div>
      <Campo
        config={config} onCambiar={onCambiar} path={['excepciones', 'definicionLargaHombreDeltaGrasa']}
        label="…delta de grasa en esas últimas semanas (g/kg)"
      />
    </Seccion>
  );
}

function SeccionActividad({ config, onCambiar }) {
  return (
    <Seccion titulo="Nivel de actividad automático" descripcion="Días de entrenamiento por semana que definen cada nivel, y el ajuste por promedio de pasos diarios.">
      <div className="grid grid-cols-2 gap-2.5">
        <Campo config={config} onCambiar={onCambiar} path={['actividad', 'diasBajoMin']} label="Bajo: desde (días)" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['actividad', 'diasBajoMax']} label="Bajo: hasta (días)" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['actividad', 'diasIntermedioMin']} label="Intermedio: desde (días)" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['actividad', 'diasIntermedioMax']} label="Intermedio: hasta (días)" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['actividad', 'diasAltoMin']} label="Alto: desde (días)" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['actividad', 'diasAltoMax']} label="Alto: hasta (días)" step="1" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Campo config={config} onCambiar={onCambiar} path={['actividad', 'pasosVentanaDias']} label="Ventana de pasos (días)" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['actividad', 'pasosMinimoDiasConDatos']} label="Mínimo de días con datos" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['actividad', 'pasosSubirNivelDesde']} label="Sube un nivel desde (pasos/día)" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['actividad', 'pasosBajarNivelHasta']} label="Baja un nivel hasta (pasos/día)" step="1" />
      </div>
    </Seccion>
  );
}

function SeccionObjetivo({ config, onCambiar }) {
  return (
    <Seccion titulo="Modo objetivo (Definición avanzada)" descripcion="Proyección semana a semana, adaptación metabólica y semáforo de realismo.">
      <Campo config={config} onCambiar={onCambiar} path={['objetivo', 'carbohidratosMinimoGPorKg']} label="Mínimo de carbohidratos (g/kg)" />
      <Campo config={config} onCambiar={onCambiar} path={['objetivo', 'ritmoSugeridoPctSemana']} label="Ritmo sugerido (% peso / semana)" />

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-[11.5px] font-semibold text-text-muted">Adaptación metabólica</span>
        <CampoCheckbox config={config} onCambiar={onCambiar} path={['objetivo', 'adaptacionMetabolica', 'activa']} label="Activa" />
        <div className="grid grid-cols-2 gap-2.5">
          <Campo config={config} onCambiar={onCambiar} path={['objetivo', 'adaptacionMetabolica', 'porcentajePorSemana']} label="% por semana" />
          <Campo config={config} onCambiar={onCambiar} path={['objetivo', 'adaptacionMetabolica', 'topePorcentaje']} label="Tope (%)" />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-[11.5px] font-semibold text-text-muted">Semáforo (% del peso perdido / semana)</span>
        <div className="grid grid-cols-2 gap-2.5">
          <Campo config={config} onCambiar={onCambiar} path={['objetivo', 'semaforo', 'muyLentoMax']} label="Muy lento: hasta" />
          <Campo config={config} onCambiar={onCambiar} path={['objetivo', 'semaforo', 'optimoMin']} label="Óptimo: desde" />
          <Campo config={config} onCambiar={onCambiar} path={['objetivo', 'semaforo', 'optimoMax']} label="Óptimo: hasta" />
          <Campo config={config} onCambiar={onCambiar} path={['objetivo', 'semaforo', 'agresivoMax']} label="Agresivo: hasta" />
        </div>
        <Campo config={config} onCambiar={onCambiar} path={['objetivo', 'semaforo', 'agresivoDeficitPctKcalMax']} label="Agresivo: déficit máximo (% kcal)" />
        <div className="grid grid-cols-2 gap-2.5">
          <Campo config={config} onCambiar={onCambiar} path={['objetivo', 'semaforo', 'noRecomendableKcalMinHombre']} label="No recomendable bajo (hombres, kcal)" step="1" />
          <Campo config={config} onCambiar={onCambiar} path={['objetivo', 'semaforo', 'noRecomendableKcalMinMujer']} label="No recomendable bajo (mujeres, kcal)" step="1" />
          <Campo config={config} onCambiar={onCambiar} path={['objetivo', 'semaforo', 'advertenciaGrasaFinalMinHombre']} label="Advertencia: % graso final mín. (hombres)" />
          <Campo config={config} onCambiar={onCambiar} path={['objetivo', 'semaforo', 'advertenciaGrasaFinalMinMujer']} label="Advertencia: % graso final mín. (mujeres)" />
        </div>
      </div>
    </Seccion>
  );
}

function SeccionTendenciaPeso({ config, onCambiar }) {
  return (
    <Seccion titulo="Tendencia de peso (modo objetivo)" descripcion="Regresión sobre los pesajes cargados, para comparar el ritmo real de pérdida contra el esperado por el plan.">
      <div className="grid grid-cols-2 gap-2.5">
        <Campo config={config} onCambiar={onCambiar} path={['tendenciaPeso', 'ventanaDias']} label="Ventana (días)" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['tendenciaPeso', 'minPuntos']} label="Mínimo de pesajes" step="1" />
      </div>
      <Campo config={config} onCambiar={onCambiar} path={['tendenciaPeso', 'toleranciaPct']} label="Tolerancia antes de avisar (% del ritmo esperado)" step="1" />
    </Seccion>
  );
}

function SeccionOtros({ config, onCambiar }) {
  return (
    <Seccion titulo="Otros" descripcion="Piso duro de calorías (nunca se baja de ahí) y factores de actividad de Mifflin-St Jeor (solo informativos).">
      <div className="grid grid-cols-2 gap-2.5">
        <Campo config={config} onCambiar={onCambiar} path={['pisosCalorias', 'hombre']} label="Piso calórico (hombres)" step="1" />
        <Campo config={config} onCambiar={onCambiar} path={['pisosCalorias', 'mujer']} label="Piso calórico (mujeres)" step="1" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {NIVELES.map((nivel) => (
          <Campo
            key={nivel} config={config} onCambiar={onCambiar}
            path={['mifflinFactoresActividad', nivel]} label={`Factor Mifflin: ${LABEL_NIVEL[nivel]}`}
          />
        ))}
      </div>
    </Seccion>
  );
}

function VistaPrevia({ config }) {
  const [sexo, setSexo] = useState('masculino');
  const [peso, setPeso] = useState('80');
  const [nivel, setNivel] = useState('intermedio');
  const [fase, setFase] = useState('mantenimiento');
  const [enfoque, setEnfoque] = useState('estandar');

  const resultado = useMemo(() => {
    const pesoKg = Number(peso);
    if (!(pesoKg > 0)) return null;
    try {
      if (fase === 'definicion') {
        const entrena = nivel !== 'sin_entrenar';
        const { macrosGKg } = resolverReferenciaDefinicion(
          { pesoActualKg: pesoKg, sexo, enfoque, entrena, nivelSiEntrena: nivel },
          config
        );
        return calcularMacrosFase({ fase, enfoque, sexo, nivel, pesoActualKg: pesoKg, referenciaGKg: macrosGKg }, config);
      }
      return calcularMacrosFase({ fase, enfoque, sexo, nivel, pesoActualKg: pesoKg }, config);
    } catch (err) {
      return { error: err.message };
    }
  }, [config, sexo, peso, nivel, fase, enfoque]);

  return (
    <Seccion titulo="Vista previa en vivo" descripcion="Perfil de ejemplo, para ver el efecto de los valores de arriba sin tener que guardar.">
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-text-muted">Sexo</span>
          <select value={sexo} onChange={(e) => setSexo(e.target.value)} className="h-9 rounded-lg border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent">
            {SEXOS.map((s) => <option key={s} value={s}>{LABEL_SEXO[s]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-text-muted">Peso (kg)</span>
          <input type="number" value={peso} onChange={(e) => setPeso(e.target.value)} className="h-9 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-text-muted">Nivel de actividad</span>
          <select value={nivel} onChange={(e) => setNivel(e.target.value)} className="h-9 rounded-lg border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent">
            {NIVELES.map((n) => <option key={n} value={n}>{LABEL_NIVEL[n]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-text-muted">Fase</span>
          <select value={fase} onChange={(e) => setFase(e.target.value)} className="h-9 rounded-lg border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent">
            {FASES.map((f) => <option key={f} value={f}>{LABEL_FASE[f]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-[11px] text-text-muted">Enfoque</span>
          <select value={enfoque} onChange={(e) => setEnfoque(e.target.value)} className="h-9 rounded-lg border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent">
            {ENFOQUES.map((f) => <option key={f} value={f}>{LABEL_ENFOQUE[f]}</option>)}
          </select>
        </label>
      </div>

      {resultado?.error && <p className="text-[12.5px] text-danger">{resultado.error}</p>}
      {resultado && !resultado.error && (
        <div className="bg-bg border border-border rounded-xl p-3 flex flex-col gap-1.5">
          <span className="text-[18px] font-bold">{resultado.kcal} kcal</span>
          <div className="flex gap-4 text-[12.5px] text-text-muted">
            <span>Proteína: <strong className="text-text">{resultado.proteinaG} g</strong></span>
            <span>Grasa: <strong className="text-text">{resultado.grasaG} g</strong></span>
            <span>Carbohidratos: <strong className="text-text">{resultado.carbohidratosG} g</strong></span>
          </div>
          {resultado.carbohidratosPorDebajoDelMinimo && (
            <p className="text-[11.5px] text-danger">Los carbohidratos quedaron por debajo del mínimo configurado.</p>
          )}
          {resultado.excepciones.length > 0 && (
            <p className="text-[11px] text-text-faint">Excepciones aplicadas: {resultado.excepciones.join(', ')}</p>
          )}
        </div>
      )}
    </Seccion>
  );
}
