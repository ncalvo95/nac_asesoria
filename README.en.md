# nac_asesoria - Training Program WebApp

🇪🇸 [Leer en español](README.md)

A webapp for programming workout routines with automatic progression over
2-week microcycles, tracking volume and effective reps per muscle group.
Built to live on the same Raspberry Pi (3B, 1GB RAM) that already runs
Loot Ledger, served at `www.castielo.io/nac_asesoria` through the same
Cloudflare Tunnel (see Deployment).

## Stack

- **Backend:** Node.js + Express + SQLite (better-sqlite3), a single process.
- **Frontend:** React + Vite + Tailwind v4 (mobile-first, automatic
  light/dark theme), compiled to static files in `frontend/dist` and served
  by that same Node process.
- **Auth:** bcryptjs (cost 10) + an opaque token in an httpOnly cookie,
  its SHA-256 hash stored in a `sesiones_auth` table (revoking a session
  is just a `DELETE`, no JWT, no blacklist). Login by **username**
  (4-10 characters, not email), same format as Loot Ledger. Roles: `admin`,
  `coach`, `cliente`. A cap of 5 active sessions per user, "remember me"
  (30 days), and a screen to list/revoke your own sessions. Accounts are
  created by **invite** (single-use code, same as Loot Ledger): an admin
  invites a coach or a client, a coach can only invite clients (who get
  linked to them automatically); claiming the code activates the account
  on the spot, no extra manual approval step.
- **PWA:** installable on phone or desktop ("Add to home screen") with its
  own icon and a full-screen launch, same as Loot Ledger
  (`frontend/public/manifest.webmanifest` + `sw.js`). It also has its own
  "Install app" button (`InstallPromptContext.jsx`) that captures the
  `beforeinstallprompt` event and fires the browser's native install prompt
  on demand, instead of relying only on the browser's passive icon -
  visible in the account menu and on the login/invite screens whenever the
  browser supports it (it never shows up on iOS Safari, which never fires
  that event).
- **Visual identity:** a real logo (black circle, silhouette deadlifting a
  bar, "N.A.C · ASESORÍA") instead of the old generic dumbbell icon -
  a small text-free version (`AppIcon.jsx`,
  `src/assets/icon-nac.png`) for the 18-32px headers, where the full
  logo's text wouldn't read, and the full version with the text baked in
  (`src/assets/logo-nac.png`) on Login and Invite, where there's room for
  it to show up large. The app's accent color (`--accent` in `index.css`,
  a single variable that drives buttons/tabs/links everywhere) moved from
  teal to a muted maroon (`#7A2E2B` light / `#9C4B44` dark) on request, and
  the red used for "Remove"/destructive actions (`--danger`) shifted to
  amber (`#B8631A` light / `#E0904A` dark) so it wouldn't get confused with
  the maroon accent.

### Why it's this lightweight

Every one of these choices (SQLite over a client/server database engine, a
single Node process serving both the API and static files, no Redis, no
queues, no separate workers) points the same way: keep the footprint as
small as possible. The app runs on a Raspberry Pi 3B with 1GB of RAM,
shared — inside Docker containers, on the same `edge` network — with a
portfolio site and another app of the same kind. There's no room for a
heavy runtime.

## Current state

Backend and frontend are both complete and tested end-to-end in the
browser (login → onboarding → routine generation → week 0 → logging
sessions → closing a microcycle → progress → Excel export):

- Full SQLite schema (`src/db/schema.sql`).
- Catalog seed: 16 active muscle groups with MEV/MAV/MRV reference values
  (`src/db/seed/musculos.js` - includes abductors, adductors and lower back
  on top of the usual "major" groups) and 60 exercises
  (`src/db/seed/ejercicios.js`).
- Auth with admin/coach/client roles (`src/routes/auth.js`).
- Onboarding: goal, availability, equipment (with a "mixed" option to pick
  home/gym **per muscle**, optional - anything left unspecified defaults
  to gym), medical profile, anthropometry, estimated 1RM, exercise
  preferences (`src/routes/perfil.js`).
