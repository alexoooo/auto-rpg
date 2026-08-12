# v2-ui-01 — one application, and a fight source it can be written against

**Goal:** replace three unrelated pages with one shell, and land the whole Battle
Arena layout and loadout picker against trace files — so every later session replaces
a data source rather than a user interface.

**Depends on:** nothing. No Rust changes.

**Golden expectation:** no pin moves. No Rust is compiled that was not compiled before.

## What moves where

| today | after |
|---|---|
| `web/index.html` — legacy Canvas game | `web/legacy.html`, byte-identical |
| `web/v2.html` — greybox diagnostic | route `#/game` inside the shell |
| `web/fight.html` — trace viewer | route `#/arena`, then **deleted** |
| — | `web/index.html` — the shell |

The legacy page moves without an edit: all four of its script references and its
stylesheet are relative (`draw.js`, `rig.js`, `assets.js`, `main.js`, `style.css`) and
all five files stay in `web/`. It is four classic scripts sharing top-level `const`s
with no bundler, so it cannot become a route and should not try. It gets a link on the
main screen and nothing else.

`vite.config.ts` line 201 currently inputs `web/v2.html` alone. It moves to
`web/index.html`. `legacy.html` stays out, exactly as it is out today — classic scripts
are not a module graph and Rollup has nothing to do with them.

## Why one page and not three with a shared header

Three pages with a common navigation bar would be cheaper and would look unified. It
would also mean three module graphs, three Babylon initialisations across a session, and
a full document teardown every time a reader goes from a fight back to the picker to
change one dropdown. The arena is a tool for iterating on a matchup; the round trip is
the thing being used, so it is the thing that has to be cheap.

Hash routes rather than the History API: this ships to a static `dist/` and to
`tools/serve.js`, neither of which rewrites unknown paths to `index.html`.

## `v2.ts` has to become mountable

[`client/src/v2.ts`](../../../client/src/v2.ts) is 473 lines of module-scope script with
no `main()`. It reads `location.search` at import time, throws `RangeError` on an invalid
value before anything is on screen, and constructs its worker unconditionally.

It becomes `export async function mount(container, params): Promise<Disposable>`, where
`Disposable` stops the render loop, terminates the worker and detaches listeners. The
URL parsing it already does (`?stress`, `?review`, `?room`, `?roomCamera`, `?renderer`,
`?backend`, `?seed`) moves into `params` so the shell can pass the hash-route query
through unchanged and the existing deep links keep working.

It already does its heavy work behind dynamic `import()` for the renderer, engine, input
and room modules, so lazy mounting is the idiom it was written in. The disposal path is
the new part and the part to test.

## `FightSource`

The interface the whole arena is written against:

```ts
interface FightSource {
  readonly header: FightHeader;      // arena, bodies[], side labels, outcome, ticks, one
  frameCount(): number;
  frameAt(tick: number): FightFrame; // poses + contacts + health
}
```

`FightHeader`, `FightFrame`, `Pose` and `Contact` are the existing `Trace` types lifted
out of [`client/src/fight/trace.ts`](../../../client/src/fight/trace.ts) with the fetch
removed. `TraceFightSource` wraps `loadTrace(url)` and is the only implementation this
session ships. `view.ts` and `chart.ts` change only in the type they name.

Keep `loadTrace`'s hard schema refusal. `TRACE_SCHEMA` is a two-file contract and the
error it produces — the one naming the exact `lab trace` command to re-run — is the most
useful message on the page when a fixture goes stale.

### A missing recording degrades; it does not break

`.gitignore` excludes `web/fight*.json` and the production build's copy allowlist carries
none of them, so **the three recordings are absent in a shipped build and in a fresh clone
alike** — and `#/arena` is now one of two cards on the landing page rather than a page that
shipped in nothing. So `loadTrace` distinguishes three failures and the arena gives each
its own sentence, the same rule v2-ui-03 sets for a missing room GLB:

