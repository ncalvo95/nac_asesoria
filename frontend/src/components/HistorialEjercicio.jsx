import { useState } from 'react';
import { api } from '../api/client.js';
import GraficoLinea from './GraficoLinea.jsx';
import { fechaCorta } from '../utils/fechas.js';

const FILAS_TABLA = 5;

// Boton "Historial" de cada ejercicio: al abrirlo trae (una sola vez) la
// evolucion del ejercicio y la muestra como grafico del 1RM estimado por
// sesion + las ultimas sesiones en tabla (la tabla es tambien la version
// accesible del grafico). Los puntos que superaron todo lo anterior llevan
// anillo de "record".
export default function HistorialEjercicio({ usuarioId, ejercicioId }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  async function alternar() {
    const abrir = !abierto;
    setAbierto(abrir);
    if (abrir && !datos) {
      try {
        setDatos(await api.get(`/usuarios/${usuarioId}/ejercicios/${ejercicioId}/historial`));
      } catch (err) {
        setError(err.message);
      }
    }
  }

  const sesiones = datos?.sesiones.filter((s) => s.mejor_e1rm != null) ?? [];
  let mejorHastaAhora = 0;
  const puntos = sesiones.map((s) => {
    const record = mejorHastaAhora > 0 && s.mejor_e1rm > mejorHastaAhora;
    mejorHastaAhora = Math.max(mejorHastaAhora, s.mejor_e1rm);
    return {
      etiqueta: fechaCorta(s.fecha),
      valor: s.mejor_e1rm,
      detalle: s.mejor_serie ? `Mejor serie: ${s.mejor_serie.peso} kg × ${s.mejor_serie.reps}` : '',
      record,
    };
  });

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        className="self-start text-[12px] font-semibold text-accent underline underline-offset-2"
      >
        {abierto ? '▴ Ocultar historial' : '📈 Ver historial'}
      </button>
      {abierto && (
        <div className="bg-bg border border-border rounded-lg p-3 flex flex-col gap-2">
          {error && <span className="text-[12px] text-danger">{error}</span>}
          {!datos && !error && <span className="text-[12px] text-text-faint">Cargando…</span>}
          {datos && sesiones.length === 0 && (
            <span className="text-[12px] text-text-muted">Todavía no hay sesiones registradas de este ejercicio.</span>
          )}
          {datos && sesiones.length > 0 && (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-text-muted">
                <span>1RM estimado máx.: <strong className="text-text tabular">{datos.records.mejor_e1rm} kg</strong></span>
                <span>Mayor peso: <strong className="text-text tabular">{datos.records.mejor_peso} kg</strong></span>
              </div>
              {puntos.length >= 2 ? (
                <GraficoLinea
                  puntos={puntos}
                  unidad="kg"
                  descripcion={`1RM estimado por sesión, de ${puntos[0].valor} a ${puntos[puntos.length - 1].valor} kg`}
                />
              ) : (
                <span className="text-[12px] text-text-muted">Con una segunda sesión se dibuja la evolución.</span>
              )}
              <table className="w-full text-[11.5px] tabular">
                <thead>
                  <tr className="text-text-faint text-left">
                    <th className="font-semibold py-0.5">Fecha</th>
                    <th className="font-semibold">Mejor serie</th>
                    <th className="font-semibold text-right">1RM est.</th>
                    <th className="font-semibold text-right">Volumen</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sesiones].reverse().slice(0, FILAS_TABLA).map((s) => (
                    <tr key={s.sesion_id} className="border-t border-border">
                      <td className="py-0.5">{fechaCorta(s.fecha)}</td>
                      <td>{s.mejor_serie ? `${s.mejor_serie.peso} × ${s.mejor_serie.reps}` : '—'}</td>
                      <td className="text-right">{s.mejor_e1rm} kg</td>
                      <td className="text-right">{s.volumen} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <span className="text-[10.5px] text-text-faint">
                1RM estimado con la fórmula de Epley (peso × (1 + reps/30)): sirve para comparar series distintas, no es un máximo real.
                {puntos.some((p) => p.record) && ' El anillo verde marca una sesión que superó todo lo anterior.'}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
