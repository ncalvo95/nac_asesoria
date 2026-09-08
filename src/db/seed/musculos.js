// Referencia de volumen semanal (series) segun tablas MEV/MAV/MRV de Mike Israetel.
// Son valores aproximados de poblacion general - el coach puede ajustarlos
// despues por usuario si hace falta, se guardan en tabla aparte para eso.
export const musculos = [
  { nombre: 'pecho', region: 'torso', mev: 8, mav: 16, mrv: 22 },
  { nombre: 'espalda', region: 'torso', mev: 6, mav: 14, mrv: 20 },
  { nombre: 'dorsales', region: 'torso', mev: 6, mav: 14, mrv: 20 },
  { nombre: 'deltoides', region: 'torso', mev: 6, mav: 16, mrv: 24 },
  { nombre: 'biceps', region: 'torso', mev: 8, mav: 14, mrv: 20 },
  { nombre: 'triceps', region: 'torso', mev: 6, mav: 12, mrv: 18 },
  { nombre: 'abdominales', region: 'torso', mev: 0, mav: 16, mrv: 25 },
  { nombre: 'cuadriceps', region: 'pierna', mev: 8, mav: 14, mrv: 20 },
  { nombre: 'isquiotibiales', region: 'pierna', mev: 4, mav: 10, mrv: 16 },
  { nombre: 'gluteos', region: 'pierna', mev: 4, mav: 12, mrv: 16 },
  { nombre: 'pantorrillas', region: 'pierna', mev: 8, mav: 14, mrv: 20 },
];
