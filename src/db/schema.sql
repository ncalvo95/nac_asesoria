-- Schema SQLite - WebApp de programacion de entrenamientos
-- Convenciones: fechas en TEXT ISO-8601, booleanos en INTEGER 0/1, listas/objetos en TEXT JSON.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Usuarios y roles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'coach', 'cliente')),
  coach_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_nacimiento TEXT,
  altura_cm REAL,
  sexo_biologico TEXT CHECK (sexo_biologico IN ('masculino', 'femenino')),
  nivel_entrenamiento TEXT CHECK (nivel_entrenamiento IN ('principiante', 'intermedio', 'avanzado')),
  anios_entrenamiento_continuo REAL,
  unidad_medida TEXT NOT NULL DEFAULT 'kg_cm' CHECK (unidad_medida IN ('kg_cm', 'lb_in')),
  activo INTEGER NOT NULL DEFAULT 1,
  -- No NULL mientras la cuenta es un placeholder de invitacion sin reclamar
  -- (usuario/password_hash random, ver src/services/invites.js). Se pisa
  -- (vuelve a NULL) al reclamar el codigo - a partir de ahi la cuenta ya es
  -- utilizable y el codigo queda consumido.
  invite_code TEXT UNIQUE,
  -- Si esta en 1 (solo aplica a rol 'cliente' con coach_id asignado), sus
  -- cambios de objetivo/disponibilidad/equipamiento/rutina no se aplican al
  -- toque: quedan en solicitud_cambio hasta que el coach los apruebe.
  requiere_aprobacion_coach INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usuarios_coach_id ON usuarios(coach_id);

-- Sesiones de autenticacion (no confundir con "sesion de entrenamiento" =
-- registro_sesion). Token opaco: nunca se guarda el token en texto plano,
-- solo su hash SHA-256 - si alguien lee la base no puede reconstruir
-- cookies validas. Revocar una sesion puntual es un DELETE, sin necesidad
-- de blacklist como haria falta con un JWT autocontenido.
CREATE TABLE IF NOT EXISTS sesiones_auth (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  recordar INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  etiqueta TEXT
);

CREATE INDEX IF NOT EXISTS idx_sesiones_auth_usuario ON sesiones_auth(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_auth_token_hash ON sesiones_auth(token_hash);

-- Cambios de un cliente con requiere_aprobacion_coach=1 que quedan a la
-- espera de que su coach los apruebe antes de aplicarse de verdad (ver
-- src/services/solicitudCambio.js). payload_json guarda exactamente lo que
-- se hubiera aplicado directo (mismo shape que el body del endpoint
-- original) - al aprobar se aplica tal cual, sin volver a pedir datos.
CREATE TABLE IF NOT EXISTS solicitud_cambio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  coach_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('objetivo', 'disponibilidad', 'equipamiento', 'rutina_auto', 'rutina_manual', 'rutina_split')),
  payload_json TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resuelta_at TEXT,
  nota_coach TEXT
);

CREATE INDEX IF NOT EXISTS idx_solicitud_cambio_coach ON solicitud_cambio(coach_id, estado);
CREATE INDEX IF NOT EXISTS idx_solicitud_cambio_usuario ON solicitud_cambio(usuario_id);

CREATE TABLE IF NOT EXISTS perfil_medico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  historial_lesiones TEXT,
  limitaciones_articulares TEXT
);

CREATE TABLE IF NOT EXISTS registro_antropometrico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  peso_corporal REAL,
  formula_pliegues TEXT CHECK (formula_pliegues IN ('jackson_pollock', 'faulkner', 'yuhasz', NULL)),
  pliegues_json TEXT,
  circunferencias_json TEXT,
  diametros_oseos_json TEXT,
  porcentaje_graso_calculado REAL
);

CREATE INDEX IF NOT EXISTS idx_registro_antropometrico_usuario ON registro_antropometrico(usuario_id, fecha);

-- Pasos diarios (podometro/celular, cargados a mano) - UN valor por usuario
-- y dia de calendario, independiente de si ese dia tiene entrenamiento o es
-- de descanso (a diferencia de dia_rutina, que solo existe para los dias
-- que se entrena). Pensado como insumo para la futura calculadora de
-- calorias/actividad (TDEE necesita el nivel de actividad de la semana
-- completa, no solo de los dias de gym) - por eso vive aparte del motor de
-- entrenamiento, no colgado de ningun dia_rutina/microciclo puntual.
CREATE TABLE IF NOT EXISTS registro_pasos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  pasos INTEGER NOT NULL,
  UNIQUE (usuario_id, fecha)
);

