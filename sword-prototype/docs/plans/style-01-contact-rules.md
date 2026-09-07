# Session 01 -- contact rules, so a rake is not a cut and a heavy head is not the bout

**Status (2026-09-06): planned. Needs 00.**

## Outcome

A golem striker bills a given part at most once per stroke, and a blow that lands on a part a
hand is holding is booked as a block while still wounding that part. The impulse rows are
balanced: a mace, a maul or a stone fist is worth several blade blows, not the bout, and a target
band over random pairs says so in the class table. The Warrior's scoring stays byte-identical.
The set's baseline is re-taken after each rule so every rule's effect is its own table.

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
- **The impulse rows are balanced against the blade by a target and a table, not by feel.**
  The owner's call, 2026-09-06: the mace, the maul and the fist are overpowered. The cause is
  one line of `../../src/scoring.ts`: an `impulse` row scores `scale × hard × massKg /
  referenceMassKg`, and the mass ratio is uncapped against the Warrior's 3.4 kg club and
  0.65 kg fist. At the same speed a mace head (18 kg, `TERMINAL_MACE` in
  `../../src/golem/config.ts`) is five Warrior clubs, a maul (48 kg) fourteen, and a stone fist
  (18 kg) twenty-eight Warrior fists, against a blade whose edge row tops out at 2.3 and lands
  at 0.19 to 0.41 a contact. The record says what that does. In the matchup close-out's class
  table in `../measurements.md`, over random pairs under the fencer, maul/long takes 0.97 points
  a bout, mace/long 0.86, fist/mid 0.70, blade/long 0.45, whip/long 0.41 and plate/short 0.37;
  the weapon session's own entry says the mace is past its band and leaves the call to the
  owner. The choices:
  - *The target.* Over random pairs, every build class with at least 300 sides inside 0.30 to
    0.65 points a bout, and the damage-per-contact column still ordered maul, mace, fist, blade,
    so a heavy head is still the heaviest blow. A weapon that meets the band and wins a mirror
    in under ten seconds is reported, not chased.
  - *The lever.* One function, `impulseWeight(massKg, referenceMassKg)` in
    `../../src/scoring.ts`, applied by every `impulse` row (club, empty, ram) in place of the
    bare ratio, with two rows in `CONFIG.combat`: `impulseWeightPower` and `impulseWeightCap`.
    Power 1 and no cap reproduce today's number to the byte; a contact that publishes no mass,
    or exactly the reference, scores 1 under every setting, so every Warrior number stays as it
    is. Candidates: the ratio as today, the square root, and caps of 2, 3 and 4. The ram is not
    on the sweep: its 37 kg reference is its own and the head publishes 74 kg
    (`HEAD_RAM.impactMassKg`), a ratio of 2 that sits inside every cap; if the chosen power
    moves it, the entry says by how much and the ram's own table is re-read.
  - *The fist is decided first and on its own.* `TERMINAL_FIST.mass` went from 8 to 18 in the
    weapon session (commit `e1ff978`) while its comment still derives 8 kg from stone at the
    fist's radius and `../../tests/scoring.test.mjs` still pins the stone fist at 8. The
    comment or the number is wrong. The 8 kg the arithmetic gives is restored, physical mass and
    published impact mass both, unless the sweep says the fist needs more to stay inside the
    band from below; either way the comment is made true and says which.
  - *Not moved.* The speed floors and references, `crushScale`, `fistScale` and `ramScale` (the
    Warrior's cells pin them), the terminals' geometry, and the mace's and maul's physical
    masses: a maul stays 48 kg to swing, only its worth on landing changes.
- **No other rule moves.** The bite table, `hitCooldown`, armour, severing and the vitality
  weights are as they were. If the entry finds a bout now runs too long, the number to move is
  the 60 s cap, and it is moved with the owner, not silently.

## Implement

1. The config row, the `strokeClaim` flag and the per-limb claim map; the terminals set the flag.
2. `guarding` on `Limb`, `guarded` on the report event, the block count in the recorder.
3. Tests: a headless golem-versus-golem bout in `../../tests/golem-mind.test.mjs` or
   `../../tests/golem-torso-head.test.mjs` where a blade rakes a trunk and books at most one blow
   on that part per 0.25 s while still billing more than one part per stroke; a plate hit counted
   in `blocks` and wounding the plate; the Warrior scoring tests unchanged to the byte.
4. Runs: Session 00's baseline again on the same seeds, `--bouts 1024 --mirror --random 40
   --cap 60 --seed 20260906` and the same over random pairs, so the two tables differ by the
   claim rule alone. Expect blows per stroke toward 1 to 2, damage per contact up, damage a bout
   down, bouts longer. `npm run measure -- --only golem --bouts 8` for the variant table.
5. `impulseWeight` and its two config rows, wired into the three `impulse` rows; the fist's
   mass and comment. Tests in `../../tests/scoring.test.mjs`: power 1 and no cap equal the bare
   ratio; no mass and the reference mass score 1 under a cap of 2 and a power of 0.5; the club
   test that reads four times the reference mass reads through `impulseWeight` rather than
   asserting four times the damage; the stone-fist assertion pins the shipped weight; a golem
   mace contact at the reference speed scores what the entry's table says.
6. The balance sweep, after the claim rule and on top of it: random pairs under the fencer
   (the only mind whose table can be read here; v2 does not move), `--bouts 2048 --random 40
   --cap 60 --seed 20260906` per row, one row per candidate weight, each at fist mass 8 and 18,
   read by build class. The shipped pair is the one whose classes sit inside the band with the
   damage-per-contact order kept; a tie inside noise goes to the least change from today. Then
   the mirrored baseline once more on the shipped pair, so the structural columns have their
   third table, and the variant table again.
7. The entry in `../measurements.md`: the three tables (baseline, claim rule, balance) side by
   side, the sweep by class, the fist's mass with the arithmetic that set it, and the ram's
   number before and after. The rules in `../design.md` under the scoring section, and
   `../../README.md` where it names the mace and the maul.

## Human gate

The owner watches two random matchups and says whether a blow that lands reads as one blow,
whether bouts now run too long, and then a mace or maul golem against a blade golem and says
whether it is a fight rather than an execution. Verdict into this file's status line.

## Verification

```powershell
npm run check
node --test tests/scoring.test.mjs tests/golem-mind.test.mjs tests/tournament.test.mjs
npm run tournament -- --bouts 64 --mirror --policies golem-fencer
npm run tournament -- --bouts 256 --random 40 --policies golem-fencer
npm test
npm run build
git diff --check -- .
```

## What remains

Whether a presented plate should take less than a full wound is not decided here; the plate's
durability row in `../../src/golem/effectors/terminals/plate.ts` is where that would go, and the
entry reports how fast plates wear under the new booking before anybody moves it.

Whether a heavy head should also cost something in the body -- a maul that reaches the mark as
fast as a blade is mass for free -- is a physics question, not a scoring one. Session 02's bench
reports speed at the mark per weapon; if the maul's is the blade's, that entry says so and the
lever is the anchor rate or the chain's drive, moved with the owner, not this row.
