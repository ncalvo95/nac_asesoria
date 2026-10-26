import { useState } from 'react';
import { api } from '../api/client.js';
import { aIso, fechaCorta, parseFechaLocal } from '../utils/fechas.js';

// Un bloque (microciclo de 2 semanas) NUNCA se cierra solo: hasta que se toque
// "Cerrar microciclo" la pantalla sigue mostrando la semana 2 y los pesos no
// avanzan. Este aviso aparece cuando pasaron los 14 dias del bloque (sin contar
// pausas) y deja cerrarlo desde el mismo lugar donde se entrena.
export default function AvisoBloqueVencido({ rutina, microciclo, onCambio }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const fin = rutina.fin_bloque;
  const hoy = aIso(new Date());
  if (!fin || rutina.pausa || microciclo.numero < 1 || microciclo.tipo === 'testeo' || hoy <= fin) return null;

  const dias = Math.round((parseFechaLocal(hoy) - parseFechaLocal(fin)) / 86400000);

  async function cerrar() {
    if (!window.confirm(
      `Esto cierra el microciclo ${microciclo.numero}, evalúa tu progreso (también cuenta lo que entrenaste después del ${fechaCorta(fin)}) y arranca el próximo con el peso y las series ajustados. No hay vuelta atrás desde la app.\n\n¿Confirmás que ya anotaste (o salteaste) todo lo de este bloque?`
    )) return;
    setEnviando(true);
    setError('');
    try {
      await api.post(`/rutinas/${rutina.id}/microciclos/${microciclo.numero}/cerrar`);
      await onCambio();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div role="status" className="bg-warning-bg text-warning rounded-xl px-4 py-3 flex flex-col gap-2">
      <strong className="text-[14px]">Tu bloque ya terminó</strong>
      <p className="text-[12.5px] leading-relaxed">
        El microciclo {microciclo.numero} terminó el {fechaCorta(fin)} (hace {dias} {dias === 1 ? 'día' : 'días'}). Los bloques no se cierran solos:
        hasta que lo cierres, tus pesos y series no avanzan. Lo que entrenaste después de esa fecha también cuenta.
      </p>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <button
        type="button"
        onClick={cerrar}
        disabled={enviando}
        className="self-start h-10 px-4 rounded-[10px] bg-accent text-accent-fg text-[13.5px] font-semibold disabled:opacity-60"
      >
        {enviando ? 'Cerrando…' : `Cerrar microciclo ${microciclo.numero}`}
      </button>
    </div>
  );
}
