# Session 03 -- energy scoring: a blow is worth the energy that arrives

**Status (2026-09-06): planned. Needs 02.**

## Outcome

Every blow is scored from the kinetic energy the struck part absorbs, turned into wound by the
striker's mechanism -- blunt, edge or point -- with one argued constant per mechanism and no cap,
power, speed ramp or per-weapon scale anywhere in a score row. A mace, a maul or a stone fist is
worth what its head and the part under it make it worth; a shield bash is worth its slab; a
Warrior's punch against stone is a slap. The Warrior's pinned scoring numbers move and are
re-pinned from the model (owner, 2026-09-06). The class table over random pairs is the check on
the result, not the knob that produced it.

## Why

The owner, 2026-09-06, on the fist out-damaging a sword: "why would a fist do more damage than a
sword? that seems counter-intuitive", and on the first answer, a swept cap on the mass weight:
"instead of putting arbitrary fixed caps, why not make it physically or intuitively based?"

What the rows do today, in `../../src/scoring.ts`. An `impulse` row (club, empty hand, ram)
scores `scale × ramp × massKg / referenceMassKg`, and the mass ratio is uncapped against the
Warrior's 3.4 kg club and 0.65 kg fist, so at full speed a mace head is 9.0, a maul 24 and the
stone fist 25, where a perfect cut is capped at 2.3 and a real blade blow lands at 0.19 to 0.41.
The record says what that does: in the matchup close-out's class table in `../measurements.md`,
over random pairs under the fencer, maul/long takes 0.97 points a bout, mace/long 0.86, fist/mid
0.70, blade/long 0.45, whip/long 0.41 and plate/short 0.37. The rows were each argued on their
own day against a Warrior, and no rule ever related a stone fist to a sword.

## Frozen choices

- **Energy that arrives.** A striker of impact mass m meeting a part of mass M at closing speed v
  along the contact normal delivers to that part E = ½ μ v², with μ = mM / (m + M), the reduced
  mass of the pair. That is the whole of the physics and it carries its own saturation: a 48 kg
  head on a 9.4 kg link can give the link no more than the link's share, and only on a trunk
  does the head's mass pay in full. The struck part's mass is the mass its Havok body reports,
  which `Combat` in `../../src/combat.ts` already reads for the shove; a jointed part is
  effectively heavier than its own body, so this errs in the striker's favour, and the entry says
  by how much on the bench. The solver's own impulse is not used, for the reason `Combat` gives
  at its head: it is dominated by how the contact was resolved. The closing speed is the
  striker's velocity at the contact point less the part's, projected on the normal, so a
  glancing rake pays for the little that arrived across the surface and a square blow pays for
  all of it; with Session 01's one claim per stroke, that is what ends the rake.
