export const LABEL_SEXO = { masculino: 'Hombres', femenino: 'Mujeres' };
export const LABEL_NIVEL = { sin_entrenar: 'Sin entrenar', bajo: 'Bajo', intermedio: 'Intermedio', alto: 'Alto' };
export const LABEL_ENFOQUE = { estandar: 'Estándar', carbohidratos: 'Enfoque carbohidratos' };
export const LABEL_FASE = { mantenimiento: 'Mantenimiento', volumen: 'Volumen', definicion: 'Definición' };
export const LABEL_FUENTE_REFERENCIA = {
  plan_anterior: 'tu último plan de Mantenimiento/Volumen',
  macros_actuales: 'lo que declaraste que comés hoy',
  tabla: 'la tabla base (sin referencia previa)',
};
export const LABEL_SEMAFORO = {
  optimo: 'Óptimo',
  muy_lento: 'Muy lento',
  agresivo: 'Agresivo',
  no_recomendable: 'No recomendable',
};
// Clases del badge por nivel, reusando los mismos tokens success/warning/danger
// que ya se usan en el resto de la app (ver EntrenamientoPage.jsx) - "muy
// lento" no es ni bueno ni grave, solo lento, por eso usa el gris neutro.
export const CLASE_SEMAFORO = {
  optimo: 'bg-success-bg text-success',
  muy_lento: 'bg-bg border border-border text-text-muted',
  agresivo: 'bg-warning-bg text-warning',
  no_recomendable: 'bg-danger-bg text-danger',
};