- Generating and persisting the actual routine by split, based on
  days/week (`src/services/routineBuilder.js`, `src/services/rutinaService.js`,
  `src/routes/rutina.js`), with user-driven exercise reordering. The
  automatic builder fills the available time per day (based on the
  declared session length) by stacking more than one exercise per muscle
  when there's time to spare, not just the bare minimum. Default split by
  days/week: 2 days → Full Body ×2; 3 days → Full Body ×3 (non-consecutive)
  or Upper/Lower/Full Body (consecutive); 4 and 5 days let you pick between
  two variants during onboarding (`variante_split`: `upper_lower` by
  default, full body at 2× frequency, or `push_pull`, more torso-focused
  at 2× frequency - with 4 days it drops legs entirely, with 5 it adds a
  Legs day at 1× frequency); 6 days → Push/Pull/Legs ×2. Delts are split
  into 3 separate muscles (`deltoides_lateral`, `deltoides_anterior`,
  `deltoides_posterior` instead of a single "deltoides") because each head
  needs a different volume target: the lateral head gets almost no
  indirect stimulus from anything else, so it always lands on
  Push/Upper/Full Body days (the same slot the old single "deltoides"
  used to occupy - it's never skipped); the anterior head rides along
  there too (already covered by pressing, MEV 0); the posterior head goes
  on Pull days instead of Push, since it responds better to pulling
  movements (rows, face pulls, rear delt flyes) - see `seed/musculos.js`
  for the full MEV/MAV/MRV breakdown per head. The old "deltoides" entry
  stays in the `musculo` table with `activo = 0` (no longer offered when
  cataloging or building new routines) for referential integrity with
  already-generated history - `migrarDeltoides()` in `src/db/migrate.js`
  reassigns only the catalog and active routines to the right head,
  automatically on every startup. Alternatives to the fully automatic
  builder:
  - **Manual build** (`POST /usuarios/:id/rutina/manual`) - the user picks
    the exercises for each day directly from the catalog instead of the
    engine choosing them by equipment/exclusions.
  - **Custom split** (`POST /usuarios/:id/rutina/split`) - the user picks
    which muscles each day trains (unlike the manual build, here the
    engine still picks the exercises within each muscle). The frontend
    warns, without blocking, if a muscle ends up on two consecutive
    calendar days.

  Once a routine exists, you can **add an exercise** for any muscle in
  the catalog, not just the ones that day already trains (`POST
  /dias/:id/ejercicios`, candidates via `GET
  /dias/:id/musculos/:id/candidatos`) - if the muscle was already present
  it's added as an extra, if it's new for that day it becomes the top
  exercise (and the day adds it to `musculos_trabajados_json`), for
  whenever something comes up mid-training that wasn't part of the
  original split. You can also **remove** one (`DELETE
  /ejercicios-asignados/:id` - always asks for confirmation through a
  modal, and warns loudly if it already has logged sets, since removing
  it cascades and deletes that history too; it also warns, without
  blocking, if it's the "top" exercise for a muscle or the only one left
  for that muscle that day: if it was the top and other exercises for the
  same muscle remain, one of them becomes the new top; if none are left,
  the muscle drops out of `musculos_trabajados_json` -
  `reacomodarMusculoTrasQuitar()` in `rutinaService.js`), **swap** it, or
  **move/copy it to another day** in the same routine (`POST
  /ejercicios/:id/mover` keeps weight/sets - it's the same instance, it
  just changes days -, `POST /ejercicios/:id/copiar` starts a brand new
  instance to be tested on the destination day). If the destination day
  already has an instance of the same exercise, the backend rejects the
  move/copy with a 400 unless `reemplazar: true` is sent in the body;
  the frontend heads that logical 409 off by checking
  `diasHermanos[].ejercicios` (already in memory, no extra request) and
  shows "Replace it?" with Cancel/Replace before sending the request.
  With `reemplazar: true`, the row that was ALREADY in the destination
  wins exactly as it is - it's never deleted or overwritten - because
  it's already the same exercise (same `ejercicio_id`, that's why there's
  a conflict) with its own weight/sets/rep range already established
  there, and above all with its own `registro_serie` history (where the
  RIR of every already-logged set lives): the first version of this
  deleted that row to "make room" -dropping that history through
  `ejercicio_asignado`'s cascade- and inserted a brand new instance
  instead (blank if it was a copy, or with the source's weight if it was
  a move), losing whatever weight/sets/reps/RIR were already logged at
  the destination. Now `resolverConflictoDestino` in `rutinaService.js`
  never touches that row at all: on **move**, the source's row gets
  deleted (it's no longer needed there) and that's it; on **copy**, there
  isn't even anything to insert - "the copy" is simply the row that was
  already there.

- Both an **exercise** (top-right of its card, aligned with the exercise
  name) and the **day as a whole** have a "Comment" button that opens a
  free-text panel with a "Remind me on the next training update" checkbox
  (`PATCH /ejercicios/:id/comentario` and `PATCH /dias/:id/comentario`,
  `comentario`/`comentario_recordar` columns on `ejercicio_asignado` and
  `dia_rutina`). If the checkbox is on, the comment shows up on its own
  -without the user having to open anything- as a banner above the
  exercise or the day the next time that screen is opened; if it's off,
  the comment is still saved but doesn't surface automatically (the
  button switches to "Edit comment" so it can be reviewed or updated
  whenever needed).

  You can also **add or remove an entire day** from the active routine
  without rebuilding it from scratch (`POST /usuarios/:id/rutina/dias`,
  `GET /dias/:id/impacto`, `DELETE /dias/:id` in `rutinaService.js`) -
  unlike generating a whole new routine, this doesn't reset the current
  microcycle or the weight/sets already logged for the days that don't
  change:
  - **Add a day**: three modes - `manual` (the user picks the exercises),
    `auto_solo_dia` (the engine builds only the new day according to the
    current split, leaving everything else untouched) or
    `auto_reorganizar` (recalculates the whole split for the new day
    count, but reuses the exercises already assigned - where a muscle
    keeps training on the same day, it's left alone; where it moves to a
    different day, the existing exercise moves with it, weight intact;
    it only builds a brand new exercise -to be tested- for a muscle that
    ended up with none assigned).
  - **Remove a day**: before confirming, the frontend shows which muscles
    would be left with no active day at all (`GET /dias/:id/impacto`) vs.
    which ones are still trained elsewhere (just a lower frequency). The
    user chooses to redistribute those muscles (a new exercise gets built
    for them on the day with the lightest load) or just drop them. The
    day itself is deleted outright if it never had a logged session, or
    deactivated (`activo` column on `dia_rutina`, so it no longer shows up
    as an active day) if it already has history - so Reports and the
    Excel export don't lose those old sessions.
  - **Change a day**: moves ALL of a day's exercises to a different day of
    the week in one shot (weight/sets/progress intact), for when the user
    simply switches which day trains the same thing (e.g. "what I used to
    do on Monday I now do on Tuesday") without moving exercises one by one
    (`PATCH /dias/:id/dia-semana`, `cambiarDiaSemana` in
    `rutinaService.js` - technically it just reassigns
    `dia_rutina.dia_semana` and recalculates `numero_dia`, it never
    touches `ejercicio_asignado`). If the chosen day already has another
    active day on it, the frontend asks what to do with that one before
    confirming: move it to a day that's free (its progress stays intact
    too) or delete it (deleted or deactivated depending on whether it
    already has history, same as Remove a day).
  - **Swap day**: unlike "Change a day" (which moves ONE day and has to
    resolve whatever's already sitting on the destination), this directly
    swaps the `dia_semana` label between two days that are BOTH already
    active - and the duration declared in availability, which travels
    with the day - without touching or redistributing anything on either
    one (`POST /dias/:id/intercambiar`, `intercambiarDias` in
    `rutinaService.js`). Useful for swapping which day trains what, with
    no conflict to resolve.
  - **Copy an entire day**: duplicates ALL of a day's exercises (with
    weight/sets/rep range/rest exactly as they are, literally "the same
    session again") to another day of the week (`POST /dias/:id/copiar`,
    `copiarDia` in `rutinaService.js`, same 6-active-days-per-week cap as
    adding a day). For when it makes sense to train the same day twice in
    the same week (e.g. legs on Monday and Friday) without building a new
    day from scratch exercise by exercise. If the chosen day already has
    another active day, it can be **replaced** (`reemplazar: true` in the
    body): that day is deleted outright if it never had a logged session,
    or deactivated if it already has history (same rule as Remove a
    day/Change a day), and the copy takes its place - no muscle
    redistribution prompt, since the user consciously chose to replace it
    whole. It also copies each exercise's `progreso_ejercicio_microciclo`
    for the current microcycle (prescribed weight/rep floor), so the gray
    suggestion on the first set matches the original's.
  - **Copying a single exercise** to another day (`POST
    /ejercicios/:id/copiar`, see above) also inherits its
    weight/sets/rep-range/rest exactly, instead of starting blank to be
    tested - it used to start blank (`series_actuales` fixed at 2 and
    `peso_actual` at NULL), which lost the already-known weight/sets/reps
    reference just for training the same exercise on a second day in the
    same week.
  - All of these (Swap and Copy an entire day, with or without replacing)
    live in a new modal (`MoverCopiarDiaModal.jsx`, "Swap/copy day"
    link next to "Change day") with a tab to pick the mode; if the chosen
    day for copying is already occupied, it asks "Replace [Day]?" before
    sending the request.
