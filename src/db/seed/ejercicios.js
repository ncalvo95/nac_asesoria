// Catalogo maestro de ejercicios (fijo). El usuario no puede escribir nombres
// libres aqui - solo puede agregar un ejercicio propio via
// preferencia_ejercicio_usuario (tipo=agregado_personalizado).
//
// musculo_primario / musculos_secundarios usan el nombre de musculo (se
// resuelven a id en el seed runner). equipamiento_requerido es la lista de
// tags que debe cumplir el usuario para que el ejercicio entre en su pool.
export const ejercicios = [
  // --- Pecho ---
  { nombre: 'Press banca plano con barra', musculo_primario: 'pecho', musculos_secundarios: ['triceps', 'deltoides'], tipo: 'compuesto', patron_movimiento: 'empuje_horizontal', equipamiento_requerido: ['barra', 'banco'], es_compuesto_principal_fuerza: true },
  { nombre: 'Press banca plano con mancuernas', musculo_primario: 'pecho', musculos_secundarios: ['triceps', 'deltoides'], tipo: 'compuesto', patron_movimiento: 'empuje_horizontal', equipamiento_requerido: ['mancuernas', 'banco'] },
  { nombre: 'Press banca inclinado con mancuernas', musculo_primario: 'pecho', musculos_secundarios: ['triceps', 'deltoides'], tipo: 'compuesto', patron_movimiento: 'empuje_horizontal', equipamiento_requerido: ['mancuernas', 'banco'] },
  { nombre: 'Aperturas con mancuernas', musculo_primario: 'pecho', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'aduccion_horizontal', equipamiento_requerido: ['mancuernas', 'banco'] },
  { nombre: 'Fondos en paralelas', musculo_primario: 'pecho', musculos_secundarios: ['triceps', 'deltoides'], tipo: 'compuesto', patron_movimiento: 'empuje_vertical', equipamiento_requerido: ['paralelas'] },
  { nombre: 'Flexiones de brazos', musculo_primario: 'pecho', musculos_secundarios: ['triceps', 'deltoides'], tipo: 'compuesto', patron_movimiento: 'empuje_horizontal', equipamiento_requerido: ['peso_corporal'] },
  { nombre: 'Press banca con banda', musculo_primario: 'pecho', musculos_secundarios: ['triceps', 'deltoides'], tipo: 'compuesto', patron_movimiento: 'empuje_horizontal', equipamiento_requerido: ['banda'] },

  // --- Espalda (alta / trapecio / romboides) ---
  { nombre: 'Remo con barra', musculo_primario: 'espalda', musculos_secundarios: ['dorsales', 'biceps'], tipo: 'compuesto', patron_movimiento: 'traccion_horizontal', equipamiento_requerido: ['barra'] },
  { nombre: 'Remo con mancuerna a un brazo', musculo_primario: 'espalda', musculos_secundarios: ['dorsales', 'biceps'], tipo: 'compuesto', patron_movimiento: 'traccion_horizontal', equipamiento_requerido: ['mancuernas', 'banco'], es_unilateral: true },
  { nombre: 'Face pull en polea', musculo_primario: 'espalda', musculos_secundarios: ['deltoides'], tipo: 'aislado', patron_movimiento: 'traccion_horizontal', equipamiento_requerido: ['polea'] },
  { nombre: 'Encogimientos con barra', musculo_primario: 'espalda', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'elevacion', equipamiento_requerido: ['barra'] },
  { nombre: 'Remo con banda', musculo_primario: 'espalda', musculos_secundarios: ['dorsales', 'biceps'], tipo: 'compuesto', patron_movimiento: 'traccion_horizontal', equipamiento_requerido: ['banda'] },

  // --- Dorsales ---
  { nombre: 'Jalon al pecho en polea', musculo_primario: 'dorsales', musculos_secundarios: ['biceps', 'espalda'], tipo: 'compuesto', patron_movimiento: 'traccion_vertical', equipamiento_requerido: ['polea'] },
  { nombre: 'Dominadas', musculo_primario: 'dorsales', musculos_secundarios: ['biceps', 'espalda'], tipo: 'compuesto', patron_movimiento: 'traccion_vertical', equipamiento_requerido: ['barra_dominadas'] },
  { nombre: 'Remo en polea baja agarre neutro', musculo_primario: 'dorsales', musculos_secundarios: ['espalda', 'biceps'], tipo: 'compuesto', patron_movimiento: 'traccion_horizontal', equipamiento_requerido: ['polea'] },
  { nombre: 'Pull-over con mancuerna', musculo_primario: 'dorsales', musculos_secundarios: ['pecho'], tipo: 'aislado', patron_movimiento: 'traccion_vertical', equipamiento_requerido: ['mancuernas', 'banco'] },
  { nombre: 'Jalon con banda', musculo_primario: 'dorsales', musculos_secundarios: ['biceps', 'espalda'], tipo: 'compuesto', patron_movimiento: 'traccion_vertical', equipamiento_requerido: ['banda'] },

  // --- Deltoides ---
  { nombre: 'Press militar con barra', musculo_primario: 'deltoides', musculos_secundarios: ['triceps'], tipo: 'compuesto', patron_movimiento: 'empuje_vertical', equipamiento_requerido: ['barra'] },
  { nombre: 'Press militar con mancuernas', musculo_primario: 'deltoides', musculos_secundarios: ['triceps'], tipo: 'compuesto', patron_movimiento: 'empuje_vertical', equipamiento_requerido: ['mancuernas'] },
  { nombre: 'Elevaciones laterales con mancuernas', musculo_primario: 'deltoides', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'abduccion', equipamiento_requerido: ['mancuernas'] },
  { nombre: 'Elevaciones posteriores (pajaro)', musculo_primario: 'deltoides', musculos_secundarios: ['espalda'], tipo: 'aislado', patron_movimiento: 'abduccion_horizontal', equipamiento_requerido: ['mancuernas'] },
  { nombre: 'Elevaciones laterales con banda', musculo_primario: 'deltoides', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'abduccion', equipamiento_requerido: ['banda'] },

  // --- Biceps ---
  { nombre: 'Curl con barra', musculo_primario: 'biceps', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'flexion_codo', equipamiento_requerido: ['barra'] },
  { nombre: 'Curl con mancuernas alternado', musculo_primario: 'biceps', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'flexion_codo', equipamiento_requerido: ['mancuernas'] },
  { nombre: 'Curl martillo', musculo_primario: 'biceps', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'flexion_codo', equipamiento_requerido: ['mancuernas'] },
  { nombre: 'Curl en banco Scott', musculo_primario: 'biceps', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'flexion_codo', equipamiento_requerido: ['barra', 'banco'] },
  { nombre: 'Curl con banda', musculo_primario: 'biceps', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'flexion_codo', equipamiento_requerido: ['banda'] },

  // --- Triceps ---
  { nombre: 'Press frances con barra', musculo_primario: 'triceps', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'extension_codo', equipamiento_requerido: ['barra', 'banco'] },
  { nombre: 'Extension de triceps en polea', musculo_primario: 'triceps', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'extension_codo', equipamiento_requerido: ['polea'] },
  { nombre: 'Fondos entre bancos', musculo_primario: 'triceps', musculos_secundarios: ['pecho', 'deltoides'], tipo: 'compuesto', patron_movimiento: 'extension_codo', equipamiento_requerido: ['banco'] },
  { nombre: 'Patada de triceps con mancuerna', musculo_primario: 'triceps', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'extension_codo', equipamiento_requerido: ['mancuernas'], es_unilateral: true },
  { nombre: 'Extension de triceps con banda', musculo_primario: 'triceps', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'extension_codo', equipamiento_requerido: ['banda'] },

  // --- Cuadriceps ---
  { nombre: 'Sentadilla con barra', musculo_primario: 'cuadriceps', musculos_secundarios: ['gluteos', 'isquiotibiales'], tipo: 'compuesto', patron_movimiento: 'sentadilla', equipamiento_requerido: ['barra'], es_compuesto_principal_fuerza: true },
  { nombre: 'Prensa de piernas', musculo_primario: 'cuadriceps', musculos_secundarios: ['gluteos'], tipo: 'compuesto', patron_movimiento: 'sentadilla', equipamiento_requerido: ['maquina'] },
  { nombre: 'Sentadilla goblet con mancuerna', musculo_primario: 'cuadriceps', musculos_secundarios: ['gluteos'], tipo: 'compuesto', patron_movimiento: 'sentadilla', equipamiento_requerido: ['mancuernas'] },
  { nombre: 'Extension de cuadriceps en maquina', musculo_primario: 'cuadriceps', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'extension_rodilla', equipamiento_requerido: ['maquina'] },
  { nombre: 'Zancadas con mancuernas', musculo_primario: 'cuadriceps', musculos_secundarios: ['gluteos', 'isquiotibiales'], tipo: 'compuesto', patron_movimiento: 'zancada', equipamiento_requerido: ['mancuernas'], es_unilateral: true },

  // --- Isquiotibiales ---
  { nombre: 'Peso muerto rumano con barra', musculo_primario: 'isquiotibiales', musculos_secundarios: ['gluteos', 'espalda'], tipo: 'compuesto', patron_movimiento: 'bisagra_cadera', equipamiento_requerido: ['barra'], es_compuesto_principal_fuerza: true },
  { nombre: 'Curl femoral en maquina', musculo_primario: 'isquiotibiales', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'flexion_rodilla', equipamiento_requerido: ['maquina'] },
  { nombre: 'Peso muerto rumano con mancuernas', musculo_primario: 'isquiotibiales', musculos_secundarios: ['gluteos', 'espalda'], tipo: 'compuesto', patron_movimiento: 'bisagra_cadera', equipamiento_requerido: ['mancuernas'] },
  { nombre: 'Buenos dias con barra', musculo_primario: 'isquiotibiales', musculos_secundarios: ['gluteos', 'espalda'], tipo: 'compuesto', patron_movimiento: 'bisagra_cadera', equipamiento_requerido: ['barra'] },

  // --- Gluteos ---
  { nombre: 'Hip thrust con barra', musculo_primario: 'gluteos', musculos_secundarios: ['isquiotibiales'], tipo: 'compuesto', patron_movimiento: 'bisagra_cadera', equipamiento_requerido: ['barra', 'banco'] },
  { nombre: 'Puente de gluteos con banda', musculo_primario: 'gluteos', musculos_secundarios: ['isquiotibiales'], tipo: 'aislado', patron_movimiento: 'bisagra_cadera', equipamiento_requerido: ['banda'] },
  { nombre: 'Patada de gluteo en polea', musculo_primario: 'gluteos', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'extension_cadera', equipamiento_requerido: ['polea'], es_unilateral: true },

  // --- Pantorrillas ---
  { nombre: 'Elevacion de talones de pie en maquina', musculo_primario: 'pantorrillas', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'flexion_plantar', equipamiento_requerido: ['maquina'] },
  { nombre: 'Elevacion de talones sentado', musculo_primario: 'pantorrillas', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'flexion_plantar', equipamiento_requerido: ['maquina'] },
  { nombre: 'Elevacion de talones a una pierna', musculo_primario: 'pantorrillas', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'flexion_plantar', equipamiento_requerido: ['peso_corporal'], es_unilateral: true },

  // --- Abdominales ---
  { nombre: 'Plancha', musculo_primario: 'abdominales', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'anti_extension', equipamiento_requerido: ['peso_corporal'] },
  { nombre: 'Crunch en polea', musculo_primario: 'abdominales', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'flexion_tronco', equipamiento_requerido: ['polea'] },
  { nombre: 'Elevacion de piernas colgado', musculo_primario: 'abdominales', musculos_secundarios: [], tipo: 'aislado', patron_movimiento: 'flexion_cadera', equipamiento_requerido: ['barra_dominadas'] },
  { nombre: 'Rueda abdominal', musculo_primario: 'abdominales', musculos_secundarios: ['deltoides'], tipo: 'aislado', patron_movimiento: 'anti_extension', equipamiento_requerido: ['peso_corporal'] },
];