- **Three mechanisms, three constants, anchored where the record is.** A row keeps its kind for
  the readout and names one mechanism:
  - *blunt* (club, empty hand, ram, the plate bash, the whip): damage = E / `crushJoulesPerDamage`;
  - *edge* (sword): damage = quality × E / `cutJoulesPerDamage`, quality being the edge and blade
    alignment gate exactly as today, so a badly placed cut still pays almost nothing;
  - *point* (thrust, arrow, the centipede's bite): the projectile row's shape already in
    `../../src/scoring.ts`, axial energy above a floor over joules a point, with the projectile's
    three-damage ceiling kept for projectiles.

  Each constant is set so that the Warrior's full-speed blow with the Warrior's own weapon on a
  Warrior torso scores what it scores today: a perfect 11 m/s cut with the 1.35 kg sword is 2.3,
  which puts the cut at about 35 J a point (the arrow row was argued to 34 on its own, which is
  the one number in this file that was not chosen); a square 11 m/s club blow is 1.7, about
  115 J a point. Every other number follows from the masses. What that predicts for square blows
  at the speeds the record shows, before any sweep, damage a blow:

  | striker | speed m/s | on a 9.4 kg link | on a 139 kg trunk core | today at full speed |
  | --- | ---: | ---: | ---: | ---: |
  | blade, 1.30 kg, perfect | 9 / 11 | 1.3 / 2.0 | 1.5 / 2.2 | 2.3 |
  | mace, 18 kg | 9 | 2.2 | 5.6 | 9.0 |
  | maul, 48 kg | 8 | 2.2 | 9.9 | 24 |
  | stone fist, 8 kg | 9 | 1.5 | 2.7 | 25 (at 18 kg) |
  | plate bash, 16.6 kg | 6.3 | 1.0 | 2.6 | 0.9 |
  | whip bead, 0.57 kg | 20 | 0.9 | 1.0 | 1.7 |
  | Warrior fist, 0.65 kg, on a torso | 9 | -- | 0.23 | 0.9 |

  On a limb a maul is a mace is a fist; on the trunk the head pays. That is the weapon triangle
  the owner asked for, and it was not tuned in. Whether a maul that lands 9.9 on a trunk still
  decides bouts is a question about how often and how fast it lands, which is the body's
  business, below.
- **Floors are energy floors.** Below `crushFloorJ` a blunt contact is a slap and takes the
  shove path as today; below `cutFloorJ` an edge is weak. Each floor is today's speed floor
  restated in joules for the Warrior's own weapon on a torso, so nothing about the Warrior's
  shove changes. The speed ramps, `damageScale`'s and `chopScale`'s ceilings, `crushScale`,
  `fistScale`, `ramScale` and the two reference masses are retired from the rows; a striker's
  own `damageScale` multiplier on `Striking` stays what it is.
- **Every striker publishes its mass, and absent is an error.** Blade 1.30, mace 18, maul 48,
  plate 16.6, whip 0.57 a bead, ram 74 (the plate and what the neck and trunk put behind it, as
  today), the Warrior's sword, club and fist from their own config rows; and the fist restored
  to the 8 kg its comment derives from stone at its radius, physical mass and impact mass both.
  `TERMINAL_FIST.mass` in `../../src/golem/config.ts` went from 8 to 18 in commit `e1ff978`
  with its comment untouched, and `../../tests/scoring.test.mjs` still pins the stone fist at 8.
- **The body pays for its mass in the physics, not in the score.** A 48 kg head is slower than
  a blade only if the arm's force ceiling binds, and `CHAIN_REACH.anchorForce` in
  `../../src/golem/config.ts` was set where the rate limit took over for 28 kg of arm and 1.3 kg
  of blade. Session 02's speed at the mark per weapon is this session's input: the entry prints
  each weapon's energy at the mark against the blade's. If the maul reaches the mark at the
  blade's speed, the ceiling is named as the lever and moved with the owner in a row of its own,
  not here; a physics change and a scoring change in one table cannot be read apart.
- **The class table is the check, not the knob.** Over random pairs under the fencer, every
  build class with at least 300 sides is expected inside 0.30 to 0.65 points a bout. A class
  outside it is reported with the physical reason the model gives, and the owner decides whether
  a constant's derivation or a body moves. Nothing is swept to hit the band.
- **The Warrior's pins move.** Owner, 2026-09-06. Every pinned scoring number in
  `../../tests/scoring.test.mjs`, `../../tests/weapons.test.mjs`, `../../tests/centipede.test.mjs`,
  `../../tests/golem-mind.test.mjs` and `../../tests/golem-torso-head.test.mjs` is re-derived
  from the model and re-pinned with its derivation in the test; the Warrior cells of
  `npm run measure` are re-taken and the entry shows them before and after.

## Implement

1. `impactEnergyJ` in `../../src/scoring.ts`, pure: striker mass, part mass and closing speed to
   joules; `scoreHit` takes an impact with those three and the alignment, and the `BITE` rows
   keep a kind, a mechanism and a floor and nothing else. The five constants in `CONFIG.combat`
   in `../../src/config.ts`, each with the anchoring arithmetic in its comment.
2. `Combat.resolve` in `../../src/combat.ts`: the part's mass from its body, the part's velocity
   at the point, the closing speed along the collision normal; the report carries `energyJ`,
   `partMassKg` and `closingSpeed`, and the HUD in `../../src/hud.ts` shows the energy beside
   the solver impulse it already shows.
3. Masses published by every `RigidStrike` and by the Warrior's strikers; the fist's row and
   comment made true; the plate bash publishes its slab.
4. Tests: `impactEnergyJ` against the table above to three figures; the Warrior's perfect cut is
   2.3 and its square club blow 1.7 by construction; the Warrior's punch and thrust at their new
   numbers with the arithmetic beside them; a 48 kg striker on a 9.4 kg part scores within a
   third of an 18 kg one and on a 139 kg part at least three times it; a contact whose closing
   speed along the normal is near zero is a slap whatever the tip speed; a striker with no mass
   throws; every golem cell re-pinned.
5. Runs: Session 00's baseline rows once more on the same seeds, `--bouts 1024 --mirror
   --random 40 --cap 60 --seed 20260906` and the same over random pairs, so the third table
   differs from Session 01's by this rule alone; `npm run measure -- --only golem --bouts 8`
   and the Warrior cells; the class table over random pairs under the fencer at 2,048 bouts;
   blows to empty the bar per weapon, from the log.
6. The entry in `../measurements.md`: the anchoring, the prediction table against what landed,
   the class table against the band, energy at the mark per weapon from the bench, and the
   Warrior cells before and after. `../design.md`: the scoring section rewritten around energy
   and mechanism. `../../README.md` where it describes what a blow is worth.

## Human gate

The owner watches a maul golem, a fist golem and a plate-and-blade golem each against a blade
golem and says whether every blow's worth reads as its weight, and whether a maul against a blade
is a fight rather than an execution. Verdict into this file's status line.

## Verification

```powershell
npm run check
node --test tests/scoring.test.mjs tests/weapons.test.mjs tests/golem-mind.test.mjs
npm run measure -- --only golem --bouts 8
npm run tournament -- --bouts 256 --random 40 --policies golem-fencer
npm test
npm run build
git diff --check -- .
```

## What remains

A cut can go no deeper than the part it is in, and a depth cap would say so; at 1.3 kg no edge
in the game carries the energy to need one, so it is named here for the day a heavier edge
arrives, not built. Whether the arm's force ceiling should follow the head is the bench's finding
and the owner's row. If the whip's bead cannot pay the blunt floor at the speeds it reaches, the
entry says so and the whip is reported as what it is rather than rescued.
