import { useRef, useState } from 'react';

// Reordenar una lista arrastrando (mantener presionado y mover arriba/
// abajo) con Pointer Events en vez de drag-and-drop nativo de HTML5, que no
// anda bien con touch en varios navegadores de celular (esta app es
// mobile-first).
//
// Clave del algoritmo: el swap se decide comparando el puntero contra los
// centros de cada tarjeta CAPTURADOS UNA SOLA VEZ al arrancar el arrastre,
// nunca recalculados en el medio. La version anterior volvia a leer
// getBoundingClientRect() de todas las tarjetas en cada pointermove, pero
// para ese momento el DOM ya reflejaba el ultimo swap (las demas tarjetas
// ya se habian corrido) - asi que un swap podia dejar el puntero
// "cayendo" sobre otra tarjeta sin que el mouse se hubiera movido mas,
// disparando otro swap encadenado de una. En PC, con eventos de mouse
// mucho mas finos que el touch, esto se sentia como un intercambio rapido
// entre ejercicios apenas se tocaba el borde de una tarjeta. Con centros
// fijos, cruzar un limite cuenta una sola vez por movimiento real del
// puntero, sin importar cuanto se haya reordenado la lista mientras tanto.
//
// idsActuales: array de ids en el orden actual (se recalcula cada render,
// normal). onReordenado(idsFinal): se llama al soltar, con el array final -
// hace el PATCH real y actualiza el estado que corresponda.
export function useArrastreOrden(idsActuales, onReordenado) {
  const [ordenArrastre, setOrdenArrastre] = useState(null);
  const [arrastrandoId, setArrastrandoId] = useState(null);
  const cardRefs = useRef({});
  const estadoRef = useRef(null);

  function iniciarArrastre(e, id) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const orden = [...idsActuales];
    const centros = orden.map((itemId) => {
      const rect = cardRefs.current[itemId]?.getBoundingClientRect();
      return rect ? rect.top + rect.height / 2 : 0;
    });
    estadoRef.current = { id, ordenOriginal: orden, centrosOriginales: centros, startY: e.clientY };
    setOrdenArrastre(orden);
    setArrastrandoId(id);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    const st = estadoRef.current;
    if (!st) return;
    const deltaY = e.clientY - st.startY;
    const idxOriginal = st.ordenOriginal.indexOf(st.id);
    const centroActual = st.centrosOriginales[idxOriginal] + deltaY;

    let nuevoIndex = idxOriginal;
    if (deltaY > 0) {
      for (let i = idxOriginal + 1; i < st.ordenOriginal.length; i++) {
        if (centroActual > st.centrosOriginales[i]) nuevoIndex = i;
        else break;
      }
    } else if (deltaY < 0) {
      for (let i = idxOriginal - 1; i >= 0; i--) {
        if (centroActual < st.centrosOriginales[i]) nuevoIndex = i;
        else break;
      }
    }

    setOrdenArrastre((prev) => {
      if (!prev) return prev;
      const idxActual = prev.indexOf(st.id);
      if (idxActual === nuevoIndex) return prev;
      const copia = [...prev];
      copia.splice(idxActual, 1);
      copia.splice(nuevoIndex, 0, st.id);
      return copia;
    });
  }

  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    estadoRef.current = null;
    setArrastrandoId(null);
    setOrdenArrastre((prev) => {
      if (prev) onReordenado(prev);
      return null;
    });
  }

  return { ordenArrastre, arrastrandoId, cardRefs, iniciarArrastre };
}
