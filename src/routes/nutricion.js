import { Router } from 'express';
import { requireAuth, requireRole, puedeAccederAUsuario } from '../middleware/auth.js';
import {
  obtenerConfigActiva,
  obtenerVersionConfig,
  listarHistorialVersiones,
  guardarNuevaVersionConfig,
  restaurarVersionConfig,
  restaurarValoresDeFabrica,
  resolverConfigNutricion,
} from '../services/nutritionConfigService.js';
import { validarConfig } from '../../shared/nutrition/nutritionEngine.js';
import {
  obtenerPlanActivo,
  listarPlanesArchivados,
  crearPlan,
  archivarPlanActivo,
  actualizarProgresoPlan,
} from '../services/nutritionService.js';
import { debeQuedarPendiente, crearSolicitudCambio } from '../services/solicitudCambio.js';
import { generarWorkbookNutricion } from '../services/excelGenerator.js';
import {
  verificarPermisoOverride, obtenerOverrideCrudo, guardarOverride, borrarOverride,
  copiarParametrosEfectivos, resolverConMerge,
} from '../services/parametroOverrideService.js';

const router = Router();
router.use(requireAuth);

// Solo lectura: cualquier usuario logueado la necesita para calcular en
// vivo (frontend).
router.get('/config', (req, res) => {
  const activa = obtenerConfigActiva();
  res.json({ id: activa.id, config: activa.config, createdAt: activa.createdAt, comment: activa.comment });
});

// ---- Plan de nutricion de un usuario (no exclusivo del admin: el propio
// usuario, su coach o el admin) ----
function checkAccesoUsuario(req, res) {
  const usuarioId = Number(req.params.usuarioId);
  if (!puedeAccederAUsuario(req.usuario, usuarioId)) {
    res.status(403).json({ error: 'No autorizado.' });
    return null;
  }
  return usuarioId;
}

