import { useRef, useState } from 'react';

// Reordenar una lista arrastrando (mantener presionado y mover) con Pointer
// Events en vez de drag-and-drop nativo de HTML5, que no anda bien con
// touch en varios navegadores de celular (esta app es mobile-first).
//
// Clave del algoritmo: el destino se decide comparando la posicion del
// puntero contra los centros de cada tarjeta CAPTURADOS UNA SOLA VEZ al
// arrancar el arrastre, nunca recalculados en el medio. La version anterior
// volvia a leer getBoundingClientRect() de todas las tarjetas en cada
// pointermove, pero para ese momento el DOM ya reflejaba el ultimo swap
// (las demas tarjetas ya se habian corrido) - asi que un swap podia dejar
// el puntero "cayendo" sobre otra tarjeta sin que el mouse se hubiera
// movido mas, disparando otro swap encadenado de una. Con centros fijos,
// un movimiento real del puntero cuenta una sola vez, sin importar cuanto
// se haya reordenado la lista mientras tanto.
//
// A DIFERENCIA de la version anterior (que solo miraba la coordenada Y,
// pensada para una lista de una sola columna), esta compara la posicion
// del puntero contra el centro ORIGINAL de CADA tarjeta en X e Y, y elige
// la mas cercana - necesario porque en PC (`md:grid-cols-2`, ver
// EntrenamientoPage.jsx) las tarjetas se acomodan en 2 columnas, no en una
// lista vertical: con la comparacion solo-Y, arrastrar una tarjeta hacia
// el costado (misma fila, otra columna) no hacia NADA -el delta vertical
// quedaba en ~0 asi que nunca cruzaba ningun limite-, que era justo lo que
// hacia sentir el reordenar "tosco" en PC. Con "vecino mas cercano" en 2D,
// el mismo codigo sirve para la grilla de escritorio y la lista de una
// columna de celular (ahi la distancia se reduce sola a la vertical, ya
// que todas las tarjetas comparten la misma X).
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
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
    });
    estadoRef.current = { id, ordenOriginal: orden, centrosOriginales: centros, startX: e.clientX, startY: e.clientY };
    setOrdenArrastre(orden);
    setArrastrandoId(id);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    const st = estadoRef.current;
    if (!st) return;
    const idxOriginal = st.ordenOriginal.indexOf(st.id);
    const centroOriginal = st.centrosOriginales[idxOriginal];
    const actualX = centroOriginal.x + (e.clientX - st.startX);
    const actualY = centroOriginal.y + (e.clientY - st.startY);

    let nuevoIndex = idxOriginal;
    let mejorDistancia = Infinity;
    st.centrosOriginales.forEach((c, i) => {
      const distancia = (c.x - actualX) ** 2 + (c.y - actualY) ** 2;
      if (distancia < mejorDistancia) {
        mejorDistancia = distancia;
        nuevoIndex = i;
      }
    });

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
