import { useState } from 'react';
import { api } from '../../api/client.js';

export const FASE_LABEL = { volumen: 'Volumen', definicion: 'Definición', mantenimiento: 'Mantenimiento' };

export const FASE_CLASE = {
  volumen: 'bg-success-bg text-success border-success',
  definicion: 'bg-warning-bg text-warning border-warning',
  mantenimiento: 'bg-bg text-text-muted border-border',
};

// Fase nutricional que el usuario dice estar llevando esta semana
// (volumen/definicion/mantenimiento) - puramente informativo para que se
// vea de un vistazo en Entrenamiento, no afecta al motor de progresion.
export function FaseNutricional({ rutinaId, faseActual, onCambiada }) {
  const [enviando, setEnviando] = useState(false);

  async function cambiar(fase) {
    setEnviando(true);
    try {
      await api.patch(`/rutinas/${rutinaId}/fase-nutricional`, { fase: fase || null });
      onCambiada();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <select
      value={faseActual || ''}
      onChange={(e) => cambiar(e.target.value)}
      disabled={enviando}
      title="Fase nutricional esta semana"
      className={`text-[11px] font-semibold rounded-full pl-2.5 pr-1.5 py-1 border outline-none disabled:opacity-60 ${
        faseActual ? FASE_CLASE[faseActual] : 'bg-bg text-text-faint border-border'
      }`}
    >
      <option value="">Fase: sin definir</option>
      <option value="volumen">{FASE_LABEL.volumen}</option>
      <option value="definicion">{FASE_LABEL.definicion}</option>
      <option value="mantenimiento">{FASE_LABEL.mantenimiento}</option>
    </select>
  );
}
