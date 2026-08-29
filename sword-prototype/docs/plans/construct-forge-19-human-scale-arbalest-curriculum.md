# Session 19 -- human-scale Arbalest curriculum

## Status -- implemented; human playtest still owed (2026-08-29)

Add a separately selectable ranged humanoid Construct without replacing Swordbearer or Twinblade,
then apply the same identical-body durability ratchet as Session 18. The candidate is deliberately
human-scale: it keeps the 1.8995 m Humanoid body, replaces the right-hand sword hardware with a
compact two-axis auto-crossbow, adds a finite torso magazine and reuses the existing ordinary sword
on the real left hand as a close guard. Active and posture-only modes share the exact blueprint and
control graph; only the Mind may track through reload, fire and hold the four-joint guard.

## Landable implementation

1. `src/construct/mounts.ts` aims a generic launcher from its live compiled muzzle ray and current
   joint readings. Optional authored height/lateral lane parameters may move the target, but Warden
   and every existing caller retain zero defaults. `tests/construct-mounts.test.mjs` proves the
   pitch sign by physical torso hits in both mirrors.
2. `src/construct/arbalest.ts` owns the compact launcher, twelve-round torso magazine, ordinary
   left sword, Human-scale profile, disjoint launcher/support/guard control groups and authored
   Mind. The projectile and sword both keep ordinary damage scale 1.15; health and reload cadence
   are declared hardware, never controller multipliers. `src/units.ts` registers it beside all
   existing fighters.
3. `tests/construct-arbalest.test.mjs` pins unchanged Humanoid parts/joints, hardware arithmetic,
   selectable A/B coexistence, exact idle/active body equality, public Actions and real mirrored
   projectile contacts.
4. `scripts/construct-warrior-curriculum.mjs` accepts a saved definition plus a committed,
   blueprint-bound tactic qualifier ID. Arbalest victories are reconstructed from retained bout evidence:
   declared ammunition is spent, `fire` really starts/completes, an ordinary arrow physically
   damages the Warrior while the Construct is supported/upright, the fatal vitality transition is
   exact, the Warrior perceives the mounted threat at decision time, and no verdict tail launders
   later contacts into the win. Each successful loose receives a monotonically unique shot serial
   carried through its lifecycle and physical contact; the recyclable Quiver pool suffix is only a
   body-slot label and never serves as chronological shot identity.

## Ratchet and acceptance

- At a rung, the posture-only Arbalest dies in all eight frozen seed x side cells.
- The earned active floor is at least two raw wins, the same two physically qualified, at least two
  survivals, upright damage in all eight cells and at least one qualified win on each construct side.
- The identical final body/control/Mind passed that floor at 0.10, 0.05 and 0.02 durability. The
  measured qualified counts are 2, 2 and 3 respectively; 0.02 is again non-monotonic rather than a
  promise that less health produces fewer wins.
- Target-lane, timing and guard sweeps record every tried cell. A setting that improves damage but
  not the primary qualified-win/mirror result is rejected rather than selected.
- The existing 0.75-scale Humanoid is the selected first size, not a minimum. Profile-derived
  standing tests must keep accepting the synthetic 0.90 m case so later smaller Constructs are not
  judged against a hidden human-height floor.

No root-workspace golden hash applies. Saved Construct digests move only with their owned body,
control, program or sensor contract; Session 19 records the measured digest rather than choosing a
constant first.

## Verification

~~~powershell
node --test tests/construct-mounts.test.mjs tests/construct-perception.test.mjs tests/construct-arbalest.test.mjs
node --test tests/construct-warrior-curriculum.test.mjs tests/construct-warrior-evidence.test.mjs tests/construct-arbalest-qualifier.test.mjs
node scripts/construct-warrior-curriculum.mjs --arbalest
npm test
npm run check
npm run build
~~~
