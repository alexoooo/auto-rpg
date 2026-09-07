# Session 01 -- contact rules, so a rake is not a cut

**Status (2026-09-06): implemented; the human gate is open.** The rules and the two re-taken
baselines are in the Session 01 entry of `../measurements.md`; the rule itself is in
`../design.md` under the scoring section.

## Outcome

A golem striker bills a given part at most once per stroke; a blow that lands on a plate is a
block and wounds nothing, the plate being an indestructible damage sink (owner, 2026-09-06); a
blow that lands on a held weapon is booked as a block while still wounding the weapon. The
Warrior's scoring stays byte-identical here. The set's baseline is re-taken so the rule's effect is one table. What a
blow is *worth* is Session 03's question, not this one's.

## Frozen choices

- **One claim per part per stroke, on golem strikers only.** `CONFIG.combat` in
  `../../src/config.ts` gains `strokeClaimSeconds`, 0.25, the window Session 12b of the golem
  set used to say what one pass of one blade is. *Corrected on implementation, 2026-09-06: the
  window shipped at **0.20**, because 0.25 is also `STROKE_GAP_SECONDS`, the gap at which Session
  00's instrument opens a new stroke. A weapon held against a part books a blow every window
  exactly, so at 0.25 a drag lands on the instrument's own boundary and each of its blows is
  filed as a stroke of its own. The measurement and the argument are in `../measurements.md` and
  beside the constant.* `Striking` in `../../src/combat.ts` gains an
  optional `strokeClaim` flag; in `onContact`, a weapon carrying it is dropped when it billed
  *this limb* inside the window, kept in a per-limb map by `effectorId` beside the existing
  per-limb `hitCooldown`. Every golem `RigidStrike` terminal under
  `../../src/golem/effectors/terminals/` sets it (blade, mace, maul, fist, plate, whip); the ram
  head already has its one-claim-per-lunge gate. Warrior weapons do not set it, so
  `../../tests/scoring.test.mjs` and every pinned Warrior cell stay byte-identical.
- **The plate is a shield: it blocks, it is never wounded, and it never wears.** The owner,
  2026-09-06: "I don't want the golem to take damage when their shield is hit, and I want it to
  have unlimited life -- i.e. the shield is an indestructible damage sink." The path exists:
  `Combat.onContact` in `../../src/combat.ts` asks the target `parriedBy` before it looks for
  a limb, and a stopped contact is booked through `parried` as a `block:<kind>` report with
  zero damage and `blocked: true`, which is how a Warrior's shield works today. `parriedBy` in
  `../../src/golem/golem.ts` returns null; it now returns `{ kind: "shield" }` when the body
  it is asked about is a plate part, and `limbFor` and `damageTargetFor` return nothing for
  that part, so no rule downstream can wound it. `TERMINAL_PLATE.vitalityWeight` in
  `../../src/golem/config.ts` goes to 0 so the plate is no part of the bar; its health row is
  kept as the shape requires and is never subtracted from; the ram head's plate is not a shield
  and keeps its wound. The `blocks` column stops reading zero. The plate keeps its mass: the
  physics is what makes it a wall, a slab with no mass is flung by the blade it was meant to
  stop, and under Session 03 its mass is also what a bash is worth.
- **A blow on a held weapon is a block that still wounds the weapon.** `Limb` gains
  `guarding`, true for the parts of a module in a hand slot, set at assembly; `Combat` puts
  `guarded: true` on the report event; `recordCombatEvent` in `../../src/options.ts` counts a
  guarded hit as a block, de-duplicated as today. A blade that meets a blade is a parry that
  costs the blade, which is what a blade's health row is for.
- **No other rule moves.** Speed floors, the bite table, `hitCooldown`, armour, severing and the
  vitality weights are as they were; the mace, the maul and the fist keep today's numbers until
  Session 03 replaces the rows they are scored on. If the entry finds a bout now runs too long,
  the number to move is the 60 s cap, and it is moved with the owner, not silently.

## Implement

1. The config row, the `strokeClaim` flag and the per-limb claim map; the terminals set the flag.
2. `parriedBy`, `limbFor` and `damageTargetFor` on the plate; the plate's vitality weight;
   `guarding` on `Limb`, `guarded` on the report event, the block count in the recorder.
3. Tests: a headless golem-versus-golem bout in `../../tests/golem-mind.test.mjs` or
   `../../tests/golem-torso-head.test.mjs` where a blade rakes a trunk and books at most one blow
   on that part per 0.25 s while still billing more than one part per stroke; a blade driven into
   a plate books a `block:shield` report, wounds nothing, moves the bar by nothing, and the plate
   is still there after a hundred of them; a blade driven into a held blade is counted in
   `blocks` and wounds the blade; the Warrior scoring tests unchanged to the byte.
4. Runs: Session 00's baseline again on the same seeds, `--bouts 1024 --mirror --random 40
   --cap 60 --seed 20260906` and the same over random pairs, so the two tables differ by the
   rule alone. Expect blows per stroke toward 1 to 2, damage per contact up, damage a bout down,
   bouts longer, and the plate classes up from the bottom of the class table, where plate/short
   sits at 0.33 to 0.38 points a bout today. `npm run measure -- --only golem --bouts 8` for the variant table.
5. The entry in `../measurements.md`; the rule in `../design.md` under the scoring section.

## Human gate

The owner watches two random matchups and says whether a blow that lands reads as one blow,
whether a blade stopped by a plate reads as a block, and whether bouts now run too long. The
number for that last one: bouts that ran out the 60 s cap went from 380 to 423 of 1,024 mirrored
and from 411 to 444 on random pairs, and the median mirrored bout is 41.2 s. Verdict into this
file's status line.

## Verification

```powershell
npm run check
node --test tests/scoring.test.mjs tests/golem-mind.test.mjs tests/tournament.test.mjs
npm run tournament -- --bouts 64 --mirror --policies golem-fencer
npm test
npm run build
git diff --check -- .
```

## What remains

Whether a held weapon should also stop wounding when it parries is not decided here; the entry
reports how often a blade dies to a parry, and if that number is the reason a mind never parries
with its blade, the weapon's health row is the place and the owner's call. *Measured on
implementation, 2026-09-06: over 32 fencer-versus-fencer bouts, 26 of 35 severs were on a part a
hand was holding and something held came off in 23 of the 32 bouts, twelve of them blades. So a
blade does die to a parry, in most bouts, and the question is live rather than theoretical.*

Whether the plate's mass should be lighter than stone so a parry can arrive in time is Session
02's arrival number and Session 06's question; the plate blocks whatever it weighs.

*Two things the entry found that this session does not fix. The `strokes` column inflated by
about a quarter on bodies that press, because a claim window of 0.20 s inside a 0.25 s stroke gap
cuts a long drag in two; the fix is to count a stroke off the effector's own phase, which
Sessions 02 and 03 open the seam for. And the plate classes did not rise: a plate mirror now
draws having done less damage than before, which is the rule working and a worse fight, and the
lever for it is Session 03's `shove` rather than anything here.*
