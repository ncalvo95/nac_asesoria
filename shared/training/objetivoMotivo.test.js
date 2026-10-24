import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { explicarObjetivo } from './objetivoMotivo.js';

const ej = { progreso_automatico: 1, rango_reps_min: 8, rango_reps_max: 12, peso_actual: 62.5, piso_reps: 8, series_actuales: 3 };

describe('explicarObjetivo', () => {
  test('sin cierre previo no hay nada que explicar', () => {
    assert.equal(explicarObjetivo(ej, null), null);
    assert.equal(explicarObjetivo(null, null), null);
  });

  test('progreso automatico apagado se explica aunque no haya cierre', () => {
    assert.equal(explicarObjetivo({ ...ej, progreso_automatico: 0 }, null).tipo, 'congelado');
  });

  test('techo por encima del maximo: sube el peso', () => {
    const r = explicarObjetivo(ej, { techo_reps: 13, sem1_reps: 12, sem2_reps: 13 });
    assert.equal(r.tipo, 'sube');
    assert.match(r.resumen, /62.5 kg/);
    assert.match(r.detalle, /8–12/);
  });

  test('techo por debajo del minimo: baja el peso', () => {
    const r = explicarObjetivo(ej, { techo_reps: 6, sem1_reps: 6, sem2_reps: 5 });
    assert.equal(r.tipo, 'baja');
  });

  test('techo dentro del rango: mismo peso con meta de reps', () => {
    const r = explicarObjetivo({ ...ej, piso_reps: 10 }, { techo_reps: 10, sem1_reps: 9, sem2_reps: 10 });
    assert.equal(r.tipo, 'igual');
    assert.match(r.resumen, /10 reps/);
  });

  test('serie agregada por estancamiento', () => {
    const r = explicarObjetivo(ej, { techo_reps: 9, serie_agregada: 1 });
    assert.equal(r.tipo, 'serie');
    assert.match(r.resumen, /3 en total/);
  });

  test('sin reps registradas en el bloque anterior', () => {
    assert.equal(explicarObjetivo(ej, { techo_reps: null }).tipo, 'sin_datos');
  });
});
