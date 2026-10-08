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
- **Fix: the same "single un-decremented target" bug was still alive in
  the already-closed-week view** (`colorVsPactado`, used by
  `ResumenSemanaPasada` - the "Week 1"/"Week 2" toggle once you've already
  moved on to the next week): the live-mode fix had never been ported
  here - this function still compared only the LAST real set against
  `piso_reps` as-is, with no per-index decrement, so a 3+ set routine
  with a perfectly normal fatigue-driven rep drop (e.g. 14-12-10-8 with
  `piso_reps=14`) showed its last set red the moment you moved past that
  week - exactly the user's report ("if I'm starting week 2 today, week
  1... is colored wrong"). It now uses the same fixed per-set target as
  `colorVsPactadoLive` (`piso_reps - 2*index`), applied to EVERY real
  set (not just the last). It skips the live view's "new set with no
  history" guard - every set shown here was actually logged for real at
  the time, there's no half-typed input to protect against. Verified
  with Playwright: week 1 seeded with the exact -2 pattern (14-12-10-8,
  `piso_reps=14`) and moved on to week 2 - opening the "Week 1" toggle,
  none of the 4 sets come back colored.
- **Critical fix: the week-2 pre-fill broke cross-device draft sync**
  (`RegistroDia`): adding the week-2 pre-fill (see above) means every
  field now starts with real data from mount, even before the user has
  touched anything - and the `useEffect` that saves `series` to
  `localStorage` on every change (so nothing gets lost if the tab closes)
  also runs on mount, so that untouched pre-fill got saved to THAT
  device's `localStorage` as if it were "real local typing." Consequence:
  edit something on the phone and tap "Save draft", then open the PC
  (which had never typed anything, only had the pre-fill) - the draft
  merge applied the remote one first -with the phone's change- but THEN
  the PC's local one, which thanks to this same effect already had its
  own untouched pre-fill saved - and that local copy, having "real" (non-
  empty) data (the same check that already protected this merge against
  a genuinely empty local draft), ended up overwriting the change just
  pulled from the phone. Root cause of exactly the user's report ("the
  changes I make on my phone don't show up on the PC"). Fixed by
  comparing `series` by REFERENCE against the value captured on the first
  render (`useRef(series)` read during render, not inside an effect)
  instead of "skip only the first time the effect runs": in development,
  StrictMode invokes mount effects twice, so a "first time" flag/counter
  gets used up on that phantom invocation and the local save still slips
  through on the second one - comparing by reference is immune to this
  because `series` only changes identity when a `setSeries` call actually
  carries different data. Verified with Playwright using two separate
  `BrowserContext`s (simulating PC/phone): confirmed `localStorage` stays
  empty on mount with nothing touched, that it DOES save as soon as
  something real gets typed, and that the full flow - edit on "phone",
  save draft, reload "PC" - now correctly picks up the new value (it used
  to bring back the old one).
- **Fix: dragging to reorder exercises produced rapid back-and-forth
  swaps on PC** (`useArrastreOrden.js`, a new hook shared by `RegistroDia`
  and `Semana0Form` - they used to have the same algorithm duplicated):
  the swap target was decided by re-reading `getBoundingClientRect()` on
  EVERY card on each `pointermove`, but by then the DOM already reflected
  the last swap (the other cards had already shifted) - so a swap could
  leave the pointer "landing" on a different card without the mouse having
  moved any further, triggering another chained swap on its own. With
  mouse events on PC (much finer-grained than touch) this felt like a
  rapid swap between exercises the moment you touched a card's edge. The
  swap target is now decided by comparing against each card's center,
  captured ONCE when the drag starts (never recalculated mid-drag) plus
  the pointer's delta from there - same approach standard sortable lists
  use. Verified with Playwright simulating a real mouse: 150px of
  fine-grained movement (1px per step) over 16 exercises produced a single
  clean reorder, with no back-and-forth oscillation at all (this same
  movement would previously have triggered several chained swaps).
- **Toggle to turn coloring on/off** ("Colors ON/OFF", next to the
  nutritional-phase picker in the day header): all coloring against the
  plan -live (`RegistroDia`) and in the closed-week view
  (`ResumenSemanaPasada`)- is now optional. The preference is saved in
  `localStorage` per device (same pattern as `ThemeContext` - it's
  intentionally not synced between phone and PC, since it's a per-screen
  visual preference, not routine data). Turned off, both views stop
  computing and applying colors entirely (not just hiding them with CSS):
  inputs go back to a neutral border and the closed-week text loses its
  highlight.