-- ---------------------------------------------------------------------------
-- Catalogo de musculos y ejercicios (fijo, mantenido por el coach/admin)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS musculo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  region TEXT NOT NULL CHECK (region IN ('torso', 'pierna'))
);

CREATE TABLE IF NOT EXISTS referencia_volumen_muscular (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  musculo_id INTEGER NOT NULL UNIQUE REFERENCES musculo(id) ON DELETE CASCADE,
  mev INTEGER NOT NULL,
  mav INTEGER NOT NULL,
  mrv INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ejercicio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  musculo_primario_id INTEGER NOT NULL REFERENCES musculo(id),
  musculos_secundarios_json TEXT NOT NULL DEFAULT '[]',
  tipo TEXT NOT NULL CHECK (tipo IN ('compuesto', 'aislado')),
  patron_movimiento TEXT NOT NULL,
  equipamiento_requerido_json TEXT NOT NULL DEFAULT '[]',
  es_unilateral INTEGER NOT NULL DEFAULT 0,
  es_compuesto_principal_fuerza INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_ejercicio_musculo_primario ON ejercicio(musculo_primario_id);

CREATE TABLE IF NOT EXISTS preferencia_ejercicio_usuario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ejercicio_id INTEGER REFERENCES ejercicio(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('exclusion', 'preferencia', 'agregado_personalizado')),
  nombre_personalizado TEXT,
  musculo_asignado_id INTEGER REFERENCES musculo(id)
);

CREATE INDEX IF NOT EXISTS idx_pref_ejercicio_usuario ON preferencia_ejercicio_usuario(usuario_id);

-- ---------------------------------------------------------------------------
-- Objetivo, disponibilidad, equipamiento del usuario (onboarding)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS objetivo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('fuerza', 'hipertrofia', 'rendimiento')),
  sub_objetivo TEXT NOT NULL,
  deporte TEXT
);

CREATE TABLE IF NOT EXISTS disponibilidad (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  dias_por_semana INTEGER NOT NULL,
  dias_especificos_json TEXT NOT NULL, -- ej. ["lunes","martes","jueves"]
  duracion_sesion_json TEXT NOT NULL   -- ej. {"lunes":60,"martes":45,"jueves":90}
);

CREATE TABLE IF NOT EXISTS equipamiento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  -- 'gimnasio'/'casa': todo el equipamiento uniforme. 'mixto': cada musculo
  -- puede tener su propia ubicacion (musculos_ubicacion_json), no obligatorio
  -- por musculo - el que no se especifica cae en 'gimnasio' por default.
  tipo TEXT NOT NULL CHECK (tipo IN ('gimnasio', 'casa', 'mixto')),
  checklist_json TEXT NOT NULL DEFAULT '[]',
  musculos_ubicacion_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS rm_estimado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ejercicio_id INTEGER NOT NULL REFERENCES ejercicio(id),
  valor REAL NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  tipo TEXT NOT NULL CHECK (tipo IN ('real', 'estimado'))
);

CREATE INDEX IF NOT EXISTS idx_rm_estimado_usuario ON rm_estimado(usuario_id, ejercicio_id);

-- ---------------------------------------------------------------------------
-- Rutina, split, dias y ejercicios asignados
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rutina (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  split_asignado TEXT NOT NULL,
  fecha_inicio TEXT NOT NULL DEFAULT (date('now')),
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'pausada', 'finalizada')),
  -- Nombre elegido por el usuario para identificarla en "Mis rutinas" (ej.
  -- "Rutina de verano") - si es NULL se sigue mostrando split_asignado, como
  -- siempre.
  nombre TEXT
);

CREATE INDEX IF NOT EXISTS idx_rutina_usuario ON rutina(usuario_id);

