# nac_asesoria - WebApp de programación de entrenamientos

Webapp para programar entrenamientos con progresión automática por microciclos
de 2 semanas, medición de volumen y series efectivas por grupo muscular.
Pensada para convivir en la misma Raspberry Pi (3B, 1GB RAM) que ya corre
Loot Ledger, expuesta en `www.castielo.io/nac_asesoria` a través del mismo
Cloudflare Tunnel (ver Deployment).

## Stack

- **Backend:** Node.js + Express + SQLite (better-sqlite3), un solo proceso.
- **Frontend:** React + Vite + Tailwind v4 (mobile-first, tema claro/oscuro
  automático), compilado a estáticos en `frontend/dist` y servido por el
  mismo proceso Node.
- **Auth:** bcryptjs (costo 10) + token opaco en cookie httpOnly, con su
  hash SHA-256 guardado en una tabla `sesiones_auth` (revocar una sesión es
  un `DELETE`, sin JWT ni blacklist). Login por **usuario** (4-10
  caracteres, no email), mismo formato que Loot Ledger. Roles: `admin`,
  `coach`, `cliente`. Límite de 5 sesiones activas por usuario, "recordarme"
  (30 días) y listar/revocar sesiones propias. Alta de cuentas por
  **invitación** (código de un solo uso, igual que Loot Ledger): el admin
  invita coach o cliente, un coach solo invita clientes (quedan linkeados
  a él automáticamente); reclamar el código activa la cuenta al toque, sin
  aprobación manual extra.
