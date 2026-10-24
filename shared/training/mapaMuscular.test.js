import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { zonaVolumen, estadoRecuperacion, diasEntre } from './mapaMuscular.js';

const ref = { mev: 8, mav: 14, mrv: 20 };

describe('zonaVolumen', () => {
  test('sin series no hay trabajo', () => {
    assert.equal(zonaVolumen(0, ref), 'sin_trabajo');
    assert.equal(zonaVolumen(null, ref), 'sin_trabajo');
  });
  test('recorre las zonas con sus bordes', () => {
    assert.equal(zonaVolumen(7, ref), 'bajo');
    assert.equal(zonaVolumen(8, ref), 'en_rango');
    assert.equal(zonaVolumen(14, ref), 'en_rango');
    assert.equal(zonaVolumen(15, ref), 'alto');
    assert.equal(zonaVolumen(20, ref), 'alto');
    assert.equal(zonaVolumen(21, ref), 'excedido');
  });
  test('con mev 0 cualquier serie esta en rango', () => {
    assert.equal(zonaVolumen(1, { mev: 0, mav: 16, mrv: 25 }), 'en_rango');
  });
});

describe('estadoRecuperacion', () => {
  test('segun dias desde la ultima vez', () => {
    assert.equal(estadoRecuperacion(null), 'sin_datos');
    assert.equal(estadoRecuperacion(0), 'reciente');
    assert.equal(estadoRecuperacion(1), 'reciente');
    assert.equal(estadoRecuperacion(2), 'recuperandose');
    assert.equal(estadoRecuperacion(3), 'recuperado');
    assert.equal(estadoRecuperacion(10), 'recuperado');
  });
});

describe('diasEntre', () => {
  test('cuenta dias enteros', () => {
    assert.equal(diasEntre('2026-10-20', '2026-10-24'), 4);
    assert.equal(diasEntre('2026-10-24', '2026-10-24'), 0);
    assert.equal(diasEntre('2026-10-30', '2026-11-02'), 3);
  });
  test('fechas faltantes dan null', () => {
    assert.equal(diasEntre(null, '2026-10-24'), null);
  });
});
