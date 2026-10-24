import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { e1rm, detectarRecords } from './e1rm.js';

describe('e1rm', () => {
  test('con 1 repeticion es el propio peso', () => {
    assert.equal(e1rm(100, 1), 100);
  });
  test('Epley con varias repeticiones', () => {
    assert.equal(e1rm(60, 10), 80);
    assert.equal(e1rm('62.5', '10'), 83.3);
  });
  test('datos invalidos o fuera de rango dan null', () => {
    assert.equal(e1rm(0, 5), null);
    assert.equal(e1rm(60, 0), null);
    assert.equal(e1rm('', 5), null);
    assert.equal(e1rm(60, 31), null);
  });
});

describe('detectarRecords', () => {
  const s = (peso, reps, extra = {}) => ({ peso, reps, hecha: true, esDropset: false, ...extra });

  test('sin historico previo no hay records', () => {
    assert.deepEqual(detectarRecords([s(60, 10)], null), []);
    assert.deepEqual(detectarRecords([s(60, 10)], 0), []);
  });
  test('marca solo las series que superan lo previo', () => {
    const r = detectarRecords([s(60, 10), s(60, 11), s(60, 9)], 80);
    assert.equal(r.length, 1);
    assert.equal(r[0].indice, 1);
    assert.equal(r[0].anterior, 80);
    assert.equal(r[0].valor, 82);
  });
  test('una serie igual a la anterior de la sesion no es otro record', () => {
    const r = detectarRecords([s(60, 11), s(60, 11)], 80);
    assert.equal(r.length, 1);
  });
  test('ignora dropsets y series no hechas', () => {
    const r = detectarRecords([s(100, 10, { esDropset: true }), s(100, 10, { hecha: false })], 80);
    assert.deepEqual(r, []);
  });
});
