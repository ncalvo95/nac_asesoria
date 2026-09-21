# nac_asesoria - WebApp de programación de entrenamientos

🇬🇧 [Read this in English](README.en.md)

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
- **Identidad visual:** logo propio (círculo negro, silueta levantando una
  barra, "N.A.C · ASESORÍA") en vez del ícono de mancuerna genérico de
  antes - versión chica sin texto (`AppIcon.jsx`, `src/assets/icon-nac.png`)
  en los headers de 18-32px, donde el texto del logo completo no se leería,
  y versión completa con el texto dibujado adentro
  (`src/assets/logo-nac.png`) en Login e Invitación, donde hay espacio para
  que se vea grande. El color de acento de toda la app (`--accent` en
  `index.css`, una sola variable que pisa botones/tabs/links en todos
  lados) pasó de verde azulado a un bordó apagado (`#7A2E2B` claro /
  `#9C4B44` oscuro) a pedido, y el rojo de "Quitar"/acciones destructivas
  (`--danger`) se corrió a ámbar (`#B8631A` claro / `#E0904A` oscuro) para
  que no se confunda con el bordó del acento.

### Por qué tan liviano

Cada una de estas decisiones (SQLite en vez de un motor cliente/servidor,
un solo proceso Node sirviendo API y estáticos, sin Redis, sin colas, sin
workers aparte) apunta a lo mismo: mantener el footprint lo más chico
posible. La app corre en una Raspberry Pi 3B con 1GB de RAM, compartida
—dentro de contenedores Docker, en la misma red `edge`— con una web
portfolio y otra aplicación del mismo estilo. No hay margen para un
runtime pesado.

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
  destino). Si el día destino ya tiene una instancia del mismo ejercicio,
  el backend rechaza el mover/copiar con un 400 a menos que se mande
  `reemplazar: true` en el body; el frontend se adelanta a ese 409 lógico
  fijándose en `diasHermanos[].ejercicios` (que ya tiene en memoria, sin
  pedir nada más al backend) y muestra "¿Lo reemplazás?" con
  Cancelar/Reemplazar antes de mandar el pedido. Con `reemplazar: true`,
  la fila que YA ESTABA en destino gana tal cual está -nunca se borra ni
  se pisa- porque ya es el mismo ejercicio (mismo `ejercicio_id`, por eso
  hay conflicto) con su propio peso/series/rango de reps ya establecidos
  ahí, y sobre todo con su propio historial de `registro_serie` (donde
  vive el RIR de cada serie ya cargada): la primera versión de esto
  borraba esa fila para "hacer lugar" -tirando ese historial por la
  cascada de `ejercicio_asignado`- y volvía a insertar una instancia
  nueva (en blanco si era copiar, o con el peso de origen si era mover),
  perdiendo el peso/series/reps/RIR que ya estaban cargados en destino.
  Ahora `resolverConflictoDestino` en `rutinaService.js` no toca esa fila
  para nada: en **mover**, se borra la de origen (que ya no hace falta
  ahí) y listo; en **copiar**, ni siquiera hace falta insertar nada, "la
  copia" es directamente la fila que ya estaba.

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
  - **Intercambiar día**: a diferencia de "Cambiar día" (que mueve UN día
    y tiene que resolver qué hacer con lo que ya había en destino),
    intercambia directamente la etiqueta `dia_semana` entre dos días YA
    ACTIVOS -y la duración declarada en disponibilidad, que viaja con el
    día- sin pisar ni redistribuir nada de ninguno de los dos (`POST
    /dias/:id/intercambiar`, `intercambiarDias` en `rutinaService.js`).
    Útil para canjear qué día se entrena qué, sin conflicto que resolver.
  - **Copiar día completo**: duplica TODOS los ejercicios de un día (con
    su peso/series/rango de reps/descanso tal cual están, es literalmente
    "la misma sesión de nuevo") a otro día de la semana (`POST
    /dias/:id/copiar`, `copiarDia` en `rutinaService.js`, límite de 6
    días activos por semana igual que agregar día). Para cuando conviene
    entrenar el mismo día 2 veces en la misma semana (ej. piernas lunes y
    viernes) sin armar un día nuevo a mano ejercicio por ejercicio. Si el
    día elegido ya tiene otro día activo, se puede **reemplazarlo**
    (`reemplazar: true` en el body): ese día se borra directo si nunca
    tuvo una sesión registrada, o se desactiva si ya tiene historial
    (mismo criterio que Quitar día/Cambiar día), y la copia entra en su
    lugar - sin preguntar por redistribuir músculos, ya que el usuario
    eligió conscientemente reemplazarlo entero. También copia el
    `progreso_ejercicio_microciclo` de cada ejercicio para el microciclo
    en curso (peso prescrito/piso de reps), para que la sugerencia en gris
    de la primera serie sea igual a la del original.
  - **Copiar un ejercicio suelto** a otro día (`POST
    /ejercicios/:id/copiar`, ver más arriba) también hereda su
    peso/series/rango/descanso tal cual, en vez de arrancar en blanco a
    testear - antes sí arrancaba en blanco (`series_actuales` fijo en 2 y
    `peso_actual` en NULL), lo que hacía perder la referencia de peso/
    series/reps ya conocida solo por entrenar el mismo ejercicio en un
    segundo día en la misma semana.
  - Todas estas (Intercambiar y Copiar día completo, con o sin reemplazo)
    viven en un modal nuevo (`MoverCopiarDiaModal.jsx`, link
    "Intercambiar/copiar día" al lado de "Cambiar día") con un tab para
    elegir el modo; si el día elegido para copiar ya está ocupado,
    pregunta "¿Reemplazar [Día]?" antes de mandar el pedido.
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
- El borrador de Semana 0 también se puede empujar al backend sin cerrar el
  testeo: botón **"Guardar"** al lado de "Guardar testeo y arrancar semana
  1" (`PUT /rutinas/:id/semana0/borrador`, columna `microciclo.borrador_semana0`,
  `guardarBorradorSemana0` en `progressionEngine.js`). A diferencia del
  submit final, acepta ejercicios incompletos - sirve para cargar la rutina
  personalizada desde la compu y verla (o seguir completándola) desde el
  celular, en vez de quedar atrapada en el `localStorage` de un solo
  dispositivo. Al abrir la pantalla, el borrador local y el del backend se
  mezclan campo por campo (gana lo tipeado en este mismo dispositivo si
  hay algo sin empujar todavía, y se completa con lo que venga del backend).