router.get('/usuarios/:usuarioId/plan', (req, res) => {
  const usuarioId = checkAccesoUsuario(req, res);
  if (usuarioId === null) return;
  try {
    res.json(obtenerPlanActivo(usuarioId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/usuarios/:usuarioId/planes', (req, res) => {
  const usuarioId = checkAccesoUsuario(req, res);
  if (usuarioId === null) return;
  res.json(listarPlanesArchivados(usuarioId));
});

router.get('/usuarios/:usuarioId/export.xlsx', async (req, res) => {
  const usuarioId = checkAccesoUsuario(req, res);
  if (usuarioId === null) return;
  try {
    const { workbook } = generarWorkbookNutricion(usuarioId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="historial-nutricion.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Crear (o reemplazar) un plan es una decision de estrategia -como
// objetivo/disponibilidad/rutina-, asi que respeta el mismo toggle
// "que mi coach apruebe mis cambios" (debeQuedarPendiente en
// solicitudCambio.js): si esta activo, queda pendiente en vez de aplicarse
// directo. El seguimiento quincenal (PATCH /plan/progreso, mas abajo) NO
// pasa por aca a proposito - es reportar el peso real de hoy sobre un plan
// YA aprobado, no una estrategia nueva, mismo criterio que registrar una
// sesion de entrenamiento.
router.post('/usuarios/:usuarioId/plan', (req, res) => {
  const usuarioId = checkAccesoUsuario(req, res);
  if (usuarioId === null) return;
  if (debeQuedarPendiente(req.usuario, usuarioId)) {
    const s = crearSolicitudCambio({ usuario_id: usuarioId, coach_id: req.usuario.coach_id, tipo: 'nutricion_plan', payload: req.body || {} });
    return res.status(202).json({ pendiente: true, solicitud_id: s.id });
  }
  try {
    const plan = crearPlan(usuarioId, req.body || {}, req.usuario.id);
    res.status(201).json(plan);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Seguimiento quincenal del modo objetivo: re-basea el plan activo con el
// peso real de hoy (ver actualizarProgresoPlan).
router.patch('/usuarios/:usuarioId/plan/progreso', (req, res) => {
  const usuarioId = checkAccesoUsuario(req, res);
  if (usuarioId === null) return;
  const { pesoActualKg } = req.body || {};
  try {
    res.json(actualizarProgresoPlan(usuarioId, pesoActualKg));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/usuarios/:usuarioId/plan', (req, res) => {
  const usuarioId = checkAccesoUsuario(req, res);
  if (usuarioId === null) return;
  try {
    res.json(archivarPlanActivo(usuarioId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Override por usuario del "nucleo de recalibracion" de nutricion -
// deliberadamente mas chico que el override de entrenamiento: solo
// tendenciaPeso, objetivo.adaptacionMetabolica, objetivo.semaforo,
// objetivo.ritmoSugeridoPctSemana y pisosCalorias. Las tablas de g/kg
// (base, incrementosCarbohidratos, excepciones, etc.) son el estandar
// nutricional en si, nunca personalizables por coach/alumno - ver la
// discusion en la sesion que agrego esto.
// ---------------------------------------------------------------------------
const ALCANCE_OVERRIDE_NUTRICION = {
  tendenciaPeso: null, // seccion entera permitida
  pisosCalorias: null, // seccion entera permitida
  objetivo: ['adaptacionMetabolica', 'semaforo', 'ritmoSugeridoPctSemana'],
};

// Rechaza cualquier clave (de primer o segundo nivel, ver
// ALCANCE_OVERRIDE_NUTRICION) fuera del nucleo de recalibracion - a
// diferencia de validarConfig (que valida NUMEROS), esto valida ALCANCE:
// que campos se permite tocar en un override, nunca en el global del admin.
function validarAlcanceOverrideNutricion(config) {
  for (const clave of Object.keys(config)) {
    if (!(clave in ALCANCE_OVERRIDE_NUTRICION)) {
      return `No se puede personalizar "${clave}" - solo tendenciaPeso, objetivo (adaptación metabólica/semáforo/ritmo sugerido) y pisosCalorias.`;
    }
    const subclaves = ALCANCE_OVERRIDE_NUTRICION[clave];
    if (subclaves && config[clave] && typeof config[clave] === 'object') {
      for (const sub of Object.keys(config[clave])) {
        if (!subclaves.includes(sub)) {
          return `No se puede personalizar "${clave}.${sub}" - dentro de "${clave}" solo: ${subclaves.join(', ')}.`;
        }
      }
    }
  }
  return null;
}

router.get('/usuarios/:usuarioId/config', (req, res) => {
  const usuarioId = checkAccesoUsuario(req, res);
  if (usuarioId === null) return;
  const override = obtenerOverrideCrudo(usuarioId, 'nutricion');
  res.json({
    efectivo: resolverConfigNutricion(usuarioId),
    override: override?.config ?? null,
    personalizado: Boolean(override),
  });
});

router.put('/usuarios/:usuarioId/config', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  try {
    verificarPermisoOverride(req.usuario, usuarioId);
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
  const { config } = req.body || {};
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'config es obligatorio.' });
  }
  const errorAlcance = validarAlcanceOverrideNutricion(config);
  if (errorAlcance) return res.status(400).json({ error: errorAlcance });

  const global = obtenerConfigActiva().config;
  const { valida, errores } = validarConfig(resolverConMerge(global, config));
  if (!valida) return res.status(400).json({ error: 'La configuración resultante no es válida.', errores });

  guardarOverride({ usuarioId, dominio: 'nutricion', config, updatedBy: req.usuario.id });
  res.json({ efectivo: resolverConfigNutricion(usuarioId), override: config, personalizado: true });
});

router.delete('/usuarios/:usuarioId/config', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  try {
    verificarPermisoOverride(req.usuario, usuarioId);
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
  borrarOverride(usuarioId, 'nutricion');
  res.json({ efectivo: resolverConfigNutricion(usuarioId), override: null, personalizado: false });
});

router.post('/usuarios/:usuarioId/config/copiar', (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  const { usuarioOrigenId } = req.body || {};
  if (!usuarioOrigenId) return res.status(400).json({ error: 'usuarioOrigenId es obligatorio.' });
  try {
    verificarPermisoOverride(req.usuario, usuarioId);
    verificarPermisoOverride(req.usuario, Number(usuarioOrigenId));
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
  // Copia solo el "nucleo de recalibracion" del efectivo de origen (no
  // todo nutritionDefaults - el resto de las secciones del efectivo son el
  // global, no tiene sentido guardarlas como override).
  const efectivoOrigen = resolverConfigNutricion(Number(usuarioOrigenId));
  const recorte = {};
  for (const clave of Object.keys(ALCANCE_OVERRIDE_NUTRICION)) recorte[clave] = efectivoOrigen[clave];
  copiarParametrosEfectivos({ efectivoOrigen: recorte, usuarioDestinoId: usuarioId, dominio: 'nutricion', updatedBy: req.usuario.id });
  res.json({ efectivo: resolverConfigNutricion(usuarioId), override: recorte, personalizado: true });
});

// Todo lo demas (historial, guardar, restaurar) es exclusivo del admin -
// "el admin... es el único que edita la configuración" (prompt original).
router.use(requireRole('admin'));

router.get('/config/historial', (req, res) => {
  res.json(listarHistorialVersiones());
});

router.get('/config/version/:id', (req, res) => {
  try {
    res.json(obtenerVersionConfig(Number(req.params.id)));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/config', (req, res) => {
  const { config, comment } = req.body || {};
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'config es obligatorio.' });
  }
  try {
    const guardada = guardarNuevaVersionConfig({ config, createdBy: req.usuario.id, comment });
    res.json(guardada);
  } catch (err) {
    res.status(400).json({ error: err.message, errores: err.errores });
  }
});

router.post('/config/restaurar/:id', (req, res) => {
  const { comment } = req.body || {};
  try {
    const restaurada = restaurarVersionConfig(Number(req.params.id), { createdBy: req.usuario.id, comment });
    res.json(restaurada);
  } catch (err) {
    res.status(400).json({ error: err.message, errores: err.errores });
  }
});

router.post('/config/restaurar-fabrica', (req, res) => {
  const { comment } = req.body || {};
  const restaurada = restaurarValoresDeFabrica({ createdBy: req.usuario.id, comment });
  res.json(restaurada);
});

export default router;