- **Fix: dragging to reorder didn't work sideways on PC, and the grab
  area was too small on mobile** (`useArrastreOrden.js` + the grab
  `<span>`s in `RegistroDia` and `Semana0Form`): the target-picking
  algorithm only compared the pointer's Y coordinate against vertical
  boundaries -built for a single-column list-, but on desktop exercises
  sit in a 2-column grid (`md:grid-cols-2`); dragging a card sideways
  (same row, other column) barely moved the pointer in Y, so it never
  crossed any boundary and nothing happened - confirmed with Playwright
  before the fix (identical order before and after a 450px horizontal
  drag). The target is now decided by "nearest neighbor in 2D": the
  pointer's X and Y are compared against each card's center (captured
  once when the drag starts, same approach as the fix above), so the same
  code works for both the 2-column desktop grid and the single-column
  mobile list (there the comparison reduces to the vertical axis on its
  own, since every card shares the same X). While at it, the grab area
  (the `⠿` icon + exercise name) was enlarged with matching negative
  margin/padding (`-m-3 p-3`, without shifting the visual layout) to make
  it easier to grab on mobile without making the card itself bigger.
  Verified with Playwright: on desktop (1100px), dragging the first card
  450px sideways now correctly swaps it with its neighbor; on mobile
  (390px), the grab area went from just the height of one line of text to
  roughly 283×68px, and dragging downward still reorders the vertical
  list with no regressions.

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
- **Direct sets and effective reps per muscle, per session** (`ResumenMuscularSesion`
  in `EntrenamientoPage.jsx`, a new block at the foot of each day, in
  `RegistroDia` and `ResumenSemanaPasada`): without waiting for the
  microcycle to close (that already existed at the full 2-week-block level
  in Progreso), this adds up live, per muscle, how many real sets (not
  dropsets, actually typed already - an untouched row doesn't count yet)
  were done today and how many of those reps fall inside the "effective
  reps" window (`repsEfectivas`, same rule each exercise card already
  used) - grouped by each exercise's target muscle (`ej.musculo_nombre`),
  summing across different exercises that train the same muscle (e.g. 2
  bench press variants, both "chest"). It's "direct" on purpose: it
  doesn't add secondary/indirect muscles (that other notion, at the full
  block level, still lives separately in Progreso) so as not to mix two
  different numbers together. Next to each total is a comparison against
  the SAME week of the previous microcycle (week 1 of the current block
  against week 1 of the last one, week 2 against week 2 - never against a
  whole 2-week block's total, so the comparison stays apples-to-apples:
  same muscles, same number of sessions) - computed on the backend
  (`comparacion_microciclo_anterior` in `obtenerRutinaActiva`,
  `rutinaService.js`) from the real session that same day had in the
  previous microcycle, using the same per-week date-range rule
  `registroDeSemana` already uses. It's only computed when the previous
  microcycle is a real progression block (`numero >= 1`) - if it was the
  testing week there's nothing to compare evenly against, so it's left
  without a comparison in that case. The current number is colored
  green/amber if it improved/dropped versus the previous one
  (`DeltaMusculo`), plain if it stayed the same. Verified with hand-seeded
  data across 2 microcycles (2 chest exercises, 2 sets each): computing
  directly against the database gave 4 direct sets and 8 effective reps
  for the closed microcycle, and typing the next microcycle's session live
  in the browser, the block showed exactly "4 (before 4)" / "8 (before
  8)" - including a freshly added row ("+1 set") still untouched, which
  correctly doesn't count until something real gets typed into it.
