import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { formatearFechaCorta, hoyISO } from '../../utils/entrenamiento.js';

// Pasos diarios (podómetro/celular, cargados a mano) - un valor por día de
// calendario, independiente de si ese día tiene entrenamiento o es de
// descanso (de ahi el prop "fecha": la del dia que se esta viendo arriba,
// entrenamiento o descanso - nunca una fecha libre a elegir desde aca, ver
// registro_pasos en schema.sql). Insumo para la calculadora de calorias
// (nivel de actividad automatico, ver pasosRecientes en nutritionService.js).
export function PasosDiariosBoton({ usuarioId, fecha }) {
  const [abierto, setAbierto] = useState(false);
  const [historial, setHistorial] = useState(null);
  const [pasosPorDefecto, setPasosPorDefecto] = useState(null);
  const [pasos, setPasos] = useState('');
  const [defectoInput, setDefectoInput] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [guardandoDefecto, setGuardandoDefecto] = useState(false);

  // Se trae una sola vez al montar (no recien al abrir el panel) - asi el
  // boton ya puede mostrar "Pasos hoy: X" apenas carga la pantalla.
  useEffect(() => {
    api.get(`/usuarios/${usuarioId}/pasos`).then(({ historial: rows, pasos_por_defecto }) => {
      setHistorial(rows);
      setPasosPorDefecto(pasos_por_defecto);
      setDefectoInput(pasos_por_defecto != null ? String(pasos_por_defecto) : '');
    }).catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId]);

  // Si se carga un valor explicito para esta fecha, precargarlo al abrir o
  // al cambiar de dia (tab) - en blanco si no hay (el placeholder ya avisa
  // si hay un default que se usaria en su lugar).
  useEffect(() => {
    const existente = historial?.find((r) => r.fecha === fecha);
    setPasos(existente ? String(existente.pasos) : '');
    setError('');
  }, [fecha, historial]);

  async function guardar() {
    const valor = Number(pasos);
    if (pasos === '' || !Number.isInteger(valor) || valor < 0) {
      setError('Ingresá un número de pasos válido.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await api.put(`/usuarios/${usuarioId}/pasos/${fecha}`, { pasos: valor });
      setHistorial((prev) => [{ fecha, pasos: valor }, ...(prev || []).filter((r) => r.fecha !== fecha)]
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1)));
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function guardarDefecto() {
    const valor = defectoInput === '' ? null : Number(defectoInput);
    if (valor != null && (!Number.isInteger(valor) || valor < 0)) {
      setError('El valor por defecto debe ser un número válido.');
      return;
    }
    setGuardandoDefecto(true);
    setError('');
    try {
      await api.put(`/usuarios/${usuarioId}/pasos-por-defecto`, { pasos_por_defecto: valor });
      setPasosPorDefecto(valor);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoDefecto(false);
    }
  }

  const registroFecha = historial?.find((r) => r.fecha === fecha);
  const pasosEfectivos = registroFecha ? registroFecha.pasos : pasosPorDefecto;
  const etiquetaDia = fecha === hoyISO() ? 'hoy' : formatearFechaCorta(new Date(`${fecha}T00:00:00`));

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="self-start text-[11px] font-medium text-text-muted underline underline-offset-2 whitespace-nowrap"
      >
        {pasosEfectivos != null
          ? `Pasos ${etiquetaDia}: ${pasosEfectivos.toLocaleString('es-AR')}${!registroFecha ? ' (por defecto)' : ''}`
          : `Pasos ${etiquetaDia}`}
      </button>
      {abierto && (
        <div className="flex flex-col gap-2 bg-bg border border-border rounded-lg p-2.5 min-w-[230px]">
          <div className="flex items-center gap-2">
            <input
              type="number" inputMode="numeric" min="0" value={pasos}
              onChange={(e) => setPasos(e.target.value)}
              placeholder={pasosPorDefecto != null && !registroFecha ? String(pasosPorDefecto) : 'Pasos'}
              className="w-24 h-8 rounded-md border border-border bg-surface px-2 tabular text-[13px] outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={guardar}
              disabled={enviando}
              className="h-8 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold disabled:opacity-60"
            >
              {enviando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          {pasosPorDefecto != null && !registroFecha && (
            <span className="text-[10.5px] text-text-faint">Sin cargar - se usa el valor por defecto ({pasosPorDefecto}).</span>
          )}
          {error && <span className="text-[11px] text-danger">{error}</span>}

          {historial === null && <span className="text-[11px] text-text-faint">Cargando…</span>}
          {historial?.length > 0 && (
            <div className="flex flex-col gap-0.5 pt-1.5 border-t border-border">
              <span className="text-[10px] font-semibold text-text-faint uppercase tracking-wide">Últimos días cargados</span>
              {historial.slice(0, 7).map((r) => (
                <div key={r.fecha} className="flex items-center justify-between gap-2 text-[12px] px-1.5 py-1">
                  <span className="text-text-muted">{formatearFechaCorta(new Date(`${r.fecha}T00:00:00`))}</span>
                  <span className="tabular">{r.pasos.toLocaleString('es-AR')}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1.5 border-t border-border">
            <input
              type="number" inputMode="numeric" min="0" value={defectoInput}
              onChange={(e) => setDefectoInput(e.target.value)}
              placeholder="Por defecto"
              className="w-24 h-8 rounded-md border border-border bg-surface px-2 tabular text-[13px] outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={guardarDefecto}
              disabled={guardandoDefecto}
              className="h-8 px-3 rounded-md border border-border text-text-muted text-[12px] font-semibold disabled:opacity-60"
            >
              {guardandoDefecto ? 'Guardando…' : 'Aplicar a todos los días'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
