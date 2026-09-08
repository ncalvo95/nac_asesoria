# nac_asesoria - WebApp de programación de entrenamientos

Webapp para programar entrenamientos con progresión automática por microciclos
de 2 semanas, medición de volumen y series efectivas por grupo muscular.
Pensada para convivir en la misma Raspberry Pi (3B, 1GB RAM) que ya corre
Loot Ledger, detrás de la misma instancia de Caddy.

## Stack

- **Backend:** Node.js + Express + SQLite (better-sqlite3), un solo proceso.
- **Frontend:** React + Vite + Tailwind v4 (mobile-first, tema claro/oscuro
  automático), compilado a estáticos en `frontend/dist` y servido por el
  mismo proceso Node.
- **Auth:** JWT en cookie httpOnly + bcryptjs. Roles: `admin`, `coach`, `cliente`.

## Estado actual

Backend y frontend completos, probados end-to-end en navegador (login →
onboarding → generación de rutina → semana 0 → registro de sesiones →
cierre de microciclo → progreso → export a Excel):

- Schema SQLite completo (`src/db/schema.sql`).
- Seed de catálogo: 11 grupos musculares con referencia MEV/MAV/MRV
  (`src/db/seed/musculos.js`) y 51 ejercicios (`src/db/seed/ejercicios.js`).
- Auth con roles admin/coach/cliente (`src/routes/auth.js`).
- Onboarding: objetivo, disponibilidad, equipamiento, perfil médico,
  antropometría, RM estimado, preferencias de ejercicio (`src/routes/perfil.js`).
- Generación y persistencia de la rutina real por split según días/semana
  (`src/services/routineBuilder.js`, `src/services/rutinaService.js`,
  `src/routes/rutina.js`), con reordenamiento de ejercicios por el usuario.
- Semana 0 (testeo) y registro de sesión/serie (`src/services/progressionEngine.js`,
  `src/routes/sesiones.js`).
- **Motor de cierre de microciclo** (el núcleo del sistema): calcula
  piso/techo por ejercicio (mejor marca vs promedio), detecta estancamiento
  por músculo, aplica el tope MAV, suma serie al ejercicio top, ajusta peso
  por rango de reps, y encadena el siguiente microciclo.
- Generador de Excel para invitados, sin cuenta ni persistencia
  (`src/routes/guest.js`) y **exportación a Excel para usuarios registrados**
  (`GET /api/rutinas/:rutinaId/export.xlsx`) que precarga el historial real
  (microciclos ya cerrados) y deja fórmulas vivas para lo que falta, así
  sirve como respaldo/continuación offline. Ambos comparten la misma lógica
  de generación (`src/services/excelGenerator.js`).

- Frontend (`frontend/`): login, onboarding, "Día de entrenamiento" (semana
  0 de testeo, registro de series por peso/reps/RIR, modo "lineal forzado"
  por ejercicio, sustitución de ejercicio a mitad de rutina), Progreso
  (volumen por músculo vs MAV, notas de estancamiento/mejora, cerrar
  microciclo, pedir descarga/deload, exportar a Excel), Reportes (semestral
  y resumen de mesociclo, comparando peso/reps/volumen), pantalla de
  invitado sin cuenta (descarga el Excel de 6 meses directo desde el
  navegador), y un panel de coach/admin (listado de clientes, alta de
  cuentas, ver la rutina/progreso/reportes de un cliente puntual).
  Diseño mobile-first, paleta clínica/neutra con acento configurable
  (mismos tokens que la [vista previa visual](https://claude.ai/code/artifact/e2941d16-a51b-4dad-ad83-4921bfcfecfe)
  que se acordó antes de construirlo), tema oscuro automático por
  `prefers-color-scheme`.

Pendiente / simplificaciones conocidas:

- La sustitución de ejercicio no reubica sesiones ya registradas antes del
  cambio (quedan asociadas al `ejercicio_asignado_id`, que ahora apunta al
  ejercicio nuevo) - es un límite aceptado del MVP, documentado en el
  código.
- Los reportes se generan a pedido (botón), no hay un cron real de "cada 6
  meses" - no hacía falta para el volumen de uso esperado.

## Setup

```bash
npm install
JWT_SECRET=<algo-secreto> npm run db:migrate
npm run db:seed
ADMIN_EMAIL=vos@ejemplo.com ADMIN_PASSWORD=<pass> npm run db:bootstrap-admin
npm run build:frontend
JWT_SECRET=<algo-secreto> npm start
```

Para desarrollo del frontend con hot reload: `npm --prefix frontend run dev`
(proxea `/api` a `http://localhost:3000`, así que el backend tiene que estar
corriendo en paralelo).

Variables de entorno:

- `JWT_SECRET` (obligatoria): secreto para firmar los JWT de sesión.
- `PORT` (opcional, default 3000).
- `DB_PATH` (opcional, default `data/app.db`).

## Probar el generador de Excel para invitados

No requiere cuenta ni base de datos de usuario (sí lee el catálogo fijo de
ejercicios/músculos, que ya tiene que estar migrado y seedeado):

```bash
curl -X POST http://localhost:3000/api/guest/rutina.xlsx \
  -H "Content-Type: application/json" \
  -d '{
    "objetivo": {"tipo":"hipertrofia","sub_objetivo":"ganancia global"},
    "equipamiento": {"tipo":"gimnasio","checklist":[]},
    "dias_especificos": ["lunes","martes","jueves","viernes"]
  }' -o plan.xlsx
```

`dias_especificos` acepta entre 2 y 6 días (lunes..domingo, en minúsculas y
sin tildes). El split se arma automáticamente según la cantidad de días
(ver `src/services/routineBuilder.js` para la tabla completa del §3 del
prompt original).

## Flujo completo para un usuario registrado

```
POST /api/auth/login                                  (admin o coach)
POST /api/auth/usuarios            {rol: "coach"}      (solo admin)
POST /api/auth/usuarios            {rol: "cliente"}    (admin o coach)
PUT  /api/usuarios/:id/objetivo
PUT  /api/usuarios/:id/disponibilidad
PUT  /api/usuarios/:id/equipamiento
POST /api/usuarios/:id/rutina                          (genera y persiste la rutina)
POST /api/rutinas/:rutinaId/semana0    {resultados: [...]}
POST /api/usuarios/:id/sesiones        {dia_rutina_id, microciclo_id, series: [...]}
POST /api/rutinas/:rutinaId/microciclos/:numero/cerrar  (el nucleo: calcula piso/techo,
                                                          estancamiento, ajusta peso/series)
GET  /api/rutinas/:rutinaId/export.xlsx                 (backup/continuacion en Excel)
```