CREATE TABLE IF NOT EXISTS dia_rutina (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rutina_id INTEGER NOT NULL REFERENCES rutina(id) ON DELETE CASCADE,
  numero_dia INTEGER NOT NULL,
  dia_semana TEXT NOT NULL,
  musculos_trabajados_json TEXT NOT NULL DEFAULT '[]',
  -- 0 = el usuario quito este dia de la rutina despues de haber entrenado ahi
  -- (tiene registro_sesion) - no se borra para no perder ese historial, pero
  -- deja de aparecer como dia activo (ver agregarDiaRutina/quitarDiaRutina en
  -- rutinaService.js). Si nunca llego a tener sesiones, se borra directo.
  activo INTEGER NOT NULL DEFAULT 1,
  comentario TEXT,
  -- 1 = mostrar el comentario como recordatorio destacado la proxima vez
  -- que se abra este dia en Entrenamiento (no solo accesible al tocar
  -- "Comentario").
  comentario_recordar INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_dia_rutina_rutina ON dia_rutina(rutina_id);

CREATE TABLE IF NOT EXISTS ejercicio_asignado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dia_rutina_id INTEGER NOT NULL REFERENCES dia_rutina(id) ON DELETE CASCADE,
  ejercicio_id INTEGER NOT NULL REFERENCES ejercicio(id),
  orden INTEGER NOT NULL, -- editable por el usuario; por defecto sugerido segun preferencias
  es_top_de_musculo INTEGER NOT NULL DEFAULT 0,
  musculo_objetivo_id INTEGER NOT NULL REFERENCES musculo(id),
  series_actuales INTEGER NOT NULL DEFAULT 2,
  peso_actual REAL,
  rango_reps_min INTEGER NOT NULL,
  rango_reps_max INTEGER NOT NULL,
  descanso_segundos INTEGER NOT NULL DEFAULT 90,
  comentario TEXT,
  comentario_recordar INTEGER NOT NULL DEFAULT 0,
  -- Hasta 2 musculos secundarios elegidos a mano para ESTE ejercicio puntual
  -- (union con los musculos_secundarios_json del catalogo, no reemplazo -
  -- ver musculosSecundariosDe en routineBuilder.js), para cuando el
  -- catalogo no capta bien lo que un ejercicio en particular le pega a un
  -- musculo (o para un ejercicio "particular" sin dato de catalogo).
  musculos_secundarios_json TEXT NOT NULL DEFAULT '[]',
  -- 0 = el motor de progresion (cerrarMicrociclo) no toca peso_prescrito/
  -- piso_reps/series_prescritas de ESTE ejercicio al cerrar el microciclo -
  -- quedan iguales al bloque anterior, pase lo que pase. Pensado para
  -- ejercicios que se entrenan a proposito con un objetivo de reps que el
  -- motor normal bajaria solo (ej. piernas a repeticiones altas: superar
  -- rango_reps_max sube el peso, lo que de por si baja las reps esperadas
  -- el proximo bloque). 1 (default) = comportamiento de siempre.
  progreso_automatico INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_ejercicio_asignado_dia ON ejercicio_asignado(dia_rutina_id, orden);

-- Ejercicios alternativos equivalentes para un slot (ej. "la maquina esta
-- rota/ocupada, hoy hago otro que trabaje lo mismo"). Cada variante tiene su
-- propio peso/techo de referencia, cargado y editado a mano (no los toca el
-- motor de progresion) - asi no se mezcla con el peso del ejercicio titular,
-- que puede no ser comparable (ej. mancuernas vs barra). ejercicio_asignado.
-- variante_activa_id (ver columnasNuevas en migrate.js) apunta a cual de
-- estas, si alguna, se usa en la PROXIMA sesion de este slot - se limpia
-- solo al registrar esa sesion (ver registrarSesion en progressionEngine.js),
-- asi que elegir una variante es "solo por esta vez", nunca permanente (para
-- eso ya esta "Cambiar ejercicio"/sustituirEjercicio).
CREATE TABLE IF NOT EXISTS ejercicio_variante (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ejercicio_asignado_id INTEGER NOT NULL REFERENCES ejercicio_asignado(id) ON DELETE CASCADE,
  ejercicio_id INTEGER NOT NULL REFERENCES ejercicio(id),
  peso_actual REAL,
  piso_reps INTEGER,
  UNIQUE (ejercicio_asignado_id, ejercicio_id)
);

-- ---------------------------------------------------------------------------
-- Microciclos y progreso (nucleo del motor)
-- ---------------------------------------------------------------------------

-- numero = 0 es siempre la semana de testeo inicial (no es un bloque de 2
-- semanas real). tipo distingue microciclos "especiales" que puedan
-- aparecer mas adelante en la rutina con cualquier numero: 'testeo' (el
-- usuario pidio recalibrar peso/reps desde cero, numero=0 siempre lo es
-- pero tambien puede pedirse de nuevo mas adelante - se comparan entre si
-- en Progreso) o 'descarga' (semana de descarga real, no cuenta para la
-- progresion - ver marcarSemanaDescarga en progressionEngine.js).
CREATE TABLE IF NOT EXISTS microciclo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rutina_id INTEGER NOT NULL REFERENCES rutina(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  fecha_inicio TEXT NOT NULL,
  fecha_fin TEXT,
  estado TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'cerrado')),
  tipo TEXT NOT NULL DEFAULT 'normal' CHECK (tipo IN ('normal', 'testeo', 'descarga')),
  borrador_semana0 TEXT,
  -- Fase nutricional que el usuario esta llevando esa semana (informativo,
  -- no afecta el motor de progresion) - NULL = sin definir.
  fase_nutricional TEXT CHECK (fase_nutricional IN ('volumen', 'definicion', 'mantenimiento')),
  UNIQUE (rutina_id, numero)
);

