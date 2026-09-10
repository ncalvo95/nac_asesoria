// Referencia de volumen semanal (series) segun tablas MEV/MAV/MRV de Mike Israetel.
// Son valores aproximados de poblacion general - el coach puede ajustarlos
// despues por usuario si hace falta, se guardan en tabla aparte para eso.
//
// "deltoides" ya no se usa para catalogar ejercicios nuevos ni para armar
// rutinas nuevas (ver deltoides_lateral/anterior/posterior mas abajo) - se
// deja en el seed sin tocar (y migrate.js la marca activo=0) solo para no
// romper la integridad referencial de rutinas/historial ya generados antes
// de este cambio. Ver migrarDeltoides() en src/db/migrate.js para el
// detalle de la migracion (reasigna el catalogo y las rutinas activas a
// las 3 cabezas nuevas).
export const musculos = [
  { nombre: 'pecho', region: 'torso', mev: 8, mav: 16, mrv: 22 },
  { nombre: 'espalda', region: 'torso', mev: 6, mav: 14, mrv: 20 },
  { nombre: 'dorsales', region: 'torso', mev: 6, mav: 14, mrv: 20 },
  { nombre: 'deltoides', region: 'torso', mev: 6, mav: 16, mrv: 24 },
  // Separado por cabeza porque el lateral necesita volumen directo propio
  // (los presses/press militar casi no lo tocan), mientras que el
  // anterior ya recibe de sobra de todo el empuje horizontal/vertical -
  // por eso su MEV es 0 y su techo es bajo. El posterior recibe algo de
  // las tracciones (remo, jalones) pero igual se beneficia de trabajo
  // directo (pajaros, face pull), asi que queda en un punto medio.
  { nombre: 'deltoides_lateral', region: 'torso', mev: 8, mav: 20, mrv: 26 },
  { nombre: 'deltoides_anterior', region: 'torso', mev: 0, mav: 8, mrv: 14 },
  { nombre: 'deltoides_posterior', region: 'torso', mev: 6, mav: 16, mrv: 22 },
  { nombre: 'biceps', region: 'torso', mev: 8, mav: 14, mrv: 20 },
  { nombre: 'triceps', region: 'torso', mev: 6, mav: 12, mrv: 18 },
  { nombre: 'abdominales', region: 'torso', mev: 0, mav: 16, mrv: 25 },
  { nombre: 'cuadriceps', region: 'pierna', mev: 8, mav: 14, mrv: 20 },
  { nombre: 'isquiotibiales', region: 'pierna', mev: 4, mav: 10, mrv: 16 },
  { nombre: 'gluteos', region: 'pierna', mev: 4, mav: 12, mrv: 16 },
  { nombre: 'pantorrillas', region: 'pierna', mev: 8, mav: 14, mrv: 20 },
];
