import { useMemo, useState } from 'react';
import AgregarDiaModal from '../AgregarDiaModal.jsx';
import QuitarDiaModal from '../QuitarDiaModal.jsx';
import CambiarDiaModal from '../CambiarDiaModal.jsx';
import MoverCopiarDiaModal from '../MoverCopiarDiaModal.jsx';
import EditarSemana0Modal from '../EditarSemana0Modal.jsx';
import { CAPITALIZAR, leerBorrador, guardarBorrador, duracionEstimadaDia, ORDEN_DIAS, elegirDiaInicial, fechaParaDia, formatearFechaCorta, sumarDiasFecha, hoyISO } from '../../utils/entrenamiento.js';
import { ResumenSemanaPasada } from './ResumenMuscular.jsx';
import { RegistroDia } from './RegistroDia.jsx';
import { ComentarioRecordatorio, ComentarioBoton } from './Comentarios.jsx';
import { PasosDiariosBoton } from './PasosDiariosBoton.jsx';
import { FaseNutricional } from './FaseNutricional.jsx';
import { ExportarExcel } from './ExportarExcel.jsx';

export function DiaEntrenamiento({ rutina, microciclo, usuario, actorRol, progreso, onGuardado, onRutinaCambiada, todosMusculos }) {
  const diasUnicos = useMemo(() => {
    const vistos = new Set();
    return rutina.dias.filter((d) => {
      if (vistos.has(d.dia_semana)) return false;
      vistos.add(d.dia_semana);
      return true;
    });
  }, [rutina]);

  const [diaId, setDiaId] = useState(() => elegirDiaInicial(diasUnicos) ?? rutina.dias[0].id);
  const dia = rutina.dias.find((d) => d.id === diaId) ?? rutina.dias[0];
  // Dia de descanso que se esta viendo (si hay uno) - null mientras se ve un
  // dia de entrenamiento normal. Se agrega para poder cargar pasos en un
  // dia sin entrenamiento, y para tener donde pararse si algun dia se
  // termina moviendo el entrenamiento a otro dia de la semana.
  const [descansoDiaSemana, setDescansoDiaSemana] = useState(null);
  // Todos los dias de la semana en orden real (lunes a domingo), cada uno
  // con su dia de entrenamiento si lo tiene o un marcador de descanso si no -
  // a diferencia de diasUnicos (que solo trae los dias CON entrenamiento,
  // en el orden en que estan guardados), esto arma la fila de tabs completa.
  const diasSemanaCompletos = useMemo(
    () => ORDEN_DIAS.map((ds) => diasUnicos.find((d) => d.dia_semana === ds) ?? { esDescanso: true, dia_semana: ds }),
    [diasUnicos]
  );
  const [mostrarAgregarDia, setMostrarAgregarDia] = useState(false);
  const [mostrarQuitarDia, setMostrarQuitarDia] = useState(false);
  const [mostrarCambiarDia, setMostrarCambiarDia] = useState(false);
  const [mostrarMoverCopiarDia, setMostrarMoverCopiarDia] = useState(false);
  const [mostrarEditarSemana0, setMostrarEditarSemana0] = useState(false);

  // rutina.semana_actual (1 o 2, ver obtenerRutinaActiva en rutinaService.js)
  // es null si no hay microciclo en curso de 2 semanas todavia (testeo). Cual
  // semana se esta VIENDO puede diferir de la actual: el usuario puede tocar
  // "Semana 1" desde la semana 2 para consultar como le fue, de solo lectura
  // - no cambia nada de lo que esta entrenando hoy.
  const [semanaVista, setSemanaVista] = useState(rutina.semana_actual ?? 1);
  const esSemanaActual = semanaVista === rutina.semana_actual;

  // Coloreado verde/rojo de peso y reps contra lo pactado (en vivo y en
  // semanas ya cerradas) - preferencia de este dispositivo, no del
  // usuario en el backend (mismo criterio que el tema claro/oscuro en
  // ThemeContext.jsx), asi que cada quien lo prende/apaga en su propia
  // PC/celular sin afectar al otro.
  const [coloreadoActivo, setColoreadoActivo] = useState(() => leerBorrador('nac_coloreado_activo') ?? true);
  function alternarColoreado() {
    setColoreadoActivo((prev) => {
      const nuevo = !prev;
      guardarBorrador('nac_coloreado_activo', nuevo);
      return nuevo;
    });
  }
  const fechaVista = rutina.semana_actual
    ? fechaParaDia(sumarDiasFecha(microciclo.fecha_inicio, semanaVista === 2 ? 7 : 0), descansoDiaSemana ?? dia.dia_semana)
    : null;
  // Fecha a la que van los pasos que se carguen desde esta pantalla - la del
  // dia que se esta viendo (entrenamiento o descanso), nunca una fecha
  // libre: si no hay microciclo en curso todavia (testeo), cae a la fecha
  // real de hoy.
  const fechaParaPasos = fechaVista ? fechaVista.toISOString().slice(0, 10) : hoyISO();

  return (
    <div className="flex flex-col gap-4 p-4 pb-6 md:max-w-5xl md:mx-auto">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[17px] font-bold">
              {descansoDiaSemana ? CAPITALIZAR(descansoDiaSemana) : CAPITALIZAR(dia.dia_semana)}
            </h1>
            {fechaVista && <span className="tabular text-[12px] text-text-faint">{formatearFechaCorta(fechaVista)}</span>}
            {!descansoDiaSemana && (
              <>
                <span className="tabular text-[12px] text-text-muted">Microciclo {microciclo.numero}</span>
                <span
                  className="tabular text-[12px] text-text-faint"
                  title="Estimado: 30s de trabajo por serie + el descanso entre series + 5 min de transición por ejercicio (cambiar de máquina, cargar/descargar)"
                >
                  ~{duracionEstimadaDia(dia)} min
                </span>
                <FaseNutricional rutinaId={rutina.id} faseActual={microciclo.fase_nutricional} onCambiada={onRutinaCambiada} />
                <button
                  type="button"
                  onClick={alternarColoreado}
                  title={coloreadoActivo ? 'Apagar el coloreado de peso/reps contra lo pactado' : 'Prender el coloreado de peso/reps contra lo pactado'}
                  className={`h-6 rounded-full border px-2.5 text-[11px] font-semibold ${
                    coloreadoActivo ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                  }`}
                >
                  Colores {coloreadoActivo ? 'ON' : 'OFF'}
                </button>
              </>
            )}
          </div>
          <ExportarExcel rutinaId={rutina.id} usuarioId={usuario.id} microciclos={rutina.microciclos} />
        </div>
        {rutina.semana_actual && (
          <div className="flex items-center gap-1.5 self-start">
            {[1, 2].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSemanaVista(n)}
                className={`px-2.5 h-7 rounded-md border text-[12px] font-semibold ${
                  n === semanaVista ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                }`}
              >
                Semana {n}{n === rutina.semana_actual ? ' · hoy' : ''}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {diasSemanaCompletos.map((d) => {
              if (d.esDescanso) {
                const fechaTab = rutina.semana_actual
                  ? fechaParaDia(sumarDiasFecha(microciclo.fecha_inicio, semanaVista === 2 ? 7 : 0), d.dia_semana)
                  : null;
                return (
                  <button
                    key={d.dia_semana}
                    type="button"
                    onClick={() => setDescansoDiaSemana(d.dia_semana)}
                    className={`flex flex-col items-center px-3 h-9 justify-center rounded-xl border text-[12.5px] font-semibold leading-tight ${
                      descansoDiaSemana === d.dia_semana ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border border-dashed text-text-faint'
                    }`}
                  >
                    {CAPITALIZAR(d.dia_semana)}
                    {fechaTab && <span className="text-[9.5px] font-normal opacity-80">{formatearFechaCorta(fechaTab)}</span>}
                  </button>
                );
              }
              const registroTab = d.registros_semana ? d.registros_semana[semanaVista] : d.sesion_actual;
              const fechaTab = rutina.semana_actual
                ? fechaParaDia(sumarDiasFecha(microciclo.fecha_inicio, semanaVista === 2 ? 7 : 0), d.dia_semana)
                : null;
              return (
              <button
                key={d.id}
                onClick={() => { setDescansoDiaSemana(null); setDiaId(d.id); }}
                className={`relative flex flex-col items-center px-3 h-9 justify-center rounded-xl border text-[12.5px] font-semibold leading-tight ${
                  !descansoDiaSemana && d.id === dia.id ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-border text-text-muted'
                }`}
              >
                {CAPITALIZAR(d.dia_semana)}
                {fechaTab && <span className="text-[9.5px] font-normal opacity-80">{formatearFechaCorta(fechaTab)}</span>}
                {registroTab && (
                  <span
                    title={registroTab.salteada ? `Salteado semana ${semanaVista}` : `Registrado semana ${semanaVista}`}
                    className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] leading-none text-white ${
                      registroTab.salteada ? 'bg-text-faint' : 'bg-success'
                    }`}
                  >
                    {registroTab.salteada ? '–' : '✓'}
                  </span>
                )}
              </button>
              );
            })}
            <button
              type="button"
              onClick={() => setMostrarAgregarDia(true)}
              className="px-3 h-8 rounded-full border border-dashed border-border text-[12.5px] font-semibold text-text-muted"
            >
              + Agregar día
            </button>
          </div>
          <div className="flex items-center gap-3">
            <PasosDiariosBoton usuarioId={usuario.id} fecha={fechaParaPasos} />
            {!descansoDiaSemana && (
              <>
                <ComentarioBoton
                  endpoint={`/dias/${dia.id}/comentario`}
                  comentarioActual={dia.comentario}
                  recordarActual={dia.comentario_recordar}
                  onGuardado={onRutinaCambiada}
                  etiqueta="Comentario del día"
                />
                <button
                  type="button"
                  onClick={() => setMostrarCambiarDia(true)}
                  className="text-[11.5px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap"
                >
                  Cambiar día
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarMoverCopiarDia(true)}
                  className="text-[11.5px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap"
                >
                  Intercambiar/copiar día
                </button>
                {microciclo.numero >= 1 && (
                  <button
                    type="button"
                    onClick={() => setMostrarEditarSemana0(true)}
                    className="text-[11.5px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap"
                  >
                    Editar Semana 0
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMostrarQuitarDia(true)}
                  className="text-[11.5px] font-medium text-danger underline underline-offset-2"
                >
                  Quitar {CAPITALIZAR(dia.dia_semana)}
                </button>
              </>
            )}
          </div>
        </div>
        {!descansoDiaSemana && Boolean(dia.comentario_recordar && dia.comentario) && (
          <ComentarioRecordatorio comentario={dia.comentario} />
        )}
      </div>

      {descansoDiaSemana && (
        <div className="bg-surface border border-border border-dashed rounded-2xl p-6 text-center">
          <p className="text-[14px] font-semibold text-text-muted">Día de descanso</p>
          <p className="text-[12.5px] text-text-faint mt-1">
            No hay entrenamiento asignado este día. Arriba podés cargar los pasos que caminaste.
          </p>
        </div>
      )}

      {/* key={dia.id} fuerza un remount limpio del estado de series al cambiar de dia */}
      {!descansoDiaSemana && (esSemanaActual ? (
        <RegistroDia
          key={dia.id}
          dia={dia}
          microciclo={microciclo}
          usuario={usuario}
          actorRol={actorRol}
          progreso={progreso}
          onGuardado={onGuardado}
          onRutinaCambiada={onRutinaCambiada}
          todosMusculos={todosMusculos}
          diasHermanos={diasUnicos.filter((d) => d.id !== dia.id)}
          semanaActual={rutina.semana_actual}
          coloreadoActivo={coloreadoActivo}
        />
      ) : (
        <ResumenSemanaPasada
          key={`${dia.id}-${semanaVista}`}
          dia={dia}
          numeroSemana={semanaVista}
          registro={dia.registros_semana?.[semanaVista] ?? null}
          coloreadoActivo={coloreadoActivo}
        />
      ))}

      {mostrarAgregarDia && (
        <AgregarDiaModal
          usuarioId={usuario.id}
          diasActivos={diasUnicos.map((d) => d.dia_semana)}
          onClose={() => setMostrarAgregarDia(false)}
          onCreado={() => { setMostrarAgregarDia(false); onRutinaCambiada(); }}
        />
      )}
      {mostrarQuitarDia && (
        <QuitarDiaModal
          diaRutinaId={dia.id}
          diaSemana={dia.dia_semana}
          onClose={() => setMostrarQuitarDia(false)}
          onQuitado={() => { setMostrarQuitarDia(false); onRutinaCambiada(); }}
        />
      )}
      {mostrarCambiarDia && (
        <CambiarDiaModal
          diaRutinaId={dia.id}
          diaSemanaActual={dia.dia_semana}
          diasActivos={diasUnicos.filter((d) => d.id !== dia.id).map((d) => d.dia_semana)}
          onClose={() => setMostrarCambiarDia(false)}
          onCambiado={() => { setMostrarCambiarDia(false); onRutinaCambiada(); }}
        />
      )}
      {mostrarMoverCopiarDia && (
        <MoverCopiarDiaModal
          diaRutinaId={dia.id}
          diaSemanaActual={dia.dia_semana}
          diasHermanos={diasUnicos.filter((d) => d.id !== dia.id)}
          onClose={() => setMostrarMoverCopiarDia(false)}
          onListo={() => { setMostrarMoverCopiarDia(false); onRutinaCambiada(); }}
        />
      )}
      {mostrarEditarSemana0 && (
        <EditarSemana0Modal
          rutinaId={rutina.id}
          onClose={() => setMostrarEditarSemana0(false)}
          onCorregido={() => { setMostrarEditarSemana0(false); onRutinaCambiada(); }}
        />
      )}
    </div>
  );
}