- Week 0 (testing) and session/set logging (`src/services/progressionEngine.js`,
  `src/routes/sesiones.js`). Whatever gets typed in (weight/reps/RIR for
  Week 0 and for the day's regular log) is saved as a draft in the
  phone's `localStorage` as it's written (`leerBorrador`/`guardarBorrador`/
  `borrarBorrador` in `EntrenamientoPage.jsx`) - it used to live only in
  React state, so if the tab closed or the phone killed it mid-workout
  (goes to background, runs low on memory) everything was lost without
  warning. The draft is only restored when the screen is reopened, and
  gets cleared once the real save against the backend succeeds - the
  dropset row (an extra entry, outside the normal `series_actuales`
  range) is restored too if it was in the draft; it used to get silently
  dropped on page reload, because the draft merge only overwrote indexes
  that already existed in the initial state. The reference rep floor for
  week 1 (`piso_reps` in `progreso_ejercicio`) takes the higher of the 2
  sets logged during testing, not always set 2 - sometimes the chosen
  weight performs better on the first set than the second. You can
  **skip testing** (`POST /rutinas/:id/semana0/saltear`, "Skip testing
  and start my routine now" button on the form) if you already know your
  numbers: the first microcycle starts with weight blank (filled in on
  the first real session, like any new exercise) and no rep floor (0 -
  any real result "beats" that floor, so the baseline establishes itself
  naturally at the first close-out instead of being compared against a
  test that never happened).
- The Week 0 draft can also be pushed to the backend without closing out
  testing: a **"Save"** button next to "Save testing and start week 1"
  (`PUT /rutinas/:id/semana0/borrador`, `microciclo.borrador_semana0`
  column, `guardarBorradorSemana0` in `progressionEngine.js`). Unlike the
  final submit, it accepts incomplete exercises - useful for loading the
  custom routine on a computer and picking it back up (or finishing it)
  from a phone, instead of it staying trapped in one device's
  `localStorage`. When the screen loads, the local draft and the backend
  one get merged field by field (whatever's typed on this device wins if
  it hasn't been pushed yet, filled in from the backend otherwise).
- The regular day-to-day log (not Week 0) has the same **"Save draft"**
  button next to "Skip session"/"Register session" (`PUT
  /dias/:id/borrador`, `borrador_dia` table -keyed by (dia_rutina_id,
  microciclo_id), a day gets trained across many microcycles over the
  routine's lifetime, each with its own draft-, `guardarBorradorDia` in
  `progressionEngine.js`, exposed as `dia.borrador_registro` from
  `obtenerRutinaActiva`). Before this, the typed weight/reps/RIR -and the
  **DropSet** checkbox in particular- only lived in that one device's
  `localStorage`: planning the routine on a computer at home and then
  opening the phone at the gym showed everything blank, with no trace of
  what was loaded on the other side. The merge (backend first,
  localStorage on top) has one extra wrinkle compared to Week 0's: a
  draft row only overwrites if it has something ACTUALLY typed in it
  (non-empty weight or reps) - simply opening the screen on a device
  already left an empty local draft saved (the same `useEffect` that
  persists it on every change also runs on mount), which without that
  check would overwrite the backend draft just fetched with empty
  strings. The draft clears itself once the real session gets registered
  (`registrarSesion`), so an old one doesn't resurface the next time that
  same day gets trained in that same microcycle (e.g. week 2 after
  saving week 1).
- **Bug fixed:** the whole Week 0 screen is a single `<form>` (the real
  submit is the "Save testing..." button), so hitting Enter/"Done" on the
  numeric keyboard while typing the weight or reps in the "+ Add exercise"
  panel -before ever tapping its own "Add" button- triggered an implicit
  submit of the ENTIRE form and closed out testing right then, starting
  microcycle 1 with whatever had been filled in up to that point. The
  `<form>` now blocks Enter on any nested `<input>` (`onKeyDown` on
  `Semana0Form`), so only an explicit click on "Save testing..." closes it
  out.
- **Edit Week 0** (link next to "Change day" on Entrenamiento,
  `EditarSemana0Modal.jsx`, `GET`/`PUT /rutinas/:id/semana0/editar`,
  `obtenerSemana0Editable`/`editarResultadosSemana0` in
  `progressionEngine.js`): fixes what got logged in testing week after
  it's already closed - the classic "I typed it wrong" case, or a way to
  undo what a bug like the one above did without redoing the whole thing
  from scratch. Only available while the microcycle that testing produced
  is still in progress (`getMicrocicloTesteoOrigenDelActual`: the closed
  testeo whose `numero + 1` is the currently in_curso microcycle) - once
  that microcycle closes, the routine has already moved past what testing
  set up, so touching it retroactively would break the progression chain,
  and the link stops showing up. Saving corrects the 2 already-logged sets
  AND recalculates the current microcycle's prescribed weight/rep floor
  from the corrected values (same rule as the original test close-out),
  preserving any manual set-count adjustment already made. An exercise
  added after testing closed (already in microcycle 1) never went through
  testing, so it doesn't show up on this screen - it gets skipped even if
  the request still includes it.
- `microciclo.tipo` (`normal` | `testeo` | `descarga`) distinguishes
  special microcycles from regular progression blocks - this used to be
  implicit in `numero === 0`, which stopped being enough once a testing
  week could be requested again later in the same routine:
  - **Real deload week** (`marcarSemanaDescarga` in
    `progressionEngine.js`, "Mark deload week" button on Progress, with an
    explicit confirmation: *"This week will be turned into your deload
    week, this action can't be undone. After the deload, the routine will
    resume from the last completed microcycle."*) - unlike an earlier
    version (a purely informational suggestion), this actually transforms
    the current week: sets are cut in half (rounded up, minimum 2) and
    weight drops to 75% except for the first set of each exercise, and it
    applies for real (`peso_actual`/`series_actuales` on
    `ejercicio_asignado`). That week's actual progress
    (`progreso_ejercicio_microciclo`) is left untouched on purpose - it
    still holds the values from the last completed normal microcycle -
    so once the deload is closed out (same "Close microcycle" button, no
    new one needed) the routine picks up exactly where it left off,
    without the deload counting toward progression.
  - **New testing week** within the same routine (`marcarNuevoTesteo` +
    `POST /rutinas/:id/testeo`, "New testing week" button on Progress,
    with confirmation) - turns the current microcycle into a testing week
    (2 sets per exercise, same as the initial one) to recalibrate
    weight/reps without losing the routine or its history; it's completed
    in Entrenamiento with the same form as Week 0
    (`registrarSemana0` was generalized to find any microcycle with
    `tipo='testeo'` currently in progress, not just `numero=0`). All the
    testing weeks a routine has already closed out (the initial one and
    any repeats) can be **compared against each other** on Progress
    (`GET /rutinas/:id/testeos`, "Compare testing weeks" section, visible
    once there are 2 or more) - weight and reps for every set, per
    exercise.
- **Microcycle close-out engine** (the core of the whole system):
  calculates a floor/ceiling per exercise (best mark vs. average),
  detects stalling per muscle, applies the MAV cap, adds a set to the top
  exercise, adjusts weight by rep range, and chains into the next
  microcycle.
- **Effective reps** (`repsEfectivas` in `progressionEngine.js`): of the
  reps done in a set, how many fall within the last
  `REPS_EFECTIVAS_UMBRAL` (3) reps before failure -
  `max(0, min(reps, 3 − RIR))`. Always recalculated from the actual logged
  sets (`registro_serie`, with its RIR), never from what was prescribed,
  so a set with no RIR (today that only happens in Week 0, which doesn't
  ask for it) contributes nothing instead of making up a value. Shown
  live while logging a session (an "RE" column per set + a total per
  exercise), aggregated by muscle/exercise on Progress (for the last
  closed microcycle), and tracked over time on Reports. Sets flagged as
  dropsets (`es_dropset`) are excluded from that normal total - they're
  aggregated separately, per muscle, and shown as a subtotal ("· N from
  dropsets") both live while logging a session and on Progress.
- An Excel generator for guests, no account or persistence needed
  (`src/routes/guest.js`), and **Excel export for registered users**
  (`GET /api/rutinas/:rutinaId/export.xlsx`) that pre-fills the actual
  history (already-closed microcycles) and leaves live formulas for
  what's still pending, so it also works as an offline backup/continuation.
  Both share the same generation logic (`src/services/excelGenerator.js`).
  That formula-driven sheet (`generarWorkbookUsuario`, now reachable only
  via `?modo=plan`) is meant to PROJECT the rest of the block, not to
  re-read what was already trained - so the default export mode instead
  builds a readable **history** (`generarWorkbookHistorial`, wired to the
  "Export Excel" button/modal): one table per already-logged session
  (Exercise/Sets/Reps/Weight/Rest/RIR/RE, all sets of an exercise summed
  up into one row - "20-18-16-14" instead of 4 loose rows, dropsets called
  out separately), styled with the app's own colors (date banner in
  bordeaux, day/muscle banner in amber). The export modal lets you pick
  the scope: the whole routine, a mesocycle (microcycle range), a single
  microcycle, or a single session. For a routine with more than one
  session, a front-page **"Index"** sheet is added (the first, default
  tab) listing every session -date, day, muscles, exercise count- with a
  link that jumps straight to that session's table on the "Historial"
  sheet, plus a full-width dark divider row ("MICROCYCLE N · start to end
  date") inserted wherever the microcycle changes, and a short legend
  explaining RIR/RE/DS - all aimed at keeping a many-months export
  navigable instead of one long undifferentiated scroll. **Cell colors
  against what was planned**: each exercise's Weight and Reps cells color
  themselves by comparing against `peso_prescrito`/`piso_reps` from
  `progreso_ejercicio_microciclo` - the same values the progression engine
  already uses to decide "improved" when closing a block, not a new
  criterion - **green** when more weight or more reps were done than
  planned, **red** when less, white (unpainted) when it matched exactly.
  Weight is compared against the exercise's first real set; reps against
  the last real set (closest to failure). One catch: reps are **only**
  colored when weight stayed white (matched the plan) - if weight changed
  (up or down), reps are left white even if they also changed, because
  doing fewer reps at a heavier weight (or more reps at a lighter one) is
  expected and doesn't say anything by itself about improving or
  regressing. With no planned value for that exercise in that microcycle
  (e.g. a testing week) nothing gets colored. Dropsets are excluded from
  this comparison too. Verified against 4 hand-seeded scenarios (same
  weight with reps up/down, weight up/down) by reading back each cell's
  fill with ExcelJS to confirm all 4 exact outcomes, including the rule
  that reps stay uncolored whenever weight changed.
- **The same coloring, inside the app too** (`colorVsPactado` in
  `EntrenamientoPage.jsx`, used by `ResumenSemanaPasada` - the "Week 1"/
  "Week 2" view for seeing what was trained on the other week of the
  current microcycle, see the toggle next to the day's name): same
  calculation as the Excel one, but against `ej.peso_actual`/
  `ej.piso_reps` already present on `dia.ejercicios` (they mirror that
  same microcycle's `peso_prescrito`/`piso_reps`, no extra query needed).
  Weight is colored on EVERY real set of the exercise (they normally
  share the same weight), reps only on the last real set - same "closest
  to failure" criterion the progression engine already uses for
  `techoDesde`- using the app's existing color tokens (`text-success`/
  `text-danger`, with automatic dark-mode support - this palette's
  "danger" is an amber/orange, not a pure red). Verified the same way as
  the Excel export: 4 hand-seeded exercises covering all 4 cases,
  confirmed with Playwright + `getComputedStyle` reading back each
  cell's actual RGB color, not just a screenshot.
- **The coloring, live too while logging today's session**
  (`colorVsPactadoLive` in `EntrenamientoPage.jsx`, used on the weight/
  reps inputs in `RegistroDia`): same criterion again, recalculated on
  every keystroke against the local `series` state (which can still have
  empty fields - an empty field doesn't count as "0", there's simply
  nothing to compare yet, so it stays uncolored until something is
  typed). Unlike `ResumenSemanaPasada` (which only colors the text), this
  one also colors the input's border (`border-success`/`border-danger`)
  so it stands out more on a small field while typing. Verified with
  Playwright actually typing live (not pasting an already-filled value)
  through the same 2 scenarios - same weight with reps going up, weight
  going up with reps going down - confirming each input's color with
  `getComputedStyle` as the fields got filled in.
  **A set added beyond the plan (the "+1 set" button) has no history to
  compare against**: if an extra set gets added beyond what was planned
  (or the exercise used to have fewer sets than it does now), that new
  set stays uncolored - it was never trained before, so there's no rep
  floor to compare it to. `colorVsPactadoLive` takes `seriesReferencia`,
  the set count the exercise had when the screen was opened
  (`seriesPactadasAlAbrir`, captured once on `RegistroDia` mount via
  `useState(() => ...)`, never recalculated even as `dia.ejercicios`
  changes prop afterward - e.g. from tapping "+1 set", which refetches
  the routine), and only compares the last real set against `piso_reps`
  if that set was already part of that original count; otherwise it
  leaves `repsColor` as `null` (weight still gets compared as always:
  `peso_actual` isn't "the weight of set N", it's the exercise's general
  working weight, so it stays a valid reference even for a brand-new
  set). This only applies to this live view, not to
  `ResumenSemanaPasada` or the Excel export (there's no reliable way to
  reconstruct "how many sets used to exist" after the fact there).
  Verified with Playwright: 3 planned sets, the 3rd with reps under the
  floor (colored red/orange); tapping "+1 set" clears that color from
  set 3 (no longer the last one) and the newly-created 4th set stays
  uncolored too even when filled in with even lower reps.
- **Fix: the live coloring was flagging perfectly normal fatigue-driven
  rep drops as red** (`colorVsPactadoLive`, live view only): it compared
  only the LAST real set against a single fixed `piso_reps`, regardless
  of how many sets there were - with 3+ sets that colored a completely
  normal fatigue decline red (e.g. 14-12-10 with `piso_reps=10` colored
  set 3 red, when that's actually -2 reps per set, exactly the expected
  pattern). Each set now gets compared against a FIXED target computed
  once from the plan: `piso_reps - 2*index` (set 1 = `piso_reps`, set 2 =
  `piso_reps - 2`, set 3 = `piso_reps - 4`, ...) - the same -2-per-set
  math `calcularSugerenciaReps` already uses for the gray placeholder,
  but WITHOUT re-chaining from what got typed in the previous set (unlike
  the placeholder, which does chain from it, because it serves a
  different purpose: suggesting a realistic number given how today's
  session is actually going). That difference matters: with the dynamic
  chain, beating set 1's target "infected" set 2 with a tougher target -
  matching the number the ORIGINAL plan actually called for in set 2 got
  flagged red just for having beaten the previous set, conflating two
  different things (you improved one set, held steady on the other).
  Verified with Playwright: planned 12/10/8 (`piso_reps=12`, 3 sets),
  typing 13/10/5 - set 1 green (improved), set 2 white (matches the plan
  despite the earlier improvement), set 3 red (regressed).
- **Fix: two more live-coloring bugs - stale data after substituting an
  exercise, and empty cells getting colored**:
  - **Substituting an exercise left the OLD exercise's weight/reps
    behind**: "Change exercise" keeps the same `ejercicio_asignado_id`
    (same slot in the routine) but changes `ejercicio_id` and sets a new
    weight/rep floor via its own reference set (a separate modal, not
    these inputs) - `RegistroDia`'s local `series` state for that id,
    though, kept whatever had been typed for the previous exercise.
    Result: those old numbers stayed visible under the NEW exercise's
    name, colored against ITS weight/floor, mixing data from two
    different exercises (e.g. a 40kg weight from a back exercise compared
    against the floor of a just-picked chest exercise). A new
    `useEffect` in `RegistroDia` detects the `ejercicio_id` change per
    `ejercicio_asignado_id` (comparing against the previous value via
    `useRef`) and resets that specific exercise's local state to blank
    the moment the substitution is confirmed.
  - **Weight was coloring empty cells**: `pesoColor` is a single
    per-exercise value (comparing the first real set against
    `peso_actual`) that got applied to every real set's weight cell
    alike, without checking whether that particular row actually had
    anything typed - a still-empty set 2/3 (showing the gray placeholder)
    got colored the same as an already-filled set 1. It's now only
    colored when `s.peso` actually holds a real value in that specific
    row (same check reps already had). Verified with Playwright:
    substituting an exercise that already had set 1 typed in - after
    confirming, all 3 rows come back blank (no ghost colors, no stale
    numbers).
- **Week 2 now opens pre-filled with week 1's numbers, not blank**
  (`RegistroDia`, new `semanaActual` prop passed down from
  `EntrenamientoPage`): both weeks of the same microcycle train at the
  SAME planned weight/floor - that's exactly what `techoDesde` compares
  when closing the block (see "Microcycle close engine" below) to decide
  whether you "improved" - so week 2 is meant as an attempt to match or
  beat week 1, not a blank routine. Opening a day in week 2 with nothing
  of its own logged yet, if week 1 of that same microcycle DOES have a
  real (non-skipped) session, now pre-fills the form with exactly those
  values - weight, reps and RIR for every real set, plus any dropset -
  instead of starting empty with just the gray suggestion placeholder.
  Everything stays fully editable: repeat the same session and it saves
  as-is, improve or drop on any set and just edit that field. **The
  coloring still compares against the plan** (`peso_actual`/`piso_reps`,
  set by Week 0 or the previous microcycle's close), never against these
  pre-filled week-1 values - so a number that already shows green the
  moment the screen opens isn't a target invented from week 1, it's the
  exact same comparison against the original plan that set already got
  last week. If week 1 already has its own logged session (reopening that
  same week) it still pre-fills from that, as before - this only adds the
  case of a freshly-opened week 2 with nothing of its own yet. Verified
  with Playwright: week 1 seeded with 40kg × 13/10/9 (`piso_reps=12`) -
  opening week 2 for the first time, the form already carries those same
  9 values (weight, reps, RIR) loaded and colored entirely against the
  original floor, with zero change to the coloring logic itself.

- Frontend (`frontend/`): login (with "remember me"), onboarding (with a
  choice of automatic generation, a custom split, or a fully manual
  build - with a custom split, besides picking which muscles each day
  trains, you can choose whether the engine fills in the exercises
  automatically as usual, or leaves the days built with just their
  muscles so you add the exercises yourself later from Entrenamiento, at
  your own pace -`diferirEjercicios` in `crearRutinaConSplit`, it still
  goes through Week 0, just empty, with nothing to test-), "Training day"
  (opens straight on today's weekday tab if the routine trains that day -
  otherwise it falls back to the first tab, same as before
  (`elegirDiaInicial` in `EntrenamientoPage.jsx`, shared logic with Week
  0); each day tab also carries a small indicator for whether that day was
  already logged (green check) or skipped (gray dash) in the current
  microcycle -no indicator means it's still pending this week-, so you can
  see what's left at a glance without opening every day (`dia.sesion_actual`
  in `obtenerRutinaActiva`, the latest `registro_sesion` row for that day
  and microcycle); Week 0 testing with a selectable start date, logging sets by
  weight/reps/RIR - the weight and reps fields start empty, showing in
  gray (a placeholder, not a saved value) the recommended reference: for
  weight, the exercise's base weight (`peso_actual`); for reps, on set 1
  the rep floor from the last close-out (`piso_reps`), and from there on,
  if the same weight as the previous set is kept (comparing what was
  typed, or the base weight if nothing was typed yet), 2 reps less than
  the ACTUAL previous set - not the earlier suggestion - (if the user logs
  a number different from the one suggested, or changes the weight, the
  next suggestion is recalculated in a chain from that value), meant to
  reflect the typical drop-off at ~90s rest between sets at the same
  weight; the user still has to write down what they actually did -weight
  and reps-, the placeholder doesn't count as logged and doesn't block
  saving until they do. Every exercise also has a "DS" (DropSet)
  checkbox: checking it adds an extra set at the end, its weight
  pre-filled at half of the last real set logged (or the base weight if
  nothing's been logged yet), rounded to 0.5kg, still editable; that
  extra set is labeled "DS" instead of a number, doesn't count toward the
  exercise's/muscle's effective reps but does count toward a separate
  dropset total per exercise (`es_dropset` column on `registro_serie`,
  excluded from `getUltimaSerieEnRango` so it doesn't skew progression) -,
  swapping or adding an exercise mid-routine — both now ask for a single
  weight + one reference set (not a 2-set mini-test), which sets the rep
  floor for the current microcycle the same way Week 0 does with the max
  of its 2 sets (if it's added during Week 0 itself, that weight and those
  reps are pre-filled right there, still editable, instead of being asked
  for twice); both also let you load a "custom" exercise that isn't in
  the catalog, with its own "Edit name" button in case it was typo'd
  (only for these, never for a catalog exercise) —, reordering a day's
  exercises by dragging the exercise name label (press and hold, then
  move up/down - built with Pointer Events rather than native HTML5
  drag-and-drop, which doesn't play well with touch on most mobile
  browsers; Week 0 used to have ▲▼ arrows instead - inconsistent with the
  rest of the app and slower on a phone - now it shares the same drag),
  manually adjusting sets (+1/-1, respecting the floor and cap
  for the given goal - the adjustment is also written to
  `progreso_ejercicio_microciclo` for the current microcycle, not just to
  `ejercicio_asignado`, so it carries over from microcycle to microcycle
  until the user changes it or requests a deload, instead of resetting
  just because a close-out happened) and base weight without waiting for
  a microcycle close-out, removing an exercise (always asks for
  confirmation through a modal, not just a message - if it already has
  logged sets, it warns loudly that they'll be lost in the cascade), and
  per-exercise rest time between sets (informational, the progression
  engine never touches it - defaults to 90s, 60s if the exercise is
  unilateral -by catalog flag or by name-, `descanso_segundos` on
  `ejercicio_asignado`) - each exercise's 6 actions (Comment, Change
  exercise, Base weight, Rest, Move/copy, Edit name if it's a custom one,
  and Remove exercise) live collapsed behind a "⋯" button instead of always
  showing as loose text links, so the card doesn't eat up so much scroll
  during a workout - the menu closes itself on an outside tap or on scroll,
  "Comment" goes first since it's the one you'd reach for most of the 6,
  and the exercise's muscle badge moved to the top-right corner (where the
  Comment button used to sit), "My routines" (routine history - only one can be
  active at a time, it's automatically finished when another is created
  or reactivated; from here you can reactivate an old one or delete it
  for good), Progress (volume per muscle vs. MAV, **effective reps** per
  muscle and per exercise, stall/improvement notes, closing a microcycle,
  requesting a deload, exporting to Excel), Reports (semiannual and
  mesocycle summaries, comparing weight/reps/volume/effective reps), a
  guest screen with no account needed (downloads the 6-month Excel
  straight from the browser), and a coach/admin panel (client list,
  creating accounts, viewing a given client's routine/progress/reports/
  exercise preferences — excluding exercises, marking favorites, or
  adding a custom exercise to a muscle's substitution pool), plus an
  **exercise catalog** managed by the admin (`/catalogo`,
  `POST /api/catalogo/ejercicios`, `PATCH /api/catalogo/ejercicios/:id/activo`)
  - the admin can add new exercises (muscle, type, movement pattern,
  required equipment) that become visible to every user when building or
  swapping exercises, and can activate/deactivate existing ones.
  Mobile-first design with the "Training day" screen adapted for desktop
  (a 2-column grid on medium/large screens instead of a single stretched
  column, to make better use of the space), a clinical/neutral palette
  with a configurable accent color (the same tokens as the [visual
  preview](https://claude.ai/code/artifact/e2941d16-a51b-4dad-ad83-4921bfcfecfe)
  that was agreed on before building it), automatic dark theme via
  `prefers-color-scheme`.

Known limitations / accepted simplifications:

- Swapping an exercise doesn't relocate sessions logged before the
  change (they stay tied to `ejercicio_asignado_id`, which now points to
  the new exercise) - an accepted MVP limitation, documented in the code.
- Reports are generated on demand (a button click), there's no actual
  "every 6 months" cron - wasn't needed for the expected usage volume.
- The **automatic** routine builder today only respects **exclusions**.
  Preferences ("preferir") and custom exercises added by users aren't
  used yet when generating or swapping - they're saved and shown, but
  still need to be wired into `routineBuilder.js`'s selection pool. The
  **manual** builder doesn't have this limit: the user picks directly
  from the whole catalog.
- The account model is deliberately closed (nobody can self-register or
  invite whoever they want - every new account starts from a code an
  admin or coach generated) - it fits "a coach manages their clients",
  not a marketplace-style app.
- A client with an assigned coach can turn on "let my coach approve my
  changes to goal/availability/equipment/routine"
  (`PATCH /usuarios/:id/aprobacion-coach`, a toggle on the Progress
  screen) - while it's on, those changes sit in `solicitud_cambio` until
  the coach approves or rejects them (`src/services/solicitudCambio.js`,
  coach panel). If the coach edits their client directly it skips this
  entirely (the coach is already who'd be approving it). Off by default.

## Setup

```bash
npm install
npm run db:migrate
npm run db:seed
ADMIN_USUARIO=admin ADMIN_PASSWORD=<pass> npm run db:bootstrap-admin
npm run build:frontend
npm start
```

For frontend development with hot reload: `npm --prefix frontend run dev`
(it proxies `/api` to `http://localhost:3000`, so the backend needs to be
running in parallel).

Environment variables:

- `PORT` (optional, defaults to 3000).
- `DB_PATH` (optional, defaults to `data/app.db`).
- `BASE_PATH` (optional, defaults to empty = domain root): the subpath the
  whole app hangs off of — API, static files, and the session cookie (see
  `src/base-path.js`). Has to match the `BASE_PATH` used when building the
  frontend (`BASE_PATH=/nac_asesoria npm run build` inside `frontend/`) —
  it's the same variable on both sides, same as in Loot Ledger
  (`server/src/base-path.js` / `client/vite.config.js` in that repo).

## Deployment at castielo.io/nac_asesoria

Same setup as Loot Ledger, with the same `BASE_PATH` convention (not
Caddy's `handle_path` — that variant is only used to *test* against
DuckDNS subdomains; the real domain (`www.castielo.io`) is served through
**Cloudflare Tunnel**, which routes by *path* without stripping the
prefix, so the app really does need to know which subpath it lives under):

**1. Build the image**, with the subpath baked into the frontend bundle
(`docker build` already does this via `--build-arg`, no need to run this
by hand if you're using the `docker-compose.yml` from step 2):

```bash
docker build -t nac-asesoria --build-arg BASE_PATH=/nac_asesoria .
```

**2. Its own `docker-compose.yml`** (already at the root of this repo, no
need to copy anything into Loot Ledger): it joins the external `edge`
network — the same one Loot Ledger and the portfolio site already share,
created once with `docker network create edge` (see
`docs/deploy-ssd-domain.md` in Loot Ledger) — without publishing any port
to the host.

```bash
cp .env.example .env
nano .env   # BASE_PATH=/nac_asesoria
docker compose up -d --build
```

**3. Routing to the container** — folder `nac-asesoria` (the
`container_name` in this compose file), reachable through Cloudflare
Tunnel over the `edge` network without touching any file in Loot Ledger.
Two ways to do it, pick one in the Cloudflare dashboard (Zero Trust →
Networks → Tunnels → your tunnel → Public Hostname), for
`www.castielo.io`:

- If the dashboard lets you set a **Path** field: an entry with
  `Path: nac_asesoria`, Service `http://nac-asesoria:3000`, evaluated
  **before** the portfolio's catch-all entry (order matters).
- If not (or if you'd rather have it version-controlled): an ingress rule
  in the tunnel's `config.yml` (lives in the Loot Ledger repo, see the
  "Route by path" section of `docs/deploy-ssd-domain.md` there) —
  something like `path: ^/nac_asesoria(/.*)?$` →
  `service: http://nac-asesoria:3000`, placed before the catch-all rule.

**4. First boot** (one time only, `docker compose exec nac-asesoria sh`
or similar): run the seed/bootstrap-admin steps from the Setup section
inside the container (the schema/migrations already run on their own
when the server starts - see below, no need to run `db:migrate` by hand).

**Updating an existing deploy** (`git pull` + `docker compose up -d
--build`): that's all it takes. `src/server.js` runs the full schema
(`CREATE TABLE IF NOT EXISTS`) and any pending `ALTER TABLE`
(`src/db/migrate.js`, tolerant of columns that already exist) against the
persistent volume BEFORE starting the HTTP server, so a new column added
in some commit doesn't leave the container crash-looping waiting for a
manual `db:migrate` that nobody ran - it self-heals on the next restart.

Validated in this environment (Docker couldn't start its daemon here — it
was checked by running the server directly with `BASE_PATH=/nac_asesoria`,
with no proxy in front): with the subpath set, the app stops responding
at the root and only responds under `/nac_asesoria` — assets, API, React
Router navigation, and the session cookie (name and path) — same as when
running at the root with no variable set.

None of this touches the Loot Ledger or castielo-web repos — all it
takes is the routing entry in the Cloudflare dashboard (or in its
`config.yml`, if that's the preferred route) pointing at
`nac-asesoria:3000`.

## Testing the guest Excel generator

Doesn't require an account or a user database (it does read the fixed
exercise/muscle catalog, which needs to already be migrated and seeded):

```bash
curl -X POST http://localhost:3000/api/guest/rutina.xlsx \
  -H "Content-Type: application/json" \
  -d '{
    "objetivo": {"tipo":"hipertrofia","sub_objetivo":"ganancia global"},
    "equipamiento": {"tipo":"gimnasio","checklist":[]},
    "dias_especificos": ["lunes","martes","jueves","viernes"]
  }' -o plan.xlsx
```

`dias_especificos` accepts between 2 and 6 days (lunes..domingo, i.e.
Spanish day names in lowercase, no accents). The split is built
automatically based on the number of days (see
`src/services/routineBuilder.js` for the full table from §3 of the
original prompt).

## Full flow for a registered user

```
POST /api/auth/login                                  (admin or coach)
POST /api/auth/usuarios            {rol: "coach"}      (admin only, direct signup with password)
POST /api/auth/usuarios            {rol: "cliente"}    (admin or coach, direct signup with password)
  # invite-based alternative (same as Loot Ledger, see above):
  # POST /api/auth/invites {rol}                 -> {code}   (admin or coach)
  # GET  /api/auth/invite/:code                              (public, validates without consuming)
  # POST /api/auth/claim-invite {code, nombre, usuario, password, coach_id?}
  #   -> activates the account and logs in right away, public
PUT  /api/usuarios/:id/objetivo
PUT  /api/usuarios/:id/disponibilidad
PUT  /api/usuarios/:id/equipamiento
POST /api/usuarios/:id/rutina                          (generates and persists the routine)
  # manual alternative (the user picks the exercises, see above):
  # POST /api/usuarios/:id/rutina/manual  {dias: [{dia_semana, ejercicios: [id,...]}]}
POST /api/rutinas/:rutinaId/semana0    {resultados: [...]}
POST /api/usuarios/:id/sesiones        {dia_rutina_id, microciclo_id, series: [...]}
POST /api/rutinas/:rutinaId/microciclos/:numero/cerrar  (the core: computes floor/ceiling,
                                                          stalling, adjusts weight/sets)
GET  /api/rutinas/:rutinaId/export.xlsx                 (backup/continuation in Excel)
```
