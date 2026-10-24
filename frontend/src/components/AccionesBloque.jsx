import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { BannerPausa, OfertaAlVolver, FormularioPausa } from './PausaProgreso.jsx';

// "Programacion del bloque" (pantalla Rutinas): semana de testeo, semana de
// descarga y pausa del progreso. Carga por su cuenta la rutina activa del
// usuario y se recarga despues de cada accion.
export default function AccionesBloque({ usuarioId }) {
  const [rutina, setRutina] = useState(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(null);

  async function cargar() {
    try {
      setRutina(await api.get(`/usuarios/${usuarioId}/rutina`));
    } catch {
      setRutina(null);
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [usuarioId]);

  if (!rutina) return null;
  const actual = rutina.microciclos.find((m) => m.estado === 'en_curso');
  if (!actual) return null;

  const enNormal = actual.tipo === 'normal' && actual.numero >= 1;
  const pausada = Boolean(rutina.pausa);

  async function accion(clave, ruta, confirmacion) {
    if (!window.confirm(confirmacion)) return;
    setEnviando(clave);
    setError('');
    try {
      await api.post(`/rutinas/${rutina.id}/${ruta}`);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(null);
    }
  }

  const descripcionBloque = actual.tipo === 'testeo'
    ? 'Semana de testeo en curso'
    : actual.tipo === 'descarga'
      ? `Semana de descarga (bloque ${actual.numero})`
      : `Bloque ${actual.numero}${rutina.semana_actual ? ` · semana ${rutina.semana_actual} de 2` : ''}`;

  return (
    <section className="bg-surface border border-border rounded-[14px] p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-text-muted tracking-wide">PROGRAMACIÓN DEL BLOQUE</span>
        <span className="text-[12.5px] text-text-muted">{descripcionBloque}</span>
      </div>

      <BannerPausa rutina={rutina} onCambio={cargar} />
      <OfertaAlVolver rutina={rutina} onCambio={cargar} />

      {!pausada && (
        <div className="flex flex-col gap-3">
          <Fila
            titulo="Semana de testeo"
            texto="Convierte la semana en curso en una semana de testeo: cargás 2 series por ejercicio y la rutina se recalibra con esos pesos y reps. Lo anotado en este bloque no cuenta como progreso."
            nota={actual.tipo === 'testeo' ? 'Ya estás en una semana de testeo.' : actual.tipo === 'descarga' ? 'No se puede desde una semana de descarga.' : null}
          >
            <Boton
              deshabilitado={!enNormal || enviando != null}
              cargando={enviando === 'testeo'}
              onClick={() => accion('testeo', 'testeo', 'Esta semana pasa a ser una semana de testeo: vas a cargar 2 series por ejercicio y la rutina se recalibra con eso. ¿Confirmás?')}
            >
              Convertir en testeo
            </Boton>
          </Fila>

          <Fila
            titulo="Semana de descarga"
            texto="Una semana con menos peso y series para recuperarte; después retomás exactamente donde estabas."
            nota={actual.tipo === 'descarga' ? 'Ya estás en una semana de descarga.' : actual.tipo === 'testeo' ? 'No se puede desde una semana de testeo.' : null}
          >
            <Boton
              deshabilitado={!enNormal || enviando != null}
              cargando={enviando === 'deload'}
              onClick={() => accion('deload', 'deload', 'Esta semana se transforma en tu semana de descarga y no tiene marcha atrás. Después se retoma la rutina desde el último bloque completado. ¿Confirmás?')}
            >
              Marcar descarga
            </Boton>
          </Fila>

          <Fila
            titulo="Pausar el progreso"
            texto="Para vacaciones, un viaje, una lesión… Congela el bloque: no se puede anotar y esos días no cuentan, así el progreso no queda estancado ni sin marcar. Al volver tenés que reactivarlo."
          >
            <FormularioPausa rutina={rutina} onCambio={cargar} />
          </Fila>
        </div>
      )}

      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <p className="text-[11.5px] text-text-faint leading-relaxed">
        ¿Querés retestear un solo ejercicio? En <strong>Entrenamiento</strong>, tocá el menú ⋯ del ejercicio y elegí “Resetear pesos y reps”.
      </p>
    </section>
  );
}

function Fila({ titulo, texto, nota, children }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <span className="text-[13.5px] font-semibold">{titulo}</span>
      <p className="text-[12.5px] text-text-muted leading-relaxed">{texto}</p>
      {nota && <p className="text-[12px] text-text-faint">{nota}</p>}
      {children}
    </div>
  );
}

function Boton({ children, onClick, deshabilitado, cargando }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className="self-start h-9 px-3.5 rounded-[10px] border border-border bg-surface text-text-muted text-[13px] font-semibold disabled:opacity-50"
    >
      {cargando ? 'Aplicando…' : children}
    </button>
  );
}
