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
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'pausada', 'finalizada'))
);

CREATE INDEX IF NOT EXISTS idx_rutina_usuario ON rutina(usuario_id);

CREATE TABLE IF NOT EXISTS dia_rutina (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rutina_id INTEGER NOT NULL REFERENCES rutina(id) ON DELETE CASCADE,
  numero_dia INTEGER NOT NULL,
  dia_semana TEXT NOT NULL,
  musculos_trabajados_json TEXT NOT NULL DEFAULT '[]'
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
  modo_lineal_forzado INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ejercicio_asignado_dia ON ejercicio_asignado(dia_rutina_id, orden);

-- ---------------------------------------------------------------------------
-- Microciclos y progreso (nucleo del motor)
-- ---------------------------------------------------------------------------

-- numero = 0 es la semana de testeo unica (no es un bloque de 2 semanas real).
CREATE TABLE IF NOT EXISTS microciclo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rutina_id INTEGER NOT NULL REFERENCES rutina(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  fecha_inicio TEXT NOT NULL,
  fecha_fin TEXT,
  estado TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'cerrado')),
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
  dia_rutina_id INTEGER NOT NULL REFERENCES dia_rutina(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  salteada INTEGER NOT NULL DEFAULT 0,
  microciclo_id INTEGER NOT NULL REFERENCES microciclo(id)
);

CREATE INDEX IF NOT EXISTS idx_registro_sesion_usuario ON registro_sesion(usuario_id, fecha);

CREATE TABLE IF NOT EXISTS registro_serie (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registro_sesion_id INTEGER NOT NULL REFERENCES registro_sesion(id) ON DELETE CASCADE,
  ejercicio_asignado_id INTEGER NOT NULL REFERENCES ejercicio_asignado(id),
  numero_serie INTEGER NOT NULL,
  peso REAL NOT NULL,
  reps INTEGER NOT NULL,
  rir INTEGER, -- puede faltar en series de semana 0 (testeo exploratorio)
  molestia TEXT
);

CREATE INDEX IF NOT EXISTS idx_registro_serie_sesion ON registro_serie(registro_sesion_id);

CREATE TABLE IF NOT EXISTS deload (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  microciclo_asociado_id INTEGER REFERENCES microciclo(id),
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
