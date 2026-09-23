# Numeric golem attributes -- overview

Per-fighter numeric attributes on the golem: nine stats, each set per corner and on the dungeon
hero, and each **measured**. The owner (2026-09-23): "each stat that we add should be measured to
quantify how it changes things", and "we'll need to be tuning and re-tuning anyways because we'll
want to quantify the effect of the stats." The design argument, the live number behind each stat,
and the size scaling laws are in `docs/analysis/2026-09-22-attributes-and-mind-schools.md`
("A first slice of numeric attributes", "Health is already per part", "Size").

Thirteen files, one per session. Each session lands green on its own and is committed as it
lands.

| Session | File | What lands | Default body |
| --- | --- | --- | --- |
| 01 | `-01-foundation.md` | The attribute record, setup field, codec, validation, and `ModuleBuild.attributes`; no stat live | bit-identical |
| 02 | `-02-sweep-instrument.md` | `research/stat-sweep.mjs`: win rate, paired bar margin, Cohen's d, and the null row | untouched |
| 03 | `-03-movement.md` | Movement live, with bench and sweep tables | bit-identical at 1.00 |
| 04 | `-04-ui.md` | Sliders in each arena corner and the dungeon hero dialog; a read-only HUD line | bit-identical |
| 05 | `-05-turning.md` | Turning live | bit-identical at 1.00 |
| 06 | `-06-stability.md` | Stability live | bit-identical at 1.00 |
| 07 | `-07-recovery.md` | Recovery live | bit-identical at 1.00 |
| 08 | `-08-armour.md` | Armour live | bit-identical at 1.00 |
| 09 | `-09-toughness.md` | Toughness live | bit-identical at 1.00 |
| 10 | `-10-arm-speed.md` | Arm speed live | bit-identical at 1.00 |
| 11 | `-11-weight.md` | Weight live | bit-identical at 1.00 |
| 12 | `-12-size.md` | Size live on the modules that carry scaling laws | bit-identical at 1.00 |

The stat order is the owner's. The UI comes fourth, not first, so that it has one live stat to
be checked with.

## What the owner decided (2026-09-23)

- **Multipliers, default 1.00.** Every stat is a factor on the body's own tuned value, shown as
  `x1.20`. At 1.00 a body is exactly today's body, and the body fingerprint proves it.
- **Armour scales armour, toughness scales health.** Armour multiplies each part's armour fraction,
  the share of a blow the part shrugs off. Toughness multiplies each part's health.
- **Weight and size are two stats.** Size scales every length, and mass follows as size cubed.
  Weight scales density at fixed geometry. Final mass is `weight x size^3`.
- **Armour and arm speed are settable attributes for now.** They may come from item stats later.
  So a resolved attribute is a fold over sources, of which the setup is today the only one.
- **UI:** set in each arena setup corner and in the dungeon hero dialog, with defaults and a
  reset. Shown read-only in the in-fight diagnostics.
- **Not now:** minds do not read attributes, their own or the opponent's. The sweeps measure what
  that costs; teaching a mind to use a stat is the AI work's, later.

## The per-stat protocol (sessions 03 and 05 to 12)

Every stat session does these seven things, in this order, and its file only adds what is
particular to that stat:

1. **Wire the knob** through `ctx.attributes` (session 01) at the one place the stat's number is
   read, or at the few places named in that session's file.
2. **Prove the default is a no-op.** Run `node tests/harness/body-fingerprint.mjs --out base.json`
   on the parent commit and `--against base.json` on the change. Every section must read `same`,
   for a setup with no `attributes` field and for one with explicit 1.00s.
3. **Prove the dimension is live.** A bench reading must move with the multiplier: one level below
   1.00, 1.00 and one level above. A flat reading is a question, not a result. Either the knob has
   no reader (see `prove-a-dimension-is-live`) or the stat does nothing on this body, and the table
   has to say which.
4. **Sweep bouts** with `research/stat-sweep.mjs` (session 02) at 0.75, 0.9, 1.0, 1.1, 1.25 and 1.5,
   trimmed to what the bench says is safe. Use n >= 384 bouts per level. Level 1.00 is the null
   control and must read about 50 % with d close to 0; a null row that does not means the
   instrument is wrong.
5. **Set the range.** The row's `min` and `max` in `ATTRIBUTES` come from steps 3 and 4: the
   widest range the bench calls physically sound. Then flip the row to `live`.
6. **Record.** Put the bench table and the sweep table in the row's doc comment in
   `src/golem/attributes.ts`, following the house rule that a constant's argument lives beside it,
   and in `docs/analysis/2026-09-23-attribute-measurements.md`. Every figure names its harness.
7. **Gate and commit.** Run `npm test`, `npm run check` and `npm run build`, mutation-check the
   new tests, and run the line-ending check (`git diff --cached --numstat` identical with
   `--ignore-cr-at-eol`).

## Costs

- **Sweep time.** On this machine the overkill probe ran 768 paired bouts in about 240 s on 24
  workers (Node harness). A six-level sweep at n = 384 is 2,304 bouts, about 12 minutes.
- **Sizing the bench levels.** Each bench reading takes seconds. What costs time is an unsound
  extreme, such as a flung blade or a slipping gait. Look for it on the bench before paying for
  bouts at that level.

## Shared hazards

- **Setup fields are copied by hand.** `copyGolem` and `readGolem` in `src/bout.ts` list each field.
  A field added to `GolemSetup` and missing from either is silently dropped, by a structured copy
  or by a shared link.
- **Module definitions are shared and built once, at import.** A per-build number must arrive
  through the build context. It must never be written into a config table, because another golem
  in the same scene reads that same table.
- **The owner's dev server on 5180 is theirs.** Do not restart it. After any mutation battery,
  fetch the changed modules and grep the served text before believing the page.