- El registro normal de un día (no Semana 0) tiene el mismo botón
  **"Guardar borrador"** junto a "Saltear sesión"/"Registrar sesión"
  (`PUT /dias/:id/borrador`, tabla `borrador_dia` -clave (dia_rutina_id,
  microciclo_id), un día se entrena en muchos microciclos a lo largo de la
  rutina, cada uno con su propio borrador-, `guardarBorradorDia` en
  `progressionEngine.js`, expuesto en `dia.borrador_registro` desde
  `obtenerRutinaActiva`). Antes el peso/reps/RIR tipeados -y el checkbox de
  **DropSet** en particular- solo vivían en el `localStorage` de ese
  dispositivo puntual: armar la rutina en la compu en casa y después abrir
  el celular en el gimnasio mostraba todo en blanco, sin ningún rastro de
  lo cargado del otro lado. El merge (backend primero, localStorage
  encima) tiene una vuelta extra respecto al de Semana 0: una fila del
  borrador solo pisa si tiene ALGO realmente tipeado (peso o reps no
  vacíos) - el simple hecho de abrir la pantalla en un dispositivo ya dejaba
  un borrador local vacío guardado (el mismo `useEffect` que lo persiste en
  cada cambio corre también al montar el componente), que sin ese chequeo
  pisaba con strings vacíos el borrador recién traído del backend. El
  borrador se limpia solo al registrar la sesión real (`registrarSesion`),
  así no queda uno viejo resurgiendo la próxima vez que se entrene ese
  mismo día en ese mismo microciclo (ej. semana 2 después de haber guardado
  la semana 1).
- **Bug arreglado:** toda la pantalla de Semana 0 es un solo `<form>` (el
  submit real es el botón "Guardar testeo..."), así que tocar Enter/"Listo"
  en el teclado numérico mientras se cargaba el peso o las reps del panel
  "+ Agregar ejercicio" -sin haber tocado todavía su propio botón
  "Agregar"- disparaba el submit implícito de TODO el formulario y cerraba
  el testeo de golpe, arrancando el microciclo 1 con lo que hubiera cargado
  hasta ese momento. El `<form>` ahora bloquea el Enter en cualquier
  `<input>` anidado (`onKeyDown` en `Semana0Form`), así que solo el clic
  explícito en "Guardar testeo..." cierra el testeo.
- **Editar Semana 0** (link junto a "Cambiar día" en Entrenamiento,
  `EditarSemana0Modal.jsx`, `GET`/`PUT /rutinas/:id/semana0/editar`,
  `obtenerSemana0Editable`/`editarResultadosSemana0` en
  `progressionEngine.js`): corrige lo cargado en la semana de testeo
  después de haberla cerrado -para el típico "me equivoqué al tipear" o
  para deshacer el efecto de un bug como el de arriba, sin tener que
  rehacer todo desde cero-. Solo está disponible mientras el microciclo
  que generó ese testeo siga en curso (`getMicrocicloTesteoOrigenDelActual`:
  el testeo cerrado cuyo `numero + 1` es el microciclo en_curso) - una vez
  que se cierra ese microciclo, la rutina ya avanzó más allá de lo que
  corrigió el testeo, así que tocarlo retroactivamente rompería la cadena
  de progresión, y el link deja de estar disponible. Al guardar, corrige
  las 2 series ya registradas Y recalcula el peso prescrito/piso de reps
  del microciclo en curso con los valores corregidos (mismo criterio que
  el cierre de testeo original), preservando el ajuste manual de series si
  ya se hizo uno. Un ejercicio agregado después de cerrado el testeo (ya
  en microciclo 1) no tenía nada que testear, así que no aparece en esta
  pantalla - se ignora si igual se manda en el pedido.
- **Renombrar una rutina** (`rutina.nombre`, `PATCH /rutinas/:id/nombre`,
  link "Renombrar" en cada tarjeta de "Mis rutinas"): nombre opcional
  elegido por el usuario para identificarla en el historial - si está
  vacío se sigue mostrando `split_asignado` como siempre.
- **Bug arreglado:** borrar una rutina desde "Mis rutinas" usaba
  `window.confirm()`, que en una PWA instalada en pantalla de inicio de iOS
  no muestra ningún diálogo y devuelve falso sin avisar - el botón
  "Borrar" quedaba sin hacer nada en ese contexto. Se reemplazó por el
  mismo tipo de modal propio que ya se usa para quitar un ejercicio
  (`RutinasPage.jsx`), que sí funciona en cualquier contexto.
- **Bug arreglado:** el input de usuario en "Reclamar invitación" y en
  "Cuenta directa" (`pattern="[A-Za-z0-9._-]+"`) rompía la validación
  nativa del navegador en versiones de Chrome que compilan `pattern` con
  el flag `v` (unicode sets) - el guión sin escapar antes del cierre de
  la clase de caracteres es inválido en ese modo (`Invalid character in
  character class`), lo que podía bloquear el submit sin ningún error
  visible. Se escapó el guión (`._\-`) en ambos formularios.
- **Bug arreglado:** el +/- de "Series" (`AjusteSeries`) actualiza
  `series_actuales` en el backend y refresca la rutina, pero el estado
  local de `RegistroDia` ya tenía una entrada para ese ejercicio desde el
  montaje de la pantalla, así que la fila nueva (o la sacada) no aparecía
  hasta recargar la página entera. Un efecto en `RegistroDia` reconcilia
  ahora la cantidad de filas reales (no toca las de dropset) contra
  `series_actuales` cada vez que cambia, preservando lo ya tipeado en las
  que quedan.
