# Session 01 -- contact rules, so a rake is not a cut

**Status (2026-09-06): planned. Needs 00.**

## Outcome

A golem striker bills a given part at most once per stroke, and a blow that lands on a part a
hand is holding is booked as a block while still wounding that part. The Warrior's scoring stays
byte-identical here. The set's baseline is re-taken so the rule's effect is one table. What a
blow is *worth* is Session 03's question, not this one's.

## Frozen choices

- **One claim per part per stroke, on golem strikers only.** `CONFIG.combat` in
  `../../src/config.ts` gains `strokeClaimSeconds`, 0.25, the window Session 12b of the golem
  set used to say what one pass of one blade is. `Striking` in `../../src/combat.ts` gains an
  optional `strokeClaim` flag; in `onContact`, a weapon carrying it is dropped when it billed
  *this limb* inside the window, kept in a per-limb map by `effectorId` beside the existing
  per-limb `hitCooldown`. Every golem `RigidStrike` terminal under
  `../../src/golem/effectors/terminals/` sets it (blade, mace, maul, fist, plate, whip); the ram
  head already has its one-claim-per-lunge gate. Warrior weapons do not set it, so
  `../../tests/scoring.test.mjs` and every pinned Warrior cell stay byte-identical.
- **A blow on a hand slot is a block that still wounds.** `Limb` gains `guarding`, true for the
  parts of a module in a hand slot, set at assembly in `../../src/golem/golem.ts`; `Combat` puts
  `guarded: true` on the report event; `recordCombatEvent` in `../../src/options.ts` counts a
  guarded hit as a block, de-duplicated as today. `parriedBy` stays null and its comment gains
  the one line that says where blocks are now booked. The `blocks` column stops reading zero.
- **No other rule moves.** Speed floors, the bite table, `hitCooldown`, armour, severing and the
  vitality weights are as they were; the mace, the maul and the fist keep today's numbers until
  Session 03 replaces the rows they are scored on. If the entry finds a bout now runs too long,
  the number to move is the 60 s cap, and it is moved with the owner, not silently.

## Implement

1. The config row, the `strokeClaim` flag and the per-limb claim map; the terminals set the flag.
2. `guarding` on `Limb`, `guarded` on the report event, the block count in the recorder.
3. Tests: a headless golem-versus-golem bout in `../../tests/golem-mind.test.mjs` or
   `../../tests/golem-torso-head.test.mjs` where a blade rakes a trunk and books at most one blow
   on that part per 0.25 s while still billing more than one part per stroke; a plate hit counted
   in `blocks` and wounding the plate; the Warrior scoring tests unchanged to the byte.
4. Runs: Session 00's baseline again on the same seeds, `--bouts 1024 --mirror --random 40
   --cap 60 --seed 20260906` and the same over random pairs, so the two tables differ by the
   rule alone. Expect blows per stroke toward 1 to 2, damage per contact up, damage a bout down,
   bouts longer. `npm run measure -- --only golem --bouts 8` for the variant table.
5. The entry in `../measurements.md`; the rule in `../design.md` under the scoring section.

## Human gate

The owner watches two random matchups and says whether a blow that lands reads as one blow, and
whether bouts now run too long. Verdict into this file's status line.

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

Whether a presented plate should take less than a full wound is not decided here; the plate's
durability row in `../../src/golem/effectors/terminals/plate.ts` is where that would go, and the
entry reports how fast plates wear under the new booking before anybody moves it.
