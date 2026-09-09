import { Router } from 'express';
import { generarWorkbookInvitado } from '../services/excelGenerator.js';
import { TODOS_MUSCULOS } from '../services/routineBuilder.js';

const router = Router();

const DIAS_VALIDOS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const OBJETIVOS_VALIDOS = ['fuerza', 'hipertrofia', 'rendimiento'];
const EQUIPO_VALIDOS = ['gimnasio', 'casa', 'mixto'];

function validar(payload) {
  const errores = [];
  if (!payload || typeof payload !== 'object') return ['Payload invalido.'];

  const { objetivo, equipamiento, dias_especificos } = payload;

  if (!objetivo || !OBJETIVOS_VALIDOS.includes(objetivo.tipo)) {
    errores.push('objetivo.tipo debe ser fuerza, hipertrofia o rendimiento.');
  }
  if (objetivo?.tipo === 'rendimiento' && !objetivo?.deporte) {
    errores.push('objetivo.deporte es obligatorio cuando el objetivo es rendimiento.');
  }
  if (!objetivo?.sub_objetivo) {
    errores.push('objetivo.sub_objetivo es obligatorio.');
  }

  if (!equipamiento || !EQUIPO_VALIDOS.includes(equipamiento.tipo)) {
    errores.push('equipamiento.tipo debe ser gimnasio, casa o mixto.');
  }
  if (equipamiento?.musculos_ubicacion && typeof equipamiento.musculos_ubicacion === 'object') {
    for (const [musculo, ubicacion] of Object.entries(equipamiento.musculos_ubicacion)) {
      if (!TODOS_MUSCULOS.includes(musculo) || !['gimnasio', 'casa'].includes(ubicacion)) {
        errores.push(`equipamiento.musculos_ubicacion invalido en "${musculo}": debe mapear un musculo valido a gimnasio o casa.`);
        break;
      }
    }
  }

  if (!Array.isArray(dias_especificos) || dias_especificos.length < 2 || dias_especificos.length > 6) {
    errores.push('dias_especificos debe tener entre 2 y 6 dias.');
  } else if (dias_especificos.some((d) => !DIAS_VALIDOS.includes(d))) {
    errores.push(`dias_especificos debe contener valores de: ${DIAS_VALIDOS.join(', ')}.`);
  }

  return errores;
}

router.post('/rutina.xlsx', async (req, res, next) => {
  try {
    const errores = validar(req.body);
    if (errores.length) {
      return res.status(400).json({ error: 'Datos invalidos.', detalles: errores });
    }

    const { workbook } = generarWorkbookInvitado(req.body);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plan-entrenamiento-6-meses.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

export default router;
