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
  Ledger (`frontend/public/manifest.webmanifest` + `sw.js`). Además tiene su
  propio botón "Instalar app" (`InstallPromptContext.jsx`) que captura el
  evento `beforeinstallprompt` y dispara el prompt nativo del navegador a
  pedido, en vez de depender solo del ícono pasivo del navegador - visible
  en el menú de cuenta y en las pantallas de login/invitación cuando el
  navegador lo soporta (no aparece en iOS Safari, que nunca dispara ese
  evento).

## Estado actual

Backend y frontend completos, probados end-to-end en navegador (login →
onboarding → generación de rutina → semana 0 → registro de sesiones →
cierre de microciclo → progreso → export a Excel):

- Schema SQLite completo (`src/db/schema.sql`).
- Seed de catálogo: 16 grupos musculares activos con referencia MEV/MAV/MRV
  (`src/db/seed/musculos.js` - incluye abductores, aductores y lumbares
  además de los grupos "grandes" habituales) y 60 ejercicios
  (`src/db/seed/ejercicios.js`).
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
  tiempo, no solo el mínimo. El split por defecto según días/semana:
  2 días → Full Body ×2; 3 días → Full Body ×3 (no consecutivos) o
  Upper/Lower/Full Body (consecutivos); 4 y 5 días dejan elegir entre dos
  variantes en el onboarding (`variante_split`: `upper_lower` por defecto,
  todo el cuerpo a frecuencia 2×, o `push_pull`, más foco en torso a
  frecuencia 2× - con 4 días deja piernas afuera, con 5 agrega un día de
  Legs a frecuencia 1×); 6 días → Push/Pull/Legs ×2. Deltoides está
  separado en 3 músculos (`deltoides_lateral`, `deltoides_anterior`,
  `deltoides_posterior` en vez de un "deltoides" único) porque cada cabeza
  necesita volumen distinto: el lateral casi no recibe estímulo indirecto
  de nada más, así que siempre entra en los días de Push/Upper/Full Body
  (mismo lugar donde antes entraba "deltoides" a secas - nunca se lo
  saltea); el anterior lo acompaña ahí (ya viene cubierto por el empuje,
  MEV 0); el posterior va en Pull en vez de Push, porque responde mejor a
  tracción (remo, face pull, pájaros) - ver `seed/musculos.js` para el
  detalle de MEV/MAV/MRV por cabeza. El "deltoides" viejo queda en la
  tabla `musculo` con `activo = 0` (no se ofrece más para catalogar ni
  armar rutinas nuevas) por integridad referencial con historial ya
  generado - `migrarDeltoides()` en `src/db/migrate.js` reasigna solo el
  catálogo y las rutinas activas a la cabeza que corresponda, automático
  en cada arranque. Alternativas al armado 100% automático:
  - **Armado manual** (`POST /usuarios/:id/rutina/manual`) - el usuario
    elige directamente los ejercicios de cada día desde el catálogo en vez
    de que el motor los elija por equipamiento/exclusiones.
  - **Split personalizado** (`POST /usuarios/:id/rutina/split`) - el
    usuario elige qué músculos entrena cada día (a diferencia del armado
    manual, acá el motor sigue eligiendo los ejercicios dentro de cada
    músculo). El frontend avisa (sin bloquear) si un músculo queda en dos
    días calendario consecutivos.

  Ya generada la rutina, se puede **agregar un ejercicio** a cualquier
  músculo del catálogo, no solo a los que ese día ya entrena (`POST
  /dias/:id/ejercicios`, candidatos vía `GET
  /dias/:id/musculos/:id/candidatos`) - si el músculo ya estaba presente
  entra como extra, si es nuevo para ese día pasa a ser el top (y el día
  lo suma a `musculos_trabajados_json`), por si surge sobre la marcha
  durante el entrenamiento y no era parte del split original. También se
  puede **quitar** (`DELETE /ejercicios-asignados/:id` - no se puede
  quitar uno que ya tenga series registradas, pero sí el ejercicio "top"
  de un músculo o el único que le queda a ese músculo en el día: si era
  top y quedan otros ejercicios del mismo músculo, uno pasa a ser el
  nuevo top; si no queda ninguno, el músculo se cae de
  `musculos_trabajados_json` - `reacomodarMusculoTrasQuitar()` en
  `rutinaService.js`. El frontend no lo bloquea, pero pide confirmación
  con una advertencia en esos dos casos), **sustituir**, o **mover/copiar
  a otro día** de la misma rutina (`POST /ejercicios/:id/mover` conserva
  peso/series -es la misma instancia, solo cambia de día-, `POST
  /ejercicios/:id/copiar` arranca una instancia nueva a testear en el día
  destino).