- **Autocompletar peso/reps de referencia** (botón junto a "DS" en cada
  ejercicio de Entrenamiento): carga de una el peso de referencia y la
  baja de reps esperada en cada serie (los mismos valores que ya se veían
  como placeholder gris) para no tener que tipearlos serie por serie -
  deshabilitado si el ejercicio todavía no tiene peso de referencia
  cargado.
- **Fase nutricional de la semana** (`microciclo.fase_nutricional`,
  `PATCH /rutinas/:id/fase-nutricional`, selector junto a "Microciclo N"
  en Entrenamiento): volumen/definición/mantenimiento/sin definir, elegido
  libremente por el usuario para ese microciclo - puramente informativo,
  no afecta en nada al motor de progresión ni al cálculo de series/peso.
- **Cálculo de tiempo por ejercicio reemplazado** (antes un fijo
  `MINUTOS_POR_EJERCICIO = 9` sin importar la cantidad de series):
  `segundosEstimadosEjercicio` en `routineBuilder.js` ahora estima
  `30s de trabajo × series + descanso × (series - 1) + 5 min de
  transición` (cambiar de máquina/estación, cargar y descargar discos) -
  el mismo criterio de descanso (90s, 60s si es unilateral) que ya se
  persiste en `ejercicio_asignado`. `armarDia` sigue repartiendo el tiempo
  declarado entre ejercicios igual que antes, pero ahora con este costo
  real por ejercicio en vez del fijo, y redondeando el acumulado para
  abajo al comparar contra los minutos disponibles (así un ejercicio que
  se pasa por una fracción de minuto -ej. 9.5 min por una 3ra serie donde
  antes eran 9 fijos- igual entra si el sobrante es menor a un minuto).
  Sigue arrancando siempre en `SERIES_MINIMO` (2) porque es el estado con
  el que se crea cualquier ejercicio nuevo, así que este cálculo es solo
  para decidir CUÁNTOS ejercicios entran al armar el día - no se vuelve a
  correr después.
- **Duración aproximada del entrenamiento** (junto a "Microciclo N" en
  Entrenamiento, `duracionEstimadaDia` en `EntrenamientoPage.jsx`): mismo
  criterio de arriba, pero recalculado en vivo con las series y el
  descanso REALES de cada ejercicio del día actual (los que ya subieron
  por progresión, o los que el usuario ajustó a mano con +/- Series o
  Descanso) - a diferencia del cálculo de `armarDia`, que solo corre una
  vez al armar el día y se congela en 2 series.
- **Rutina Express** (botón "⚡ Poco tiempo hoy" en Entrenamiento,
  `activarModoExpress`/`desactivarModoExpress` en `RegistroDia`): para
  cuando hay tiempo de ir al gimnasio pero no de hacer el día completo
  como está planeado. No es una rutina aparte ni se persiste en ningún
  lado -reescribe el estado local `series` de este día, como si el
  usuario hubiera tipeado todo a mano-, así que no hace falta borrarla
  después: si se registra la sesión queda como una sesión más (igual que
  cualquier otra), y si se abandona sin registrar es un borrador más que
  se pisa la próxima vez. Por ejercicio: 2 series reales al mismo peso
  que ya tenía (la 1ra con el objetivo de reps de siempre, la 2da libre)
  + 1 dropset a mitad de ese peso; el descanso de 60s entre la serie 1 y
  la 2 es solo una indicación en el cartel (no se persiste - la próxima
  semana el día vuelve a su descanso normal sin tocar nada).
- **Priorizar músculo(s) al armar la rutina** (checklist en el
  onboarding, modo automático, visible desde 4 días/semana; `POST
  /usuarios/:id/rutina` y `/rutina/split` aceptan `musculos_prioritarios`):
  el/los músculo(s) elegidos arrancan con 3 series por ejercicio en vez
  de 2, y ganan la mayoría de los ejercicios extra al repartir el tiempo
  disponible del día (`construirPrioridad`/`armarDia` en
  `routineBuilder.js`). Con 2 o más músculos priorizados se avisa que
  puede ser contraproducente (más fatiga, el día puede durar más de lo
  declarado). No aplica a rutinas de menos de 4 días/semana - no da el
  tiempo para priorizar nada. Por ahora solo en modo "Generarla
  automáticamente" (no en "Elegir mi split").
- **Jerarquía de músculos por defecto** (cuando el usuario NO elige
  ningún músculo prioritario, en rutinas de 4+ días/semana): pecho,
  espalda y deltoides lateral quedan 1-2 ejercicios por delante de
  bíceps/tríceps/dorsales/deltoides anterior/deltoides posterior; en
  piernas, cuádriceps e isquiotibiales por delante de glúteos, que a su
  vez va por delante de abductores/aductores/pantorrillas. Antes de
  favorecer a los prioritarios, se asegura un piso mínimo para los demás
  si el tiempo alcanza (bíceps y tríceps a 2 ejercicios; dorsales,
  deltoides anterior y posterior a 1 - ya cubierto por el ejercicio top
  de cada uno). Es el mismo mecanismo que la prioridad explícita de
  arriba (`construirPrioridad`), solo que con esta jerarquía fija en vez
  de la elegida a mano, y sin el extra de series (se queda en las 2 de
  siempre). Aplica también al agregar un día suelto más adelante (no solo
  al armar la rutina completa), siempre que la rutina ya tenga 4+
  días/semana.
