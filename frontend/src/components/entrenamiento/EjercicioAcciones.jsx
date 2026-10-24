import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { formatearMusculo } from '../../utils/musculo.js';
import { CAPITALIZAR } from '../../utils/entrenamiento.js';
import { QuitarEjercicioBoton } from './QuitarEjercicioBoton.jsx';
import { VariantePanel } from './VariantePanel.jsx';
import { AjusteSeries, AjustePeso, AjustePisoReps, AjusteDescanso, AjusteMusculosSecundarios } from './AjustesEjercicio.jsx';
import { EditarNombreParticular, CorregirMusculoPrincipal, MoverCopiarEjercicio } from './EdicionEjercicio.jsx';
import { ComentarioBoton } from './Comentarios.jsx';
import { SustituirEjercicio } from './SustituirEjercicio.jsx';

export function EjercicioAcciones({ ejercicio, usuario, actorRol, onCambiado, diasHermanos, esUltimoDelMusculo, dropsetActivo, onToggleDropset, onAutocompletar, todosMusculos }) {
  const advertenciaQuitar = ejercicio.es_top_de_musculo || esUltimoDelMusculo
    ? `Este es el ejercicio ${ejercicio.es_top_de_musculo ? 'principal' : 'único'} de ${CAPITALIZAR(formatearMusculo(ejercicio.musculo_nombre))} en este día. ¿Seguro que querés quitarlo?`
    : null;
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [menuHaciaArriba, setMenuHaciaArriba] = useState(false);
  const panelRef = useRef(null);
  const [mostrarSustituir, setMostrarSustituir] = useState(false);
  const [mostrarVariante, setMostrarVariante] = useState(false);
  const [mostrarPeso, setMostrarPeso] = useState(false);
  const [mostrarPiso, setMostrarPiso] = useState(false);
  const [mostrarDescanso, setMostrarDescanso] = useState(false);
  const [mostrarMoverCopiar, setMostrarMoverCopiar] = useState(false);
  const [mostrarEditarNombre, setMostrarEditarNombre] = useState(false);
  const [mostrarMusculoPrincipal, setMostrarMusculoPrincipal] = useState(false);
  const [mostrarSecundarios, setMostrarSecundarios] = useState(false);
  const [error, setError] = useState('');
  const menuRef = useRef(null);

  // Cerrar el menú "⋯" al tocar afuera - las acciones que abre (Peso base,
  // Descanso, etc.) quedan visibles debajo de la tarjeta, así que un click
  // en cualquier otro lado de la pantalla debe cerrarlo primero.
  useEffect(() => {
    if (!menuAbierto) return;
    function onClickFuera(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuAbierto(false);
    }
    // Scrollear tambien lo cierra (no solo tocar afuera) - al ser
    // position:absolute, el menu no sigue a la tarjeta y queda flotando en
    // cualquier lado si no se cierra solo.
    function onScroll() {
      setMenuAbierto(false);
    }
    window.addEventListener('mousedown', onClickFuera);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('mousedown', onClickFuera);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [menuAbierto]);

  // Si el ejercicio está muy abajo en la pantalla, el menú (que siempre
  // arrancaba hacia abajo) se desbordaba fuera del viewport y quedaba
  // parcial o totalmente invisible. Se mide una vez, recién abierto,
  // y si no entra hacia abajo se lo abre hacia arriba en su lugar.
  useLayoutEffect(() => {
    if (!menuAbierto || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) setMenuHaciaArriba(true);
  }, [menuAbierto]);

  function abrir(setter) {
    setMenuAbierto(false);
    setter(true);
  }

  // Toggle inmediato (sin panel aparte, a diferencia de Peso base/Descanso):
  // es un solo booleano, no hace falta pedir ningun valor.
  const [cambiandoProgresoAuto, setCambiandoProgresoAuto] = useState(false);
  async function alternarProgresoAutomatico() {
    setMenuAbierto(false);
    setCambiandoProgresoAuto(true);
    setError('');
    try {
      await api.patch(`/ejercicios/${ejercicio.id}/progreso-automatico`, { activo: !ejercicio.progreso_automatico });
      onCambiado();
    } catch (err) {
      setError(err.message);
    } finally {
      setCambiandoProgresoAuto(false);
    }
  }

  // Retesteo de este ejercicio ("resetear pesos y reps"): lo deja en blanco para
  // medirlo de nuevo sin que cuente como progreso (ver retesteoService.js).
  const [cambiandoRetesteo, setCambiandoRetesteo] = useState(false);
  async function alternarRetesteo() {
    setMenuAbierto(false);
    const reseteando = !ejercicio.retesteo;
    const aviso = reseteando
      ? `Esto deja "${ejercicio.ejercicio_nombre}" en blanco para volver a medirlo. Lo que cargues desde ahora es tu nueva línea base: este bloque NO cuenta como progreso de este ejercicio, y al cerrarlo vas a ver si tu rendimiento subió o bajó respecto de antes. ¿Confirmás?`
      : `Se cancela el retesteo y "${ejercicio.ejercicio_nombre}" vuelve al peso y objetivo de antes. ¿Confirmás?`;
    if (!window.confirm(aviso)) return;
    setCambiandoRetesteo(true);
    setError('');
    try {
      if (reseteando) await api.post(`/ejercicios/${ejercicio.id}/retesteo`);
      else await api.del(`/ejercicios/${ejercicio.id}/retesteo`);
      onCambiado();
    } catch (err) {
      setError(err.message);
    } finally {
      setCambiandoRetesteo(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-border -mx-4 px-4">
      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-3 flex-wrap">
          <AjusteSeries ejercicioId={ejercicio.id} seriesActuales={ejercicio.series_actuales} onAjustado={onCambiado} onError={setError} />
          <label className="flex items-center gap-1.5 shrink-0 cursor-pointer" title="DropSet">
            <input
              type="checkbox"
              checked={dropsetActivo}
              onChange={onToggleDropset}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-[11px] font-semibold text-text-muted whitespace-nowrap">DS</span>
          </label>
          <button
            type="button"
            onClick={onAutocompletar}
            disabled={ejercicio.peso_actual == null}
            title="Cargar el peso y las reps de referencia en todas las series"
            className="text-[11px] font-semibold text-accent underline underline-offset-2 whitespace-nowrap disabled:opacity-40 disabled:no-underline"
          >
            Autocompletar
          </button>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => {
              setMenuHaciaArriba(false);
              setMenuAbierto((v) => !v);
            }}
            className="w-7 h-7 rounded-md border border-border bg-surface text-text-muted text-[15px] leading-none flex items-center justify-center"
            title="Más acciones"
          >
            ⋯
          </button>
          {menuAbierto && (
            <div
              ref={panelRef}
              className={`absolute right-0 z-20 w-48 max-h-[70vh] overflow-y-auto bg-surface border border-border rounded-lg shadow-lg py-1 flex flex-col ${menuHaciaArriba ? 'bottom-full mb-1' : 'top-full mt-1'}`}
            >
              <ComentarioBoton
                endpoint={`/ejercicios/${ejercicio.id}/comentario`}
                comentarioActual={ejercicio.comentario}
                recordarActual={ejercicio.comentario_recordar}
                onGuardado={onCambiado}
                variante="menu"
              />
              <button
                type="button"
                onClick={() => abrir(setMostrarSustituir)}
                className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
              >
                Cambiar ejercicio
              </button>
              <button
                type="button"
                onClick={() => abrir(setMostrarVariante)}
                title="Para cuando la maquina/el ejercicio de siempre no esta disponible: hacer otro que trabaje lo mismo, solo por esta sesión, sin perder el peso del titular ni el de la variante"
                className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
              >
                Agregar/elegir variante{ejercicio.variante_activa_id != null ? ' ✓' : ''}
              </button>
              <button
                type="button"
                onClick={() => abrir(setMostrarPeso)}
                className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
              >
                Peso base
              </button>
              {ejercicio.piso_reps != null && (
                <button
                  type="button"
                  onClick={() => abrir(setMostrarPiso)}
                  title="El objetivo sugerido en gris para la 1ra serie - ver Progreso para consultar el de microciclos anteriores"
                  className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
                >
                  Techo de reps
                </button>
              )}
              <button
                type="button"
                onClick={() => abrir(setMostrarDescanso)}
                className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
              >
                Descanso
              </button>
              <button
                type="button"
                onClick={() => abrir(setMostrarSecundarios)}
                className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
              >
                Músculos secundarios
              </button>
              <button
                type="button"
                onClick={alternarProgresoAutomatico}
                disabled={cambiandoProgresoAuto}
                title="Al cerrar el microciclo, el peso/techo de reps/series de este ejercicio se ajustan solos, salvo que lo apagues acá"
                className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg disabled:opacity-60"
              >
                {ejercicio.progreso_automatico ? 'Apagar progreso automático' : 'Prender progreso automático'}
              </button>
              {ejercicio.variante_activa_id == null && (
                <button
                  type="button"
                  onClick={alternarRetesteo}
                  disabled={cambiandoRetesteo}
                  title="Deja el ejercicio en blanco para volver a medirlo; ese bloque no cuenta como progreso y se muestra como subida o bajada de rendimiento"
                  className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg disabled:opacity-60"
                >
                  {ejercicio.retesteo ? 'Cancelar retesteo' : 'Resetear pesos y reps'}
                </button>
              )}
              {diasHermanos?.length > 0 && (
                <button
                  type="button"
                  onClick={() => abrir(setMostrarMoverCopiar)}
                  className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
                >
                  Mover/copiar
                </button>
              )}
              {ejercicio.patron_movimiento === 'personalizado' && (
                <button
                  type="button"
                  onClick={() => abrir(setMostrarEditarNombre)}
                  className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
                >
                  Editar nombre
                </button>
              )}
              {ejercicio.patron_movimiento === 'personalizado' && (actorRol === 'coach' || actorRol === 'admin') && (
                <button
                  type="button"
                  onClick={() => abrir(setMostrarMusculoPrincipal)}
                  title="Para cuando un alumno (o vos mismo) lo cargó bajo el músculo equivocado"
                  className="text-left px-3 py-2 text-[13px] text-text-muted hover:bg-bg"
                >
                  Corregir músculo principal
                </button>
              )}
              <div className="border-t border-border my-1" />
              <div className="px-3 py-1.5">
                <QuitarEjercicioBoton
                  ejercicioAsignadoId={ejercicio.id}
                  nombreEjercicio={ejercicio.ejercicio_nombre}
                  tieneSeries={Boolean(ejercicio.tiene_series)}
                  onQuitado={() => { setMenuAbierto(false); onCambiado(); }}
                  advertencia={advertenciaQuitar}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {mostrarPeso && (
        <div className="flex flex-col items-end gap-1">
          {ejercicio.variante_activa_id != null && (
            <span className="text-[11px] text-text-faint">Editando el peso de la variante activa, no el del titular</span>
          )}
          <AjustePeso
            ejercicioId={ejercicio.id}
            pesoActual={ejercicio.peso_actual}
            onAjustado={() => { setMostrarPeso(false); onCambiado(); }}
          />
        </div>
      )}
      {mostrarPiso && (
        <div className="flex flex-col items-end gap-1">
          {ejercicio.variante_activa_id != null && (
            <span className="text-[11px] text-text-faint">Editando el techo de la variante activa, no el del titular</span>
          )}
          <AjustePisoReps
            ejercicioId={ejercicio.id}
            pisoActual={ejercicio.piso_reps}
            onAjustado={() => { setMostrarPiso(false); onCambiado(); }}
          />
        </div>
      )}
      {mostrarDescanso && (
        <div className="flex justify-end">
          <AjusteDescanso
            ejercicioId={ejercicio.id}
            descansoSegundos={ejercicio.descanso_segundos}
            onAjustado={() => { setMostrarDescanso(false); onCambiado(); }}
          />
        </div>
      )}
      {mostrarSecundarios && (
        <div className="flex justify-end">
          <AjusteMusculosSecundarios
            ejercicio={ejercicio}
            todosMusculos={todosMusculos}
            onAjustado={() => { setMostrarSecundarios(false); onCambiado(); }}
          />
        </div>
      )}
      {mostrarMoverCopiar && (
        <div className="flex justify-end">
          <MoverCopiarEjercicio
            ejercicioId={ejercicio.id}
            ejercicioCatalogoId={ejercicio.ejercicio_id}
            diasHermanos={diasHermanos}
            onListo={() => { setMostrarMoverCopiar(false); onCambiado(); }}
            onError={setError}
          />
        </div>
      )}
      {mostrarEditarNombre && (
        <div className="flex justify-end">
          <EditarNombreParticular
            ejercicioId={ejercicio.id}
            nombreActual={ejercicio.ejercicio_nombre}
            onEditado={() => { setMostrarEditarNombre(false); onCambiado(); }}
          />
        </div>
      )}
      {mostrarMusculoPrincipal && (
        <div className="flex justify-end">
          <CorregirMusculoPrincipal
            ejercicioId={ejercicio.id}
            musculoActual={ejercicio.musculo_nombre}
            todosMusculos={todosMusculos}
            onCorregido={() => { setMostrarMusculoPrincipal(false); onCambiado(); }}
          />
        </div>
      )}

      {error && <span className="text-[11px] text-danger">{error}</span>}

      {mostrarSustituir && (
        <SustituirEjercicio
          ejercicio={ejercicio}
          usuario={usuario}
          onListo={() => { setMostrarSustituir(false); onCambiado(); }}
        />
      )}
      {mostrarVariante && (
        <VariantePanel
          ejercicio={ejercicio}
          onListo={() => { setMostrarVariante(false); onCambiado(); }}
          onError={setError}
        />
      )}
    </div>
  );
}
