import { useEffect, useState } from 'react';
import { api, API_BASE } from '../api/client.js';
import { NIVELES, FASES, ENFOQUES } from '@shared/nutrition/nutritionEngine.js';
import { LABEL_NIVEL, LABEL_ENFOQUE, LABEL_FASE, LABEL_FUENTE_REFERENCIA, LABEL_SEMAFORO, CLASE_SEMAFORO, LABEL_TENDENCIA, CLASE_TENDENCIA, LABEL_FASE_ESTADO, CLASE_FASE_ESTADO } from '../utils/nutricionLabels.js';
import GraficoProyeccion from './GraficoProyeccion.jsx';
import Sparkline from './Sparkline.jsx';

function formatearFecha(iso) {
  return new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z')).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

// Pantalla de nutricion para un usuario puntual (cliente viendo la propia,
// o coach/admin viendo la de un cliente) - Etapa 3 de 5: alta y resultado
// de un plan Mantenimiento/Volumen/Definicion "simple" (sin modo objetivo
// todavia, eso es la Etapa 4).
export default function PlanNutricion({ usuarioId }) {
  const [datosPersonales, setDatosPersonales] = useState(null);
  const [rutinaActiva, setRutinaActiva] = useState(undefined); // undefined = cargando, null = sin rutina
  const [plan, setPlan] = useState(undefined);
  const [error, setError] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [historial, setHistorial] = useState(null);
  const [semanasSugeridas, setSemanasSugeridas] = useState(null);

  async function cargarTodo() {
    setError('');
    try {
      const [perfil, rutina, planActivo] = await Promise.all([
        api.get(`/usuarios/${usuarioId}/perfil`),
        api.get(`/usuarios/${usuarioId}/rutina`).catch(() => null),
        api.get(`/nutricion/usuarios/${usuarioId}/plan`),
      ]);
      setDatosPersonales(perfil.datos_personales);
      setRutinaActiva(rutina);
      setPlan(planActivo);
      setMostrarForm(!planActivo);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { cargarTodo(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [usuarioId]);

  async function recargarPlan() {
    try {
      setPlan(await api.get(`/nutricion/usuarios/${usuarioId}/plan`));
    } catch (err) {
      setError(err.message);
    }
  }

  async function cargarHistorial() {
    try {
      setHistorial(await api.get(`/nutricion/usuarios/${usuarioId}/planes`));
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleHistorial() {
    setMostrarHistorial((v) => !v);
    if (!historial) cargarHistorial();
  }

  if (error) return <p className="text-[13px] text-danger p-4">{error}</p>;
  if (datosPersonales === null || rutinaActiva === undefined || plan === undefined) {
    return <p className="text-[13px] text-text-muted p-4">Cargando…</p>;
  }

  if (!datosPersonales.sexo_biologico) {
    return (
      <div className="p-4 flex flex-col gap-3 max-w-xl w-full mx-auto">
        <h1 className="text-[16px] font-bold">Nutrición</h1>
        <DatosPersonalesForm
          usuarioId={usuarioId}
          datosPersonales={datosPersonales}
          onGuardado={(d) => setDatosPersonales(d)}
        />
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 max-w-xl w-full mx-auto pb-10">
      <h1 className="text-[16px] font-bold">Nutrición</h1>

      {plan && !mostrarForm && (
        <ResultadoPlan
          plan={plan}
          usuarioId={usuarioId}
          onNuevoPlan={() => { setSemanasSugeridas(null); setMostrarForm(true); }}
          onAplicarPlazoSugerido={(semanas) => { setSemanasSugeridas(semanas); setMostrarForm(true); }}
          onProgresoActualizado={(p) => setPlan(p)}
          onRecargarPlan={recargarPlan}
          onVerHistorial={toggleHistorial}
          mostrandoHistorial={mostrarHistorial}
        />
      )}

      {mostrarForm && (
        <FormularioPlan
          usuarioId={usuarioId}
          rutinaActiva={rutinaActiva}
          planActual={plan}
          semanasSugeridas={semanasSugeridas}
          onCreado={(p) => { setPlan(p); setMostrarForm(false); setHistorial(null); setSemanasSugeridas(null); }}
          onCancelar={plan ? () => setMostrarForm(false) : null}
        />
      )}

      {mostrarHistorial && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-bold text-text-muted uppercase tracking-wide">Planes anteriores</h2>
          {historial === null && <p className="text-[12.5px] text-text-muted">Cargando…</p>}
          {historial?.length === 0 && <p className="text-[12.5px] text-text-faint">Todavía no hay planes archivados.</p>}
          {historial?.map((p) => (
            <div key={p.id} className="bg-surface border border-border rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold">{LABEL_FASE[p.phase]} · {LABEL_ENFOQUE[p.focus]}</span>
                <span className="text-[11.5px] text-text-faint">
                  {formatearFecha(p.created_at)}{p.created_by_nombre ? ` · ${p.created_by_nombre}` : ''}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function DatosPersonalesForm({ usuarioId, datosPersonales, onGuardado }) {
  const [sexo, setSexo] = useState(datosPersonales?.sexo_biologico || 'masculino');
  const [fechaNacimiento, setFechaNacimiento] = useState(datosPersonales?.fecha_nacimiento || '');
  const [alturaCm, setAlturaCm] = useState(datosPersonales?.altura_cm || '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const guardado = await api.put(`/usuarios/${usuarioId}/datos-personales`, {
        sexo_biologico: sexo,
        fecha_nacimiento: fechaNacimiento || null,
        altura_cm: alturaCm === '' ? null : Number(alturaCm),
      });
      onGuardado(guardado);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2.5">
      <p className="text-[12.5px] text-text-muted">
        Para calcular el plan hace falta el sexo biológico. Fecha de nacimiento y altura son opcionales (solo se usan para mostrar el Mifflin-St Jeor informativo).
      </p>
      <div className="flex gap-2">
        {['masculino', 'femenino'].map((s) => (
          <button
            type="button" key={s} onClick={() => setSexo(s)}
            className={`flex-1 h-9 rounded-lg border text-[13px] font-semibold ${sexo === s ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`}
          >
            {s === 'masculino' ? 'Hombre' : 'Mujer'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-text-muted">Fecha de nacimiento (opcional)</span>
          <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)}
            className="h-9 rounded-lg border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-text-muted">Altura en cm (opcional)</span>
          <input type="number" value={alturaCm} onChange={(e) => setAlturaCm(e.target.value)}
            className="h-9 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent" />
        </label>
      </div>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <button type="submit" disabled={guardando} className="h-10 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold disabled:opacity-60">
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}

function ResultadoPlan({ plan, usuarioId, onNuevoPlan, onAplicarPlazoSugerido, onProgresoActualizado, onRecargarPlan, onVerHistorial, mostrandoHistorial }) {
  const r = plan.resultado;
  const conObjetivo = Boolean(plan.goal_fat_kg);
  const [mostrarProgreso, setMostrarProgreso] = useState(false);

  return (
    <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-text-faint">
            {LABEL_FASE[plan.phase]} · {LABEL_ENFOQUE[plan.focus]}{conObjetivo ? ' · Modo objetivo' : ''}
          </span>
          <div className="text-[26px] font-bold leading-tight">{r.kcal} kcal</div>
        </div>
        {conObjetivo && plan.semaforo && (
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${CLASE_SEMAFORO[plan.semaforo.nivel]}`}>
            {LABEL_SEMAFORO[plan.semaforo.nivel]}
          </span>
        )}
      </div>

      <div className="flex gap-4 text-[13px]">
        <div className="flex flex-col">
          <span className="text-text-faint text-[11px]">Proteína</span>
          <span className="font-semibold">{r.proteinaG} g</span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-faint text-[11px]">Grasa</span>
          <span className="font-semibold">{r.grasaG} g</span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-faint text-[11px]">Carbohidratos</span>
          <span className="font-semibold">{r.carbohidratosG} g</span>
        </div>
      </div>

      {r.carbohidratosPorDebajoDelMinimo && (
        <p className="text-[11.5px] text-danger">Los carbohidratos quedaron por debajo del mínimo recomendado.</p>
      )}
      {conObjetivo && r.pisoCalorioAplicado && (
        <p className="text-[11.5px] text-danger">Se aplicó el piso calórico de seguridad: el déficit calculado daba menos calorías de las permitidas.</p>
      )}

      <div className="flex flex-col gap-1 text-[11.5px] text-text-faint border-t border-border pt-2.5">
        <span>Peso de referencia: {plan.reference_weight_kg} kg · Nivel de actividad: {LABEL_NIVEL[plan.activity_level]} ({plan.activity_source === 'auto' ? 'automático' : 'manual'})</span>
        {plan.phase === 'definicion' && plan.reference_source && (
          <span>Referencia de Definición: {LABEL_FUENTE_REFERENCIA[plan.reference_source]}.</span>
        )}
        {plan.mifflin && (
          <span>Mifflin-St Jeor informativo: BMR {plan.mifflin.bmr} kcal · TDEE {plan.mifflin.tdee} kcal ({plan.mifflin.edad} años).</span>
        )}
        {conObjetivo && (
          <span>Objetivo: perder {plan.goal_fat_kg} kg de grasa en {plan.weeks} semana{plan.weeks === 1 ? '' : 's'} (déficit de {r.deficitDiarioKcal} kcal/día).</span>
        )}
      </div>

      {conObjetivo && !plan.mifflinDisponible && (
        <p className="text-[11.5px] text-danger">
          Cargá tu fecha de nacimiento y altura para ver el semáforo de realismo y la proyección semana a semana.
        </p>
      )}

      {conObjetivo && plan.semaforo && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
          {plan.semaforo.motivos.map((m) => (
            <p key={m} className="text-[11.5px] text-text-muted">{m}</p>
          ))}
          {plan.semaforo.advertenciaGrasaBaja && (
            <p className="text-[11.5px] text-danger">El % de grasa corporal proyectado al final del plan queda en un nivel bajo.</p>
          )}
          {plan.plazoMinimoSugeridoSemanas != null && (
            <button
              onClick={() => onAplicarPlazoSugerido(plan.plazoMinimoSugeridoSemanas)}
              className="text-[12px] font-semibold text-accent text-left"
            >
              Aplicar plazo sugerido ({plan.plazoMinimoSugeridoSemanas} semanas)
            </button>
          )}
        </div>
      )}

      {conObjetivo && plan.proyeccion?.length > 1 && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <GraficoProyeccion proyeccion={plan.proyeccion} />
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-text-faint">
                  <th className="text-left font-normal pb-1">Sem.</th>
                  <th className="text-right font-normal pb-1">Peso</th>
                  <th className="text-right font-normal pb-1">Kcal</th>
                  <th className="text-right font-normal pb-1">P</th>
                  <th className="text-right font-normal pb-1">G</th>
                  <th className="text-right font-normal pb-1">C</th>
                </tr>
              </thead>
              <tbody>
                {plan.proyeccion.map((f) => (
                  <tr key={f.semana} className="border-t border-border">
                    <td className="py-1">{f.semana}</td>
                    <td className="text-right tabular">{f.pesoProyectadoKg}</td>
                    <td className="text-right tabular">{f.kcal}</td>
                    <td className="text-right tabular">{f.proteinaG}</td>
                    <td className="text-right tabular">{f.grasaG}</td>
                    <td className="text-right tabular">{f.carbohidratosG}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SeguimientoCorporal plan={plan} usuarioId={usuarioId} onRecargarPlan={onRecargarPlan} />

      {conObjetivo && (
        <div className="border-t border-border pt-2.5">
          {!mostrarProgreso ? (
            <button onClick={() => setMostrarProgreso(true)} className="text-[12px] font-semibold text-accent">
              Actualizar peso actual
            </button>
          ) : (
            <ActualizarProgreso
              usuarioId={usuarioId}
              pesoSugerido={plan.tendenciaPeso?.pesoTendenciaKg}
              onActualizado={(p) => { onProgresoActualizado(p); setMostrarProgreso(false); }}
              onCancelar={() => setMostrarProgreso(false)}
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <button onClick={onNuevoPlan} className="text-[12.5px] font-semibold text-accent">Nuevo plan</button>
        <div className="flex items-center gap-3">
          <a href={`${API_BASE}/nutricion/usuarios/${usuarioId}/export.xlsx`} className="text-[12.5px] font-semibold text-accent">
            Exportar Excel
          </a>
          <button onClick={onVerHistorial} className="text-[12.5px] font-semibold text-text-muted">
            {mostrandoHistorial ? 'Ocultar historial' : 'Ver historial'}
          </button>
        </div>
      </div>
    </section>
  );
}

function ActualizarProgreso({ usuarioId, pesoSugerido, onActualizado, onCancelar }) {
  // Prellenado con el peso de TENDENCIA (suavizado, ver tendenciaPeso en
  // nutritionService.js) en vez de dejarlo vacio - sigue siendo editable,
  // pero asi el check-in no depende de que justo hoy no haya retencion de
  // liquidos/una comida pesada de por medio como pasaria con un pesaje
  // crudo. Si todavia no hay tendencia (pocos pesajes cargados), queda
  // vacio como antes.
  const [peso, setPeso] = useState(pesoSugerido?.toString() || '');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!(Number(peso) > 0)) { setError('Ingresá tu peso actual en kg.'); return; }
    setEnviando(true);
    try {
      const actualizado = await api.patch(`/nutricion/usuarios/${usuarioId}/plan/progreso`, { pesoActualKg: Number(peso) });
      onActualizado(actualizado);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <p className="text-[11.5px] text-text-faint">
        Recalcula lo que falta del plan (objetivo y semanas restantes) en base a tu peso de hoy.
      </p>
      <div className="flex gap-2">
        <input type="number" step="0.1" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="Peso actual (kg)"
          className="flex-1 h-9 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent" />
        <button type="button" onClick={onCancelar} className="h-9 px-3 rounded-lg border border-border text-text-muted text-[12.5px] font-semibold">
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className="h-9 px-3 rounded-lg bg-accent text-accent-fg text-[12.5px] font-semibold disabled:opacity-60">
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </form>
  );
}

// Seguimiento corporal general: disponible en CUALQUIER fase (a diferencia
// del viejo bloque que solo aparecia con Modo objetivo declarado), promedia
// los pesajes por semana y compara el ritmo real contra lo que la fase
// espera (volumen -> subir, definicion -> bajar, mantenimiento -> estable).
// Con Modo objetivo activo, el badge usa la comparacion contra el deficit
// en kcal (mas precisa, ya existia) en vez de la generica por fase.
function SeguimientoCorporal({ plan, usuarioId, onRecargarPlan }) {
  const [mostrarRegistroPeso, setMostrarRegistroPeso] = useState(false);
  const sc = plan.seguimientoCorporal;
  if (!sc) return null;

  const comparacionDeficit = plan.goal_fat_kg ? plan.tendenciaPeso?.comparacion : null;
  const estadoBadge = comparacionDeficit
    ? { label: LABEL_TENDENCIA[comparacionDeficit.estado], clase: CLASE_TENDENCIA[comparacionDeficit.estado] }
    : sc.comparacionFase
      ? { label: LABEL_FASE_ESTADO[sc.comparacionFase.estado], clase: CLASE_FASE_ESTADO[sc.comparacionFase.estado] }
      : null;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Seguimiento corporal</span>

      {sc.tendencia ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold">{sc.tendencia.pesoTendenciaKg} kg</span>
              <span className="text-[11px] text-text-faint">
                {sc.tendencia.kgPorSemanaTendencia > 0 && `Subiendo ${sc.tendencia.kgPorSemanaTendencia} kg/semana`}
                {sc.tendencia.kgPorSemanaTendencia < 0 && `Bajando ${Math.abs(sc.tendencia.kgPorSemanaTendencia)} kg/semana`}
                {sc.tendencia.kgPorSemanaTendencia === 0 && 'Peso estable'}
                {comparacionDeficit ? ` (esperado perder ${comparacionDeficit.ritmoEsperadoKgSemana})` : ''}
                {' · '}{sc.progreso.numeroPuntos} pesajes desde {formatearFecha(sc.tendencia.primeraFecha)}
              </span>
            </div>
            {sc.promedios.length > 1 && <Sparkline valores={sc.promedios.map((p) => p.pesoPromedioKg)} />}
          </div>
          {estadoBadge && (
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${estadoBadge.clase}`}>
              {estadoBadge.label}
            </span>
          )}
        </div>
      ) : (
        <p className="text-[11.5px] text-text-faint">
          Registrá tu peso en al menos {sc.progreso.minPuntos} días distintos (vas {sc.progreso.numeroPuntos}/{sc.progreso.minPuntos}) de los últimos {sc.progreso.ventanaDias} días para ver tu tendencia.
        </p>
      )}

      {sc.promedios.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-text-faint">
                <th className="text-left font-normal pb-1">Semana</th>
                <th className="text-right font-normal pb-1">Peso</th>
                <th className="text-right font-normal pb-1">% graso</th>
                <th className="text-right font-normal pb-1">% muscular</th>
              </tr>
            </thead>
            <tbody>
              {sc.promedios.map((p) => (
                <tr key={p.desde} className="border-t border-border">
                  <td className="py-1">{formatearFecha(p.desde)}</td>
                  <td className="text-right tabular">{p.pesoPromedioKg ?? '—'}</td>
                  <td className="text-right tabular">{p.grasaPromedioPct ?? '—'}</td>
                  <td className="text-right tabular">{p.muscularPromedioPct ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!mostrarRegistroPeso ? (
        <button onClick={() => setMostrarRegistroPeso(true)} className="text-[12px] font-semibold text-accent self-start">
          Registrar peso de hoy
        </button>
      ) : (
        <RegistroPeso
          usuarioId={usuarioId}
          onRegistrado={() => { onRecargarPlan(); setMostrarRegistroPeso(false); }}
          onCancelar={() => setMostrarRegistroPeso(false)}
        />
      )}
    </div>
  );
}

// Pesaje suelto para alimentar la tendencia (registro_antropometrico) - a
// diferencia de "Actualizar peso actual" (que re-basea el plan), esto solo
// guarda un dato mas de la serie. Fecha siempre hoy, sin selector libre -
// mismo criterio que PasosDiariosBoton en EntrenamientoPage.jsx. % graso y
// % muscular son opcionales (no todos tienen una balanza que los mida).
function RegistroPeso({ usuarioId, onRegistrado, onCancelar }) {
  const [peso, setPeso] = useState('');
  const [grasa, setGrasa] = useState('');
  const [muscular, setMuscular] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!(Number(peso) > 0)) { setError('Ingresá tu peso de hoy en kg.'); return; }
    setEnviando(true);
    try {
      await api.post(`/usuarios/${usuarioId}/antropometria`, {
        peso_corporal: Number(peso),
        porcentaje_graso: grasa ? Number(grasa) : null,
        porcentaje_muscular: muscular ? Number(muscular) : null,
      });
      onRegistrado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <p className="text-[11.5px] text-text-faint">Se guarda con la fecha de hoy. % graso y % muscular son opcionales.</p>
      <div className="flex gap-2">
        <input type="number" step="0.1" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="Peso (kg)"
          className="flex-1 h-9 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent" />
        <input type="number" step="0.1" value={grasa} onChange={(e) => setGrasa(e.target.value)} placeholder="% graso"
          className="flex-1 h-9 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent" />
        <input type="number" step="0.1" value={muscular} onChange={(e) => setMuscular(e.target.value)} placeholder="% muscular"
          className="flex-1 h-9 rounded-lg border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent" />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancelar} className="h-9 px-3 rounded-lg border border-border text-text-muted text-[12.5px] font-semibold">
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className="h-9 px-3 rounded-lg bg-accent text-accent-fg text-[12.5px] font-semibold disabled:opacity-60">
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </form>
  );
}

function FormularioPlan({ usuarioId, rutinaActiva, planActual, semanasSugeridas, onCreado, onCancelar }) {
  const planConObjetivo = Boolean(planActual?.goal_fat_kg);
  const [peso, setPeso] = useState(planActual?.reference_weight_kg?.toString() || '');
  const [fase, setFase] = useState(planActual?.phase || 'mantenimiento');
  const [enfoque, setEnfoque] = useState(planActual?.focus || 'estandar');
  const [diasManual, setDiasManual] = useState('4');
  const [nivelManualActivo, setNivelManualActivo] = useState(false);
  const [nivelManual, setNivelManual] = useState('intermedio');
  const [semanas, setSemanas] = useState(semanasSugeridas?.toString() || planActual?.weeks?.toString() || '');
  const [declararMacros, setDeclararMacros] = useState(false);
  const [proteinaDeclarada, setProteinaDeclarada] = useState('');
  const [grasaDeclarada, setGrasaDeclarada] = useState('');
  const [carbosDeclarados, setCarbosDeclarados] = useState('');
  const [modoObjetivoActivo, setModoObjetivoActivo] = useState(Boolean(semanasSugeridas) || planConObjetivo);
  const [kgAPerder, setKgAPerder] = useState(planActual?.goal_fat_kg?.toString() || '');
  const [pctGrasaInicial, setPctGrasaInicial] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pendiente, setPendiente] = useState(false);

  const tieneRutina = Boolean(rutinaActiva);
  const diasDeRutina = rutinaActiva?.dias?.length;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!(Number(peso) > 0)) { setError('Ingresá tu peso actual en kg.'); return; }
    if (!tieneRutina && !(Number(diasManual) >= 1 && Number(diasManual) <= 7)) {
      setError('Indicá cuántos días por semana entrenás (entre 1 y 7).');
      return;
    }
    if (fase === 'definicion' && modoObjetivoActivo) {
      if (!(Number(kgAPerder) > 0)) { setError('Indicá cuántos kg de grasa querés perder.'); return; }
      if (!(Number(semanas) > 0)) { setError('El modo objetivo necesita la duración del plan en semanas.'); return; }
    }
    setEnviando(true);
    try {
      const payload = {
        phase: fase, focus: enfoque, pesoActualKg: Number(peso),
        diasEntrenamientoManual: tieneRutina ? undefined : Number(diasManual),
        nivelManual: nivelManualActivo ? nivelManual : undefined,
        weeks: fase === 'definicion' && semanas ? Number(semanas) : undefined,
        macrosActualesDeclaradosGDia: fase === 'definicion' && declararMacros
          ? { proteina: Number(proteinaDeclarada) || 0, grasa: Number(grasaDeclarada) || 0, carbohidratos: Number(carbosDeclarados) || 0 }
          : undefined,
        goalFatKg: fase === 'definicion' && modoObjetivoActivo ? Number(kgAPerder) : undefined,
        pctGrasaInicial: fase === 'definicion' && modoObjetivoActivo && pctGrasaInicial ? Number(pctGrasaInicial) : undefined,
      };
      const creado = await api.post(`/nutricion/usuarios/${usuarioId}/plan`, payload);
      // requiere_aprobacion_coach activo: el plan todavia no existe, queda
      // esperando a que el coach lo apruebe (ver debeQuedarPendiente en
      // solicitudCambio.js) - no hay un plan nuevo que mostrar todavia.
      if (creado.pendiente) {
        setPendiente(true);
      } else {
        onCreado(creado);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (pendiente) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2.5">
        <p className="text-[13.5px] font-semibold">Plan enviado a tu coach</p>
        <p className="text-[12.5px] text-text-muted">
          Tenés activado que tu coach apruebe tus cambios, así que este plan va a activarse recién cuando lo revise.
        </p>
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="self-start text-[12.5px] font-semibold text-accent">
            Volver a mi plan actual
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <h2 className="text-[13px] font-bold text-text-muted uppercase tracking-wide">
        {planActual ? 'Nuevo plan' : 'Armar tu plan'}
      </h2>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Peso actual (kg)</span>
        <input type="number" step="0.1" value={peso} onChange={(e) => setPeso(e.target.value)} required
          className="h-10 rounded-lg border border-border bg-bg px-3 text-[13.5px] outline-none focus:border-accent" />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-text-muted">Fase</span>
        <div className="flex gap-2">
          {FASES.map((f) => (
            <button type="button" key={f} onClick={() => setFase(f)}
              className={`flex-1 h-9 rounded-lg border text-[12.5px] font-semibold ${fase === f ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`}>
              {LABEL_FASE[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-text-muted">Enfoque</span>
        <div className="flex gap-2">
          {ENFOQUES.map((f) => (
            <button type="button" key={f} onClick={() => setEnfoque(f)}
              className={`flex-1 h-9 rounded-lg border text-[12.5px] font-semibold ${enfoque === f ? 'bg-accent text-accent-fg border-accent' : 'bg-bg border-border text-text-muted'}`}>
              {LABEL_ENFOQUE[f]}
            </button>
          ))}
        </div>
      </div>

      {tieneRutina ? (
        <p className="text-[11.5px] text-text-faint">
          Nivel de actividad automático según tu rutina activa ({diasDeRutina} día{diasDeRutina === 1 ? '' : 's'}/semana) y tus pasos diarios cargados.
        </p>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-text-muted">Días de entrenamiento por semana (no tenés una rutina activa)</span>
          <input type="number" min="1" max="7" value={diasManual} onChange={(e) => setDiasManual(e.target.value)}
            className="h-10 rounded-lg border border-border bg-bg px-3 text-[13.5px] outline-none focus:border-accent" />
        </label>
      )}

      <label className="flex items-center gap-2 text-[12px] text-text-muted">
        <input type="checkbox" checked={nivelManualActivo} onChange={(e) => setNivelManualActivo(e.target.checked)} className="w-4 h-4 accent-accent" />
        Elegir el nivel de actividad a mano
      </label>
      {nivelManualActivo && (
        <select value={nivelManual} onChange={(e) => setNivelManual(e.target.value)}
          className="h-9 rounded-lg border border-border bg-bg px-2 text-[13px] outline-none focus:border-accent">
          {NIVELES.map((n) => <option key={n} value={n}>{LABEL_NIVEL[n]}</option>)}
        </select>
      )}

      {fase === 'definicion' && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-text-muted">
              Duración del plan en semanas {modoObjetivoActivo ? '(obligatoria para el modo objetivo)' : '(opcional)'}
            </span>
            <input type="number" min="1" value={semanas} onChange={(e) => setSemanas(e.target.value)}
              className="h-10 rounded-lg border border-border bg-bg px-3 text-[13.5px] outline-none focus:border-accent" />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-text-muted">
            <input type="checkbox" checked={declararMacros} onChange={(e) => setDeclararMacros(e.target.checked)} className="w-4 h-4 accent-accent" />
            Declarar lo que comés actualmente (mejora la referencia si no hay un plan previo)
          </label>
          {declararMacros && (
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] text-text-muted">Proteína (g/día)</span>
                <input type="number" value={proteinaDeclarada} onChange={(e) => setProteinaDeclarada(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-bg px-2 text-[12.5px] outline-none focus:border-accent" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] text-text-muted">Grasa (g/día)</span>
                <input type="number" value={grasaDeclarada} onChange={(e) => setGrasaDeclarada(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-bg px-2 text-[12.5px] outline-none focus:border-accent" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] text-text-muted">Carbohidratos (g/día)</span>
                <input type="number" value={carbosDeclarados} onChange={(e) => setCarbosDeclarados(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-bg px-2 text-[12.5px] outline-none focus:border-accent" />
              </label>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-2.5">
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-text">
              <input type="checkbox" checked={modoObjetivoActivo} onChange={(e) => setModoObjetivoActivo(e.target.checked)} className="w-4 h-4 accent-accent" />
              Modo objetivo (déficit calculado para perder grasa en un plazo)
            </label>
            {modoObjetivoActivo && (
              <>
                <p className="text-[11.5px] text-text-faint -mt-1">
                  Necesita tu fecha de nacimiento y altura cargadas (se usan para el semáforo de realismo).
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10.5px] text-text-muted">Grasa a perder (kg)</span>
                    <input type="number" step="0.1" value={kgAPerder} onChange={(e) => setKgAPerder(e.target.value)}
                      className="h-9 rounded-lg border border-border bg-bg px-2 text-[12.5px] outline-none focus:border-accent" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10.5px] text-text-muted">% graso actual (opcional)</span>
                    <input type="number" step="0.1" value={pctGrasaInicial} onChange={(e) => setPctGrasaInicial(e.target.value)}
                      className="h-9 rounded-lg border border-border bg-bg px-2 text-[12.5px] outline-none focus:border-accent" />
                  </label>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <div className="flex gap-2">
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="flex-1 h-10 rounded-lg border border-border text-text-muted text-[13.5px] font-semibold">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={enviando} className="flex-1 h-10 rounded-lg bg-accent text-accent-fg text-[13.5px] font-semibold disabled:opacity-60">
          {enviando ? 'Calculando…' : 'Calcular plan'}
        </button>
      </div>
    </form>
  );
}
