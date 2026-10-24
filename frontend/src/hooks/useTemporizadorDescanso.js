import { useCallback, useEffect, useRef, useState } from 'react';

const CLAVE_SONIDO = 'nac_descanso_sonido';
const SEGUNDOS_AVISO_VISIBLE = 6;

function leerSonido() {
  try { return localStorage.getItem(CLAVE_SONIDO) !== '0'; } catch { return true; }
}

// Tres pitidos cortos con WebAudio - no hace falta ningun archivo de audio.
// El AudioContext se crea en iniciar() (que corre dentro de un toque del
// usuario) porque los navegadores no dejan sonar nada creado fuera de un
// gesto; despues el aviso ya puede sonar solo cuando el reloj llega a cero.
function pitar(ctx) {
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    [0, 0.28, 0.56].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + 0.22);
    });
  } catch { /* sin audio: queda el aviso visual y la vibracion */ }
}

// Descanso entre series. Se guarda el instante de FIN (no un contador que
// resta de a uno): si el celular bloquea la pantalla o la pestaña pasa a
// segundo plano los timers del navegador se frenan, pero al volver el
// restante se recalcula bien contra el reloj real.
export function useTemporizadorDescanso() {
  const [fin, setFin] = useState(null);
  const [total, setTotal] = useState(0);
  const [etiqueta, setEtiqueta] = useState('');
  const [ahora, setAhora] = useState(() => Date.now());
  const [terminado, setTerminado] = useState(false);
  const [sonidoActivo, setSonidoActivo] = useState(leerSonido);
  const ctxRef = useRef(null);
  const sonidoRef = useRef(sonidoActivo);
  sonidoRef.current = sonidoActivo;

  const corriendo = fin != null && !terminado;

  useEffect(() => {
    if (!corriendo) return undefined;
    const id = setInterval(() => setAhora(Date.now()), 250);
    // Al volver a la pestaña se actualiza al instante, sin esperar al tick.
    const alVolver = () => setAhora(Date.now());
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
  }, [corriendo]);

  useEffect(() => {
    if (!corriendo || ahora < fin) return;
    setTerminado(true);
    if (sonidoRef.current) {
      pitar(ctxRef.current);
      try { navigator.vibrate?.([200, 100, 200, 100, 200]); } catch { /* no soportado */ }
    }
  }, [ahora, fin, corriendo]);

  // El cartel de "listo" se va solo.
  useEffect(() => {
    if (!terminado) return undefined;
    const id = setTimeout(() => { setFin(null); setTerminado(false); }, SEGUNDOS_AVISO_VISIBLE * 1000);
    return () => clearTimeout(id);
  }, [terminado]);

  const iniciar = useCallback((segundos, nombre = '') => {
    if (!Number.isFinite(segundos) || segundos <= 0) return;
    try {
      if (!ctxRef.current && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
        ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      ctxRef.current?.resume?.();
    } catch { /* sin audio */ }
    const ahoraMs = Date.now();
    setAhora(ahoraMs);
    setTotal(segundos);
    setEtiqueta(nombre);
    setTerminado(false);
    setFin(ahoraMs + segundos * 1000);
  }, []);

  const ajustar = useCallback((deltaSegundos) => {
    setFin((f) => (f == null ? f : f + deltaSegundos * 1000));
    setTotal((t) => Math.max(1, t + deltaSegundos));
    setTerminado(false);
  }, []);

  const saltar = useCallback(() => { setFin(null); setTerminado(false); }, []);

  const alternarSonido = useCallback(() => {
    setSonidoActivo((v) => {
      try { localStorage.setItem(CLAVE_SONIDO, v ? '0' : '1'); } catch { /* sin storage */ }
      return !v;
    });
  }, []);

  const restante = fin == null ? 0 : Math.max(0, Math.ceil((fin - ahora) / 1000));

  return { activo: fin != null, terminado, restante, total, etiqueta, sonidoActivo, iniciar, ajustar, saltar, alternarSonido };
}
