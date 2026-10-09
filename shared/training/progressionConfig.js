// Validacion del "nucleo de progresion" de entrenamiento (usada por Express
// al guardar una version nueva) - mismo criterio que validarConfig en
// shared/nutrition/nutritionEngine.js.

function esNumeroFinito(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validarRango(obj, ruta, errores) {
  if (!obj) { errores.push(`Falta "${ruta}".`); return; }
  if (!esNumeroFinito(obj.min) || obj.min < 0) errores.push(`${ruta}.min debe ser un número mayor o igual a 0.`);
  if (!esNumeroFinito(obj.max) || obj.max < 0) errores.push(`${ruta}.max debe ser un número mayor o igual a 0.`);
  if (esNumeroFinito(obj.min) && esNumeroFinito(obj.max) && obj.min > obj.max) {
    errores.push(`${ruta}.min no puede ser mayor a ${ruta}.max.`);
  }
}

export function validarConfigProgresion(config) {
  const errores = [];
  if (!config || typeof config !== 'object') {
    return { valida: false, errores: ['La configuración debe ser un objeto.'] };
  }

  try {
    if (!esNumeroFinito(config.incrementoKg) || config.incrementoKg <= 0) {
      errores.push('incrementoKg debe ser un número mayor a 0.');
    }
    if (!esNumeroFinito(config.seriesMinimo) || config.seriesMinimo < 1) {
      errores.push('seriesMinimo debe ser un número mayor o igual a 1.');
    }

    const rr = config.rangoReps;
    if (!rr) errores.push('Falta la sección "rangoReps".');
    else {
      validarRango(rr.rendimientoPierna, 'rangoReps.rendimientoPierna', errores);
      validarRango(rr.fuerzaCompuesto, 'rangoReps.fuerzaCompuesto', errores);
      validarRango(rr.default, 'rangoReps.default', errores);
    }

    const ts = config.topeSeries;
    if (!ts) errores.push('Falta la sección "topeSeries".');
    else {
      if (!esNumeroFinito(ts.fuerzaCompuesto) || ts.fuerzaCompuesto < 1) errores.push('topeSeries.fuerzaCompuesto debe ser un número mayor o igual a 1.');
      if (!esNumeroFinito(ts.default) || ts.default < 1) errores.push('topeSeries.default debe ser un número mayor o igual a 1.');
    }

    const ut = config.umbralesTecho;
    if (!ut) errores.push('Falta la sección "umbralesTecho".');
    else {
      if (!esNumeroFinito(ut.variacionPorcentual) || ut.variacionPorcentual < 0) errores.push('umbralesTecho.variacionPorcentual debe ser un número mayor o igual a 0.');
      if (!esNumeroFinito(ut.variacionRepsAbs) || ut.variacionRepsAbs < 0) errores.push('umbralesTecho.variacionRepsAbs debe ser un número mayor o igual a 0.');
      if (!esNumeroFinito(ut.serieLarga) || ut.serieLarga < 0) errores.push('umbralesTecho.serieLarga debe ser un número mayor o igual a 0.');
    }

    if (!esNumeroFinito(config.repsEfectivasUmbral) || config.repsEfectivasUmbral < 1) {
      errores.push('repsEfectivasUmbral debe ser un número mayor o igual a 1.');
    }

    const d = config.descarga;
    if (!d) errores.push('Falta la sección "descarga".');
    else {
      if (!esNumeroFinito(d.seriesMinimo) || d.seriesMinimo < 1) errores.push('descarga.seriesMinimo debe ser un número mayor o igual a 1.');
      if (!esNumeroFinito(d.fraccionSeries) || d.fraccionSeries <= 0 || d.fraccionSeries > 1) errores.push('descarga.fraccionSeries debe ser un número entre 0 (exclusivo) y 1.');
      if (!esNumeroFinito(d.pesoRestoFraccion) || d.pesoRestoFraccion <= 0 || d.pesoRestoFraccion > 1) errores.push('descarga.pesoRestoFraccion debe ser un número entre 0 (exclusivo) y 1.');
    }
  } catch (err) {
    errores.push(`Error inesperado validando la configuración: ${err.message}`);
  }

  return { valida: errores.length === 0, errores };
}
