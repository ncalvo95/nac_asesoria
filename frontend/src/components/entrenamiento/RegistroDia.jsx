import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { useArrastreOrden } from '../../hooks/useArrastreOrden.js';
import { formatearMusculo } from '../../utils/musculo.js';
import TemporizadorDescanso from '../TemporizadorDescanso.jsx';
import { CampoNumerico, BotonRIR, BotonSerieHecha, EncabezadoRIR, TextoLeyendaRIR } from '../ControlesSerie.jsx';
import { useTemporizadorDescanso } from '../../hooks/useTemporizadorDescanso.js';
import { explicarObjetivo } from '@shared/training/objetivoMotivo.js';
import { detectarRecords } from '@shared/training/e1rm.js';
import HistorialEjercicio from '../HistorialEjercicio.jsx';
import { leerBorrador, guardarBorrador, borrarBorrador, repsEfectivas, formatearFechaHora, resumenMuscularPorMusculo, colorVsPactadoLive, colorClaseInput, construirSeriesPorDefecto, construirEstadoInicial, mezclarSesionEnBase, aplicarBorradorEnBase, calcularSugerenciaReps } from '../../utils/entrenamiento.js';
import { AgregarEjercicioDia } from './AgregarEjercicioDia.jsx';
import { ResumenMuscularSesion } from './ResumenMuscular.jsx';
import { EjercicioAcciones } from './EjercicioAcciones.jsx';
import { ComentarioRecordatorio } from './Comentarios.jsx';

// Paso del boton +/- del peso. Es el incremento de fabrica del motor de
// progresion; no se lee de la config porque aca solo es un atajo de tipeo
// (el valor siempre se puede escribir a mano).
export const PASO_KG = 2.5;

// Columnas de cada fila de serie: S | KG | REPS | RIR | (RE desde pantallas
// anchas) | HECHA. Clases completas a proposito: Tailwind no detecta las que
// se arman concatenando.
export const COLUMNAS_SERIE =
  'grid-cols-[18px_minmax(0,1fr)_minmax(0,1fr)_32px_34px] sm:grid-cols-[18px_minmax(0,1fr)_minmax(0,1fr)_32px_28px_34px]';