| what happened | what the reader is told |
|---|---|
| 404, or 200 with an HTML body (a static host's SPA fallback — `vite preview` does this) | recordings are a development fixture written by `npm run trace`; v2-ui-07 removes the file |
| `TRACE_SCHEMA` mismatch | unchanged, including the `lab trace` command to re-run |
| anything else | the URL and the underlying error |

The transport bar disables itself while no fight is loaded, so "inert" is visible rather
than inferred, and the main screen says the same thing before the click when
`import.meta.env.PROD`. The picker keeps working either way.

### `mount` returns before the fight loads

The recording is an 8–9 MB fetch plus a parse, and the shell cannot dispose a route whose
`mount` has not resolved. So `mount` registers its listeners, returns its handle, and lets
the load resolve into a route that is either still mounted or already gone;
`loadTrace`/`loadTraceSource` take a required `AbortSignal` so `dispose` cancels the
download rather than only setting a flag, and a second **[Fight]** aborts the first.

## The picker, before there is anything to pick

The loadout controls are built and validated now, and disabled where nothing can honour
them yet, because designing them against session 04's real constraints is what stops
session 04 discovering the UI cannot express its own rules. In this session **[Fight]
loads a trace**; the dropdowns choose which one.

Two rules are known already and must be encoded here rather than discovered later:

- **Both hands empty is not constructible.** `Loadout.primary` is `ActionKind`, not
  `Option<ActionKind>` ([`crates/sim/src/loadout.rs:18`](../../../crates/sim/src/loadout.rs#L18)),
  and `validate_rows` refuses `(None, Some(_))`. The picker refuses empty/empty with
  that sentence, not with "invalid".
- **`learned` is not selectable for a live fight.** It is selectable for a trace. The
  control says which, in words, rather than silently offering something that will fail
  in session 05.

## Layout

CSS grid, three columns. The left and middle columns must be **adjacent and share one
canvas element** — session 02 renders three cameras into viewport rectangles of a single
WebGL context, and the alternative is three engines each building the meshes again. This
session places that canvas and gives it a solid placeholder fill; nothing draws into it
yet.

The right column keeps the existing plan and elevation exactly as they are, including
the `ResizeObserver` and the device-pixel-ratio transform in `prepare()`. They are
orthographic on purpose and stay that way: a shared scale is what makes "did that reach"
answerable, and the 3D panels cannot answer it.

The transport bar keeps every control `fight.html` has — play, ±1 (shift ±10),
contact and wound seeking, scrub, rate, span, azimuth, the four toggles, the chart
click-to-scrub and the keyboard bindings.

## Documentation

`fight.html` and `index.html` are named in about 22 live places outside the exempt
`docs/plans/`: [`AGENTS.md`](../../../AGENTS.md), [`README.md`](../../../README.md),
`docs/architecture/browser-runtime.md`, `docs/reference/worker-protocol.md`,
`docs/architecture/assets.md`, `docs/reference/room-asset-contract.md` and three files
under `docs/performance/`. `AGENTS.md`'s paragraph promising `/fight.html` will be
deleted by the session that lands the real pose channel is discharged here in part —
the page goes now, the pose channel arrives in 07 — and the replacement text should say
so rather than quietly dropping the promise.

## Verification

```powershell
npm run check
npm run build
node tools/check_docs.js
node tools/check_deps.js
cargo test
```

`npm run build` is the load-bearing one: it proves the shell is a valid Rollup input and
that the `wasmArtifactPlugin` build assertions still hold — in particular that the
main-thread chunk contains no `WebAssembly.instantiate` and a separate worker chunk owns
it. Moving the entry point is exactly the change that could break that.

By hand, and recorded:

- `/` offers both destinations; `/legacy.html` still plays.
- `#/game` reaches a rendering greybox, and leaving and re-entering it twice does not
  leak a worker or a render loop — check the diagnostics dump and the browser task
  manager.
- `#/arena` plays `fight.json`, `fight-learned.json` and `fight-windmill.json`, with
  every transport control and every toggle behaving as it did on `fight.html`.
- The picker refuses empty/empty with a sentence a reader can act on.

## Decision

Record `pass`, `revise` or `stop`. A `pass` requires that no capability present on
`fight.html` was lost, listed control by control — this session deletes a working page
and the only honest way to do that is to enumerate what replaced it.

## How v2-ui-01 closed, 2026-08-11

**`pass`.** Every control `web/fight.html` carried is in `#/arena`, and the enumeration
below is the whole of the argument for deleting the page.

### Control by control

Compared against `git show HEAD:web/fight.html`. Each of the eighteen appears in the
`route-arena` template of `web/index.html` with the same `id` and the same attributes —
same `min`/`max`/`step` on every range, same `checked` on every checkbox, same five
`rate` options with `1x` still selected, same `title` shortcuts on the four stepping
buttons:

| control | old | new |
|---|---|---|
| `plan`, `elevation`, `chart` canvases | 900×620, 900×620, 1800×220 | identical |
| `play` | ✓ | ✓ |
| `step-back`, `step-forward` | `title` "Left/Right arrow; shift for ten" | identical |
| `prev-contact`, `next-contact` | `title` `[` and `]` | identical |
| `prev-wound`, `next-wound` | ✓ | ✓ |
| `scrub` | `range 0..1 step 1`, `aria-label="Tick"` | identical |
| `rate` | five options, `1x` selected | identical |
| `span` | `range 2..26 step 1` | identical |
| `azimuth` | `range −180..180 step 5` | identical |
| `show-regions`, `show-targets`, `show-contacts` | checked | identical |
| `show-velocity` | unchecked | identical |

Two things deliberately did **not** carry over unchanged, and neither is a capability:

- The footer's link to `/v2.html` is now the **New Game** destination on the nav bar, and
  `/fight.html` is `#/arena`. A link became a route; nothing became unreachable.
- The regenerate hint reads "Regenerate the recorded fights with `npm run trace`" rather
  than naming one file, because the picker now offers three.

Everything gained is additive: the picker, and — from `v2-ui-02` onward — the three 3D
panels that share the canvas beside these two.

### What the adversarial review found

Two defects, both fixed here, and both were failures of *evidence* rather than of code:

- **`#/arena` 404s in a production build**, because `publicDir: false` and the copy
  allowlist mean the three 8–9 MB fixtures are not in `dist/`. Fixed by saying so on the
  page rather than by shipping 26 MB. The finding that made it worth having: a missing
  `/fight.json` is answered by both `vite preview` and the dev server with the SPA
  fallback — **`status 200, text/html`** — so a check written against a 404 sees nothing
  wrong with exactly the case that is broken.
- **The build assertion had gone vacuous**, exactly as this plan warned it could.
  `studio.ts` has no static imports, so `dist/index.html` names a 3.5 KB router and the
  grep never opened the game code. Replaced with a static-import-closure walk, and the
  fix was proved by *inducing* the failure: `dist/index.html statically reaches
  sim.worker-….js, so the wasm worker runs on the main thread`.

### Owed onward

`client/test/chunk-graph.mjs` is imported by `vite.config.ts`, which points from build
configuration into the test tree. It belongs in `tools/`.

**Paid.** It is `tools/chunk-graph.mjs`, beside the other build-adjacent checkers, and
both importers move with it. Still one copy for the reason the file's own header gives:
the build's assertion and `render-contract.test.mjs`'s are the same claim about the same
graph, and two copies would eventually be two claims that both pass about different
graphs. A move is exactly the change that could disarm an assertion silently, so it was
checked the way this session checked the assertion in the first place: by inducing the
failure again after the move, and reading back
`dist/index.html statically reaches sim.worker-….js, so the wasm worker runs on the
main thread`.