- **PWA:** instalable en el teléfono o la PC ("Agregar a pantalla de
  inicio") con ícono propio y arranque a pantalla completa, igual que Loot
  Ledger (`frontend/public/manifest.webmanifest` + `sw.js`).

## Estado actual

Backend y frontend completos, probados end-to-end en navegador (login →
onboarding → generación de rutina → semana 0 → registro de sesiones →
cierre de microciclo → progreso → export a Excel):

- Schema SQLite completo (`src/db/schema.sql`).
- Seed de catálogo: 11 grupos musculares con referencia MEV/MAV/MRV
  (`src/db/seed/musculos.js`) y 51 ejercicios (`src/db/seed/ejercicios.js`).
- Auth con roles admin/coach/cliente (`src/routes/auth.js`).
- Onboarding: objetivo, disponibilidad, equipamiento (con la opción
  "mixto" de elegir casa/gimnasio **por músculo**, no obligatorio - el que
  no se especifica cae en gimnasio por default), perfil médico,
  antropometría, RM estimado, preferencias de ejercicio (`src/routes/perfil.js`).
- Generación y persistencia de la rutina real por split según días/semana
  (`src/services/routineBuilder.js`, `src/services/rutinaService.js`,
  `src/routes/rutina.js`), con reordenamiento de ejercicios por el usuario.
  El armado automático llena el tiempo disponible por día (según la
  duración declarada) sumando más de un ejercicio por músculo cuando sobra
  tiempo, no solo el mínimo. Alternativas al armado 100% automático:
  - **Armado manual** (`POST /usuarios/:id/rutina/manual`) - el usuario
    elige directamente los ejercicios de cada día desde el catálogo en vez
    de que el motor los elija por equipamiento/exclusiones.
  - **Split personalizado** (`POST /usuarios/:id/rutina/split`) - el
    usuario elige qué músculos entrena cada día (a diferencia del armado
    manual, acá el motor sigue eligiendo los ejercicios dentro de cada
    músculo). El frontend avisa (sin bloquear) si un músculo queda en dos
    días calendario consecutivos.

  Ya generada la rutina, se puede **agregar un ejercicio extra** a un
  músculo que ya está presente ese día (`POST /dias/:id/ejercicios`,
  candidatos vía `GET /dias/:id/musculos/:id/candidatos`) o **quitarlo**
  (`DELETE /ejercicios-asignados/:id` - no se puede quitar el ejercicio
  "top" de un músculo ni uno que ya tenga series registradas), además de
  la sustitución existente.
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

- Frontend (`frontend/`): login (con "recordarme"), onboarding (con la
  opción de generación automática, split personalizado o armado manual de
  la rutina), "Día de entrenamiento" (semana 0 de testeo con fecha de
  inicio elegible, registro de series por peso/reps/RIR, modo "lineal
  forzado" por ejercicio, sustitución o agregado de ejercicio a mitad de
  rutina), "Mis rutinas" (historial de rutinas - solo una puede estar
  activa a la vez, se finaliza sola al crear o reactivar otra; desde acá se
  puede reactivar una vieja o borrarla para siempre), Progreso
  (volumen por músculo vs MAV, notas de estancamiento/mejora, cerrar
  microciclo, pedir descarga/deload, exportar a Excel), Reportes (semestral
  y resumen de mesociclo, comparando peso/reps/volumen), pantalla de
  invitado sin cuenta (descarga el Excel de 6 meses directo desde el
  navegador), y un panel de coach/admin (listado de clientes, alta de
  cuentas, ver la rutina/progreso/reportes/preferencias de ejercicio de un
  cliente puntual — excluir ejercicios, marcar preferidos, o agregar un
  ejercicio propio al pool de sustitución de un músculo), y un
  **catálogo de ejercicios** administrado por el admin (`/catalogo`,
  `POST /api/catalogo/ejercicios`, `PATCH /api/catalogo/ejercicios/:id/activo`)
  - el admin da de alta ejercicios nuevos (músculo, tipo, patrón de
  movimiento, equipamiento requerido) que quedan visibles para todos los
  usuarios al armar o sustituir, y puede activar/desactivar los existentes.
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
- El armado **automático** de la rutina hoy solo respeta las
  **exclusiones**. Las preferencias ("preferir") y los ejercicios propios
  agregados todavía no se usan al generar o sustituir - se guardan y se
  muestran, pero falta conectarlos al pool de selección de
  `routineBuilder.js`. El armado **manual** no tiene este límite: el
  usuario elige directamente cualquier ejercicio del catálogo.
- El modelo de cuentas es cerrado a propósito (nadie se registra libremente
  ni invita a quien quiera - el alta siempre nace de un código que generó un
  admin o un coach) - encaja con "un coach gestiona a sus clientes", no con
  una app tipo marketplace.
- Un cliente con un coach asignado puede activar "que mi coach apruebe mis
  cambios de objetivo/disponibilidad/equipamiento/rutina"
  (`PATCH /usuarios/:id/aprobacion-coach`, toggle en la pantalla de
  Progreso) - mientras está activo, esos cambios quedan en
  `solicitud_cambio` hasta que el coach los aprueba o rechaza
  (`src/services/solicitudCambio.js`, panel de coach). Si el coach edita
  directo a su cliente no pasa por esto (el coach ya es quien aprobaría).
  Apagado por default.

## Setup

```bash
npm install
npm run db:migrate
npm run db:seed
ADMIN_USUARIO=admin ADMIN_PASSWORD=<pass> npm run db:bootstrap-admin
npm run build:frontend
npm start
```

Para desarrollo del frontend con hot reload: `npm --prefix frontend run dev`
(proxea `/api` a `http://localhost:3000`, así que el backend tiene que estar
corriendo en paralelo).

Variables de entorno:

- `PORT` (opcional, default 3000).
- `DB_PATH` (opcional, default `data/app.db`).
- `BASE_PATH` (opcional, default vacío = raíz del dominio): subpath bajo el
  que cuelga toda la app — API, estáticos y cookie de sesión (ver
  `src/base-path.js`). Tiene que coincidir con el `BASE_PATH` usado al
  buildear el frontend (`BASE_PATH=/nac_asesoria npm run build` dentro de
  `frontend/`) — es la misma variable para los dos lados, igual que en Loot
  Ledger (`server/src/base-path.js` / `client/vite.config.js` de ese repo).

## Deployment en castielo.io/nac_asesoria

Mismo esquema que Loot Ledger, con la misma convención `BASE_PATH` (no
`handle_path` de Caddy — esa variante solo la usan para *probar* con
subdominios de DuckDNS; el dominio real (`www.castielo.io`) se sirve por
**Cloudflare Tunnel**, que rutea por *path* sin recortar el prefijo, así que
la app sí necesita saber bajo qué subpath vive):

**1. Build de la imagen**, con el subpath horneado en el bundle del
frontend (`docker build` ya lo hace vía `--build-arg`, no hace falta correr
esto a mano si usás el `docker-compose.yml` del paso 2):

```bash
docker build -t nac-asesoria --build-arg BASE_PATH=/nac_asesoria .
```

**2. `docker-compose.yml` propio** (ya está en la raíz de este repo, no hay
que copiarlo a Loot Ledger): se une a la red externa `edge` — la misma que
ya comparten Loot Ledger y el portfolio, creada una sola vez con
`docker network create edge` (ver `docs/deploy-ssd-domain.md` de Loot
Ledger) — sin publicar puerto al host.

```bash
cp .env.example .env
nano .env   # BASE_PATH=/nac_asesoria
docker compose up -d --build
```

**3. Ruteo hacia el contenedor** — folder `nac-asesoria` (el `container_name`
de este compose), alcanzable por Cloudflare Tunnel a través de la red
`edge` sin tocar ningún archivo de Loot Ledger. Dos formas, elegí una en el
dashboard de Cloudflare (Zero Trust → Networks → Tunnels → tu túnel →
Public Hostname), para `www.castielo.io`:

- Si el dashboard te deja poner un campo **Path**: una entrada con
  `Path: nac_asesoria`, Service `http://nac-asesoria:3000`, evaluada
  **antes** que la entrada catch-all del portfolio (el orden importa).
- Si no (o preferís tenerlo versionado): un ingress rule en el `config.yml`
  del túnel (vive en el repo de Loot Ledger, ver la sección "Rutear por
  path" de `docs/deploy-ssd-domain.md` ahí) — algo como
  `path: ^/nac_asesoria(/.*)?$` → `service: http://nac-asesoria:3000`,
  antes de la regla catch-all.

**4. Primer arranque** (una sola vez, `docker compose exec nac-asesoria sh`
o similar): correr las migraciones/seed/bootstrap-admin de la sección Setup
dentro del contenedor.

Validado en este entorno (Docker no pudo levantar el daemon acá — se
verificó corriendo el server directo con `BASE_PATH=/nac_asesoria`, sin
proxy intermediario): con el subpath seteado, la app deja de responder en
la raíz y pasa a responder solo bajo `/nac_asesoria` — assets, API,
navegación de React Router, y la cookie de sesión (nombre y path) — igual
que corriendo en la raíz sin la variable.

Nada de esto toca el repo de Loot Ledger ni el de castielo-web — solo
hace falta la entrada de ruteo en el dashboard de Cloudflare (o en su
`config.yml`, si prefieren esa vía) apuntando a `nac-asesoria:3000`.

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
POST /api/auth/usuarios            {rol: "coach"}      (solo admin, alta directa con password)
POST /api/auth/usuarios            {rol: "cliente"}    (admin o coach, alta directa con password)
  # alternativa por invitacion (igual que Loot Ledger, ver arriba):
  # POST /api/auth/invites {rol}                 -> {code}   (admin o coach)
  # GET  /api/auth/invite/:code                              (publica, valida sin consumir)
  # POST /api/auth/claim-invite {code, nombre, usuario, password, coach_id?}
  #   -> activa la cuenta y loguea de una, publica
PUT  /api/usuarios/:id/objetivo
PUT  /api/usuarios/:id/disponibilidad
PUT  /api/usuarios/:id/equipamiento
POST /api/usuarios/:id/rutina                          (genera y persiste la rutina)
  # alternativa manual (el usuario elige los ejercicios, ver arriba):
  # POST /api/usuarios/:id/rutina/manual  {dias: [{dia_semana, ejercicios: [id,...]}]}
POST /api/rutinas/:rutinaId/semana0    {resultados: [...]}
POST /api/usuarios/:id/sesiones        {dia_rutina_id, microciclo_id, series: [...]}
POST /api/rutinas/:rutinaId/microciclos/:numero/cerrar  (el nucleo: calcula piso/techo,
                                                          estancamiento, ajusta peso/series)
GET  /api/rutinas/:rutinaId/export.xlsx                 (backup/continuacion en Excel)
```