- Tanto un **ejercicio** (arriba a la derecha de la tarjeta, alineado con
  el nombre del ejercicio) como el **día en general** tienen un botón
  "Comentario" que abre un panel con un textarea libre y un tick
  "Recordarme en la próxima actualización de entrenamiento"
  (`PATCH /ejercicios/:id/comentario` y `PATCH /dias/:id/comentario`,
  columnas `comentario`/`comentario_recordar` en `ejercicio_asignado` y
  `dia_rutina`). Si el tick queda marcado, el comentario se muestra solo
  -sin que el usuario tenga que volver a abrir nada- como un aviso arriba
  del ejercicio o del día la próxima vez que entra a esa pantalla; si no
  se marca, el comentario queda guardado pero no se vuelve a mostrar solo
  (el botón cambia a "Editar comentario" para poder revisarlo o
  actualizarlo cuando haga falta).

  También se puede **agregar o quitar un día entero** de la rutina activa
  sin rehacerla desde cero (`POST /usuarios/:id/rutina/dias`,
  `GET /dias/:id/impacto`, `DELETE /dias/:id` en `rutinaService.js`) - a
  diferencia de generar una rutina nueva, esto no reinicia el microciclo en
  curso ni el peso/series ya cargados de los días que no cambian:
  - **Agregar día**: tres modos - `manual` (el usuario elige los
    ejercicios), `auto_solo_dia` (el motor arma solo el día nuevo según el
    split actual, sin tocar el resto) o `auto_reorganizar` (recalcula el
    split completo para la nueva cantidad de días, pero reutilizando los
    ejercicios ya asignados - donde un músculo se sigue entrenando el mismo
    día, no lo toca; donde cambia de día, mueve el ejercicio existente con
    su peso intacto; solo arma un ejercicio nuevo -a testear- para un
    músculo que quedó sin ninguno asignado).
  - **Quitar día**: antes de confirmar, el frontend muestra qué músculos se
    quedarían sin ningún día activo (`GET /dias/:id/impacto`) vs cuáles ya
    se entrenan en otro día (solo baja la frecuencia). El usuario elige
    redistribuir esos músculos (se les arma un ejercicio nuevo en el día
    con menos carga) o sacarlos nomás. El día en sí se borra directo si
    nunca tuvo una sesión registrada, o se desactiva (columna `activo` en
    `dia_rutina`, no aparece más como día activo) si ya tiene historial -
    así Reportes y la exportación a Excel no pierden esas sesiones viejas.
  - **Cambiar día**: pasa TODOS los ejercicios de un día a otro día de la
    semana de una sola vez (con su peso/series/progreso intactos), para
    cuando el usuario simplemente cambia qué día entrena lo mismo (ej. "lo
    que hacía el lunes ahora lo hago el martes") sin mover ejercicio por
    ejercicio (`PATCH /dias/:id/dia-semana`, `cambiarDiaSemana` en
    `rutinaService.js` - técnicamente solo reasigna `dia_rutina.dia_semana`
    y recalcula `numero_dia`, nunca toca `ejercicio_asignado`). Si el día
    elegido ya tiene otro día activo, el frontend pregunta qué hacer con
    ese antes de confirmar: moverlo a un día que esté libre (con su
    progreso intacto también) o eliminarlo (se borra o se desactiva, según
    si ya tiene historial, igual que Quitar día).
- Semana 0 (testeo) y registro de sesión/serie (`src/services/progressionEngine.js`,
  `src/routes/sesiones.js`). Lo que se va tipeando (peso/reps/RIR de Semana 0
  y del registro normal del día) se guarda como borrador en `localStorage`
  del celular a medida que se escribe (`leerBorrador`/`guardarBorrador`/
  `borrarBorrador` en `EntrenamientoPage.jsx`) - antes solo vivía en estado
  de React, así que si la pestaña se cerraba o el celular la mataba en
  medio del entrenamiento (se va a background, se queda sin memoria) se
  perdía todo sin aviso. El borrador se recupera solo al volver a abrir la
  pantalla y se borra recién cuando el guardado real contra el backend
  confirma - la serie de dropset (una fila extra, fuera del rango normal de
  `series_actuales`) también se restaura si estaba en el borrador; antes se
  perdía silenciosamente al recargar la página, porque el merge del
  borrador solo pisaba índices que ya existían en el estado inicial. El
  piso de reps de referencia para la semana 1 (`piso_reps` en
  `progreso_ejercicio`) toma la más alta de las 2 series cargadas en el
  testeo, no siempre la serie 2 - a veces el peso elegido rinde mejor en
  la primera serie que en la segunda. Se puede **saltear el testeo**
  (`POST /rutinas/:id/semana0/saltear`, botón "Saltear el testeo y empezar
  directo con mi rutina" en el formulario) para quien ya conoce sus pesos:
  arranca el primer microciclo con el peso en blanco (se carga en la
  primera sesión real, como con cualquier ejercicio nuevo) y sin piso de
  reps (0 - cualquier resultado real "supera" ese piso, así la base se
  establece sola en el primer cierre en vez de compararse contra un testeo
  que no pasó).
- `microciclo.tipo` (`normal` | `testeo` | `descarga`) distingue microciclos
  especiales de los bloques de progresión regulares - antes esto vivía
  implícito en `numero === 0`, que ya no alcanza porque una semana de
  testeo se puede volver a pedir más adelante en la misma rutina:
  - **Semana de descarga real** (`marcarSemanaDescarga` en
    `progressionEngine.js`, botón "Marcar semana de descarga" en
    Progreso, con confirmación explícita: *"Esta semana será transformada
    en tu semana de descarga, esta acción no tiene marcha atrás. Luego de
    la descarga, se retomará la rutina desde el último microciclo
    completado."*) - a diferencia de una versión anterior (una sugerencia
    meramente informativa), esto sí transforma la semana en curso: baja
    series a la mitad (redondeando para arriba, mínimo 2) y el peso al
    75% salvo la primera serie de cada ejercicio, y lo aplica de verdad
    (`peso_actual`/`series_actuales` en `ejercicio_asignado`). El progreso
    real (`progreso_ejercicio_microciclo`) de esa semana queda intacto a
    propósito - son los valores del último microciclo normal cerrado -
    así que al cerrar la descarga (mismo botón "Cerrar microciclo", sin
    ninguno nuevo) la rutina retoma exactamente donde estaba, sin que la
    descarga cuente para la progresión.
  - **Nueva semana de testeo** dentro de la misma rutina
    (`marcarNuevoTesteo` + `POST /rutinas/:id/testeo`, botón "Nueva semana
    de testeo" en Progreso, con confirmación) - convierte el microciclo en
    curso en una semana de testeo (2 series por ejercicio, igual que la
    inicial) para recalibrar peso/reps sin perder la rutina ni el
    historial; se completa en Entrenamiento con el mismo formulario que la
    Semana 0 (`registrarSemana0` se generalizó para encontrar cualquier
    microciclo `tipo='testeo'` en curso, no solo `numero=0`). Todas las
    semanas de testeo ya cerradas de una rutina (la inicial y las
    repetidas) se pueden **comparar entre sí** en Progreso
    (`GET /rutinas/:id/testeos`, sección "Comparar semanas de testeo",
    visible con 2 o más) - peso y reps de cada serie, por ejercicio.
- **Motor de cierre de microciclo** (el núcleo del sistema): calcula
  piso/techo por ejercicio (mejor marca vs promedio), detecta estancamiento
  por músculo, aplica el tope MAV, suma serie al ejercicio top, ajusta peso
  por rango de reps, y encadena el siguiente microciclo.
- **Reps efectivas** (`repsEfectivas` en `progressionEngine.js`): de las
  reps hechas en una serie, cuántas caen dentro de la ventana de las
  últimas `REPS_EFECTIVAS_UMBRAL` (3) reps antes del fallo -
  `max(0, min(reps, 3 − RIR))`. Se recalcula siempre a partir de las series
  reales cargadas (`registro_serie`, con su RIR), no de lo prescripto, así
  que una serie sin RIR (hoy solo pasa en Semana 0, que no lo pide) no suma
  nada en vez de inventar un valor. Se muestra en vivo mientras se carga la
  sesión (columna "RE" por serie + total por ejercicio), agregado por
  músculo/ejercicio en Progreso (del último microciclo cerrado) y su
  evolución en Reportes. Las series marcadas como dropset (`es_dropset`)
  quedan afuera de este total normal - se agregan aparte, por músculo, y
  se muestran como un subtotal ("· N de dropset") tanto en vivo al cargar
  la sesión como en Progreso.
- Generador de Excel para invitados, sin cuenta ni persistencia
  (`src/routes/guest.js`) y **exportación a Excel para usuarios registrados**
  (`GET /api/rutinas/:rutinaId/export.xlsx`) que precarga el historial real
  (microciclos ya cerrados) y deja fórmulas vivas para lo que falta, así
  sirve como respaldo/continuación offline. Ambos comparten la misma lógica
  de generación (`src/services/excelGenerator.js`).

- Frontend (`frontend/`): login (con "recordarme"), onboarding (con la
  opción de generación automática, split personalizado o armado manual de
  la rutina - en split personalizado, además de elegir qué músculos entrena
  cada día, se puede elegir que el motor complete los ejercicios
  automáticamente como siempre, o dejar los días armados solo con sus
  músculos y agregar los ejercicios uno mismo después desde Entrenamiento,
  a su propio ritmo -`diferirEjercicios` en `crearRutinaConSplit`, pasa por
  Semana 0 igual pero queda vacía, sin nada que testear-), "Día de
  entrenamiento" (semana 0 de testeo con fecha de
  inicio elegible, registro de series por peso/reps/RIR - los campos de
  peso y reps arrancan vacíos, mostrando en gris (placeholder, no un valor
  cargado) lo recomendado como referencia: el peso, el peso base del
  ejercicio (`peso_actual`); las reps, en la serie 1 el piso de reps del
  último cierre (`piso_reps`), y de ahí en más, si se mantiene el mismo
  peso que en la serie anterior (comparando lo tipeado, o el peso base si
  todavía no se tipeó nada), 2 reps menos que la serie anterior REAL -no
  la sugerencia previa- (si el usuario carga un número distinto al
  sugerido, o cambia el peso, la siguiente sugerencia se recalcula en
  cadena desde ese valor), pensado para el declive típico a ~90s de
  descanso entre series con el mismo peso; el usuario igual tiene que
  escribir lo que hizo de verdad -peso y reps-, el placeholder no cuenta
  como cargado ni bloquea el guardado hasta que lo hace. Cada ejercicio
  también tiene una casilla "DS" (DropSet): al marcarla agrega una serie
  extra al final con el peso precargado a la mitad de la última serie
  real cargada (o del peso base si todavía no se cargó ninguna),
  redondeado a 0.5kg, editable igual; esa serie extra se identifica como
  "DS" en vez de un número, no suma a las reps efectivas del
  ejercicio/músculo pero sí a un total aparte de dropset por ejercicio
  (columna `es_dropset` en `registro_serie`, excluida de
  `getUltimaSerieEnRango` para no distorsionar la progresión) -, sustitución
  o agregado de ejercicio a mitad de rutina — en ambos casos pide un único
  peso + una serie de referencia (no un mini-testeo de 2 series), que fija
  el piso de reps del microciclo en curso igual que hace Semana 0 con el
  máximo de sus 2 series (si se agrega durante la propia Semana 0, ese peso
  y esas reps quedan precargados ahí, editables, en vez de pedirse dos
  veces); en ambos casos con la opción de cargar uno "particular" que no
  está en el catálogo, con su propio botón "Editar nombre" por si se anotó
  mal (solo para estos, nunca para uno del catálogo compartido) —,
  reordenar los ejercicios de un día arrastrando la etiqueta con el nombre
  (mantener presionado y mover arriba/abajo - con Pointer Events, no
  drag-and-drop nativo de HTML5, que no anda bien con touch en la mayoría
  de los navegadores de celular), ajuste manual de series (+1/-1,
  respetando el piso y el tope según objetivo - el ajuste se pisa también
  en `progreso_ejercicio_microciclo` del microciclo en curso, no solo en
  `ejercicio_asignado`, así que se mantiene microciclo tras microciclo
  hasta que el usuario lo cambie o pida una descarga, en vez de perderse
  solo con que pase un cierre) y del peso base sin esperar al cierre de
  microciclo, quitar un ejercicio (siempre pide confirmar con un modal, no
  un simple mensaje - si ya tiene series registradas, avisa fuerte que se
  pierden en cascada) y descanso entre series editable por ejercicio
  (informativo, no lo toca el motor de progresión - default 90s, 60s si el
  ejercicio es unilateral -catálogo o nombre-, `descanso_segundos` en
  `ejercicio_asignado`),
  "Mis rutinas" (historial de rutinas - solo una puede estar
  activa a la vez, se finaliza sola al crear o reactivar otra; desde acá se
  puede reactivar una vieja o borrarla para siempre), Progreso
  (volumen por músculo vs MAV, **reps efectivas** por músculo y por
  ejercicio, notas de estancamiento/mejora, cerrar microciclo, pedir
  descarga/deload, exportar a Excel), Reportes (semestral y resumen de
  mesociclo, comparando peso/reps/volumen/reps efectivas), pantalla de
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
  Diseño mobile-first con la pantalla de "Día de entrenamiento" adaptada a
  desktop (grilla de 2 columnas en pantallas medianas/grandes en vez de
  una sola columna estirada, para aprovechar el espacio), paleta
  clínica/neutra con acento configurable
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
o similar): correr el seed/bootstrap-admin de la sección Setup dentro del
contenedor (el schema/las migraciones ya corren solas al arrancar el
servidor - ver más abajo, no hace falta `db:migrate` a mano).

**Actualizar un deploy existente** (`git pull` + `docker compose up -d
--build`): alcanza con eso. `src/server.js` corre el schema completo
(`CREATE TABLE IF NOT EXISTS`) y cualquier `ALTER TABLE` pendiente
(`src/db/migrate.js`, tolerante a columnas que ya existen) contra el
volumen persistente ANTES de levantar el servidor HTTP, así que una
columna nueva sumada en un commit no deja el contenedor en loop de crash
esperando un `db:migrate` manual que nadie corrió - se auto-repara en el
próximo restart.

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