export function RegistroDia({ dia, microciclo, usuario, actorRol, progreso, onGuardado, onRutinaCambiada, todosMusculos, diasHermanos, semanaActual, coloreadoActivo }) {
  const borradorKey = `nac_borrador_dia_${dia.id}_${microciclo.id}`;
  const [series, setSeries] = useState(() => {
    const base = construirEstadoInicial(dia);

    // Si esta semana ya se registro (no salteada) una sesion de este dia,
    // precargar el formulario con lo que REALMENTE se guardo - antes, al
    // guardar con exito se borraba el borrador local (mas abajo) pero el
    // formulario nunca volvia a leer la sesion ya guardada, asi que
    // reabrir un dia ya registrado mostraba todo en blanco (peso/reps en
    // gris, como si nunca se hubiera tipeado nada) y el RIR vuelto a su
    // default (1) - el registro en si seguia intacto en la base, solo la
    // vista no lo reflejaba. dia.sesion_actual ya trae las series (ver
    // registroDeSemana en rutinaService.js).
    //
    // Si esta semana TODAVIA no tiene nada propio y es la semana 2, se
    // precarga en cambio con lo que se registro en la semana 1 de este
    // mismo microciclo - las dos semanas de un microciclo entrenan al
    // MISMO peso/piso pactado (ver techoDesde en progressionEngine.js,
    // que compara semana 1 vs semana 2 al cerrar el bloque), asi que la
    // semana 2 es literalmente un intento de igualar o mejorar la semana
    // 1, no una rutina en blanco - pedir tipear ejercicio por ejercicio,
    // serie por serie, peso, reps y RIR de nuevo desde cero no tenia
    // sentido cuando ya se habia cargado exactamente eso 7 dias antes.
    // El coloreado en vivo (colorVsPactadoLive) sigue comparando contra
    // lo pactado (peso_actual/piso_reps), nunca contra estos valores
    // precargados, asi que superarlos o igualarlos sigue siendo "mejorar"
    // o "mantenerse" en los terminos del plan original - no un objetivo
    // nuevo inventado a partir de la semana 1.
    const registroBase = (dia.sesion_actual && !dia.sesion_actual.salteada)
      ? dia.sesion_actual
      : (semanaActual === 2 && dia.registros_semana?.[1] && !dia.registros_semana[1].salteada
        ? dia.registros_semana[1]
        : null);
    if (registroBase) mezclarSesionEnBase(base, registroBase, undefined, registroBase === dia.sesion_actual);

    // Ejercicios con el progreso automático apagado (ver toggle "Progreso
    // automático" en el menú "⋯") al abrir un microciclo NUEVO sin nada
    // propio tipeado todavía (registroBase es null - ni sesión de esta
    // semana ni precarga de semana 1): a diferencia del resto, que arranca
    // en blanco con solo el piso/peso como sugerencia gris, uno "congelado"
    // no tiene ningún cambio de plan real que justifique volver a tipear
    // todo de cero - sigue literalmente donde había quedado la última vez
    // (peso, reps y RIR incluidos), mismo criterio que ya usa la precarga
    // de semana 2 dentro del mismo microciclo, pero cruzando el límite de
    // microciclo. dia.ultima_sesion_microciclo_anterior ya viene filtrada a
    // la última semana real (no salteada) del bloque anterior.
    if (!registroBase && dia.ultima_sesion_microciclo_anterior) {
      const ejerciciosCongelados = new Set(dia.ejercicios.filter((ej) => !ej.progreso_automatico).map((ej) => ej.id));
      if (ejerciciosCongelados.size > 0) {
        mezclarSesionEnBase(base, dia.ultima_sesion_microciclo_anterior, ejerciciosCongelados);
      }
    }

    // Borrador del backend (dia.borrador_registro, empujado desde
    // CUALQUIER dispositivo via el boton "Guardar borrador" - ver
    // guardarBorradorDia en progressionEngine.js) primero, y el de
    // localStorage de este mismo dispositivo encima - si hay tipeo local
    // mas reciente que todavia no se empujo, gana ese (mismo criterio que
    // el borrador de Semana 0).
    if (dia.borrador_registro) aplicarBorradorEnBase(base, dia.borrador_registro);
    aplicarBorradorEnBase(base, leerBorrador(borradorKey) || {});
    return base;
  });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [modoExpress, setModoExpress] = useState(false);
  // Confirmacion antes de pisar datos ya tipeados (ver mas abajo) - null
  // cuando no hay ningun cambio de modo esperando confirmacion.
  const [confirmarCambioModo, setConfirmarCambioModo] = useState(null); // 'activar' | 'desactivar' | null
  const [guardandoBorrador, setGuardandoBorrador] = useState(false);
  const [borradorGuardado, setBorradorGuardado] = useState(false);
  const temporizador = useTemporizadorDescanso();
  // Mejor 1RM estimado historico por ejercicio (sin la sesion de hoy ya
  // guardada, para que sus propios records no desaparezcan al reabrirla).
  const [recordsPrevios, setRecordsPrevios] = useState(null);
  const sesionGuardadaId = dia.sesion_actual?.id ?? null;
  useEffect(() => {
    let vigente = true;
    const q = sesionGuardadaId != null ? `?excluir_sesion_id=${sesionGuardadaId}` : '';
    api.get(`/usuarios/${usuario.id}/records${q}`).then((r) => { if (vigente) setRecordsPrevios(r); }).catch(() => {});
    return () => { vigente = false; };
  }, [usuario.id, sesionGuardadaId]);
  const [leyendaRirAbierta, setLeyendaRirAbierta] = useState(false);
  // "ejercicio:serie" de la fila a la que le faltaba peso/reps al tildarla -
  // se resalta un instante para que se vea cual es sin mostrar un cartel.
  const [filaIncompleta, setFilaIncompleta] = useState(null);
  useEffect(() => {
    if (!filaIncompleta) return undefined;
    const id = setTimeout(() => setFilaIncompleta(null), 1800);
    return () => clearTimeout(id);
  }, [filaIncompleta]);

  // Cuantas series tenia cada ejercicio al abrir esta pantalla - se
  // captura una sola vez (el inicializador de useState no vuelve a correr
  // aunque dia.ejercicios cambie de prop despues, ej. al tocar "+1 serie",
  // que refetchea la rutina) para poder distinguir mas adelante una serie
  // recien agregada AHORA (sin referencia previa) de una que ya estaba.
  const [seriesPactadasAlAbrir] = useState(() => {
    const map = {};
    for (const ej of dia.ejercicios) map[ej.id] = ej.series_actuales;
    return map;
  });

  // No persistir el valor de "series" tal cual queda al MONTAR: en ese
  // momento ya puede traer datos reales sin que el usuario haya tocado
  // nada -precarga de semana 1 en semana 2 (ver arriba), sesion ya
  // registrada, borrador remoto recien mezclado- y guardarlos de nuevo en
  // localStorage los disfraza de "tipeo local de este dispositivo". Bug
  // real que esto arregla: si el celular editaba algo y tocaba "Guardar
  // borrador", al abrir la PC (que nunca habia tipeado nada, solo tenia
  // la precarga de semana 1) el merge de borradores aplicaba primero el
  // remoto -con el cambio del celular- pero DESPUES el local de la PC,
  // que ya habia guardado en su propio localStorage la precarga sin
  // editar apenas montó - y esa carga local, al tener datos "reales" (no
  // vacios), pisaba el cambio recien traido del celular.
  //
  // Comparar por REFERENCIA contra el valor capturado al renderizar por
  // primera vez (en vez de "saltear solo la primera vez que corre el
  // efecto") es a proposito: en desarrollo, StrictMode invoca los efectos
  // de montaje dos veces, así que un contador/flag de "primera vez" ya se
  // gasta en esa primera invocación fantasma y el efecto persiste igual
  // en la segunda. `series` solo cambia de referencia cuando de verdad
  // hay un `setSeries` con datos distintos (los efectos de reconciliacion
  // de abajo devuelven la misma referencia si no hubo cambio real), asi
  // que esta comparacion es inmune a cuantas veces se invoque el efecto.
  const seriesInicialRef = useRef(series);
  useEffect(() => {
    if (series === seriesInicialRef.current) return;
    guardarBorrador(borradorKey, series);
  }, [borradorKey, series]);
  // El aviso "borrador guardado" es solo para el instante despues de
  // tocar el boton - si se sigue tipeando despues, deja de ser cierto.
  useEffect(() => { setBorradorGuardado(false); }, [series]);

  // Empuja lo tipeado hasta ahora (peso/reps/RIR/dropset) al backend, sin
  // registrar la sesion - para que se vea desde otro dispositivo (ej.
  // cargar la rutina en la compu en casa y despues abrirla en el celular
  // en el gimnasio). Antes esto solo vivia en localStorage de este mismo
  // dispositivo/navegador, asi que un DropSet tildado (o cualquier peso/
  // reps ya tipeado) no se veia del otro lado hasta recien registrar la
  // sesion entera.
  // Se muestra junto al boton "Guardar borrador" (ver mas abajo) para que
  // quede claro, con solo mirar la pantalla, si lo tipeado en OTRO
  // dispositivo (o antes de actualizar la app) llego de verdad al backend -
  // en vez de tener que confiar a ciegas en que el guardado "funciono".
  // Arranca con lo que ya traia el dia (dia.borrador_actualizado_en, del
  // ultimo guardado de cualquier dispositivo) y se actualiza local apenas
  // este mismo guardado tiene éxito, sin esperar el proximo refetch.
  const [ultimoBorradorGuardado, setUltimoBorradorGuardado] = useState(dia.borrador_actualizado_en);

  async function guardarBorradorRemoto() {
    setError('');
    setGuardandoBorrador(true);
    setBorradorGuardado(false);
    try {
      await api.put(`/dias/${dia.id}/borrador`, { microciclo_id: microciclo.id, valores: series });
      setBorradorGuardado(true);
      setUltimoBorradorGuardado(new Date().toISOString());
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoBorrador(false);
    }
  }

  // true si hay algun peso/reps ya tipeado en el dia actual (series reales,
  // no dropset) - para no pisarlo sin avisar al activar/desactivar el modo
  // express (bug real: antes esto pisaba el progreso ya cargado sin
  // preguntar nada, incluso si ya se habian tipeado series reales de hoy).
  function hayDatosTipeados() {
    return dia.ejercicios.some((ej) => (series[ej.id] || []).some((s) => s.peso !== '' || s.reps !== '' || s.rir !== 1));
  }

  // Rutina Express: para cuando hay tiempo de ir al gimnasio pero no de
  // hacer el dia entero como esta planeado. No es una rutina aparte ni se
  // persiste en ningun lado -solo reescribe el estado local "series" de
  // este dia, como si el usuario hubiera tipeado todo esto a mano- asi que
  // no hace falta borrarla despues: si se registra la sesion, queda como
  // una sesion mas (igual que cualquier otra); si se abandona sin
  // registrar, es un borrador mas que se pisa la proxima vez que se entra.
  // Por ejercicio: 2 series reales al mismo peso que ya tenia (la 1ra con
  // el objetivo de reps de siempre, la 2da libre - sin reps fijadas) + 1
  // dropset a la mitad de ese peso. El descanso de 60s entre series 1 y 2
  // es solo una indicacion en el cartel de abajo, no se persiste (asi la
  // proxima semana el dia vuelve a su descanso normal sin tocar nada).
  function activarModoExpress() {
    if (hayDatosTipeados()) {
      setConfirmarCambioModo('activar');
      return;
    }
    aplicarModoExpress();
  }

  function aplicarModoExpress() {
    setSeries((prev) => {
      const copia = { ...prev };
      for (const ej of dia.ejercicios) {
        const peso = ej.peso_actual != null ? String(ej.peso_actual) : '';
        const pesoDropset = ej.peso_actual != null ? String(Math.round(ej.peso_actual) / 2) : '';
        copia[ej.id] = [
          { peso, reps: ej.piso_reps != null ? String(ej.piso_reps) : '', rir: 1, esDropset: false },
          { peso, reps: '', rir: 1, esDropset: false },
          { peso: pesoDropset, reps: '', rir: 1, esDropset: true },
        ];
      }
      return copia;
    });
    setModoExpress(true);
    setConfirmarCambioModo(null);
  }

  function desactivarModoExpress() {
    if (hayDatosTipeados()) {
      setConfirmarCambioModo('desactivar');
      return;
    }
    aplicarDesactivarModoExpress();
  }

  function aplicarDesactivarModoExpress() {
    setSeries(construirEstadoInicial(dia));
    setModoExpress(false);
    setConfirmarCambioModo(null);
  }

  // Como el guardado/agregado/reordenado ya no fuerza un remount de este
  // componente (ver onRutinaCambiada en EntrenamientoPage - antes recargaba
  // la pagina entera y reseteaba el dia seleccionado), "series" puede no
  // tener todavia una entrada para un ejercicio agregado despues del mount
  // (o al revés, seguir teniendo una de uno ya quitado) - se completa acá,
  // por render, sin pisar lo que el usuario ya tipeo para los que si existen.
  const seriesPorEjercicio = useMemo(() => {
    const map = {};
    for (const ej of dia.ejercicios) map[ej.id] = series[ej.id] ?? construirSeriesPorDefecto(ej);
    return map;
  }, [series, dia.ejercicios]);

  // Resumen en vivo (se recalcula con cada tecleo, igual que el coloreado)
  // de series directas y reps efectivas por musculo - comparado contra la
  // MISMA semana del microciclo anterior (ver comparacion_microciclo_anterior
  // en rutinaService.js), no contra el acumulado del bloque completo.
  const resumenMuscular = useMemo(
    () => resumenMuscularPorMusculo(dia, (ej) => seriesPorEjercicio[ej.id] ?? []),
    [dia, seriesPorEjercicio]
  );
  const semanaComparacionKey = semanaActual === 2 ? 'semana2' : 'semana1';
  const comparacionMicrocicloAnterior = dia.comparacion_microciclo_anterior?.[semanaComparacionKey] ?? null;

  // AjusteSeries (el +/- de "Series") cambia series_actuales en el backend y
  // refetchea la rutina, pero "series" ya tenia una entrada para ese
  // ejercicio desde el mount - sin esto, seriesPorEjercicio de arriba nunca
  // volvia a mirar series_actuales (el "??" no dispara con un array ya
  // existente) y la fila nueva/quitada no aparecia hasta recargar la pagina
  // entera. Agrega o saca filas reales al final (nunca toca las de dropset)
  // preservando lo que el usuario ya tipeo en las que quedan.
  const seriesActualesKey = dia.ejercicios.map((e) => `${e.id}:${e.series_actuales}`).join(',');
  useEffect(() => {
    setSeries((prev) => {
      let cambio = false;
      const copia = { ...prev };
      for (const ej of dia.ejercicios) {
        const actual = copia[ej.id];
        if (!actual) continue;
        const reales = actual.filter((s) => !s.esDropset);
        const dropsets = actual.filter((s) => s.esDropset);
        if (reales.length === ej.series_actuales) continue;
        cambio = true;
        const nuevasReales = reales.length < ej.series_actuales
          ? [...reales, ...Array.from({ length: ej.series_actuales - reales.length }, () => ({ peso: '', reps: '', rir: 1, esDropset: false }))]
          : reales.slice(0, ej.series_actuales);
        copia[ej.id] = [...nuevasReales, ...dropsets];
      }
      return cambio ? copia : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesActualesKey]);

  // Sustituir un ejercicio ("Cambiar ejercicio") cambia su ejercicio_id y le
  // fija un peso/piso de reps nuevos (via una serie de referencia que se
  // carga en un modal aparte, no en estos inputs) - pero mantiene el MISMO
  // ejercicio_asignado_id (mismo puesto en la rutina). Sin este reset, lo
  // que ya estuviera tipeado en "series" para ese id -del ejercicio VIEJO,
  // antes de sustituirlo- seguia mostrandose (y coloreandose contra el
  // peso/piso del ejercicio NUEVO), mezclando datos de dos ejercicios
  // distintos bajo el mismo casillero.
  const ejercicioIdKey = dia.ejercicios.map((e) => `${e.id}:${e.ejercicio_id}`).join(',');
  const ejercicioIdPrevioRef = useRef(ejercicioIdKey);
  useEffect(() => {
    const anteriores = Object.fromEntries(
      ejercicioIdPrevioRef.current.split(',').filter(Boolean).map((par) => par.split(':'))
    );
    ejercicioIdPrevioRef.current = ejercicioIdKey;
    const sustituidos = dia.ejercicios.filter(
      (ej) => anteriores[ej.id] != null && anteriores[ej.id] !== String(ej.ejercicio_id)
    );
    if (sustituidos.length === 0) return;
    setSeries((prev) => {
      const copia = { ...prev };
      for (const ej of sustituidos) copia[ej.id] = construirSeriesPorDefecto(ej);
      return copia;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ejercicioIdKey]);

  const notasPorEjercicio = useMemo(() => {
    const map = new Map();
    for (const e of progreso?.ejercicios ?? []) map.set(e.id, e);
    return map;
  }, [progreso]);

  function actualizarSerie(ejercicioId, idx, campo, valor) {
    setSeries((prev) => {
      const actual = prev[ejercicioId] ?? seriesPorEjercicio[ejercicioId];
      const copia = { ...prev, [ejercicioId]: [...actual] };
      copia[ejercicioId][idx] = { ...copia[ejercicioId][idx], [campo]: valor };
      return copia;
    });
  }

  // Tilde de "serie hecha": si faltaba peso o reps, los completa con la
  // sugerencia gris (el mismo criterio que "Autocompletar"), asi con un solo
  // toque queda cargada tal cual estaba prevista; y al tildarla arranca el
  // descanso del ejercicio. Destildar solo desmarca (no frena un descanso en
  // curso: se saltea desde la barra).
  function alternarSerieHecha(ej, idx) {
    const filas = seriesPorEjercicio[ej.id];
    const fila = filas[idx];
    if (fila.hecha) {
      actualizarSerie(ej.id, idx, 'hecha', false);
      return;
    }
    const peso = fila.peso !== '' ? fila.peso : (!fila.esDropset && ej.peso_actual != null ? String(ej.peso_actual) : '');
    const reps = fila.reps !== '' ? fila.reps : (calcularSugerenciaReps(ej, filas, idx) ?? '');
    if (peso === '' || reps === '') {
      setFilaIncompleta(`${ej.id}:${idx}`);
      return;
    }
    setSeries((prev) => {
      const actual = prev[ej.id] ?? seriesPorEjercicio[ej.id];
      const copia = { ...prev, [ej.id]: [...actual] };
      copia[ej.id][idx] = { ...copia[ej.id][idx], peso, reps, hecha: true };
      return copia;
    });
    const esUltimaDelDia = ej.id === ejerciciosMostrados[ejerciciosMostrados.length - 1]?.id && idx === filas.length - 1;
    if (esUltimaDelDia) {
      // Ultima serie del dia: no queda nada para lo que descansar.
      temporizador.saltar();
    } else if (!fila.esDropset && !filas[idx + 1]?.esDropset) {
      temporizador.iniciar(
        modoExpress ? 60 : (ej.descanso_segundos ?? 90),
        `${ej.ejercicio_nombre} · serie ${idx + 1}`
      );
    }
  }

  // Completa el peso de referencia (el mismo que ya se ve como placeholder
  // gris) y la baja de reps esperada en cada serie, para no tener que
  // tipearlos serie por serie. Solo llena lo que todavia esta VACIO - si ya
  // tipeaste un peso distinto al de base en alguna serie, se respeta (no se
  // pisa), y las reps sugeridas para las filas vacias se calculan en
  // relacion a lo que haya en cada fila (tipeado o de base), con la misma
  // logica que ya usa el placeholder gris en vivo (calcularSugerenciaReps) -
  // no siempre contra el peso de base si vos ya cambiaste algo.
  function autocompletarReferencia(ejercicioId) {
    setSeries((prev) => {
      const ej = dia.ejercicios.find((e) => e.id === ejercicioId);
      const actuales = prev[ejercicioId] ?? seriesPorEjercicio[ejercicioId];
      if (!ej || ej.peso_actual == null || !actuales) return prev;
      const pesoRef = String(ej.peso_actual);
      const conPeso = actuales.map((s) => (s.esDropset || s.peso !== '' ? s : { ...s, peso: pesoRef }));
      const conReps = conPeso.map((s, idx) => (
        s.esDropset || s.reps !== '' ? s : { ...s, reps: calcularSugerenciaReps(ej, conPeso, idx) ?? '' }
      ));
      return { ...prev, [ejercicioId]: conReps };
    });
  }

  // Agrega/quita una serie extra de dropset al final del ejercicio. El peso
  // arranca en la mitad de la ultima serie real cargada (o del peso base si
  // todavia no se cargo nada), redondeado a 0.5kg - el usuario lo puede
  // cambiar igual. No se recalcula si ya esta activa (toggle apaga/prende).
  function toggleDropset(ejercicioId) {
    setSeries((prev) => {
      const actuales = prev[ejercicioId] ?? seriesPorEjercicio[ejercicioId];
      if (actuales.some((s) => s.esDropset)) {
        return { ...prev, [ejercicioId]: actuales.filter((s) => !s.esDropset) };
      }
      const ej = dia.ejercicios.find((e) => e.id === ejercicioId);
      const ultimaReal = [...actuales].reverse().find((s) => s.peso !== '');
      const pesoBase = ultimaReal ? Number(ultimaReal.peso) : ej?.peso_actual;
      const pesoDropset = Number.isFinite(pesoBase) ? String(Math.round(pesoBase) / 2) : '';
      return { ...prev, [ejercicioId]: [...actuales, { peso: pesoDropset, reps: '', rir: 1, esDropset: true }] };
    });
  }

  async function guardarOrdenArrastre(ids) {
    const orden = ids.map((id, i) => ({ ejercicio_asignado_id: id, orden: i + 1 }));
    try {
      await api.patch(`/dias/${dia.id}/orden`, { orden });
      onRutinaCambiada();
    } catch (err) {
      setError(err.message);
    }
  }

  const { ordenArrastre, arrastrandoId, cardRefs, iniciarArrastre } = useArrastreOrden(
    dia.ejercicios.map((ej) => ej.id),
    guardarOrdenArrastre
  );

  const ejerciciosMostrados = ordenArrastre
    ? ordenArrastre.map((id) => dia.ejercicios.find((ej) => ej.id === id)).filter(Boolean)
    : dia.ejercicios;

  async function guardarSesion() {
    setError('');
    const payload = [];
    for (const ej of dia.ejercicios) {
      for (const [idx, s] of seriesPorEjercicio[ej.id].entries()) {
        if (s.peso === '' || s.reps === '') {
          const serie = s.esDropset ? 'la serie de dropset' : 'todas las series';
          setError(`Completá el peso y las reps de ${serie} de "${ej.ejercicio_nombre}".`);
          return;
        }
        payload.push({
          ejercicio_asignado_id: ej.id,
          numero_serie: idx + 1,
          peso: Number(s.peso),
          reps: Number(s.reps),
          rir: Number(s.rir),
          es_dropset: s.esDropset ? 1 : 0,
        });
      }
    }
    setEnviando(true);
    try {
      await api.post(`/usuarios/${usuario.id}/sesiones`, {
        dia_rutina_id: dia.id,
        microciclo_id: microciclo.id,
        series: payload,
      });
      borrarBorrador(borradorKey);
      setOk(true);
      onGuardado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function saltear() {
    setEnviando(true);
    try {
      await api.post(`/usuarios/${usuario.id}/sesiones`, {
        dia_rutina_id: dia.id,
        microciclo_id: microciclo.id,
        salteada: true,
      });
      borrarBorrador(borradorKey);
      setOk(true);
      onGuardado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {ok && (
        <div className="bg-success-bg text-success text-[13px] font-semibold rounded-lg px-3 py-2.5">
          Sesión guardada.
        </div>
      )}

      {!modoExpress && (
        <button
          type="button"
          onClick={activarModoExpress}
          className="self-start text-[12px] font-semibold text-accent underline underline-offset-2"
        >
          ⚡ Poco tiempo hoy — armar rutina express
        </button>
      )}
      {modoExpress && (
        <div className="bg-warning-bg text-warning text-[12.5px] rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap">
          <span>
            <strong>Modo express:</strong> 2 series al mismo peso de siempre (la 2da sin objetivo de reps fijo)
            + 1 dropset a mitad de peso. Descansá 60s entre la serie 1 y la 2.
          </span>
          <button type="button" onClick={desactivarModoExpress} className="font-semibold underline underline-offset-2 whitespace-nowrap">
            Volver a la rutina normal
          </button>
        </div>
      )}

      {confirmarCambioModo && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setConfirmarCambioModo(null)}
        >
          <div
            className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-bold">Ya tenés datos cargados hoy</h2>
            <p className="text-[13px] text-text-muted leading-relaxed">
              {confirmarCambioModo === 'activar'
                ? 'Armar la rutina express va a reemplazar el peso y las reps que ya tipeaste en este día. ¿Seguro que querés continuar?'
                : 'Volver a la rutina normal va a reemplazar el peso y las reps que ya tipeaste en este día. ¿Seguro que querés continuar?'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmarCambioModo(null)}
                className="flex-1 h-10 rounded-lg border border-border bg-bg text-text-muted text-[13px] font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => (confirmarCambioModo === 'activar' ? aplicarModoExpress() : aplicarDesactivarModoExpress())}
                className="flex-[2] h-10 rounded-lg border border-danger text-danger text-[13px] font-semibold"
              >
                Sí, reemplazar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start md:gap-4">
        {ejerciciosMostrados.map((ej) => {
          const nota = notasPorEjercicio.get(ej.id);
          const esUltimoDelMusculo = dia.ejercicios.filter(
            (e) => e.musculo_objetivo_id === ej.musculo_objetivo_id
          ).length === 1;
          const seriesReferencia = seriesPactadasAlAbrir[ej.id] ?? ej.series_actuales;
          const recordsEj = recordsPrevios && ej.variante_activa_id == null ? detectarRecords(seriesPorEjercicio[ej.id], recordsPrevios[ej.ejercicio_id]) : [];
          const filasRecord = new Set(recordsEj.map((r) => r.indice));
          const { pesoColor, repsColores } = coloreadoActivo
            ? colorVsPactadoLive(seriesPorEjercicio[ej.id], ej, seriesReferencia)
            : { pesoColor: null, repsColores: [] };
          return (
            <div
              key={ej.id}
              ref={(node) => { cardRefs.current[ej.id] = node; }}
              className={`bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-3 min-w-0 ${
                arrastrandoId === ej.id ? 'opacity-60 ring-2 ring-accent' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <span
                    onPointerDown={(e) => iniciarArrastre(e, ej.id)}
                    // -m-3 p-3 agranda el area de agarre real (toque/click)
                    // bastante mas alla del texto sin correr el layout
                    // visual -el padding infla la caja, el margen negativo
                    // la vuelve a acomodar en el mismo lugar-: antes el
                    // target era solo la altura de una linea de texto
                    // (~20px), muy chico para agarrar comodo con el dedo.
                    className="flex items-center gap-1.5 -m-3 p-3 cursor-grab active:cursor-grabbing select-none"
                    style={{ touchAction: 'none' }}
                    title="Mantené presionado para reordenar"
                  >
                    <span aria-hidden="true" className="text-[19px] leading-none text-text-faint">⠿</span>
                    <span className="text-[14.5px] font-semibold">{ej.ejercicio_nombre}</span>
                  </span>
                  <span className="text-[12px] text-text-faint whitespace-nowrap">
                    {ej.rango_reps_min}–{ej.rango_reps_max} reps · Descanso {ej.descanso_segundos}s
                    {seriesPorEjercicio[ej.id].some((s) => s.hecha) && (
                      <> · <span className="text-success font-semibold">
                        {seriesPorEjercicio[ej.id].filter((s) => s.hecha).length}/{seriesPorEjercicio[ej.id].length} hechas
                      </span></>
                    )}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[11px] font-semibold text-text-muted bg-bg border border-border rounded-md px-2 py-0.5 uppercase">
                    {formatearMusculo(ej.musculo_nombre)}
                  </span>
                  {ej.variante_activa_id != null && (
                    <span
                      title={`Variante de "${ej.titular_ejercicio_nombre}" solo para esta sesión - después vuelve sola al ejercicio titular`}
                      className="text-[10.5px] font-semibold text-accent bg-bg border border-accent rounded-md px-2 py-0.5 whitespace-nowrap"
                    >
                      Variante
                    </span>
                  )}
                  {!ej.progreso_automatico && (
                    <span
                      title="El peso, el techo de reps y las series de este ejercicio no se ajustan solos al cerrar el microciclo"
                      className="text-[10.5px] font-semibold text-text-faint bg-bg border border-border rounded-md px-2 py-0.5 whitespace-nowrap"
                    >
                      Progreso auto. OFF
                    </span>
                  )}
                  {nota && (
                    <span
                      className={`text-[11px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${
                        nota.mejoro ? 'bg-success-bg text-success' : nota.serie_agregada ? 'bg-warning-bg text-warning' : ''
                      }`}
                    >
                      {nota.mejoro ? 'Mejoró' : nota.serie_agregada ? '+1 serie' : ''}
                    </span>
                  )}
                </div>
              </div>

              {Boolean(ej.comentario_recordar && ej.comentario) && (
                <ComentarioRecordatorio comentario={ej.comentario} />
              )}

              {ej.variante_activa_id == null && (
                <MotivoObjetivo motivo={explicarObjetivo(ej, nota)} />
              )}

              <div className={`grid ${COLUMNAS_SERIE} gap-1.5 text-[10px] font-semibold text-text-faint tracking-wide px-0.5`}>
                <span className="text-center">S</span><span className="text-center">KG</span><span className="text-center">REPS</span>
                <EncabezadoRIR abierta={leyendaRirAbierta} onToggle={() => setLeyendaRirAbierta((v) => !v)} />
                <span title="Reps efectivas" className="hidden sm:block text-center">RE</span>
                <span className="text-center">HECHA</span>
              </div>
              {leyendaRirAbierta && <TextoLeyendaRIR />}
              {seriesPorEjercicio[ej.id].map((s, idx) => {
                const efectivas = repsEfectivas(s.reps, s.rir);
                const sugerenciaReps = calcularSugerenciaReps(ej, seriesPorEjercicio[ej.id], idx);
                const faltaDato = filaIncompleta === `${ej.id}:${idx}`;
                return (
                  <div
                    key={idx}
                    className={`grid ${COLUMNAS_SERIE} gap-1.5 items-center rounded-lg ${s.esDropset ? 'opacity-90' : ''} ${
                      faltaDato ? 'ring-2 ring-danger' : filasRecord.has(idx) ? 'ring-2 ring-success' : ''
                    }`}
                  >
                    <span className="tabular text-[11px] font-semibold text-text-muted text-center">
                      {s.esDropset ? 'DS' : idx + 1}
                    </span>
                    <CampoNumerico
                      value={s.peso}
                      placeholder={s.esDropset ? undefined : (ej.peso_actual != null ? String(ej.peso_actual) : undefined)}
                      onChange={(v) => actualizarSerie(ej.id, idx, 'peso', v)}
                      paso={PASO_KG}
                      decimal
                      etiqueta={`kg de la serie ${idx + 1}`}
                      claseBorde={!s.esDropset && s.peso !== '' && s.peso != null ? colorClaseInput(pesoColor) : 'border-border'}
                    />
                    <CampoNumerico
                      value={s.reps}
                      placeholder={sugerenciaReps}
                      onChange={(v) => actualizarSerie(ej.id, idx, 'reps', v)}
                      paso={1}
                      etiqueta={`reps de la serie ${idx + 1}`}
                      claseBorde={!s.esDropset ? colorClaseInput(repsColores[idx]) : 'border-border'}
                    />
                    <BotonRIR value={s.rir} onChange={(v) => actualizarSerie(ej.id, idx, 'rir', v)} />
                    <span title="Reps efectivas" className="hidden sm:block tabular text-[12.5px] text-text-faint text-center">{efectivas ?? '—'}</span>
                    <BotonSerieHecha hecha={Boolean(s.hecha)} numero={s.esDropset ? 'de dropset' : idx + 1} onClick={() => alternarSerieHecha(ej, idx)} />
                  </div>
                );
              })}
              <span className="tabular text-[11px] text-text-faint -mt-1">
                {seriesPorEjercicio[ej.id].filter((s) => !s.esDropset).reduce((acc, s) => acc + (repsEfectivas(s.reps, s.rir) || 0), 0)} reps efectivas en total
                {seriesPorEjercicio[ej.id].some((s) => s.esDropset) && (
                  <> · {seriesPorEjercicio[ej.id].filter((s) => s.esDropset).reduce((acc, s) => acc + (repsEfectivas(s.reps, s.rir) || 0), 0)} de dropset</>
                )}
              </span>

              {recordsEj.length > 0 && (() => {
                const mejor = recordsEj[recordsEj.length - 1];
                const fila = seriesPorEjercicio[ej.id][mejor.indice];
                return (
                  <div role="status" className="bg-success-bg text-success rounded-lg px-2.5 py-1.5 text-[12px] leading-snug">
                    <strong>🏆 ¡Nuevo récord!</strong> Serie {mejor.indice + 1}: {fila.peso} kg × {fila.reps} →
                    1RM estimado {mejor.valor} kg (tu mejor anterior: {mejor.anterior} kg).
                  </div>
                );
              })()}

              <HistorialEjercicio usuarioId={usuario.id} ejercicioId={ej.ejercicio_id} />

              <EjercicioAcciones
                ejercicio={ej}
                usuario={usuario}
                actorRol={actorRol}
                onCambiado={onRutinaCambiada}
                diasHermanos={diasHermanos}
                esUltimoDelMusculo={esUltimoDelMusculo}
                dropsetActivo={seriesPorEjercicio[ej.id].some((s) => s.esDropset)}
                onToggleDropset={() => toggleDropset(ej.id)}
                onAutocompletar={() => autocompletarReferencia(ej.id)}
                todosMusculos={todosMusculos}
              />
            </div>
          );
        })}

        <AgregarEjercicioDia diaRutinaId={dia.id} musculos={todosMusculos} onAgregado={onRutinaCambiada} />
      </div>

      <ResumenMuscularSesion
        resumen={resumenMuscular}
        comparacion={comparacionMicrocicloAnterior}
        microcicloAnteriorNumero={dia.comparacion_microciclo_anterior?.numero}
      />

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {ultimoBorradorGuardado && (
        <p className="text-[11.5px] text-text-faint -mb-1">
          Último borrador guardado: {formatearFechaHora(ultimoBorradorGuardado)}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={guardarBorradorRemoto}
          disabled={guardandoBorrador}
          className="h-11 px-3.5 rounded-[10px] border border-accent text-accent text-[13px] font-semibold disabled:opacity-60 whitespace-nowrap"
        >
          {guardandoBorrador ? 'Guardando…' : 'Guardar borrador'}
        </button>
        <button
          onClick={saltear}
          disabled={enviando}
          className="flex-1 h-11 rounded-[10px] border border-border bg-surface text-text-muted text-[13.5px] font-semibold disabled:opacity-60"
        >
          Saltear sesión
        </button>
        <button
          onClick={guardarSesion}
          disabled={enviando}
          className="flex-[2] h-11 rounded-[10px] bg-accent text-accent-fg text-[14.5px] font-semibold disabled:opacity-60"
        >
          {enviando ? 'Guardando…' : 'Registrar sesión'}
        </button>
      </div>
      {borradorGuardado && (
        <p className="text-[12.5px] text-text-muted text-center">
          Borrador guardado - ya lo podés ver desde otro dispositivo.
        </p>
      )}
      {/* Reserva el alto de la barra del descanso (fija abajo) para que no tape
          "Registrar sesion" al llegar al final de la pantalla. */}
      {temporizador.activo && <div aria-hidden="true" className="h-24 shrink-0" />}
      <TemporizadorDescanso temporizador={temporizador} />
    </>
  );
}

// Una linea con el "por que" del objetivo de hoy (ver explicarObjetivo en
// shared/training/objetivoMotivo.js); tocarla despliega el detalle.
export function MotivoObjetivo({ motivo }) {
  const [abierto, setAbierto] = useState(false);
  if (!motivo) return null;
  const CLASE = {
    sube: 'bg-success-bg text-success',
    baja: 'bg-warning-bg text-warning',
    serie: 'bg-warning-bg text-warning',
    igual: 'bg-bg border border-border text-text-muted',
    congelado: 'bg-bg border border-border text-text-faint',
    sin_datos: 'bg-bg border border-border text-text-faint',
  };
  return (
    <button
      type="button"
      onClick={() => setAbierto((v) => !v)}
      aria-expanded={abierto}
      className={`text-left rounded-lg px-2.5 py-1.5 text-[12px] leading-snug ${CLASE[motivo.tipo]}`}
    >
      <span className="font-semibold">Objetivo de hoy: {motivo.resumen}</span>
      <span aria-hidden="true" className="ml-1 opacity-70">{abierto ? '▴' : 'ⓘ'}</span>
      {abierto && <span className="block mt-1 font-normal">{motivo.detalle}</span>}
    </button>
  );
}
