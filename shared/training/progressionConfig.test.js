import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { progressionDefaults } from './progressionDefaults.js';
import { validarConfigProgresion } from './progressionConfig.js';

describe('validarConfigProgresion', () => {
  test('acepta los valores de fabrica', () => {
    const { valida, errores } = validarConfigProgresion(progressionDefaults);
    assert.equal(valida, true, errores.join(' / '));
  });

  test('rechaza un objeto vacio', () => {
    const { valida, errores } = validarConfigProgresion({});
    assert.equal(valida, false);
    assert.ok(errores.length > 0);
  });

  test('rechaza incrementoKg <= 0', () => {
    const { valida, errores } = validarConfigProgresion({ ...progressionDefaults, incrementoKg: 0 });
    assert.equal(valida, false);
    assert.ok(errores.some((e) => e.includes('incrementoKg')));
  });

  test('rechaza seriesMinimo menor a 1', () => {
    const { valida, errores } = validarConfigProgresion({ ...progressionDefaults, seriesMinimo: 0 });
    assert.equal(valida, false);
    assert.ok(errores.some((e) => e.includes('seriesMinimo')));
  });

  test('rechaza un rango de reps con min > max', () => {
    const config = { ...progressionDefaults, rangoReps: { ...progressionDefaults.rangoReps, default: { min: 20, max: 10 } } };
    const { valida, errores } = validarConfigProgresion(config);
    assert.equal(valida, false);
    assert.ok(errores.some((e) => e.includes('rangoReps.default')));
  });

  test('rechaza descarga.fraccionSeries fuera de (0, 1]', () => {
    const config = { ...progressionDefaults, descarga: { ...progressionDefaults.descarga, fraccionSeries: 1.5 } };
    const { valida, errores } = validarConfigProgresion(config);
    assert.equal(valida, false);
    assert.ok(errores.some((e) => e.includes('fraccionSeries')));
  });
});
