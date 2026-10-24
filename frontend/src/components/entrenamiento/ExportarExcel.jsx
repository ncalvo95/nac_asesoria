import { useState } from 'react';
import ExportarExcelModal from '../ExportarExcelModal.jsx';

export function ExportarExcel({ rutinaId, usuarioId, microciclos }) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setMostrar(true)}
        className="text-[12px] font-semibold text-accent border border-accent rounded-lg px-2.5 py-1.5 whitespace-nowrap"
      >
        Exportar Excel
      </button>
      {mostrar && (
        <ExportarExcelModal
          rutinaId={rutinaId}
          usuarioId={usuarioId}
          microciclos={microciclos}
          onClose={() => setMostrar(false)}
        />
      )}
    </>
  );
}
