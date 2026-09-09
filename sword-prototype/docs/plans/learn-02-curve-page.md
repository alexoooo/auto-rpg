# Session 02 -- the learning-curve page

**Status (2026-09-09): landed.**

## Outcome

A third page beside the arena and the bench that draws the learning curve of any run the harness
has written -- a `train-ppo` log, a league log, a `rate-snapshots` or `probe-snapshots` curve, or
a whole sweep from Session 04 -- with several runs overlaid and every series labelled with the
pool it was rated on. The owner opens it while a night's arms are running and sees where they are.

## Frozen choices

- **A Vite page, not a static file**, because the arena already is one, `../../vite.config.ts`
  is page-aware through one object, and a page can link a point on the curve to the arena with
  that snapshot loaded (Session 03). The built page still works without a server through a file
  picker, so a curve can be shown on any machine.
- **The data stays where it is.** `tournaments/` is gitignored and outside `public/`, and copying
  runs into `public/` would either commit them or make the page lie about what it shows. A
  dev-only middleware serves the directory read-only under `/runs/` with a JSON listing; nothing
  is written and nothing is bundled.
- **Readers are DOM-free and tested; the drawing is not.** The Node runner has no DOM, so every
  row parser and every series builder is a pure function over text in its own module, and the
  chart is inline SVG over arrays those functions return. No chart library: the page draws six
  kinds of line and a band, and a dependency for that is a dependency the docs gate would have
  to learn about.
- **Every series carries its pool.** `../../scripts/rate-snapshots.mjs` says it in its header: a
  rating is only comparable to another rating on the same pool. The page will not draw two
  series on one axis unless their pool labels match, and says which differ.
- **The row shapes are the harness's, unchanged.** The page reads what
  `../../scripts/train-ppo.mjs` and `../../scripts/league.mjs` write today, so every run on disk
  is already drawable; a half-written last line is skipped the way `readLog` skips it.

## Implement

1. curve.html at the prototype root and src/curve/main.ts, with `curve` added beside `index` and
   `bench` in `rollupOptions.input` in `../../vite.config.ts`. The page: a run list on the left
   (from /runs/index.json when served, else a drop zone and a file input), a chart area, and a
   legend that names each series with its run, its pool and its opponent.
2. The middleware, in `../../vite.config.ts` as a plugin with `configureServer`: GET /runs/index.json
   walks `tournaments/` two levels deep and lists `.jsonl` and `.json` files with size and mtime;
   `GET /runs/<path>` streams the file with the path checked against the directory root. Dev only:
   the plugin has no `build` hook, and the built page's fetch of /runs/index.json failing is the
   signal to show the picker.
3. src/curve/runs.ts, the readers: `readTrainLog(text)` returns `{header, iterations, ratings}`
   from a `train-ppo` log -- per iteration `iteration, ret, retSem, decided, margin, kl,
   clipFraction, entropy, explained, logSigma, seconds, collectSeconds, penaltyShare`, per rating
   `iteration, per, differences` with `bar, barSem, d` per opponent; `readLeagueLog(text)` the same
   plus `byOpponent, shares, pool, snapshot`; `readCurve(text)` for the two snapshot scripts'
   rows, keeping `pool` and the `uniform` / `driver` / `fit` columns or `killRate` / `maul` /
   `mace` / `p`; `readSweep(manifestText, logsByArm)` for Session 04's manifest; `series(run,
   column)` returning `{label, pool, x, y, lo, hi}` with the band from the row's standard error
   where one prints. Every reader tolerates a truncated last line and refuses a row whose
   `version` it does not know, by name.
4. src/curve/chart.ts: `drawLines(svg, series[], {yLabel})` -- axes, ticks, one path a series, a
   translucent band where `lo`/`hi` exist, a hover readout of the nearest point; the palette is
   fixed by series order. Panels, each one call: bar margin against uniform and against
   `golem-driver`; points a bout against each league member; decided fraction; stall and
   outside-reach seconds when the rows carry them (Session 06 adds the columns); penalty share;
   `logSigma` per axis; KL, clip fraction, entropy and explained variance on one panel with
   separate scales.
5. The watch link: every snapshot point on a league curve, and every checkpoint of a `train-ppo`
   run, gets an anchor to `index.html?snapshot=<run>/<file>` which Session 03 makes the arena
   honour. Until 03 lands the link exists and the arena ignores it.
6. Tests in tests/curve.test.mjs: each reader on a fixture of real rows copied from the record's
   runs (a `train-ppo` header plus three iteration rows and one rating row; a league row with
   `byOpponent`; one row of each snapshot script), the truncated last line, the unknown version
   refused, `series` carrying the pool label, and the refusal to overlay two pools.

## Human gate

The owner opens /curve.html under `npm run dev`, loads the three league arms the record shipped
from (league-anchored, league-flat, league-pure under `tournaments/`) and sees the 93-iteration
curve that chose the current mind with the other two overlaid, the decided fraction falling as
the record says it did, and can point at the iteration the mind shipped from. Verdict into this
file's status line.

## Verification

```powershell
npm run check
node --test tests/curve.test.mjs tests/docs.test.mjs
npm test
npm run build
git diff --check -- .
```

Then `npm run dev`, open http://localhost:5180/curve.html, load a run, close the server.

## What remains

Live tailing (re-fetching an open log every few seconds) is a `setInterval` on the same reader
and is left to Session 11, which is the first run long enough to want it. A committed example
curve for the built page is not made: the page is a window on `tournaments/`, and the record's
tables are in `../measurements.md`.