- **Auto progression can be turned off per exercise** (`progreso_automatico`
  on `ejercicio_asignado`, "Turn off/on automatic progression" toggle in
  each exercise's "⋯" menu): when a microcycle closes, the progression
  engine (`cerrarMicrociclo`) auto-adjusts each exercise's weight, rep
  floor and set count based on the ceiling it reached - a sensible default
  most of the time, but not always what's wanted: a leg exercise trained
  on purpose with high reps, for example, can regularly exceed the rep
  range's ceiling (`rango_reps_max`), which bumps the weight up on its own
  - and bumping the weight, in turn, lowers the expected reps next block,
  the exact opposite of what was intended. With the toggle off for that
  specific exercise, its weight, rep floor and set count stay exactly the
  same as the previous block no matter what the ceiling was - a "Progreso
  auto. OFF" ("Auto progress OFF") tag next to the muscle pill makes it
  obvious at a glance. That exercise's ceiling/improvement is still
  computed and recorded as usual (informational, for Progreso/Reportes,
  and it still feeds into that muscle's stagnation detection for its other
  exercises) - the only thing skipped is applying the automatic adjustment
  to THAT exercise. Verified with hand-seeded data: 2 exercises of the
  same muscle (legs), both with reps well above their range, one with the
  toggle off - closing the microcycle, the one left off kept exactly the
  same weight and rep floor it already had, while the other one went up in
  weight and rep floor with the usual rule.
- **"Last draft saved" indicator** (`dia.borrador_actualizado_en` from
  `obtenerRutinaActiva`, text next to the "Save draft" button in
  `RegistroDia`): prompted by a report that the draft seemed to disappear
  "with every update" (every time a code update gets deployed) - dug into
  it thoroughly without being able to reproduce it from the app itself
  (reloading without saving, "Save draft" + reload, and other actions in
  between like toggling DropSet, all tested with Playwright, and in all
  three cases the draft survived intact, both the local one and the one
  synced to the backend; nor did the persistent Docker volume or `DB_PATH`
  ever change across the repo's history) - so instead of a blind fix, this
  gets added: opening a day that already had a draft saved on the backend
  now shows the exact date and time of that save; and tapping "Save draft"
  updates it right away, without waiting on a refetch. That way, next time
  it happens, a glance at the screen is enough to tell whether the remote
  save actually landed or not -instead of finding out only once it's time
  to train-, which will say for sure whether the problem is in the app or
  somewhere else (e.g. the deploy process on the Pi).
- **New muscle: trapezius** (`src/db/seed/musculos.js` + `ejercicios.js`,
  retroactive for already-seeded databases via `migrarTrapecio()` in
  `migrate.js`): it used to live implicitly inside the generic "espalda"
  (back) muscle (the catalog's original comment literally said "Back
  (upper / trapezius / rhomboids)"), mixing its volume with rows/pulldowns
  - now it has its own weekly volume (MEV/MAV/MRV) and shows up separately
  in Progreso, the same way it was done for deltoids by head. "Barbell
  shrugs" (the only exercise that already existed for this) got
  reclassified from "espalda" to "trapecio" - both in the catalog and in
  any `ejercicio_asignado` on an active routine that already had it
  assigned (same pattern as the deltoid migration, retroactive and
  idempotent) -, and "Dumbbell shrugs" was added as a second option. It
  enters the Upper and Pull auto-build splits (it trains better alongside
  pulling than pushing, same rule as the posterior deltoid). Verified by
  migrating a database seeded with the old catalog (no trapezius, with a
  user who already had "Barbell shrugs" assigned in their active routine):
  after migrating, both the catalog and the user's `ejercicio_asignado`
  ended up pointing at "trapecio", with no duplicate rows from running the
  migration a second time.
- **See what was prescribed (weight/rep floor) in the previous microcycle,
  and be able to manually correct the current microcycle's rep floor**
  (Progreso now shows "Set for that microcycle: X kg × Y reps (floor) ·
  Week 1: ... reps · Week 2: ... reps · Ceiling: ..." on each "AT
  MICROCYCLE CLOSE" card, with data the backend already computed and
  stored but never displayed anywhere; a new "Rep floor" button in each
  exercise's "⋯" menu on Entrenamiento, `PATCH /ejercicios/:id/piso-reps`):
  prompted by an automatic adjustment (before the toggle to disable it
  existed) having changed an exercise's weight and reps with no visible
  trace left of what the values were before the change. The base weight
  could already be corrected by hand ("Peso base"), but the current
  microcycle's rep floor had no way to be edited outside of "Editar Semana
  0" -which only works on the first microcycle right after a test week,
  never a later one-, so there was no way back to what it was before an
  unwanted adjustment. Verified with an exercise that had a closed
  microcycle (week 1: 13 reps, week 2: 13 reps, ceiling 13, floor set at
  15): Progreso showed those 4 numbers correctly, and changing the current
  microcycle's rep floor to 20 through the new button updated exactly that
  row in the database (the closed microcycle's row stayed untouched).
- **Fix: changing only the RIR (without touching weight or reps) didn't
  survive a draft save** (`aplicarBorradorEnBase` in
  `EntrenamientoPage.jsx`, used for both the remote draft and the
  `localStorage` one): the "does this row have something typed, worth
  applying" check only looked at weight and reps - if only the RIR got
  touched (e.g. jotting it down right after finishing the set, before
  loading the weight/reps), that row counted as "nothing typed" for this
  check and the merge skipped it entirely. The RIR did save correctly in
  the moment (persisting to `localStorage` doesn't have this filter), but
  it silently got lost the next time the draft got re-read -e.g. on a page
  reload-, which is likely part of what got reported as "the draft gets
  wiped." Now an RIR different from the default (`!== 1`, the value any
  never-touched row starts at) also counts as "typed." The same check got
  fixed in Modo Express's "overwrite what's already typed?" guard
  (`hayDatosTipeados`). Verified with Playwright: typing only a set's RIR
  (weight and reps left empty) and reloading the page - the RIR is still
  there, with the rest of the row untouched.
- **A frozen exercise's RIR now also carries over from the previous
  microcycle when a new one starts** (same mechanism that already existed
  for "week 2 pre-filled from week 1" -see above-, extended to cross the
  microcycle boundary: new `ultima_sesion_microciclo_anterior` field in
  `obtenerRutinaActiva`, `rutinaService.js`): even though weight and rep
  floor already stayed frozen with the auto-progression toggle off, RIR
  still reset to the default (1) instead of keeping whatever was used last
  time (e.g. 0) - for an exercise that "doesn't change anything," typing it
  in again from scratch didn't make sense. Now, if the new microcycle
  doesn't have anything of its own typed yet, every exercise with the
  toggle off gets pre-filled -weight, reps and RIR, all 3, same as already
  happens between week 1 and 2- with whatever was last logged in the
  previous microcycle (week 2 if it exists, otherwise week 1). Verified
  with Playwright: an exercise with RIR=0 in both weeks of the closed
  microcycle and auto-progression off - opening the next microcycle, its 2
  sets already come loaded with that same weight/reps/RIR=0, while a
  normal exercise (auto-progression on) on the same day starts blank, as
  always.
- **Renamed "rep ceiling" (was "rep floor") across the UI, and redesigned
  the previous-microcycle comparison as a table grouped by day** (Progreso:
  new table inside a collapsible "Microciclo N (last closed) - detail by
  day"; Entrenamiento: the "⋯" menu button and its tooltips): requested,
  because the number being shown/edited is actually a ceiling -the target
  for set 1, which later sets subtract from (`piso_reps - 2*index`)-, not a
  floor, and because the comparison with the previous microcycle was one
  long sentence per exercise, not grouped by day, hard to read. The
  database column's internal name (`piso_reps`) and the endpoint (`PATCH
  /ejercicios/:id/piso-reps`) were left untouched -renaming them would have
  been a much bigger change for no real benefit, since from the "what gets
  prescribed for the next block" angle the name still holds, it's just
  confusing as a UI label-. The comparison itself didn't change: the
  ceiling shown was always the max or average of both weeks (`techoDesde`
  in `progressionEngine.js`), it just wasn't displayed clearly; now
  Progreso builds a real table (like the routine's) with columns
  Exercise/Weight/Week 1/Week 2/Ceiling/Result, grouped by day of the week,
  inside a collapsible `<details>` so it doesn't take up space when not
  needed. Verified with Playwright: the table shows the "Lunes"/"Martes"
  headers and the "Techo" (Ceiling) column, the old text ("Pactado ese
  microciclo") is gone, and the Entrenamiento menu button reads "Techo de
  reps" (no longer "Piso de reps").
- **Fix: an exercise's "⋯" menu could open off-screen when its card was
  near the bottom of the page** (`EjercicioAcciones` in
  `EntrenamientoPage.jsx`): the panel always opened downward from the
  button (`top-full`), so with the button near the bottom edge of the
  screen the menu (up to 9 items) overflowed and the last options became
  invisible, with no scroll and no way to reach them. Now, when the menu
  opens, it's measured once whether it fits below (`getBoundingClientRect`
  against `window.innerHeight`) and if it doesn't, it opens upward
  (`bottom-full`) instead; it also has its own `max-height` with scroll as
  a safety net for very small screens. Verified with Playwright in two
  scenarios: a short viewport (700px) with an exercise pinned to the
  bottom -the menu opened upward, fully visible inside the viewport,
  including "Quitar ejercicio"- and a tall viewport (1400px) with the same
  exercise -the menu still opened downward as always, no change to the
  normal case.
- **Equivalent variants per exercise** ("Agregar/elegir variante" in
  Entrenamiento's "⋯" menu; new `ejercicio_variante` table,
  `ejercicio_asignado.variante_activa_id` column; endpoints `POST
  /ejercicios/:id/variantes`, `PATCH /ejercicios/:id/variante-activa`,
  `PATCH` and `DELETE /variantes/:id`): for when the usual machine/
  exercise isn't available, without losing either one's reference weight.
  Unlike "Cambiar ejercicio" (which permanently replaces the titular and
  overwrites its weight/floor), a variant is added *alongside* the
  titular -same muscle, same equipment filter, same candidate picker-
  with its own weight/ceiling reference, stored separately in
  `ejercicio_variante` (one row per catalog exercise, several can
  coexist). Activating one redirects, only for the NEXT session of that
  slot, the name/weight/ceiling shown and edited (card, gray
  placeholders, "Peso base", "Techo de reps", autocomplete, colors vs.
  the agreed target) to the variant's own, with a "Variante" badge on the
  card - logging or skipping that session reverts it to the titular on
  its own (no need to remember to switch back). The titular and its
  `progreso_ejercicio_microciclo` (per-muscle set/effective-rep counting,
  the automatic weight adjustment every 2 weeks) stay completely
  untouched no matter what happens with variants: reps logged with one
  still count toward the muscle's set total and toward the next close's
  ceiling (so "per-muscle set counting stays the same" holds), but a
  variant's own weight is a manual value -you load and edit it, like
  "Peso base"-, never touched by the automatic engine, since it wouldn't
  be comparable between different exercises (e.g. dumbbells vs. barbell).
  Verified with Playwright and direct API calls: adding a variant
  activates it right away (the card's name/placeholders change
  immediately), switching back to the titular from the panel restores its
  own values, and logging a real session with the variant active resets
  it on its own - the next time the routine loads, the titular is back,
  no badge.
- **Coach/admin can correct a particular exercise's primary muscle**
  ("Corregir músculo principal" button in Entrenamiento's "⋯" menu, only
  visible/allowed for those 2 roles; `PATCH
  /ejercicios/:id/musculo-principal` endpoint,
  `cambiarMusculoEjercicioParticular` in `rutinaService.js`): requested,
  because a "particular" exercise (one a client or the coach themselves
  typed in by hand, outside the catalog) can end up wrongly classified by
  a typo. Scoped to particular exercises only -never the global catalog,
  which stays admin-only via "publish" in `/catalogo`, so one coach's
  mistake can't reclassify an exercise other unrelated coaches/clients
  use-. Unlike "Cambiar ejercicio", it doesn't go through any mini-test or
  touch already-logged weight/ceiling/sets: it only fixes the
  classification, both in the catalog (`ejercicio.musculo_primario_id`)
  and in any `ejercicio_asignado` that already has that same particular
  exercise assigned, across any routine/user (same pattern as the
  deltoides/trapecio retroactive migrations, just triggered by hand). The
  permission is checked on the backend itself (403 for a `cliente` calling
  the endpoint directly, not just a hidden UI button) using the logged-in
  actor's role, not the role of whoever's routine is being viewed - so a
  coach looking at a client's routine still sees themselves as a coach.
  Verified with Playwright and curl: a client can't see the button or call
  the endpoint (403), a coach viewing their client's routine can see it,
  and correcting "bíceps" (mistagged) to "espalda" updates both the
  catalog and the existing assignment.
- **Fix: "Autocompletar" overwrote a weight already typed by hand into a
  set** (`autocompletarReferencia` in `EntrenamientoPage.jsx`): the button
  always reset all 3 columns (weight AND reps) of EVERY set to the base
  weight, even if you had already typed a different weight into one by
  hand -e.g. because you're training heavier today than last time- losing
  that value. Now it only fills in what's still empty: a set that already
  has a weight or reps typed in keeps it as-is; the rest gets filled with
  the base weight and, for reps, with the same logic that already
  computes the live gray placeholder as you type
  (`calcularSugerenciaReps`) -which compares each set's weight against the
  previous one, so if you typed a different weight into a set, the reps
  cascade stops there instead of assuming you're still on the base
  weight. Verified with Playwright: typing 45kg into set 1 (base is 40)
  and tapping "Autocompletar" -set 1 stays at 45kg (not overwritten) with
  its reps filled to the ceiling, sets 2 and 3 get filled with 40kg (the
  base, which is what was already shown there in gray) but with NO
  suggested reps (45≠40, no cascade); and the case with nothing typed
  still works exactly as before (base weight + a 2-rep cascade across all
  3 sets).
- **Daily steps** ("Pasos diarios"/"Pasos hoy: N" button in Entrenamiento's
  header; new `registro_pasos` table, `PUT`/`GET /usuarios/:id/pasos`
  routes in `perfil.js`): the first building block for the future calorie
  calculator, which will need the whole week's activity level (TDEE), not
  just gym days. Deliberately NOT hung off any `dia_rutina` or specific
  microcycle -the routine only has days for when you train, but steps get
  walked every day, rest days included-: it's a separate table, one value
  per user and calendar date (`UNIQUE(usuario_id, fecha)`), with its own
  small panel in the header (date + steps + Save, listing the last 7 days
  to check/fix one with a tap). The button already shows "Pasos hoy: N" as
  soon as the screen loads if that day was already logged -no need to open
  the panel first to find out- thanks to fetching the short history on
  mount, not only when the panel opens. Verified with Playwright: logging
  today's steps updates the button right away, persists after a page
  reload, and tapping a day from the history (e.g. "yesterday") preloads
  its date/value for editing without duplicating the row (same `UNIQUE`,
  `ON CONFLICT DO UPDATE`).
- **Nutrition / calorie and macro calculator - Stage 1 of 5 (calculation
  engine, no UI yet)**: kicks off the new module, built in stages. This
  first delivery is all the non-visible foundation: `shared/nutrition/` -a
  pure JS calculation engine, no dependencies, that **receives the
  configuration as a parameter** instead of importing constants (so the
  frontend, in future stages, calculates live with the exact same logic
  Express uses to validate and recalculate on save)-, with functions for
  per-phase macros (Mantenimiento/Volumen/Definición, with every table and
  exception from the original prompt -including the late-stage fat
  exception for men in long cuts, which only kicks in within the last N
  weeks, never on day 1 of a freshly created plan-), automatic activity
  level (training days + adjustment from the last 14 days of steps, with a
  warning when data is missing), reference resolution for Definición (the
  3 sources, in priority order), the fat-loss goal mode (deficit, a hard
  calorie floor -not just a semáforo warning-, a realism semáforo that
  always takes the most severe condition when several trigger at once, a
  suggested minimum timeframe), week-by-week projection (with a linear,
  capped metabolic adaptation, and the optimistic "all the loss is fat"
  model when a body-fat % is on file), and a purely informational
  Mifflin-St Jeor. 76 tests (`node:test`, no new dependencies -
  `npm run test:nutrition`) cover every sex/focus/phase/level combination,
  the 3 reference sources, each exception, the automatic level, edge cases
  in goal mode (extreme timeframes, negative carbs, the calorie floor),
  and that the engine actually uses the config it's handed (never one of
  its own fixed values). New `nutrition_config_versions` table (every save
  inserts a new row, never edits an existing one - so "revert to an
  earlier version" and the full history come for free) and
  `nutrition_plans` table (one active plan per user, enforced with a
  partial unique SQLite index; `reference_weight_kg` as its own column,
  not buried in JSON, because the engine needs it to re-derive g/kg ratios
  when a plan is used as the reference for a new one). **Archived** plans
  stay frozen with whatever config version they were created with -only
  each user's **active** plan recalculates against the current config- so
  tweaking the admin panel (not built yet) can't silently rewrite an old
  plan. `src/services/nutritionConfigService.js` caches the active config
  in memory (auto-invalidated on every new version saved) and
  `GET /api/nutricion/config` exposes it read-only. No UI yet (admin
  panel, creating a plan, results, goal mode) - that's the next stages.
- **Nutrition - Stage 2 of 5 (admin panel + new tab)**: new "Nutrición" tab
  in the bottom bar, visible to all 3 roles (coach and client see a
  "coming soon" notice until Stage 3; the admin sees the full panel). The
  panel edits all 7 sections of the original prompt's config (energy, the
  base table, carb increments, Definición, exceptions, automatic activity
  level, goal mode/semáforo, and "other" -calorie floors and Mifflin
  factors-) with a live preview (an editable example profile:
  sex/weight/level/phase/focus) that recalculates on every keystroke
  **without hitting the backend**, importing
  `shared/nutrition/nutritionEngine.js` straight into the frontend through
  a new Vite alias (`@shared/nutrition`, with `server.fs.allow` widened so
  Vite can serve a file living outside `frontend/`) - the same pure engine
  Express uses, no calculation logic duplicated client-side. Saving hits
  `POST /api/nutricion/config` (rejects with 400 + the list of errors if
  `validarConfig` finds something inconsistent, e.g. an inverted semáforo
  range); the history (`GET /config/historial`) lists every version with
  author/date/comment and lets you "Restore" any of them or reset to
  factory defaults, always inserting a new version (history is never
  lost). All 4 write routes (`POST /config`, `/config/restaurar/:id`,
  `/config/restaurar-fabrica`, `GET /config/historial`) are gated with
  `requireRole('admin')` on the backend -not just hidden in the UI-,
  verified by hitting the API directly with a coach session (403 on all
  4). Tested end-to-end in the browser with Playwright: the live preview
  recalculates on the fly, saving creates a new version, restoring a
  specific version from the history brings back its exact values (checked
  with a distinguishable value), and restoring factory defaults works
  independently.
- **Nutrition - Stage 3 of 5 (creating and viewing an actual plan)**: coach
  and client can now build and see a real plan (Mantenimiento, Volumen or
  "simple" Definición -no goal mode yet, that's Stage 4-), both at
  `/nutricion` (their own) and at `/coach/clientes/:id/nutricion` (new
  "Nutrición" tab on the client panel) - the same screen serves both cases,
  just like `EntrenamientoPage` with `usuarioIdParam`: the route decides
  whose plan it is, not the viewer's role. If biological sex hasn't been
  set yet (required by the engine; a column that already existed in the
  schema but had never been wired to any route) it asks for that first -
  birth date and height stay optional, only feeding the informational
  Mifflin-St Jeor in the result. The creation form asks for current weight
  (required, entered by hand, as the project owner asked) and phase/focus;
  training days come straight from the active routine when one exists
  (`GET /usuarios/:id/rutina`), and when there's no routine (someone using
  only the calculator) it asks for them by hand, with the option to
  override the automatic activity level by hand either way.
  `src/services/nutritionService.js` is the new DB-touching layer (the
  engine in `shared/nutrition/` still never touches the database): it
  resolves the activity level (training days + average steps over the
  configured window), builds the Definición reference following the
  prompt's 3 priorities (last Mantenimiento/Volumen plan -recalculated with
  ITS OWN frozen config and converted to g/kg- → what the user declares
  eating today → the table), and creates the plan by archiving the
  previous one in the same transaction (2 active plans never coexist,
  already enforced by the partial unique index too). An active plan always
  recalculates against the current config; an archived one against the
  version it had when created - same rule already proven in Stage 1/2. New
  `PUT /api/usuarios/:id/datos-personales` endpoint (direct write, no
  `solicitud_cambio` detour: this is objective biometric data, not a
  training decision to approve) and 4 routes under
  `/api/nutricion/usuarios/:id/plan[es]` with the same
  `puedeAccederAUsuario` check as the rest of the app (verified with a
  coach unrelated to the client: 403). Tested end-to-end in the browser
  with Playwright across 3 scenarios: a client with an active plan viewing
  its result and history, a client building a Definición plan that
  actually uses their previous plan as the reference (confirmed
  `reference_source: "plan_anterior"` and the exact grams), and a coach
  entering biological sex and the first plan for a brand-new client with
  nothing on file yet.
- **Nutrition - Stage 4 of 5 (goal mode)**: inside Definición, a new "Goal
  mode" checkbox turns on the advanced fat-loss calculation: instead of
  the fixed g/kg decrement, day-1 calories come from a calculated deficit
  (kg to lose × 7700 kcal/kg, spread over the plan's weeks), with the
  calorie floor as a hard cap (`calcularModoObjetivo`). Protein/fat still
  come from the "simple" Definición (same reference and exceptions as
  Stage 3) - goal mode only changes how the calories are reached, never
  the criterion for those two macros. It needs birth date and height on
  file (if missing, day 1 still calculates but without the semáforo or
  projection, with a note explaining why). With those on file, everything
  else gets built: the realism semáforo (rate %/week, deficit as % of
  reference kcal, BMR floor and absolute calorie floor, always keeping the
  most severe condition when several trigger at once), the "Apply
  suggested timeframe" button when it isn't optimal (recalculates the
  minimum timeframe at the configured rate and preloads the form with that
  duration), the week-by-week table and an SVG chart of projected weight
  (`proyectarSemanaASemana`, no library -same "light design" rule as the
  rest of the project-, with the optimistic "all the loss is fat" model
  when a starting body-fat % is entered). "Biweekly recalculation": an
  "Update current weight" button on the active plan re-bases that same
  plan (doesn't create a new one) with today's actual weight - it
  subtracts from the remaining weeks however many have passed since the
  last re-base, and from the remaining goal whatever was actually lost
  (never negative, a weight gain is never counted as "fat lost"). Tested
  in the browser with Playwright: the "New plan" form auto-preloads goal
  mode and its values from the active plan, an aggressive goal (10 kg in
  4 weeks) triggers "Not recommended" with the calorie floor applied
  across all 4 weeks of the table, applying the suggested timeframe
  preloads the right number of weeks, and updating the real weight
  recalculates the remaining goal and weeks without touching anything
  else. Also verified that a Mantenimiento/Volumen/Definición plan without
  a goal still has no semáforo or projection (no regression).
- **Nutrition - Stage 5 of 5 (integration into the semestral report)**:
  the report (`generarDatosReporte` in `reportes.js`) now adds a
  "Nutrición" section with the user's **entire** plan history (active +
  archived, chronological order) via a new `obtenerEvolucionNutricional`
  in `nutritionService.js` -each one recalculated against the config it's
  tied to, same frozen/current rule the rest of the module already
  follows-. Nutrition has its own timeline (it isn't tied to the routine's
  microciclos that drive the rest of the report), so it's added in full
  rather than filtered to the covered period. If the user never set their
  biological sex or never built a plan, the function returns an empty list
  and the report still generates fine - nutrition is an optional addition,
  never a new requirement to generate a report-, verified with a user that
  has no sex on file and with a nonexistent id. This closes all 5 stages
  of the nutrition module: the pure calculation engine and versioned
  config (1), the admin panel (2), creating and viewing a plan (3), goal
  mode with projection and semáforo (4), and this report integration (5).
- **Daily steps: fixed day (never free-form), rest days in the tabs, and a
  default value**: 3 requested tweaks to Entrenamiento's daily step
  logging. (1) The steps button no longer has a free date picker -it
  carried the risk of logging steps on the wrong day by accident-: it now
  receives the date of the day being viewed (training or rest) as a prop
  and always loads/edits THAT day, showing "Pasos {date}: N" on the
  button. (2) The tab row up top (`DiaEntrenamiento` in
  `EntrenamientoPage.jsx`) now builds all 7 days of the week in real order
  (it used to only show days WITH training assigned): a day with no
  routine shows as a dashed-border tab that, when tapped, shows a simple
  "Rest day" card -meant for logging steps on an off day, and for having
  somewhere to land if training ends up moving to a different day-. (3) A
  new "default steps" (`usuarios.pasos_por_defecto`, `PUT
  /usuarios/:id/pasos-por-defecto`): a fixed value used as the steps for
  any day without an explicit entry, both for display ("Pasos {date}: N
  (default)") and for the automatic activity level calculation
  (`pasosRecientes` in `nutritionService.js` now fills days with no
  explicit entry with the default before averaging, instead of skipping
  them) - so someone who walks roughly the same amount every day doesn't
  have to log it day by day. Tested in the browser with Playwright:
  skipped the testing week to reach a real microciclo, verified all 7 days
  show up (Saturday/Sunday included as rest) with correct dates, logged
  steps on a rest day, confirmed the button's date switches automatically
  when changing tabs, and that setting a default shows correctly on a day
  that was never logged.
- **Coach approval now also covers new nutrition plans**: the optional
  coach-approval gate (`requiere_aprobacion_coach`, see below) now also
  covers creating a new nutrition plan (`POST
  /nutricion/usuarios/:id/plan`) - it used to only cover goal,
  availability, equipment and routine. With the toggle on, the POST
  returns `202 { pendiente: true, solicitud_id }` instead of creating the
  plan right away, and it sits in `solicitud_cambio` (type
  `nutricion_plan`) until the coach approves or rejects it from their
  panel - once approved, the plan is created with `created_by` set to the
  client themself (it's their plan, the coach just unlocks it). On
  purpose, updating an already-active plan's progress (`PATCH
  /plan/progreso`, reporting current weight, a fact, not a new strategy
  decision) and discarding the active plan (`DELETE /plan`) are **not**
  gated - same reasoning already applied to logging a training session,
  which isn't gated either. This also fixed a latent bug in
  `solicitud_cambio.tipo`'s CHECK constraint: it was never updated when
  the `dia_agregar`/`dia_quitar`/`dia_cambiar_semana` types were added
  (see below), so a request of those types would crash with "CHECK
  constraint failed" if approval mode was on - `schema.sql` and a new
  migration (`fixSolicitudCambioTipoCheck` in `migrate.js`, rebuilds the
  table the same way the missing `ON DELETE CASCADE`s already do) fix it
  together with the new type. Tested end-to-end with a script: turn the
  toggle on, create a plan (stays pending, 202), see it in the coach's
  list, confirm there's still no active plan, approve it, confirm there
  now is one with the right `created_by`.
- **Real weight trend (goal mode)**: `registro_antropometrico` existed in
  the schema (with its `POST`/`GET /usuarios/:id/antropometria` endpoints)
  but nothing in the frontend used it. It now feeds a real recalibration:
  `calcularTendenciaPeso` (pure engine function,
  `shared/nutrition/nutritionEngine.js`) runs a least-squares linear
  regression over the weigh-ins logged within the configured window
  (`tendenciaPeso.ventanaDias`, 21 days by default) to get a smoothed
  "trend weight" - same idea as MacroFactor's trend weight, meant to not
  react to a single day's water retention - and compares the real rate
  (`compararTendenciaConPlan`) against the one the plan's deficit expected,
  with a tolerance band (`tendenciaPeso.toleranciaPct`) before flagging
  "faster" / "slower" / "weight isn't going down". Unlike the semáforo
  (which judges whether the plan is realistic BEFORE starting), this judges
  what's actually happening in practice - the recalibration that didn't
  exist yet. With fewer than `tendenciaPeso.minPuntos` weigh-ins (3 by
  default) in the window, no trend shows up (a slope from that few points
  is unreliable anyway) and it tells you how many are missing. New
  "Registrar peso de hoy" (Log today's weight) button on the Nutrition
  screen (date always today, no free picker - same reasoning as daily
  steps) that logs a loose weigh-in through the existing endpoint; and
  "Actualizar peso actual" (Update current weight) now comes pre-filled
  with the trend weight (still editable) instead of blank, so the
  biweekly check-in doesn't depend on that exact day not having a heavy
  meal or water retention. New "Tendencia de peso" section in the admin
  panel for the 3 parameters. Adding this new section to the config meant
  a version saved BEFORE this change (the real active config, and any
  archived plan) was missing the `tendenciaPeso` key and would crash with
  "Cannot read properties of undefined" - fixed by filling in any missing
  top-level section with its factory default when reading a saved version
  (`filaAObjeto` in `nutritionConfigService.js`), instead of migrating each
  row one by one; explicitly tested by saving and restoring an old version
  missing the section. Tested end-to-end with a script (create a goal-mode
  plan, log 10 weigh-ins with a real rate of 0.7 kg/week against a plan
  that expected 0.5, confirm it classifies as "faster than expected") and
  visually in the browser.
- **Training history Excel: one row per exercise with per-set columns, colored
  by muscle**: the training export used to compress an exercise's sets into
  one text cell ("20-18-16-14") - the user asked for it to look like the
  paper log they used to fill by hand, with each set's weight and reps in
  its own column (S, P1/R1, P2/R2...) and the dropset in its own column
  (P-ds/R-ds) instead of a text suffix. The number of P/R pairs is computed
  from the MAXIMUM real-set count across the whole export (not per
  individual table, so every table in the file shares the same column
  width) - 4 covers the common hypertrophy case, but a strength compound
  (cap of 6, see `topeSeriesPara`) or a manually added set just grows the
  columns it needs. Each row also now gets a background color for the
  primary muscle trained: 18 muscles in the catalog is too many shades to
  tell apart at a glance (most would end up nearly identical as a pastel
  tint), so they're grouped into 7 categories by function/area - the same
  criterion already used to build splits (push/pull/legs) in
  `routineBuilder.js` - each with a light tint from a 7-hue categorical
  palette picked for distinguishability (dark text on top). The
  green/red "beat/missed what was agreed" highlight still works, now
  applied to the first real set's weight cell and the last set's reps cell
  (the comparison logic itself didn't change, see
  `resumirEjercicioDeSesion`). Tested end-to-end with a script against the
  dev DB: a session with a 6-set exercise (no dropset) and one with a
  dropset, several muscles from different groups in the same day (matches
  the reference format the user shared), exporting the whole routine with 2
  sessions from different days (confirms the column width is global, not
  per-session), and exporting filtered to a single session.
- **Nutrition Excel export (new, none existed before)**: new "Exportar Excel"
  button on the Nutrition screen (`GET /nutricion/usuarios/:id/export.xlsx`,
  `generarWorkbookNutricion` in `excelGenerator.js`), with 2 sheets.
  "Planes": the full history (active + archived, reuses
  `obtenerEvolucionNutricional`, which already recalculates each one with
  its own matching config) with date, status, phase, focus, activity level,
  reference weight, kcal, macros, and the goal-mode target if it had one.
  "Pesajes": the raw `registro_antropometrico` history (date, weight, %
  body fat if logged) - the same data that already feeds the real weight
  trend added earlier. If the user has no plan and no weigh-in at all, it
  returns a clear error instead of an empty file. Tested end-to-end with a
  script: a user with 8 plans plus weigh-ins (full content in both sheets),
  and one with no data at all (400 error with a message).
- **Excel export of a report (training + nutrition crossed together)**: new
  "Exportar Excel" button on each already-generated report on the Reportes
  screen (`GET /usuarios/:id/reportes/:reporteId/export.xlsx`,
  `generarWorkbookReporte` in `excelGenerator.js`). Exports exactly what was
  saved in `reporte_progreso.datos_json` at the time -never recomputed with
  newer data, so the Excel matches what was seen on screen when it was
  generated- with 4 sheets. "Resumen": period and closed microciclos, plus
  2 mini tables side by side on the same sheet - body weight (per nutrition
  plan) on the left, volume (start → current) per muscle on the right - so
  they can be eyeballed together without forcing a row-by-row date match
  (they're 2 independent timelines: training by microciclo, nutrition by
  plan). "Por ejercicio" and "Por músculo": the same detail already shown
  on screen compressed with arrows ("20kg×8 → 24kg×10"), now with each
  value in its own column (in "Por músculo", one row per muscle ×
  microciclo). "Nutrición": the same table as the standalone nutrition
  export (extracted into a shared function, `agregarTablaPlanes`, to avoid
  duplicating the row-building logic). Tested end-to-end: a real report (32
  exercises, 16 muscles, 1 plan) against dev DB data - confirming the
  sheets handle the no-data case gracefully (empty muscle volume for this
  test user) - and separately with full synthetic data to validate the
  populated path across all 4 sheets.
- **Reportes: headline numbers and trend sparklines (it used to be just text
  with arrows, no chart at all)**: new row of stat tiles above each report
  with the key numbers at a glance - exercises that gained weight, stalled
  muscles, total effective reps for the period, and, when nutrition data
  exists, body weight (never color-coded by direction: gaining weight can
  be the goal in a bulk or the opposite in a cut, so it's the one number
  that stays neutral). Each row in "Por ejercicio" and "Por músculo" now
  also has a trend sparkline (`Sparkline.jsx`, new component, same
  "hand-rolled SVG, no library" approach as `GraficoProyeccion.jsx`) with
  weight/volume across microciclos - no axes or legend (the exact number is
  already right there in text), just a visual reinforcement of "which way
  it's going" at a glance. Deliberately avoided a single combined chart with
  every exercise or every muscle together: mixing such different scales
  (e.g. a 100kg squat with an 8kg lateral raise) on the same axis is
  misleading, so each row gets its own small chart instead of competing for
  one shared scale. Tested in the browser: the stat-tile row computes the
  right numbers against real dev DB data (confirmed "32" exercises is
  correct for a 4-day × 8-exercise routine, not a duplicate-counting bug);
  the sparklines don't have enough data to show up with this test routine
  (only one closed microciclo), which is the expected behavior with fewer
  than 2 points.
- **General body tracking in Nutrition (daily weight + optional body fat/
  muscle %, weekly averages, compared against the phase)**: weight logging
  and its trend used to only show up with Definición's "goal mode" active
  (a declared kg target); now the "Body tracking" block is always visible,
  in any phase. "Log today's weight" gained two optional fields, body fat %
  and muscle %, stored in new `porcentaje_graso`/`porcentaje_muscular`
  columns on `registro_antropometrico`, separate from
  `porcentaje_graso_calculado` (which comes from the skinfold formula the
  coach enters). New `seguimientoCorporal` function in
  `nutritionService.js`: groups weigh-ins by week (average weight/body fat/
  muscle %) and reuses `calcularTendenciaPeso` for the smoothed trend; a new
  engine function, `clasificarTendenciaSegunFase`, compares the real rate
  against what the plan's PHASE expects - bulk expects gaining, cut expects
  losing, maintenance expects staying stable, with a tolerance band in % of
  the trend weight (`tendenciaPeso.bandaEstablePctSemana`) - without
  depending on a declared kcal deficit like goal mode. With goal mode
  active, the more precise deficit-based comparison (already existing) is
  still used instead of the generic phase-based one. The weekly-average
  table is shown with a trend sparkline (`Sparkline.jsx`, reused from
  Reportes) next to the current trend weight. The Nutrition Excel export
  ("Pesajes" sheet) now adds "% graso" and "% muscular" self-reported
  columns, separate from the skinfold one.
  Along the way, found and fixed a latent bug in
  `nutritionConfigService.js`: the factory-value backfill for an old stored
  config only completed entire NEW sections, not a new field added INSIDE
  an already-existing section (exactly the case of `bandaEstablePctSemana`
  inside the already-existing `tendenciaPeso`) - changed to a recursive
  backfill that never overwrites a value already present. Tested in the
  browser against the dev DB: one client in Definición with no declared
  goal and another in Mantenimiento, logging weigh-ins with all 3 fields
  and confirming the right badge for each phase ("Matches your goal" /
  "Stalled" / "Working against your goal").

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
  changes to goal/availability/equipment/routine/nutrition"
  (`PATCH /usuarios/:id/aprobacion-coach`, a toggle on the Progress
  screen) - while it's on, those changes sit in `solicitud_cambio` until
  the coach approves or rejects them (`src/services/solicitudCambio.js`,
  coach panel). If the coach edits their client directly it skips this
  entirely (the coach is already who'd be approving it). Off by default.
- The guest Excel's `modo=plan` (live formulas, `excelGenerator.js`) has
  its own hardcoded `TODOS_MUSCULOS` list that's out of date - missing
  deltoids by head (still on the old unified "deltoides"),
  abductores/aductores/lumbares, and now trapezius too. An exercise from
  any of those muscles in a guest's routine leaves that row's
  "MusculosResumen" formula with a broken reference (`ENaN`). Not new from
  this change -it's been this way since deltoids got split-, and
  `modo=historial` (the default, no formulas) doesn't have this problem
  since it reads muscles from the database live. Left to do: sync that
  list with the database, or better, drop it and compute it dynamically.

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
