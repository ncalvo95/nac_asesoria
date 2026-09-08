# nac_asesoria - WebApp de programación de entrenamientos

Webapp para programar entrenamientos con progresión automática por microciclos
de 2 semanas, medición de volumen y series efectivas por grupo muscular.
Pensada para convivir en la misma Raspberry Pi (3B, 1GB RAM) que ya corre
Loot Ledger, detrás de la misma instancia de Caddy.

## Stack

- **Backend:** Node.js + Express + SQLite (better-sqlite3), un solo proceso.
- **Frontend:** React + Vite + Tailwind (pendiente de scaffoldear), compilado
  a estáticos y servido por el mismo proceso Node.
- **Auth:** JWT en cookie httpOnly + bcryptjs. Roles: `admin`, `coach`, `cliente`.

## Estado actual

Implementado y probado:

- Schema SQLite completo (`src/db/schema.sql`).
- Seed de catálogo: 11 grupos musculares con referencia MEV/MAV/MRV
  (`src/db/seed/musculos.js`) y 51 ejercicios (`src/db/seed/ejercicios.js`).
- Auth con roles admin/coach/cliente (`src/routes/auth.js`).
- Armado de rutina por split según días/semana (`src/services/routineBuilder.js`).
- Generador de Excel para invitados, sin cuenta ni persistencia
  (`src/services/excelGenerator.js`, `src/routes/guest.js`): motor de
  progresión completo (doble progresión, estancamiento por músculo, tope MAV,
  ajuste por rep-cap absoluto) implementado como fórmulas vivas de Excel.

Pendiente:

- Frontend (React + Vite + Tailwind).
- Motor de progresión server-side para cuentas registradas (equivalente en
  JS a lo que hoy resuelve el Excel de invitados).
- Registro de sesión/serie, reportes, deload manual, reordenamiento de
  ejercicios por el usuario.

## Setup

```bash
npm install
JWT_SECRET=<algo-secreto> npm run db:migrate
npm run db:seed
ADMIN_EMAIL=vos@ejemplo.com ADMIN_PASSWORD=<pass> npm run db:bootstrap-admin
JWT_SECRET=<algo-secreto> npm start
```

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