CREATE TABLE IF NOT EXISTS progreso_ejercicio_microciclo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ejercicio_asignado_id INTEGER NOT NULL REFERENCES ejercicio_asignado(id) ON DELETE CASCADE,
  microciclo_id INTEGER NOT NULL REFERENCES microciclo(id) ON DELETE CASCADE,
  peso_prescrito REAL NOT NULL,
  piso_reps INTEGER NOT NULL,
  series_prescritas INTEGER NOT NULL DEFAULT 2,
  sem1_reps INTEGER,
  sem2_reps INTEGER,
  techo_reps INTEGER,
  mejoro INTEGER,
  serie_agregada INTEGER NOT NULL DEFAULT 0,
  nota TEXT,
  UNIQUE (ejercicio_asignado_id, microciclo_id)
);

CREATE TABLE IF NOT EXISTS progreso_muscular_microciclo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  musculo_id INTEGER NOT NULL REFERENCES musculo(id),
  microciclo_id INTEGER NOT NULL REFERENCES microciclo(id) ON DELETE CASCADE,
  estancado INTEGER NOT NULL DEFAULT 0,
  serie_agregada INTEGER NOT NULL DEFAULT 0,
  volumen_directo INTEGER NOT NULL DEFAULT 0,
  volumen_indirecto INTEGER NOT NULL DEFAULT 0,
  cerca_de_mav INTEGER NOT NULL DEFAULT 0,
  UNIQUE (usuario_id, musculo_id, microciclo_id)
);

-- ---------------------------------------------------------------------------
-- Registro de entrenamiento
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS registro_sesion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  dia_rutina_id INTEGER NOT NULL REFERENCES dia_rutina(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  salteada INTEGER NOT NULL DEFAULT 0,
  microciclo_id INTEGER NOT NULL REFERENCES microciclo(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_registro_sesion_usuario ON registro_sesion(usuario_id, fecha);

CREATE TABLE IF NOT EXISTS registro_serie (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registro_sesion_id INTEGER NOT NULL REFERENCES registro_sesion(id) ON DELETE CASCADE,
  ejercicio_asignado_id INTEGER NOT NULL REFERENCES ejercicio_asignado(id) ON DELETE CASCADE,
  numero_serie INTEGER NOT NULL,
  peso REAL NOT NULL,
  reps INTEGER NOT NULL,
  rir INTEGER, -- puede faltar en series de semana 0 (testeo exploratorio)
  molestia TEXT,
  es_dropset INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_registro_serie_sesion ON registro_serie(registro_sesion_id);

CREATE TABLE IF NOT EXISTS deload (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  microciclo_asociado_id INTEGER REFERENCES microciclo(id) ON DELETE CASCADE,
  detalle_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS reporte_progreso (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha_generacion TEXT NOT NULL DEFAULT (datetime('now')),
  periodo_cubierto TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('semestral', 'mesociclo')),
  datos_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reporte_progreso_usuario ON reporte_progreso(usuario_id);

-- Feedback / reportes de bug / pedidos de cualquier usuario logueado hacia
-- el admin (ver src/routes/feedback.js) - un canal de texto libre, no
-- reemplaza solicitud_cambio (eso es "aplicar un cambio real" con
-- aprobacion del coach).
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'otro' CHECK (tipo IN ('bug', 'sugerencia', 'otro')),
  mensaje TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'revisado')),
  nota_admin TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resuelto_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_estado ON feedback(estado, created_at);

-- Borrador de lo que se va tipeando en el registro normal de un dia (peso/
-- reps/RIR/dropset por ejercicio) SIN haber guardado la sesion todavia -
-- mismo espiritu que microciclo.borrador_semana0, pero para el dia a dia:
-- antes esto solo vivia en localStorage del dispositivo, asi que lo
-- cargado en la compu en casa no se veia en el celular en el gimnasio
-- hasta recien guardar la sesion entera. Un dia se entrena en muchos
-- microciclos distintos a lo largo de la rutina, cada uno con su propio
-- borrador -por eso la clave es (dia_rutina_id, microciclo_id), no solo
-- dia_rutina_id.
CREATE TABLE IF NOT EXISTS borrador_dia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dia_rutina_id INTEGER NOT NULL REFERENCES dia_rutina(id) ON DELETE CASCADE,
  microciclo_id INTEGER NOT NULL REFERENCES microciclo(id) ON DELETE CASCADE,
  valores_json TEXT NOT NULL DEFAULT '{}',
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (dia_rutina_id, microciclo_id)
);

-- ---------------------------------------------------------------------------
-- Nutricion / calculadora de calorias y macros
-- ---------------------------------------------------------------------------

-- Cada guardado desde el panel de admin crea una fila nueva (nunca se
-- edita una existente) - la de id mas alto es la version activa. "Volver a
-- una version anterior" tambien crea una fila nueva con ese config_json
-- copiado, asi el historial queda siempre lineal y completo (ver
-- nutritionConfigService.js). config_json trae TODOS los numeros del
-- modulo (tablas base, incrementos, excepciones, umbrales de actividad,
-- kcal por gramo/por kg de grasa, umbrales del semaforo, pisos caloricos,
-- minimo de carbohidratos, adaptacion metabolica) - ver nutritionDefaults.js
-- para la forma exacta y los valores de fabrica.
CREATE TABLE IF NOT EXISTS nutrition_config_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_json TEXT NOT NULL,
  created_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  comment TEXT
);