- **Músculos secundarios por ejercicio** (`ejercicio_asignado.musculos_secundarios_json`,
  `PATCH /ejercicios/:id/musculos-secundarios`, opción "Músculos
  secundarios" en el menú "⋯"): hasta 2 músculos elegidos a mano para ESE
  ejercicio puntual, que se suman a los que ya trae el catálogo (nunca los
  reemplazan - ver `musculosSecundariosDe` en `routineBuilder.js`). Sirve
  para cuando el catálogo no capta bien lo que un ejercicio en particular
  le pega a un músculo, o para un ejercicio "particular" (cargado a mano)
  que no tiene dato de catálogo.
- **Reps efectivas directas vs. indirectas por músculo** (sección "Volumen
  semanal por músculo" en Progreso, `reps_efectivas_indirectas` en `GET
  /rutinas/:id/progreso`): además de las reps efectivas directas de
  siempre (del ejercicio cuyo músculo objetivo es ese), ahora se muestran
  discriminadas las indirectas - las mismas series ya registradas cuentan
  también, completas, para cada músculo secundario del ejercicio
  (catálogo + agregados a mano de arriba). Se calcula en vivo a partir de
  `registro_serie` del último bloque cerrado, igual que las directas -
  `volumen_indirecto` (el conteo en series, no en reps efectivas, que ya
  existía para el cierre de microciclo) también pasa a usar esta misma
  unión catálogo+agregados.
- **Fix crítico: borrar una rutina con sesiones entrenadas fallaba con
  "FOREIGN KEY constraint failed"** (`fixRegistroSesionCascade`/
  `fixRegistroSerieCascade` en `src/db/migrate.js`): en bases creadas antes
  de que `registro_sesion.dia_rutina_id`/`microciclo_id` y
  `registro_serie.ejercicio_asignado_id` tuvieran `ON DELETE CASCADE`
  (agregado a `schema.sql` en un commit posterior a la creación de esas
  tablas), `CREATE TABLE IF NOT EXISTS` nunca actualiza retroactivamente
  esa restricción en una base ya existente - hacía falta reconstruir la
  tabla, mismo problema y mismo mecanismo que ya se había arreglado antes
  para `deload` (ver `fixDeloadCascade`, un poco más arriba en el mismo
  archivo) pero que se había quedado corto: solo cubría esa tabla. Se
  corre solo (retroactivo, idempotente) en cada arranque del servidor -
  no hace falta ningún paso manual.
- **Semana 1 / Semana 2 por separado dentro de un mismo microciclo**
  (selector "Semana 1"/"Semana 2 · hoy" en Entrenamiento, `semana_actual`
  y `dia.registros_semana` en `GET /usuarios/:id/rutina`): antes, el
  registro de sesión de la semana 2 quedaba "encima" del de la semana 1 en
  la misma pestaña de día (mismo `dia_rutina_id`), sin forma de consultar
  cómo había ido la semana 1 una vez ya en la semana 2 - y el tick de
  "registrado" en la pestaña del día tomaba la sesión más reciente sin
  importar de qué semana era, así que en la semana 2 podía seguir marcado
  en verde por una sesión de la semana 1 que no tenía nada que ver con
  hoy. Ahora `obtenerRutinaActiva` en `rutinaService.js` separa el
  registro de cada semana por rango de fecha (mismo criterio de
  semana1/semana2 que ya usaba `cerrarMicrociclo` al cerrar el bloque) y
  el tick queda scopeado SOLO a la semana actual. La semana que no es la
  actual se ve de solo lectura (`ResumenSemanaPasada` en
  `EntrenamientoPage.jsx`) - consultar no toca nada de lo que se está
  entrenando hoy, que sigue siendo el formulario editable de siempre. La
  fecha (dd/mm) de cada día, que antes solo se mostraba en la Semana 0 de
  testeo, ahora también se ve junto al nombre del día y en cada pestaña,
  actualizándose según la semana que se esté consultando.
- **Fix: reabrir un día ya registrado mostraba todo en blanco** (precarga
  en `RegistroDia` desde `dia.sesion_actual.series`): al guardar una
  sesión con éxito se borra el borrador local de ese día (correcto, ya no
  hace falta), pero el formulario nunca volvía a leer la sesión ya
  guardada - así que reabrir un día con la sesión de hoy ya registrada
  mostraba peso y reps en gris (como si nunca se hubiera tipeado nada) y
  el RIR vuelto a su default (1), aunque el registro seguía intacto en la
  base (nada se había borrado - era solo la vista la que no lo reflejaba).
  Ahora, si el día ya tiene una sesión registrada (no salteada) esta
  semana, el formulario se precarga con los valores realmente guardados -
  funciona incluso sin el borrador local (otro dispositivo, caché
  limpiado), porque lee directo de lo que ya está en la base.
- **Publicar ejercicios particulares al catálogo global** (sección
  "Particulares para revisar" en Catálogo, admin; `GET
  /catalogo/ejercicios-personalizados`, `PATCH
  /catalogo/ejercicios/:id/publicar`): un ejercicio "particular" que un
  coach o cliente carga a mano en un día (`patron_movimiento =
  'personalizado'`, ver `crearEjercicioPersonalizado` en
  `rutinaService.js`) ya tiene su propia fila en la tabla `ejercicio` -
  "publicarlo" es completar los datos que le faltan (tipo real, patrón de
  movimiento, equipamiento, unilateral/compuesto de fuerza) con el mismo
  formulario que se usa para dar de alta un ejercicio nuevo. Como el `id`
  no cambia, las rutinas que ya lo tienen asignado lo ven de inmediato
  como un ejercicio de catálogo más, sin tocar nada. La lista muestra
  quién lo está usando (`ejercicio_asignado` → `dia_rutina` → `rutina` →
  `usuarios`) para ayudar a decidir si conviene publicarlo.
- **Feedback / reportar un problema** (botón "Reportar un problema" en el
  menú de cuenta, tabla `feedback`, `POST /feedback`): cualquier usuario
  logueado (cliente, coach o admin) puede mandar un mensaje corto (bug,
  sugerencia u otro) que le llega al admin. El admin lo ve en una sección
  propia del panel ("Feedback recibido", ordenado con lo pendiente
  primero) y lo puede marcar como revisado. No reemplaza `solicitud_cambio`
  (eso es "aplicar un cambio real" con aprobación del coach) - esto es
  solo un canal de texto libre hacia el admin.
- **Fix: "Preferir" y "Agregar propio" en Preferencias de ejercicios no
  hacían nada** (`preferencia_ejercicio_usuario`, pantalla
  `PreferenciasPage.jsx`): de los 3 tipos de preferencia, solo `exclusion`
  se leía en algún lado (`rutinaService.js`) - `preferencia` y
  `agregado_personalizado` se guardaban en la base y se mostraban en la
  lista, pero nunca afectaban nada real, pese a lo que decía la propia
  pantalla ("se prioriza sobre otros del mismo músculo" / "entra al pool
  de sustitución"). Arreglado en los dos casos:
  - **`preferencia`**: ahora se lee al armar/agregar/reorganizar un día
    (`getPreferidos` en `rutinaService.js`, mismo patrón que ya existía
    para `exclusion`) y se pasa a `armarDia`/`elegirEjercicioTop`, donde
    `candidatosPara` en `routineBuilder.js` adelanta los ejercicios
    preferidos dentro de su propio grupo de tipo (compuesto/aislado) - un
    aislado preferido no salta por delante de un compuesto sin marcar,
    solo gana el desempate contra otros aislados.
  - **`agregado_personalizado`**: en vez de guardar nombre/músculo sueltos
    sin ningún efecto, ahora crea de una un ejercicio "particular" real
    (`crearEjercicioPersonalizado`, la misma función y la misma marca
    `patron_movimiento = 'personalizado'` que usa cargar un ejercicio
    particular desde un día) - como los candidatos para sustituir/agregar
    ya leen cualquier fila de `ejercicio` para ese músculo sin filtrar por
    esto, aparece de entrada como una opción más. De paso, también entra
    a "Particulares para revisar" en Catálogo (arriba), así que el admin
    lo puede publicar al catálogo global igual que cualquier otro.
  Verificado: marcar una preferencia hace que ese ejercicio salga elegido
  como top de su músculo al generar una rutina nueva; un "agregado propio"
  vía preferencias queda disponible en el catálogo de ese músculo y
  aparece en la cola de revisión del admin.
- **Detección de nombre repetido al crear un ejercicio particular**
  (`crearEjercicioPersonalizado` en `rutinaService.js`, usada por los 3
  puntos de entrada: agregar ejercicio particular a un día, sustituir con
  nombre particular, y "Agregar propio" en Preferencias de arriba): antes
  cada alta insertaba una fila nueva sin mirar si ya existía una igual, así
  que dos coaches/clientes distintos (o el mismo, en otro día) escribiendo
  el mismo nombre para el mismo músculo terminaban con filas duplicadas en
  el catálogo. Ahora, antes de crear, busca un ejercicio activo del mismo
  músculo con el mismo nombre (recortado y sin distinguir mayúsculas -
  comparación simple, no busca sinónimos ni tolera tildes distintas) y
  reutiliza ese en vez de duplicar - incluye ejercicios del catálogo real,
  no solo otros particulares (si alguien escribe a mano un nombre que ya
  existe en el catálogo, termina usando ese, no un doble). Verificado:
  mismo nombre con mayúsculas/espacios distintos devuelve el mismo
  `ejercicio.id`; un nombre distinto sigue creando uno nuevo.
- **Sugerir patrones de movimiento existentes al dar de alta un ejercicio**
  (`<datalist>` + chips por músculo en `FormularioEjercicio`, Catálogo): el
  campo "Patrón de movimiento" era texto libre sin ninguna referencia de lo
  que ya existía - fácil terminar escribiendo variantes del mismo patrón
  sin darse cuenta (`empuje_horizontal` vs `Empuje Horizontal`), o
  clasificando mal (ej. hombro bajo el mismo patrón que brazo). Ahora
  sugiere los patrones ya usados en el catálogo por dos vías: un
  `<datalist>` con todos (`GET /catalogo/ejercicios` ahora también
  devuelve `patron_movimiento` y `musculo_id`) para elegir o escribir uno
  nuevo, y chips de un toque con SOLO los ya usados para el músculo
  elegido en el propio formulario (`patronesPorMusculoId`, derivado en
  vivo del catálogo) - hombro (deltoides lateral/anterior/posterior)
  sugiere `abduccion`/`empuje_vertical`/`abduccion_horizontal`, brazo
  (bíceps/tríceps) sugiere `flexion_codo`/`extension_codo`, cada uno el
  suyo, en vez de una lista plana de los 16 músculos mezclados.
- **Exportar a Excel rediseñado: historial legible en vez de una planilla de
  fórmulas** (`generarWorkbookHistorial` en `excelGenerator.js`,
  `ExportarExcelModal.jsx`): el Excel de siempre (`generarWorkbookUsuario`,
  ahora accesible con `?modo=plan`) es una planilla de cálculo con fórmulas
  vivas pensada para PROYECTAR el resto del bloque, no para releer lo ya
  entrenado - de ahí la queja de que "no hay una forma simple de seguir una
  rutina". El nuevo modo por defecto exporta lo que REALMENTE se entrenó:
  una tabla por sesión ya registrada (Ejercicio/Series/Repes/Peso/Descanso/
  RIR/RE, una fila por ejercicio con todas sus series resumidas en un solo
  texto - "20-18-16-14" en vez de 4 filas sueltas, dropsets aclarados
  aparte), con los mismos colores de la app (banner de fecha en bordó
  `#7A2E2B`, banner de día/músculos en ámbar `#B8842E`). El botón "Exportar
  Excel" ahora abre un modal para elegir el alcance: toda la rutina, un
  mesociclo (rango de microciclos), un microciclo puntual, o una sola
  sesión (`GET /rutinas/:id/export.xlsx?microciclo_desde=&microciclo_hasta=
  &sesion_id=`). Sesiones salteadas no se incluyen (no hay nada que
  mostrar). Verificado con Playwright de punta a punta (login, abrir el
  modal, elegir "Una sesión", descargar) y releyendo el .xlsx resultante
  con ExcelJS para confirmar colores, resumen por ejercicio y el dropset.
  **Más ordenado para rutinas largas** (varios meses exportados de
  corrido): con más de una sesión, se agrega una hoja **"Indice"** al
  frente (la primera solapa, la que Excel abre por defecto) con una fila
  por sesión -fecha, día, músculos, cantidad de ejercicios- y un link
  ("Ver ▸") que salta directo a esa tabla en la hoja "Historial"
  (hipervínculo interno `#Historial!A<fila>`, calculado en
  `agregarSesionAlSheet` que ahora devuelve la fila donde arranca cada
  sesión). Dentro de "Historial", un separador oscuro de ancho completo
  ("MICROCICLO N · fecha de inicio al fin", `agregarBannerMicrociclo`) se
  inserta cada vez que cambia el microciclo, para ubicarse de un vistazo en
  qué bloque de 2 semanas se está al scrollear una rutina larga -antes
  todas las sesiones eran visualmente idénticas sin importar de qué
  microciclo eran-. También se agregó una leyenda corta debajo del título
  explicando RIR/RE/DS, que antes solo se entendían por contexto. Probado
  generando un .xlsx real contra datos de prueba (2 microciclos, 4
  sesiones) y releyéndolo con ExcelJS para confirmar el orden de hojas, la
  fila exacta de cada hipervínculo y los separadores de microciclo, además
  de los 3 modos de alcance (rutina completa, un microciclo, una sesión).
  **Colores por celda según lo pactado**: las celdas de Peso y Repes de
  cada ejercicio se pintan solas comparando contra `peso_prescrito`/
  `piso_reps` de `progreso_ejercicio_microciclo` -lo mismo que ya usa el
  motor de progresión para decidir "mejoró" al cerrar un bloque, no un
  criterio nuevo-: **verde** si se hizo más peso o más reps que lo
  pactado, **rojo** si menos, blanco (sin pintar) si quedó igual. El peso
  se compara contra la primera serie real del ejercicio; las reps, contra
  la última serie real (la más cercana al fallo). Ojo con la combinación:
  las reps **solo** se pintan cuando el peso quedó en blanco (igual al
  pactado) - si el peso cambió (subió o bajó), las reps se dejan en
  blanco aunque hayan variado, porque hacer menos reps con más peso (o
  más reps con menos peso) es esperable y no dice nada por sí solo sobre
  si mejoraste o empeoraste. Sin dato de "lo pactado" para ese ejercicio
  en ese microciclo (ej. semana de testeo) no se pinta nada. Los
  dropsets quedan afuera de esta comparación (mismo criterio que el resto
  del resumen). Verificado con 4 escenarios sembrados a mano (peso igual
  con reps que suben/bajan, peso que sube/baja) releyendo los `fill` de
  cada celda con ExcelJS para confirmar los 4 casos exactos, incluida la
  regla de "las reps no se pintan si el peso cambió".
- **El mismo coloreado, también dentro de la app** (`colorVsPactado` en
  `EntrenamientoPage.jsx`, usado por `ResumenSemanaPasada` - la vista de
  "Semana 1"/"Semana 2" para ver lo que se entrenó la otra semana del
  microciclo en curso, ver toggle junto al nombre del día): mismo cálculo
  que en el Excel, pero contra `ej.peso_actual`/`ej.piso_reps` que ya
  vienen en `dia.ejercicios` (reflejan el mismo `peso_prescrito`/
  `piso_reps` del microciclo en curso, sin pegarle una consulta aparte).
  El peso se pinta en TODAS las series reales del ejercicio (normalmente
  comparten el mismo peso), las reps solo en la última serie real -mismo
  criterio "más cerca del fallo" que ya usa el motor de progresión para
  `techoDesde`-, con los tokens de color que ya tiene la app
  (`text-success`/`text-danger`, con soporte automático de tema oscuro -
  el "danger" de esta paleta es un ámbar/naranja, no un rojo puro).
  Verificado igual que el Excel: 4 ejercicios sembrados a mano cubriendo
  los 4 casos, confirmando con Playwright + `getComputedStyle` el color
  RGB real de cada celda (no solo capturas de pantalla).
- **El coloreado, también en vivo mientras se carga la sesión de hoy**
  (`colorVsPactadoLive` en `EntrenamientoPage.jsx`, usado en los inputs de
  peso/reps de `RegistroDia`): mismo criterio otra vez, pero recalculado
  en cada tecleo sobre el estado local `series` (que todavía puede tener
  campos vacíos - un campo vacío no cuenta como "0", simplemente no hay
  nada que comparar todavía, así que no se pinta hasta que se tipea algo).
  A diferencia de `ResumenSemanaPasada` (que solo pinta el texto), acá se
  pinta también el borde del input (`border-success`/`border-danger`)
  para que se note más en un campo chico mientras se está escribiendo.
  Verificado con Playwright tipeando en vivo (no pegando un valor ya
  cargado) los mismos 2 escenarios -peso igual con reps que suben, peso
  que sube con reps que bajan- y confirmando con `getComputedStyle` el
  color de cada input a medida que se completaban los campos.
  **Serie agregada de más (botón "+1 serie") sin referencia previa**: si
  se agrega una serie extra respecto a lo pactado (o si el ejercicio ya
  venía con menos series de las que tiene ahora), esa serie nueva no se
  pinta - no se entrenó nunca antes, así que no hay piso de reps con el
  que compararla. `colorVsPactadoLive` recibe `seriesReferencia`, la
  cantidad de series que tenía el ejercicio al abrir la pantalla
  (`seriesPactadasAlAbrir`, capturada una sola vez al montar `RegistroDia`
  con `useState(() => ...)`, sin recalcularse aunque `dia.ejercicios`
  cambie de prop después - ej. al tocar "+1 serie", que refetchea la
  rutina), y solo compara la última serie real contra `piso_reps` si esa
  serie ya existía en ese conteo original; si no, deja `repsColor` en
  `null` (el peso sí se sigue comparando siempre: `peso_actual` no es "el
  peso de la serie N", es el peso de trabajo del ejercicio en general, así
  que sigue siendo una referencia válida aunque la serie sea nueva).
  Aplica solo a esta vista en vivo, no a `ResumenSemanaPasada` ni al
  Excel (ahí no hay forma confiable de reconstruir cuántas series eran
  "las de antes" después del hecho). Verificado con Playwright: 3 series
  pactadas, la 3ª con reps por debajo del piso (se pinta rojo); al tocar
  "+1 serie" la 3ª pierde el color (ya no es la última) y la 4ª -recién
  creada- tampoco se pinta ni completándola con reps aún más bajas.
- **Fix: el coloreado en vivo marcaba en rojo caídas de reps totalmente
  esperables por fatiga** (`colorVsPactadoLive`, en vivo únicamente):
  comparaba solo la ÚLTIMA serie real contra un único `piso_reps` fijo,
  sin importar cuántas series hubiera - con 3 o más series, eso pintaba
  en rojo una caída de reps perfectamente normal por fatiga (ej. 14-12-10
  con `piso_reps=10` pintaba la serie 3 en rojo, cuando en realidad son
  -2 reps por serie, justo el patrón esperado). Cada serie ahora se
  compara contra un objetivo FIJO calculado una sola vez desde lo
  pactado: `piso_reps - 2*índice` (serie 1 = `piso_reps`, serie 2 =
  `piso_reps - 2`, serie 3 = `piso_reps - 4`, ...) - el mismo -2 por
  serie que ya calcula `calcularSugerenciaReps` para el placeholder gris,
  pero SIN recalcularse en cadena a partir de lo tipeado en la serie
  anterior (a diferencia del placeholder, que sí lo hace, porque sirve
  para otra cosa: sugerir un número realista dado cómo viene la sesión
  hoy). Esa diferencia importa: con la cadena dinámica, mejorar la serie
  1 "contagiaba" un objetivo más exigente a la serie 2 - mantenerse ahí
  en el número que en realidad pautaba el plan original quedaba marcado
  en rojo solo por haber mejorado la serie anterior, mezclando dos cosas
  distintas (mejoraste una serie, te mantuviste en la otra). Verificado
  con Playwright: pactado 12/10/8 (piso_reps=12, 3 series), tipeando
  13/10/5 - serie 1 verde (mejoró), serie 2 blanca (igual al plan pese a
  la mejora previa), serie 3 roja (empeoró).
- **Fix: dos bugs más del coloreado en vivo -datos viejos tras sustituir un
  ejercicio, y celdas vacías pintadas-**:
  - **Sustituir un ejercicio dejaba pisado el peso/reps del ejercicio
    VIEJO**: "Cambiar ejercicio" mantiene el mismo `ejercicio_asignado_id`
    (mismo puesto en la rutina) pero cambia `ejercicio_id` y fija un
    peso/piso de reps nuevos vía su propia serie de referencia (un modal
    aparte, no estos inputs) - el estado local `series` de `RegistroDia`
    para ese id, sin embargo, seguía teniendo lo que se hubiera tipeado
    para el ejercicio anterior. Resultado: esos números viejos quedaban
    visibles bajo el nombre del ejercicio NUEVO, coloreados contra SU
    peso/piso, mezclando datos de dos ejercicios distintos (ej. un peso
    de 40kg de un ejercicio de espalda comparado contra el piso de un
    ejercicio de pecho recién elegido). Un nuevo `useEffect` en
    `RegistroDia` detecta el cambio de `ejercicio_id` por cada
    `ejercicio_asignado_id` (comparando contra el valor anterior via
    `useRef`) y resetea a blanco el estado local de ese ejercicio en
    particular apenas se confirma la sustitución.
  - **El peso se pintaba en celdas vacías**: `pesoColor` es un solo valor
    por ejercicio (compara la primera serie real contra `peso_actual`) que
    se aplicaba a las celdas de peso de TODAS las series reales por igual,
    sin chequear si esa fila en particular ya tenía algo tipeado - una
    serie 2/3 todavía vacía (mostrando el placeholder gris) se pintaba
    igual que la serie 1 ya completada. Ahora solo se pinta si `s.peso`
    tiene un valor real cargado en esa fila puntual (mismo chequeo que ya
    tenían las reps). Verificado con Playwright: sustituir un ejercicio
    con datos ya tipeados en la serie 1 - después de confirmar, las 3
    filas quedan en blanco (sin colores fantasma, sin números viejos).
- **La semana 2 arranca precargada con lo de la semana 1, no en blanco**
  (`RegistroDia`, prop nueva `semanaActual` pasada desde
  `EntrenamientoPage`): las dos semanas de un mismo microciclo entrenan al
  MISMO peso/piso pactado -es justo lo que compara `techoDesde` al cerrar
  el bloque (ver "Motor de cierre de microciclo" más abajo) para decidir
  si "mejoró"-, así que la semana 2 es un intento de igualar o superar la
  semana 1, no una rutina en blanco. Al abrir un día en semana 2 sin nada
  propio todavía registrado, si la semana 1 de ese mismo microciclo SÍ
  tiene una sesión real (no salteada), el formulario se precarga con
  exactamente esos valores -peso, reps y RIR de cada serie real, más
  cualquier dropset- en vez de arrancar vacío con solo el placeholder gris
  de sugerencia. Quedan totalmente editables: si repetís el mismo
  entrenamiento se guarda tal cual, si mejorás o empeorás alguna serie la
  editás y listo. El **coloreado sigue comparando contra lo pactado**
  (`peso_actual`/`piso_reps`, viene de Semana 0 o del cierre del
  microciclo anterior) y no contra estos valores precargados de la semana
  1 - por eso un número que ya viene "en verde" al abrir la pantalla no es
  un objetivo inventado a partir de la semana 1, es la misma comparación
  contra el plan original que ya se le aplicaba a esa serie la semana
  pasada. Si la semana 1 ya tiene su propia sesión registrada (reabriendo
  esa misma semana) sigue precargando esa, como antes - esto solo agrega
  el caso de semana 2 recién abierta sin nada propio todavía. Verificado
  con Playwright: semana 1 sembrada con 40kg × 13/10/9 (piso_reps=12) -
  al abrir semana 2 por primera vez, el formulario ya trae esos mismos 9
  valores (peso, reps, RIR) cargados y coloreados 100% en base al piso
  original, sin ningún cambio en la lógica de coloreado en sí.
- **Fix: el mismo bug del "objetivo único sin decrementar" seguía vivo en
  la vista de semana ya cerrada** (`colorVsPactado`, usada por
  `ResumenSemanaPasada` - el toggle "Semana 1"/"Semana 2" una vez que ya
  se avanzó a la semana siguiente): el fix del modo en vivo había
  quedado sin aplicar acá - esta función seguía comparando solo la
  ÚLTIMA serie real contra `piso_reps` tal cual, sin decrementar por
  índice, así que una rutina de 3+ series con una caída de reps
  perfectamente esperable por fatiga (ej. 14-12-10-8 con `piso_reps=14`)
  aparecía con la última serie en rojo apenas se pasaba de semana -
  justo el reporte del usuario ("si hoy empiezo semana 2, la semana 1...
  está mal coloreada"). Ahora usa el mismo objetivo fijo por serie que ya
  tiene `colorVsPactadoLive` (`piso_reps - 2*índice`), aplicado a CADA
  serie real (no solo a la última). No lleva el guard de "serie nueva sin
  referencia" del modo en vivo -acá todas las series mostradas ya se
  registraron de verdad en su momento, no hay tipeo a medio terminar que
  proteger-. Verificado con Playwright: semana 1 sembrada con el patrón
  -2 exacto (14-12-10-8, `piso_reps=14`) y avanzada a semana 2 - al abrir
  el toggle "Semana 1", ninguna de las 4 series queda pintada.
- **Fix crítico: la precarga de semana 2 rompió la sincronización de
  borrador entre dispositivos** (`RegistroDia`): al agregar la precarga
  de semana 2 con los valores de semana 1 (ver más arriba), cada campo
  arranca con datos reales desde el montaje aunque el usuario no haya
  tocado nada todavía - y el `useEffect` que guarda "series" en
  `localStorage` en cada cambio (para no perder lo tipeado si se cierra
  la pestaña) también corre en el montaje, así que esa precarga sin
  editar quedaba guardada en el `localStorage` de ESE dispositivo como si
  fuera "tipeo local real". Consecuencia: si se editaba algo en el
  celular y se tocaba "Guardar borrador", al abrir la PC (que nunca había
  tipeado nada, solo tenía la precarga) el merge de borradores aplicaba
  primero el remoto -con el cambio del celular- pero DESPUÉS el local de
  la PC, que por este mismo efecto ya tenía guardada su propia precarga
  sin editar - y esa carga local, al tener datos "reales" (no vacíos, el
  mismo chequeo que ya protegía este merge contra un borrador local
  genuinamente vacío), terminaba pisando el cambio recién traído del
  celular. Root cause de exactamente el reporte del usuario ("los cambios
  que hago en el celular no se ven en la PC"). Arreglado comparando
  `series` por REFERENCIA contra el valor capturado en el primer render
  (`useRef(series)` leído durante el render, no en un efecto) en vez de
  "saltear solo la primera vez que corre el efecto": en desarrollo,
  StrictMode invoca los efectos de montaje dos veces, así que un
  flag/contador de "primera vez" se gasta en esa invocación fantasma y
  el guardado local se cuela igual en la segunda - la comparación por
  referencia es inmune a esto porque `series` solo cambia de identidad
  cuando hay un `setSeries` con datos de verdad distintos. Verificado con
  Playwright con dos `BrowserContext` separados (simulando PC/celular):
  confirmado que el `localStorage` queda vacío en el montaje sin tocar
  nada, que SÍ se guarda apenas se tipea algo real, y que el flujo
  completo -editar en "celular", guardar borrador, recargar "PC"- ahora
  sí trae el valor nuevo (antes traía el viejo).
- **Fix: arrastrar para reordenar ejercicios generaba intercambios rápidos
  en PC** (`useArrastreOrden.js`, hook nuevo compartido por `RegistroDia` y
  `Semana0Form` - antes tenían el mismo algoritmo duplicado): el swap se
  decidía releyendo `getBoundingClientRect()` de TODAS las tarjetas en cada
  `pointermove`, pero para ese momento el DOM ya reflejaba el último swap
  (las tarjetas ya se habían corrido) - así que un swap podía dejar el
  puntero "cayendo" sobre otra tarjeta sin que el mouse se hubiera movido
  más, disparando otro swap encadenado de una. Con eventos de mouse en PC
  (mucho más finos que el touch) esto se sentía como un intercambio rápido
  entre ejercicios apenas se tocaba el borde de una tarjeta. Ahora el swap
  se decide comparando contra los centros de cada tarjeta capturados UNA
  SOLA VEZ al arrancar el arrastre (nunca recalculados en el medio) más el
  delta del puntero - mismo enfoque que usan las listas ordenables
  estándar. Verificado con Playwright simulando un mouse real: 150px de
  movimiento fino (1px por paso) sobre 16 ejercicios produjo un solo
  cambio de orden limpio, sin ninguna oscilación de ida y vuelta (antes
  este mismo movimiento habría generado varios cambios encadenados).
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
  entrenamiento" (se abre directo en la pestaña del día de la semana que es
  hoy, si la rutina entrena ese día - si no, cae a la primera pestaña, igual
  que antes (`elegirDiaInicial` en `EntrenamientoPage.jsx`, comparte lógica
  con Semana 0); cada pestaña de día muestra además un indicador chiquito de
  si ya se registró (check verde) o se salteó (guion gris) ese día en el
  microciclo en curso -sin indicador, todavía está pendiente esta semana-,
  para ver de un vistazo qué falta sin entrar a cada día (`dia.sesion_actual`
  en `obtenerRutinaActiva`, última fila de `registro_sesion` para ese día y
  microciclo); semana 0 de testeo con fecha de
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
  de los navegadores de celular; Semana 0 usaba flechas ▲▼ en vez de esto -
  quedaba inconsistente con el resto de la app y era más lento en el
  celular-, ahora comparte el mismo arrastre), ajuste manual de series (+1/-1,
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
  `ejercicio_asignado`) - las 6 acciones de cada ejercicio (Comentario,
  Cambiar ejercicio, Peso base, Descanso, Mover/copiar, Editar nombre si es
  particular y Quitar ejercicio) viven colapsadas atrás de un botón "⋯" en
  vez de mostrarse siempre como texto suelto, para que la tarjeta no ocupe
  tanto scroll durante el entrenamiento - el menú se cierra solo al tocar
  afuera o al scrollear la pantalla, "Comentario" va primero por ser la más
  usada de las 6, y el músculo del ejercicio pasó a la esquina superior
  derecha (donde antes estaba el botón de Comentario),
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
