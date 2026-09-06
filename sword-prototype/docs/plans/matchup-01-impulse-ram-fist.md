# Session 01 -- momentum scoring, a ram that leans in, and a fist

**Status (2026-09-05): planned.**

## Outcome

A ram contact hurts. A heavy striker is scored by what it carries and not only by how fast its
surface moved. A fist terminal exists on every chain that can throw it.

## Why

The ram answer from the overview: a plate of 21 kg and a lunging torso scored as a speed ramp
between 0.65 and 3.3 m/s, worth 0.42 to 0.73 damage per contact against a blade stroke's 3.13,
and fired without the trunk lean that is the forward half of the lunge. The mace and the fist
have the same problem in waiting: a mass striker's whole point is its mass.

## Frozen choices

- **A new bite mechanism, `impulse`, beside `edge`, `point`, `mass` and `none`.** Damage is the
  row's scale times a clamped ramp over momentum, `impactMassKg` times contact speed, between the
  row's floor and reference. A row scored by impulse whose striker publishes no `impactMassKg`
  falls back to the speed ramp the row has today, so every existing Warrior number is byte-identical
  and `tests/scoring.test.mjs` says so.
- **The striker declares its impact mass.** `Striking` in `src/combat.ts` gains an optional
  `impactMassKg`; `RigidStrike` in `src/golem/effectors/striker.ts` passes it through. The ram
  head sets its plate mass plus a lean-weighted share of the torso mass, because the torso is
  what the lunge throws; a fist sets its knuckle mass; the mace and maul set their head mass in
  Session 02.
- **The ram is an exchange, not a reflex.** A new stance in `src/golem/tactics.ts` that chambers,
  leans the trunk to its commit lean, steps in, fires `natural.thrust` for the head's own drive
  time, and recovers. Entered when the ram is ready and the measure is inside ram reach plus the
  lunge's travel, and either the arms cannot attack or a seeded fraction chooses it over an arm
  exchange. Its constants live in `GOLEM_TACTICS` with sweep tables like every other.
- **The fist is a terminal, not a chain.** `TerminalId` gains `fist`; the terminal is one stone
  knuckle heavier than the `none` cap, striker kind `empty` with an impact mass, and it contributes
  nothing to control. Its strokes come from the chain, as the module contract says.

## Implement

1. `src/scoring.ts`: the `impulse` mechanism, the ram row moved onto it, the calibration table
   in the row's own comment. `src/combat.ts` and `src/golem/effectors/striker.ts` carry the mass.
   `src/golem/head/ram.ts` publishes the ram's impact mass.
2. `src/golem/tactics.ts`: the ram stance and its constants. The head test in
   `tests/golem-mind.test.mjs` that closes and fights with its head gains the assertion that the
   trunk is leaning when the thrust fires.
3. The fist: `src/golem/module.ts` `TerminalId`; `src/golem/build.ts` `TERMINAL_DESCRIPTION`
   (the total record is the compile gate); a new terminal file beside `blade.ts` under
   `src/golem/effectors/terminals/`, from `ballShell` in `src/golem/effectors/shell.ts`; registry
   rows for pitch, reach and wrist in `src/golem/registry.ts`; bench rows in
   `tests/golem-bench.test.mjs`; build shapes in `tests/golem-arena.test.mjs`. The variant table
   in `scripts/measure.mjs` picks the new option up through `golemVariants`.
4. `docs/measurements.md`: the ram before/after per contact and per bout, the fist variant row,
   and the blade row unchanged within noise. `docs/design.md`: the ram section rewritten, the
   scoring section gains the impulse mechanism.

## Human gate

The owner watches a ram-headed golem with capped arms against the default build, then the
default build with a fist in each socket. Does the ram read as a charge that lands; does a punch
read as a punch. Verdict into this file's status line.

## Verification

```powershell
npm run check
node --test tests/scoring.test.mjs tests/golem-torso-head.test.mjs tests/golem-mind.test.mjs tests/golem-arena.test.mjs tests/golem-bench.test.mjs
npm run measure -- --only golem --bouts 8
npm test
npm run build
git diff --check -- .
```
