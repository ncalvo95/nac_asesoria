import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nutritionDefaults } from './nutritionDefaults.js';
import {
  SEXOS, ENFOQUES, NIVELES,
  calcularMacrosFase, calcularNivelActividadAutomatico, resolverReferenciaDefinicion,
  calcularModoObjetivo, calcularSemaforo, calcularPlazoMinimoSugerido, proyectarSemanaASemana,
  calcularMifflinStJeor, calcularTdeeMifflin, calcularEdad, validarConfig,
} from './nutritionEngine.js';

const config = nutritionDefaults;

// ---------------------------------------------------------------------------
// Combinaciones sexo x enfoque x fase x nivel (Mantenimiento/Volumen)
// ---------------------------------------------------------------------------

describe('calcularMacrosFase - Mantenimiento/Volumen, todas las combinaciones', () => {
  for (const fase of ['mantenimiento', 'volumen']) {
    for (const enfoque of ENFOQUES) {
      for (const sexo of SEXOS) {
        for (const nivel of NIVELES) {
          test(`${fase} / ${enfoque} / ${sexo} / ${nivel}`, () => {
            const peso = 75;
            const r = calcularMacrosFase({ fase, enfoque, sexo, nivel, pesoActualKg: peso }, config);

            const base = config.base[enfoque][sexo];
            const tablaIncrementos = fase === 'mantenimiento' ? config.incrementosCarbohidratos.mantenimiento : config.incrementosCarbohidratos.volumen;
            const delta = tablaIncrementos[sexo][nivel];

            let grasaEsperadaGKg = base.grasa;
            if (fase === 'volumen' && sexo === 'femenino' && nivel === 'alto') {
              grasaEsperadaGKg += config.excepciones.grasaVolumenMujerAltoDelta;
            }

            assert.equal(r.proteinaGKg, base.proteina);
            assert.ok(Math.abs(r.grasaGKg - grasaEsperadaGKg) < 1e-9);
            assert.ok(Math.abs(r.carbohidratosGKg - (base.carbohidratos + delta)) < 1e-9);
            assert.equal(r.proteinaG, Math.round(base.proteina * peso * 10) / 10);
            // kcal = P*4 + G*9 + C*4, siempre a partir de los macros.
            assert.equal(r.kcal, Math.round(r.proteinaG * 4 + r.grasaG * 9 + r.carbohidratosG * 4));
          });
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Excepciones puntuales
// ---------------------------------------------------------------------------

describe('Excepciones', () => {
  test('Volumen + mujer + Alto: la grasa sube el delta de la excepción', () => {
    const sinExcepcion = calcularMacrosFase({ fase: 'volumen', enfoque: 'estandar', sexo: 'femenino', nivel: 'intermedio', pesoActualKg: 60 }, config);
    const conExcepcion = calcularMacrosFase({ fase: 'volumen', enfoque: 'estandar', sexo: 'femenino', nivel: 'alto', pesoActualKg: 60 }, config);
    assert.ok(conExcepcion.excepciones.includes('grasa_volumen_mujer_alto'));
    assert.ok(!sinExcepcion.excepciones.includes('grasa_volumen_mujer_alto'));
    assert.ok(Math.abs(conExcepcion.grasaGKg - (config.base.estandar.femenino.grasa + config.excepciones.grasaVolumenMujerAltoDelta)) < 1e-9);
  });

  test('Volumen + hombre + Alto: NO aplica la excepción de grasa (es solo para mujeres)', () => {
    const r = calcularMacrosFase({ fase: 'volumen', enfoque: 'estandar', sexo: 'masculino', nivel: 'alto', pesoActualKg: 80 }, config);
    assert.ok(!r.excepciones.includes('grasa_volumen_mujer_alto'));
    assert.equal(r.grasaGKg, config.base.estandar.masculino.grasa);
  });

  test('Definición larga en hombres: la excepción de grasa solo aplica dentro de las últimas N semanas', () => {
    const referenciaGKg = { proteina: 2.0, grasa: 1.0, carbohidratos: 2.0 };
    const semanas = 12; // >= minimo de 8, ultimas 4 son semanas 9-12.

    const semana1 = calcularMacrosFase({ fase: 'definicion', enfoque: 'estandar', sexo: 'masculino', nivel: 'intermedio', pesoActualKg: 80, referenciaGKg, semanasPlan: semanas, semanaActual: 1 }, config);
    const semana8 = calcularMacrosFase({ fase: 'definicion', enfoque: 'estandar', sexo: 'masculino', nivel: 'intermedio', pesoActualKg: 80, referenciaGKg, semanasPlan: semanas, semanaActual: 8 }, config);
    const semana9 = calcularMacrosFase({ fase: 'definicion', enfoque: 'estandar', sexo: 'masculino', nivel: 'intermedio', pesoActualKg: 80, referenciaGKg, semanasPlan: semanas, semanaActual: 9 }, config);
    const semana12 = calcularMacrosFase({ fase: 'definicion', enfoque: 'estandar', sexo: 'masculino', nivel: 'intermedio', pesoActualKg: 80, referenciaGKg, semanasPlan: semanas, semanaActual: 12 }, config);

    assert.ok(!semana1.excepciones.includes('grasa_definicion_larga_hombre'));
    assert.ok(!semana8.excepciones.includes('grasa_definicion_larga_hombre'));
    assert.ok(semana9.excepciones.includes('grasa_definicion_larga_hombre'));
    assert.ok(semana12.excepciones.includes('grasa_definicion_larga_hombre'));
    assert.ok(Math.abs(semana9.grasaGKg - (referenciaGKg.grasa + config.excepciones.definicionLargaHombreDeltaGrasa)) < 1e-9);
  });

  test('Definición larga en mujeres: la excepción NUNCA aplica (es solo para hombres)', () => {
    const referenciaGKg = { proteina: 1.5, grasa: 1.0, carbohidratos: 1.5 };
    const r = calcularMacrosFase({ fase: 'definicion', enfoque: 'estandar', sexo: 'femenino', nivel: 'intermedio', pesoActualKg: 60, referenciaGKg, semanasPlan: 20, semanaActual: 20 }, config);
    assert.ok(!r.excepciones.includes('grasa_definicion_larga_hombre'));
    assert.equal(r.grasaGKg, referenciaGKg.grasa);
  });

  test('Definición corta (< mínimo de semanas): la excepción no aplica nunca', () => {
    const referenciaGKg = { proteina: 1.5, grasa: 1.0, carbohidratos: 1.5 };
    const r = calcularMacrosFase({ fase: 'definicion', enfoque: 'estandar', sexo: 'masculino', nivel: 'intermedio', pesoActualKg: 80, referenciaGKg, semanasPlan: 6, semanaActual: 6 }, config);
    assert.ok(!r.excepciones.includes('grasa_definicion_larga_hombre'));
  });

  test('Piso de proteína en Definición: si la referencia queda por debajo de la tabla, se usa la de la tabla', () => {
    const referenciaBaja = { proteina: 0.5, grasa: 0.8, carbohidratos: 2.0 };
    const r = calcularMacrosFase({ fase: 'definicion', enfoque: 'estandar', sexo: 'masculino', nivel: 'intermedio', pesoActualKg: 80, referenciaGKg: referenciaBaja }, config);
    assert.equal(r.proteinaGKg, config.base.estandar.masculino.proteina);
    assert.ok(r.excepciones.includes('piso_proteina_definicion'));
  });

  test('Piso de proteína desactivado: se respeta la referencia aunque sea baja', () => {
    const configSinPiso = { ...config, pisoProteinaDefinicionActivo: false };
    const referenciaBaja = { proteina: 0.5, grasa: 0.8, carbohidratos: 2.0 };
    const r = calcularMacrosFase({ fase: 'definicion', enfoque: 'estandar', sexo: 'masculino', nivel: 'intermedio', pesoActualKg: 80, referenciaGKg: referenciaBaja }, configSinPiso);
    assert.equal(r.proteinaGKg, 0.5);
    assert.ok(!r.excepciones.includes('piso_proteina_definicion'));
  });

  test('Decremento de Definición: mismo valor para los 2 sexos y los 2 enfoques', () => {
    const referenciaGKg = { proteina: 2.0, grasa: 1.0, carbohidratos: 3.0 };
    for (const sexo of SEXOS) {
      for (const enfoque of ENFOQUES) {
        const r = calcularMacrosFase({ fase: 'definicion', enfoque, sexo, nivel: 'bajo', pesoActualKg: 70, referenciaGKg }, config);
        assert.ok(Math.abs(r.carbohidratosGKg - (3.0 + config.decrementoDefinicionCarbohidratos.bajo)) < 1e-9);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Resolución de referencia para Definición (3 fuentes)
// ---------------------------------------------------------------------------

describe('resolverReferenciaDefinicion', () => {
  test('Fuente 1: último plan (ya convertido a g/kg) - se usa tal cual', () => {
    const ultimoPlanMacrosGKg = { proteina: 2.1, grasa: 0.9, carbohidratos: 2.8 };
    const r = resolverReferenciaDefinicion({ ultimoPlanMacrosGKg, pesoActualKg: 80, sexo: 'masculino', enfoque: 'estandar', entrena: true, nivelSiEntrena: 'intermedio' }, config);
    assert.equal(r.fuente, 'plan_anterior');
    assert.deepEqual(r.macrosGKg, ultimoPlanMacrosGKg);
  });

  test('Fuente 2: macros actuales declarados (g/día) - se convierten a g/kg con el peso actual', () => {
    const r = resolverReferenciaDefinicion(
      { macrosActualesDeclaradosGDia: { proteina: 160, grasa: 70, carbohidratos: 250 }, pesoActualKg: 80, sexo: 'masculino', enfoque: 'estandar', entrena: true, nivelSiEntrena: 'intermedio' },
      config
    );
    assert.equal(r.fuente, 'macros_actuales');
    assert.equal(r.macrosGKg.proteina, 2);
    assert.equal(r.macrosGKg.grasa, 0.875);
    assert.equal(r.macrosGKg.carbohidratos, 3.125);
  });

  test('Fuente 3a: tabla, no entrena -> base sin entrenar', () => {
    const r = resolverReferenciaDefinicion({ pesoActualKg: 80, sexo: 'masculino', enfoque: 'estandar', entrena: false, nivelSiEntrena: 'intermedio' }, config);
    assert.equal(r.fuente, 'tabla');
    assert.deepEqual(r.macrosGKg, {
      proteina: config.base.estandar.masculino.proteina,
      grasa: config.base.estandar.masculino.grasa,
      carbohidratos: config.base.estandar.masculino.carbohidratos,
    });
  });

  test('Fuente 3b: tabla, entrena -> mantenimiento de su nivel', () => {
    const r = resolverReferenciaDefinicion({ pesoActualKg: 80, sexo: 'femenino', enfoque: 'carbohidratos', entrena: true, nivelSiEntrena: 'alto' }, config);
    assert.equal(r.fuente, 'tabla');
    const esperado = config.base.carbohidratos.femenino.carbohidratos + config.incrementosCarbohidratos.mantenimiento.femenino.alto;
    assert.ok(Math.abs(r.macrosGKg.carbohidratos - esperado) < 1e-9);
  });

  test('Prioridad: si hay último plan, se usa aunque también haya macros declarados', () => {
    const ultimoPlanMacrosGKg = { proteina: 2.1, grasa: 0.9, carbohidratos: 2.8 };
    const r = resolverReferenciaDefinicion(
      { ultimoPlanMacrosGKg, macrosActualesDeclaradosGDia: { proteina: 999, grasa: 999, carbohidratos: 999 }, pesoActualKg: 80, sexo: 'masculino', enfoque: 'estandar', entrena: true, nivelSiEntrena: 'intermedio' },
      config
    );
    assert.equal(r.fuente, 'plan_anterior');
  });
});

// ---------------------------------------------------------------------------
// Nivel de actividad automático
// ---------------------------------------------------------------------------

describe('calcularNivelActividadAutomatico', () => {
  test('Umbrales de días, sin pasos suficientes', () => {
    const casos = [
      [0, 'sin_entrenar'], [1, 'bajo'], [3, 'bajo'],
      [4, 'intermedio'], [5, 'intermedio'],
      [6, 'alto'], [7, 'alto'],
    ];
    for (const [dias, esperado] of casos) {
      const r = calcularNivelActividadAutomatico({ diasEntrenamiento: dias, pasosPromedioUltimos14: 8000, diasConPasosCargados: 0 }, config);
      assert.equal(r.nivel, esperado, `${dias} días debería dar ${esperado}`);
      assert.equal(r.fuente, 'solo_dias');
    }
  });

  test('Pasos suficientes, promedio alto: sube un nivel (tope Alto)', () => {
    const r = calcularNivelActividadAutomatico({ diasEntrenamiento: 4, pasosPromedioUltimos14: 15000, diasConPasosCargados: 10 }, config);
    assert.equal(r.nivel, 'alto'); // intermedio -> alto
    const rTope = calcularNivelActividadAutomatico({ diasEntrenamiento: 6, pasosPromedioUltimos14: 20000, diasConPasosCargados: 14 }, config);
    assert.equal(rTope.nivel, 'alto'); // ya era alto, no se pasa de ahi
  });

  test('Pasos suficientes, promedio bajo: baja un nivel, pero solo si entrena (piso Bajo)', () => {
    const r = calcularNivelActividadAutomatico({ diasEntrenamiento: 4, pasosPromedioUltimos14: 3000, diasConPasosCargados: 10 }, config);
    assert.equal(r.nivel, 'bajo'); // intermedio -> bajo

    const rPiso = calcularNivelActividadAutomatico({ diasEntrenamiento: 2, pasosPromedioUltimos14: 1000, diasConPasosCargados: 10 }, config);
    assert.equal(rPiso.nivel, 'bajo'); // ya era bajo, no baja a sin_entrenar

    const rSinEntrenar = calcularNivelActividadAutomatico({ diasEntrenamiento: 0, pasosPromedioUltimos14: 1000, diasConPasosCargados: 10 }, config);
    assert.equal(rSinEntrenar.nivel, 'sin_entrenar'); // los pasos bajos no tocan a quien no entrena
  });

  test('Sin entrenar + pasos muy altos: SÍ puede subir a Bajo (la suba no exige entrenar)', () => {
    const r = calcularNivelActividadAutomatico({ diasEntrenamiento: 0, pasosPromedioUltimos14: 15000, diasConPasosCargados: 10 }, config);
    assert.equal(r.nivel, 'bajo');
  });

  test('Datos insuficientes: avisa y no ajusta por pasos', () => {
    const r = calcularNivelActividadAutomatico({ diasEntrenamiento: 4, pasosPromedioUltimos14: 20000, diasConPasosCargados: 2 }, config);
    assert.equal(r.nivel, 'intermedio');
    assert.equal(r.fuente, 'solo_dias');
    assert.ok(r.motivos.some((m) => m.includes('insuficientes')));
  });
});

// ---------------------------------------------------------------------------
// Modo objetivo (pérdida de grasa)
// ---------------------------------------------------------------------------

describe('calcularModoObjetivo', () => {
  const macrosDefinicionGKg = { proteina: 1.8, grasa: 0.8 };

  test('Caso normal: déficit moderado, sin pisos ni advertencias', () => {
    const r = calcularModoObjetivo({ kcalReferencia: 2500, kgAPerder: 4, semanas: 16, macrosDefinicionGKg, pesoActualKg: 80, sexo: 'masculino', config });
    assert.equal(r.deficitTotalKcal, 4 * config.energia.kcalPorKgGrasa);
    assert.equal(r.pisoCalorioAplicado, false);
    assert.equal(r.carbohidratosPorDebajoDelMinimo, false);
    assert.ok(r.carbohidratosG > 0);
  });

  test('Plazo extremo (muy corto): dispara el piso calórico y reacomoda carbohidratos', () => {
    const r = calcularModoObjetivo({ kcalReferencia: 2200, kgAPerder: 8, semanas: 2, macrosDefinicionGKg, pesoActualKg: 70, sexo: 'femenino', config });
    assert.equal(r.pisoCalorioAplicado, true);
    assert.equal(r.kcalObjetivo, config.pisosCalorias.mujer);
    assert.equal(r.kcal, r.kcalObjetivo);
  });

  test('Carbohidratos en negativo (proteína+grasa ya superan el piso calórico): se marca, nunca grasos negativos', () => {
    const macrosAltos = { proteina: 3, grasa: 2 }; // P+G ya suman ~3*4+2*9=30 kcal/kg, mucho a 70kg
    const r = calcularModoObjetivo({ kcalReferencia: 2000, kgAPerder: 10, semanas: 1, macrosDefinicionGKg: macrosAltos, pesoActualKg: 70, sexo: 'femenino', config });
    assert.equal(r.carbohidratosG, 0);
    assert.equal(r.carbohidratosPorDebajoDelMinimo, true);
  });

  test('Carbohidratos por debajo del mínimo configurable (sin llegar a negativo)', () => {
    const r = calcularModoObjetivo({ kcalReferencia: 3000, kgAPerder: 6, semanas: 4, macrosDefinicionGKg: { proteina: 2.5, grasa: 1.3 }, pesoActualKg: 90, sexo: 'masculino', config });
    if (r.carbohidratosGKg < config.objetivo.carbohidratosMinimoGPorKg) {
      assert.equal(r.carbohidratosPorDebajoDelMinimo, true);
    }
  });
});

describe('calcularPlazoMinimoSugerido', () => {
  test('Apunta al ritmo configurado (óptimo, el extremo más corto en verde)', () => {
    const semanas = calcularPlazoMinimoSugerido({ kgAPerder: 4, pesoActualKg: 80 }, config);
    // 80kg * 1%/semana = 0.8kg/semana -> ceil(4/0.8) = 5
    assert.equal(semanas, 5);
  });
});

describe('calcularSemaforo', () => {
  test('Ritmo óptimo, sin pisos: da verde', () => {
    const r = calcularSemaforo({
      pesoActualKg: 80, deficitSemanalKcal: 80 * 0.007 * 7700, kcalReferencia: 2500,
      kcalObjetivo: 2000, sexo: 'masculino', bmrMifflin: 1700, grasaFinalEstimadaPct: null,
    }, config);
    assert.equal(r.nivel, 'optimo');
  });

  test('Múltiples condiciones disparadas a la vez: gana la más severa (no_recomendable)', () => {
    const r = calcularSemaforo({
      pesoActualKg: 60, deficitSemanalKcal: 60 * 0.02 * 7700, kcalReferencia: 1800,
      kcalObjetivo: 1100, sexo: 'femenino', bmrMifflin: 1400, grasaFinalEstimadaPct: 12,
    }, config);
    assert.equal(r.nivel, 'no_recomendable');
    assert.ok(r.motivos.length >= 2);
  });

  test('Advertencia de grasa final baja, independiente del nivel del semáforo', () => {
    const r = calcularSemaforo({
      pesoActualKg: 80, deficitSemanalKcal: 80 * 0.007 * 7700, kcalReferencia: 2500,
      kcalObjetivo: 2000, sexo: 'masculino', bmrMifflin: 1700, grasaFinalEstimadaPct: 6,
    }, config);
    assert.equal(r.advertenciaGrasaBaja, true);
  });
});

// ---------------------------------------------------------------------------
// Mifflin-St Jeor (informativo)
// ---------------------------------------------------------------------------

describe('Mifflin-St Jeor', () => {
  test('BMR hombre vs mujer (misma edad/peso/altura, el hombre da más alto)', () => {
    const hombre = calcularMifflinStJeor({ sexo: 'masculino', pesoKg: 75, alturaCm: 175, edad: 30 });
    const mujer = calcularMifflinStJeor({ sexo: 'femenino', pesoKg: 75, alturaCm: 175, edad: 30 });
    assert.ok(hombre > mujer);
    assert.equal(hombre - mujer, 166); // +5 vs -161 = 166 de diferencia
  });

  test('TDEE = BMR * factor de actividad de la config', () => {
    const bmr = 1700;
    const tdee = calcularTdeeMifflin({ bmr, nivel: 'alto' }, config);
    assert.equal(tdee, Math.round(bmr * config.mifflinFactoresActividad.alto));
  });
});

describe('calcularEdad', () => {
  test('cumpleaños ya pasado este año', () => {
    assert.equal(calcularEdad('1990-01-15', '2026-06-01'), 36);
  });
  test('cumpleaños todavía no llegó este año', () => {
    assert.equal(calcularEdad('1990-12-15', '2026-06-01'), 35);
  });
  test('cumpleaños es hoy', () => {
    assert.equal(calcularEdad('1990-06-01', '2026-06-01'), 36);
  });
});

// ---------------------------------------------------------------------------
// Proyección semana a semana
// ---------------------------------------------------------------------------

describe('proyectarSemanaASemana', () => {
  const referenciaGKg = { proteina: 1.8, grasa: 0.8, carbohidratos: 2.5 };

  test('El peso baja de forma consistente con el déficit semanal', () => {
    const deficitSemanalKcal = 3500;
    const filas = proyectarSemanaASemana({
      pesoInicialKg: 80, pctGrasaInicial: null, deficitSemanalKcal, kcalReferencia: 2500,
      semanas: 4, enfoque: 'estandar', sexo: 'masculino', nivel: 'intermedio', referenciaGKg,
    }, config);
    assert.equal(filas.length, 4);
    assert.equal(filas[0].pesoProyectadoKg, 80);
    const perdidaPorSemana = deficitSemanalKcal / config.energia.kcalPorKgGrasa;
    assert.ok(Math.abs(filas[1].pesoProyectadoKg - (80 - perdidaPorSemana)) < 0.05);
  });

  test('Con % graso inicial: la masa magra se mantiene constante, toda la pérdida es grasa', () => {
    const filas = proyectarSemanaASemana({
      pesoInicialKg: 80, pctGrasaInicial: 20, deficitSemanalKcal: 770, kcalReferencia: 2500,
      semanas: 2, enfoque: 'estandar', sexo: 'masculino', nivel: 'intermedio', referenciaGKg,
    }, config);
    const masaMagraInicial = 80 * 0.8;
    const masaMagraSemana2 = filas[1].pesoProyectadoKg * (1 - filas[1].pctGrasaProyectado / 100);
    assert.ok(Math.abs(masaMagraSemana2 - masaMagraInicial) < 0.1);
  });

  test('Adaptación metabólica: el piso calórico sigue aplicando semana a semana si corresponde', () => {
    const filas = proyectarSemanaASemana({
      pesoInicialKg: 55, pctGrasaInicial: 25, deficitSemanalKcal: 3000, kcalReferencia: 1700,
      semanas: 6, enfoque: 'estandar', sexo: 'femenino', nivel: 'bajo', referenciaGKg: { proteina: 1.4, grasa: 1.1, carbohidratos: 1.5 },
    }, config);
    assert.ok(filas.every((f) => f.kcal >= config.pisosCalorias.mujer));
  });

  test('La excepción de grasa en hombres se activa recién en las últimas semanas de la proyección', () => {
    const filas = proyectarSemanaASemana({
      pesoInicialKg: 85, pctGrasaInicial: null, deficitSemanalKcal: 2000, kcalReferencia: 2800,
      semanas: 10, enfoque: 'estandar', sexo: 'masculino', nivel: 'intermedio', referenciaGKg: { proteina: 2, grasa: 1, carbohidratos: 2.5 },
    }, config);
    const conExcepcion = filas.filter((f) => f.excepciones.includes('grasa_definicion_larga_hombre'));
    assert.equal(conExcepcion.length, config.excepciones.definicionLargaHombreUltimasSemanas);
    assert.equal(conExcepcion[0].semana, 10 - config.excepciones.definicionLargaHombreUltimasSemanas + 1);
  });
});

// ---------------------------------------------------------------------------
// La config pasada manda - nunca hay valores fijos adentro del motor
// ---------------------------------------------------------------------------

describe('El motor usa la config recibida, nunca valores fijos', () => {
  test('Cambiar la tabla base cambia el resultado', () => {
    const configAlterada = JSON.parse(JSON.stringify(config));
    configAlterada.base.estandar.masculino.proteina = 3.3;
    const r = calcularMacrosFase({ fase: 'mantenimiento', enfoque: 'estandar', sexo: 'masculino', nivel: 'bajo', pesoActualKg: 80 }, configAlterada);
    assert.equal(r.proteinaGKg, 3.3);
  });

  test('Cambiar kcal por gramo cambia las calorías calculadas', () => {
    const configAlterada = JSON.parse(JSON.stringify(config));
    configAlterada.energia.kcalPorGProteina = 5;
    const r1 = calcularMacrosFase({ fase: 'mantenimiento', enfoque: 'estandar', sexo: 'masculino', nivel: 'bajo', pesoActualKg: 80 }, config);
    const r2 = calcularMacrosFase({ fase: 'mantenimiento', enfoque: 'estandar', sexo: 'masculino', nivel: 'bajo', pesoActualKg: 80 }, configAlterada);
    assert.notEqual(r1.kcal, r2.kcal);
  });

  test('Cambiar el piso calórico cambia si el modo objetivo lo aplica', () => {
    const entradas = { kcalReferencia: 1800, kgAPerder: 4, semanas: 12, macrosDefinicionGKg: { proteina: 1.4, grasa: 1.1 }, pesoActualKg: 60, sexo: 'femenino' };

    const configPisoBajo = JSON.parse(JSON.stringify(config));
    configPisoBajo.pisosCalorias.mujer = 100; // piso bajísimo, no debería activarse con este déficit moderado
    const conPisoBajo = calcularModoObjetivo({ ...entradas, config: configPisoBajo });
    assert.equal(conPisoBajo.pisoCalorioAplicado, false);

    const configPisoAlto = JSON.parse(JSON.stringify(config));
    configPisoAlto.pisosCalorias.mujer = 3000; // piso absurdamente alto, siempre se activa
    const conPisoAlto = calcularModoObjetivo({ ...entradas, config: configPisoAlto });
    assert.equal(conPisoAlto.pisoCalorioAplicado, true);
    assert.equal(conPisoAlto.kcalObjetivo, 3000);
  });
});

// ---------------------------------------------------------------------------
// Validación de la config
// ---------------------------------------------------------------------------

describe('validarConfig', () => {
  test('La config de fábrica es válida', () => {
    assert.deepEqual(validarConfig(config), { valida: true, errores: [] });
  });

  test('Rechaza un coeficiente negativo donde no corresponde', () => {
    const mala = JSON.parse(JSON.stringify(config));
    mala.base.estandar.masculino.proteina = -1;
    const r = validarConfig(mala);
    assert.equal(r.valida, false);
    assert.ok(r.errores.some((e) => e.includes('base.estandar.masculino.proteina')));
  });

  test('Rechaza umbrales de días desordenados', () => {
    const mala = JSON.parse(JSON.stringify(config));
    mala.actividad.diasBajoMax = 10;
    mala.actividad.diasIntermedioMin = 4;
    const r = validarConfig(mala);
    assert.equal(r.valida, false);
  });

  test('Rechaza umbrales de pasos invertidos', () => {
    const mala = JSON.parse(JSON.stringify(config));
    mala.actividad.pasosBajarNivelHasta = 15000;
    mala.actividad.pasosSubirNivelDesde = 5000;
    const r = validarConfig(mala);
    assert.equal(r.valida, false);
  });

  test('Rechaza umbrales del semáforo desordenados', () => {
    const mala = JSON.parse(JSON.stringify(config));
    mala.objetivo.semaforo.muyLentoMax = 2;
    mala.objetivo.semaforo.optimoMax = 1;
    const r = validarConfig(mala);
    assert.equal(r.valida, false);
  });

  test('Acepta decrementos de Definición en negativo (son deltas a sumar)', () => {
    const r = validarConfig(config);
    assert.equal(r.valida, true);
  });
});
