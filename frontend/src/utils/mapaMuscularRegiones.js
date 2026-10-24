// Dibujo del mapa muscular: un cuerpo de frente y uno de espalda en un lienzo de
// 200 x 360. Solo se dibuja la MITAD IZQUIERDA (x <= 100) de cada region y de la
// silueta; el componente la repite espejada para la mitad derecha, asi un
// cambio en un trazo se ve en los dos lados.
//
// Cada region se llama como el musculo de la base (tabla `musculo`), y
// FUENTES dice de que musculos suma sus series: las tres cabezas del deltoides
// suman tambien las series cargadas al "deltoides" general.

export const SILUETA =
  'M100 34 L92 34 L92 48 L66 57 C54 58 47 66 46 80 L41 138 L36 172 L34 186 L46 188 L52 152 L59 112 ' +
  'L66 98 L72 140 L68 168 L66 200 L66 260 L68 300 L72 338 L70 352 L92 352 L91 338 L93 300 L94 262 L96 192 L100 174';

export const CABEZA = { cx: 100, cy: 19, rx: 13, ry: 16 };

const BRAZO_SUPERIOR = 'M49 90 C45 104 44 118 46 130 L58 132 C60 118 62 104 60 92 Z';
const CASCO_DELTOIDES = 'M66 57 C54 58 47 68 47 84 L59 86 C59 76 62 68 70 64 Z';

export const REGIONES_FRENTE = [
  { musculo: 'trapecio', d: 'M92 48 L66 58 L74 66 L92 58 Z' },
  { musculo: 'deltoides_lateral', d: CASCO_DELTOIDES },
  { musculo: 'deltoides_anterior', d: 'M70 64 C62 68 59 76 59 86 L68 92 C68 80 72 72 76 68 Z' },
  { musculo: 'pecho', d: 'M99 72 L78 68 C68 74 66 90 70 100 C80 108 92 106 99 100 Z' },
  { musculo: 'biceps', d: BRAZO_SUPERIOR },
  { musculo: 'abdominales', d: 'M99 104 L84 106 C82 124 84 150 88 166 L99 168 Z' },
  { musculo: 'abductores', d: 'M72 140 C66 150 64 162 66 176 L76 176 L84 150 Z' },
  { musculo: 'cuadriceps', d: 'M84 176 C72 178 66 194 66 222 C66 246 70 262 74 274 L90 274 C93 256 94 230 94 192 L94 180 Z' },
  { musculo: 'aductores', d: 'M95 180 L94 192 C94 230 93 256 91 272 L97 270 C99 240 100 210 100 184 Z' },
];

export const REGIONES_ESPALDA = [
  { musculo: 'trapecio', d: 'M99 48 L66 58 L76 70 L99 84 Z' },
  { musculo: 'deltoides_posterior', d: CASCO_DELTOIDES },
  { musculo: 'espalda', d: 'M99 84 L76 70 L74 90 L99 108 Z' },
  { musculo: 'dorsales', d: 'M74 90 L68 92 C68 108 74 126 88 140 L99 144 L99 108 Z' },
  { musculo: 'triceps', d: BRAZO_SUPERIOR },
  { musculo: 'lumbares', d: 'M99 144 L88 142 L88 160 L99 164 Z' },
  { musculo: 'gluteos', d: 'M99 164 C84 160 70 168 68 184 C68 198 84 206 99 202 Z' },
  { musculo: 'isquiotibiales', d: 'M96 208 C82 208 68 214 68 240 C68 258 72 270 76 282 L94 282 C97 262 98 236 98 212 Z' },
  { musculo: 'pantorrillas', d: 'M76 292 C70 304 70 324 76 340 L90 340 C94 324 94 304 90 292 Z' },
];

export const FUENTES = {
  deltoides_anterior: ['deltoides_anterior', 'deltoides'],
  deltoides_lateral: ['deltoides_lateral', 'deltoides'],
  deltoides_posterior: ['deltoides_posterior', 'deltoides'],
};