-- Un plan de nutricion (fase/enfoque/nivel + como se resolvio la
-- referencia para Definicion) - los resultados en si (macros, semana a
-- semana, semaforo) NUNCA se guardan, se recalculan "on read" con el
-- motor puro de shared/nutrition/ (ver nutritionService.js). Solo el plan
-- ACTIVO de cada usuario se recalcula con la configuracion VIGENTE -los
-- archivados quedan congelados con su propio config_version_id, para que
-- tocar el panel de admin no reescriba en silencio como se veia un plan
-- viejo, y para que "el ultimo plan" usado como referencia de uno nuevo
-- siga reflejando lo que se le recomendo en su momento (ver
-- resolverReferenciaDefinicion en el motor).
CREATE TABLE IF NOT EXISTS nutrition_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  phase TEXT NOT NULL CHECK (phase IN ('mantenimiento', 'volumen', 'definicion')),
  focus TEXT NOT NULL CHECK (focus IN ('estandar', 'carbohidratos')),
  activity_level TEXT NOT NULL CHECK (activity_level IN ('sin_entrenar', 'bajo', 'intermedio', 'alto')),
  activity_source TEXT NOT NULL CHECK (activity_source IN ('auto', 'manual')),
  -- NULL salvo en Definicion (la unica fase con "referencia" de la que
  -- restar/completar) - ver resolverReferenciaDefinicion.
  reference_source TEXT CHECK (reference_source IN ('plan_anterior', 'macros_actuales', 'tabla')),
  reference_macros_json TEXT,
  -- Peso corporal (kg) con el que se armo ESTE plan - columna propia, no
  -- enterrada en params_json, porque el motor la necesita en el camino
  -- critico: para usar este plan como referencia de uno nuevo hay que
  -- reconvertir sus macros a g/kg, y eso exige saber que peso se uso aca.
  reference_weight_kg REAL NOT NULL,
  start_date TEXT NOT NULL DEFAULT (date('now')),
  -- Duracion estimada/objetivo en semanas - obligatoria en el modo
  -- objetivo (goal_fat_kg no nulo), opcional en el resto (sirve igual para
  -- decidir si aplica la excepcion de grasa de definiciones largas).
  weeks INTEGER,
  goal_fat_kg REAL,
  config_version_id INTEGER NOT NULL REFERENCES nutrition_config_versions(id),
  params_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_nutrition_plans_usuario ON nutrition_plans(user_id, status);
-- Un solo plan activo por usuario, a nivel base de datos (no solo de
-- aplicacion) - el service que activa un plan nuevo primero archiva el
-- que estuviera activo, en la misma transaccion.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nutrition_plans_un_activo ON nutrition_plans(user_id) WHERE status = 'active';
