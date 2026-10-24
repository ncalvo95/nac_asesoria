import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rangosDeBloque, intervalosDePausas, diasPausados, estaPausado, sumarDias } from './calendarioBloque.js';

describe('rangosDeBloque', () => {
  test('sin pausas es el calendario de siempre', () => {
    const r = rangosDeBloque('2026-10-05');
    assert.deepEqual(r[1], ['2026-10-05', '2026-10-11']);
    assert.deepEqual(r[2], ['2026-10-12', '2026-10-18']);
    assert.equal(r.siguienteInicio, '2026-10-19');
  });

  test('una pausa en medio de la semana 1 corre los dias de la pausa', () => {
    // Pausados 7 a 13 de octubre (7 dias): la semana 1 cierra 7 dias despues.
    const r = rangosDeBloque('2026-10-05', [{ desde: '2026-10-07', hasta: '2026-10-13' }]);
    // Activos: 5,6 + 14..18 = 7 -> fin1 = 18
    assert.deepEqual(r[1], ['2026-10-05', '2026-10-18']);
    assert.deepEqual(r[2], ['2026-10-19', '2026-10-25']);
    assert.equal(r.siguienteInicio, '2026-10-26');
  });

  test('una pausa antes de que arranque el bloque no lo toca', () => {
    const r = rangosDeBloque('2026-10-05', [{ desde: '2026-09-01', hasta: '2026-09-20' }]);
    assert.deepEqual(r[1], ['2026-10-05', '2026-10-11']);
  });

  test('una pausa en la semana 2 solo corre el final', () => {
    const r = rangosDeBloque('2026-10-05', [{ desde: '2026-10-14', hasta: '2026-10-16' }]);
    assert.deepEqual(r[1], ['2026-10-05', '2026-10-11']);
    assert.deepEqual(r[2], ['2026-10-12', '2026-10-21']);
  });

  test('dos pausas se acumulan', () => {
    const r = rangosDeBloque('2026-10-05', [
      { desde: '2026-10-06', hasta: '2026-10-06' },
      { desde: '2026-10-16', hasta: '2026-10-17' },
    ]);
    assert.equal(r[1][1], '2026-10-12');
    assert.equal(r[2][1], '2026-10-21');
  });
});

describe('intervalosDePausas', () => {
  test('el dia de pausar y el de reanudar cuentan como activos', () => {
    const [i] = intervalosDePausas([{ desde: '2026-10-07', hasta: '2026-10-14' }], '2026-10-30');
    assert.deepEqual(i, { desde: '2026-10-08', hasta: '2026-10-13' });
  });
  test('una pausa abierta llega hasta hoy', () => {
    const [i] = intervalosDePausas([{ desde: '2026-10-07', hasta: null }], '2026-10-10');
    assert.deepEqual(i, { desde: '2026-10-08', hasta: '2026-10-10' });
  });
  test('pausar y reanudar el mismo dia (o al dia siguiente) no pausa nada', () => {
    assert.deepEqual(intervalosDePausas([{ desde: '2026-10-07', hasta: '2026-10-07' }], '2026-10-30'), []);
    assert.deepEqual(intervalosDePausas([{ desde: '2026-10-07', hasta: '2026-10-08' }], '2026-10-30'), []);
  });
});

describe('diasPausados y utilidades', () => {
  test('cuenta los dias de en medio', () => {
    assert.equal(diasPausados('2026-10-07', '2026-10-14'), 6);
    assert.equal(diasPausados('2026-10-07', '2026-10-08'), 0);
    assert.equal(diasPausados('2026-10-07', '2026-10-07'), 0);
  });
  test('estaPausado y sumarDias', () => {
    assert.equal(estaPausado('2026-10-10', [{ desde: '2026-10-08', hasta: '2026-10-12' }]), true);
    assert.equal(estaPausado('2026-10-13', [{ desde: '2026-10-08', hasta: '2026-10-12' }]), false);
    assert.equal(sumarDias('2026-10-31', 1), '2026-11-01');
  });
});
