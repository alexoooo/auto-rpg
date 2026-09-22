# Skeleton body family -- overview

A third body family beside the stone golem and the human warrior: built on the golem's five-slot
layout, but made of bone. Nine files, one per session; each session lands green on its own and
is committed as it lands.

| Session | File | What lands | Stone and human bodies |
| --- | --- | --- | --- |
| 01 | `-01-fingerprint.md` | An instrument that proves stone and human physics did not move | untouched |
| 02 | `-02-armour-by-hit-kind.md` | Armour may differ by cut / thrust / crush / slap | bit-identical |
| 03 | `-03-families-as-a-table.md` | Body families become declared data instead of inference | bit-identical |
| 04 | `-04-tables-carry-shape-and-fatality.md` | Builders read their own table; `fatal` becomes data; arm chains become factories | bit-identical |
| 05 | `-05-bone-look.md` | A bone material and bone-shaped shells, selectable per table | bit-identical, same look |
| 06 | `-06-skeleton-modules.md` | The skeleton's legs, ribcage, skull and arms; the Skeleton family and its setup button; benches and measured torques | bit-identical |
| 07 | `-07-playable-skeleton.md` | Named skeleton builds, the dungeon hero and its weapon picker, a crown that knows the head is gone, first fights watched | bit-identical |
| 08 | `-08-fight-tuning.md` | Measured hit rates, damage and time-to-kill; final health, armour and force values with tables; owner decisions | untouched |

Sessions 01 to 07 must not move a stone or human body by a single bit. Session 01 exists so that
this can be checked rather than asserted.

## What the owner decided (2026-09-22)

- A **new unit family that feels different**, not a reskin.
- **Thin bones with thin colliders**, accepting that they are harder to hit.
- **Blunt weapons are relatively better against it than against flesh**; cuts and thrusts are
  weaker.
- **Weak joints**: limbs come off easily. Losing the whole arm at the shoulder is fine, which is
  already the golem rule (the module is the severable unit).
- **Decapitation is not fatal; the ribcage is.** The pelvis stays fatal, so losing a leg ends the
  fight. The owner likes that fragility and may revisit it.
- **Winning by wearing the health bar down must keep working** for every weapon.
- No major change without understanding the current state and its implications first. Each
  session below says what it touches, and why stone and human cannot move.

## What exists today and is reused as it is

- **The five-slot assembly** (`Golem` in `src/golem/golem.ts`): locomotion, torso, head, primary,
  secondary. The skeleton is five more modules in the same slots.
- **Table-driven builders** for three of the five slots: `bipedDefinition(id, label, B)`,
  `torsoModule(id, label, tuning)` and `headModule(id, label, tuning, N)`. The human family is
  built this way (`src/golem/humanoid/body.ts`): data tables spread from the stone ones, and a
  `humanDefinition` wrapper that stamps every part.
- **The damage model**, whole. `scoreHit` in `src/scoring.ts` prices a blow from the reduced-mass
  energy `0.5 * mu * v^2`, where `mu = m*M/(m+M)` uses the struck part's own mass, so light bones
  already take less from every blow. `armouredDamage` spends a part's armour at
  `Golem.applyDamage`. `severs` takes a limb off when its health is gone and the blow was clean
  enough. `beaten` in `src/bout.ts` ends a bout on a `fatal` part severed or emptied, or on the
  vitality bar reaching zero.
- **Severing**: `Golem.sever` detaches the whole module the struck piece belongs to, and calls
  `die()` only if that module has a `fatal` part. A non-fatal head that comes off is already
  handled by the head module's own `severed` guards.
- **Weapons**: every stone terminal (blade, plate, mace, maul, whip, fist) can hang off a skeletal
  arm unchanged, because session 06 keeps the stone arm's link lengths (see "Decisions" below).

## What is missing, and why each gap matters

1. **No proof that a refactor left stone alone.** Every determinism test in `tests/` compares two
   runs in one process, so a change that moves stone physics deterministically passes all of them.
   Only four exact pins exist, all on build-time mass and geometry. Session 01.
2. **Armour is one number for every kind of blow.** A flat fraction cannot make blunt relatively
   better: it scales cut and crush alike. Session 02. (Arithmetic below.)
3. **Family is inferred by exclusion.** `moduleFamily` in `src/golem/family.ts` returns `"golem"`
   for any id it does not recognise, so a forgotten skeleton id would silently join the stone
   shelves, stone random draws and stone refusal. Two-family literals are spread across
   `build.ts`, `bout.ts`, `setup.ts` and `src/dungeon/`. Session 03.
4. **Some builders read global tables.** `headShell` draws the stone head's size whatever table
   the head was built from; `torsoModule` always uses `TORSO_WAIST`; the reach and wrist arm
   chains are singletons over `CHAIN_REACH` / `CHAIN_WRIST`. `fatal` is a literal in `head.ts`
   and `torso.ts`, so a non-fatal skull and a fatal ribcage cannot be expressed. Session 04.
5. **There is no bone to draw with.** The palette has stone, bronze, wood and rune; every shell
   builder draws carved slabs. Session 05.
6. **The modules themselves**, and the plumbing to pick them. Sessions 06 and 07.
7. **A headless skeleton would be a target in the wrong place.** `Golem.geometry.crownHeight` is
   fixed at build, and tactics v2, v3 and v4 aim between the crown and the shoulder, so after a
   decapitation every stone policy would swing at air above the skeleton. Session 07.

## Blunt beats bone: what the arithmetic says

Per-hit damage at 10 m/s, before `healthScale`, for a perfectly aligned blade (1.30 kg, priced at
`cutJoulesPerDamage` 34.82 J) and the stone mace (2.92 kg, `crushJoulesPerDamage` 115.24 J):

| Struck part | Mass kg | Armour (cut / crush) | Blade | Mace | Mace / blade |
| --- | --- | --- | --- | --- | --- |
| stone forearm | 1.43 | 0 / 0 | 0.976 | 0.415 | 0.43 |
| stone trunk core | 22.52 | 0.10 / 0.10 | 1.588 | 1.008 | 0.63 |
| human forearm | 2.00 | 0.35 / 0.35 | 0.735 | 0.335 | 0.45 |
| human trunk core | 37.00 | 0.50 / 0.50 | 0.902 | 0.586 | 0.65 |
| skeleton forearm, flat armour 0 | 0.40 | 0 / 0 | 0.440 | 0.153 | **0.35** |
| skeleton forearm, by kind | 0.40 | 0.50 / 0 | 0.220 | 0.153 | **0.69** |
| skeleton ribcage, by kind | 5.00 | 0.50 / 0 | 0.741 | 0.799 | **1.08** |

Two things fall out of it:

- **Light bones make blunt relatively worse, not better.** Reduced mass saturates at the lighter
  of the two bodies, so a heavy mace gains less over a light blade the lighter the target. With
  one armour number the skeleton would reward swords more than flesh does (0.35 against 0.45).
- **Armour by kind fixes it with one table.** Cut 0.5 and crush 0 put the mace at 0.69 of the
  blade on a skeleton limb against 0.45 on a human one, about 1.5 times the relative value, and
  make it the better weapon outright on the ribcage. These are session 08's starting values, not
  its answers.

Weak joints are then **low health on the skeleton's limb pieces**, not a new rule: `severs`
already takes a limb off when its health is gone. A blade does about a quarter of its stone
damage to a 0.4 kg bone with cut armour 0.5, so a skeleton forearm at 20 to 25 health takes
about as many clean blade hits as a stone forearm at 100 (2 to 3). A mace needs half to two thirds
as many hits on that forearm as on a stone one (3 to 4, against about 6), though still more than
the blade needs on it. On limbs the change is relative; on the ribcage the mace is better
outright. Note that the club row severs (`severQuality` 0) but the fist, ram and plate never do.

## The invariant, and how it is checked

**No session before 08 may move a stone or a human body by one bit.** Session 01 adds
`tests/harness/body-fingerprint.mjs`, which runs fixed bouts across every named stone and human
build plus the module benches for every stone and human module, and hashes every limb's position,
rotation and health on every frame, with every hit report. Each session's verification is:

```powershell
# before the session's first edit, on the clean parent commit
node tests/harness/body-fingerprint.mjs --out .review/fp-before.json
# after the last edit
node tests/harness/body-fingerprint.mjs --out .review/fp-after.json --against .review/fp-before.json
```

If the baseline was forgotten, take it from a throwaway worktree of the parent commit, not from
a stash. `git stash` has refused mid-operation on a large uncommitted diff in this repo, which
puts the session's whole diff at risk.

```powershell
git worktree add --detach $env:TEMP\fp-base HEAD
cmd /c mklink /J $env:TEMP\fp-base\node_modules $PWD\node_modules   # or npm ci inside it
node $env:TEMP\fp-base\tests\harness\body-fingerprint.mjs --out .review/fp-before.json
cmd /c rmdir $env:TEMP\fp-base\node_modules    # the junction first: rmdir removes the link only
git worktree remove --force $env:TEMP\fp-base
```

Remove the junction before the worktree. A recursive delete that follows the junction would empty
the main tree's `node_modules`.

Session 01 has no parent with the harness in it, so it has no baseline to forget.

`--against` exits non-zero if any stone or human section moved or disappeared, and lists new
sections (skeleton ones, from session 06 on) without failing on them. `.review/` is gitignored.

What the fingerprint cannot see, and is checked otherwise: cosmetics (shell meshes carry no body,
so they never reach it; session 05 checks mesh names and materials directly), UI text, and the
research fingerprint in `research/fingerprint.mjs`, which hashes source and **changes on every
session by design** -- it marks stored policy ratings stale, which is expected and not a defect.

## Constants introduced

All in `src/golem/skeleton/body.ts` (new, session 06) unless noted. Masses are stated in
kilograms directly, as `humanoid/body.ts` does; `kg()` in `src/golem/config.ts` is for stone
geometry and is not exported.

- `SKELETON_ARMOUR` -- `{ cut: 0.5, thrust: 0.6, crush: 0, slap: 0 }`, on every skeleton part.
- `SKELETON_BIPED`, `SPINE`, `RIBCAGE`, `SKULL`, `SKELETAL_REACH`, `SKELETAL_WRIST`,
  `SKELETAL_FIST` -- spread from the stone tables, overriding size, mass, health, vitality weight,
  shell style, fatality and the torques that carry a lighter load.
- `ArmouredHit`, `ArmourByHit` and `Armour` types, and `armourAgainst` -- `src/scoring.ts`
  (session 02).
- `BODY_FAMILIES`, `isBodyFamily`, `FAMILY_LABEL`, `FAMILY_POLICY`, `CHAIN_FAMILY` and
  `BODY_MODULE_FAMILY` -- `src/golem/family.ts`; `FAMILY_SETUP` -- `src/golem/family-setup.ts`
  (session 03). `ARMED_SETUP` joins it in session 07.
- `coreFatal` on `TorsoTuning`, `headFatal` on `HEAD_NECK`, `wristChainFrom` and
  `WristChainOptions` (session 04).
- `ShellLook` and the `LIMB_SHELL` / `JOINT_SHELL` tables -- `src/golem/effectors/shell.ts`, plus
  `look: "carved"` on each stone table; the bone shells in `src/golem/bone-shells.ts` (session 05).
- `skeletonSetup` -- `src/golem/skeleton/presets.ts` (session 06), and `SKELETON_BUILDS` beside it
  (session 07).
- `headlessCrown` in `Golem`'s geometry record (session 07).

## Decisions made here that the owner may want to reverse

- **The skeletal arm keeps the stone arm's link lengths** (0.42 m upper, 0.36 m fore) and is thin
  and light instead. Every terminal's reach and joint limits (`TERMINAL_MAUL.limits`,
  `TERMINAL_PLATE.limits`, `TERMINAL_WHIP.limits` ...) were derived from those lengths, and
  `buildArmCore` narrows without checking that a floor stays under its ceiling, so a shorter arm
  would need every terminal's limits re-derived through the chain's `fitTerminal`. Kept out of
  this plan; a skeleton with longish arms reads as a skeleton.
- **The skeleton holds the stone weapons.** Only the fist is refitted (a bone fist). A lighter
  weapon set, as the human family has, is one `fitTerminal` table away if wanted.
- **Every skeleton part gets the same armour table.** Bone is bone. Per-part tables (a ribcage
  that thrusts slip through, say) are a later tuning option, not a mechanism change.
- **Thin colliders are the limbs and the neck, not the trunk.** The ribcage collider is one solid
  0.30 x 0.38 x 0.20 box, so a blade drawn passing between two ribs still strikes it. That is the
  simplest version, and the owner wants to try it first and see whether it is a problem in play
  (session 07 watches for it). Open ribs would be a compound collider of several bars, a new body
  shape, and a follow-up only if the box looks wrong.
- **The skeleton's default policy is `golem-duelist`**, the stone one. Its arms are stone-shaped
  wrist chains, so every golem policy applies. A skeleton-specific policy is out of scope.
- **Skeletons are playable, not enemies.** The arena setup screen offers them through the
  Skeleton family button (session 06). `PLAYABLE_BUILDS` adds them to the dungeon hero picker
  (session 07). They stay out of `NAMED_BUILDS`, which feeds waves, dungeon enemies and the
  research pools; `tests/research.test.mjs` pins the size of the training pool drawn from it.
- **No rename of "golem".** The framework name is still open ("vessel" was suggested); a rename
  touches about 4,900 occurrences in 171 files and is its own change.

## Risks this plan measures rather than assumes

- **Thin colliders at 240 Hz.** A 22 mm bone against a 30 m/s blade tip moves 125 mm per solver
  step. Hit rates against the skeleton are measured in session 08; the owner accepted a harder
  target, but not one that cannot be hit.
- **A light body falls to one blow.** This is the risk most likely to need an owner decision. The
  fall ledger in `src/supported-locomotion-state.ts` divides each blow's shove by the supported
  mass, and the biped falls at 0.021 m/s of specific impulse. For the stone default (about 89 kg)
  that is 1.87 N.s. For the skeleton (about 23 kg) it is 0.49 N.s, and one clean cut at 10 m/s
  shoves 0.72. So a stone golem goes down to about three quick blows and a skeleton to one. The
  skeleton-only lever is its own `braceCapacityMultiplier` in `SKELETON_BIPED`. Session 06
  measures the line and session 08 takes the choice to the owner.
- **Light parts are flung.** The physical impulse in `Combat` (`speed * 0.11 * (1.35 - quality *
  0.7)` N.s) is not scaled by the struck part's mass, so a 0.4 kg bone takes about 3.6 times the
  velocity change of a 1.43 kg stone forearm. That is shared code and stays untouched; session 08
  measures what it does to a skeleton's guard and reports rather than fixes.
- **A body a quarter of the stone golem's mass.** Stone torques on light links can buzz; session
  06 benches every skeleton module and derives the neck and waist torques from the mass they
  carry, which is the precedent `HEAD_NECK.pitchTorque`'s own comment sets.
- **`jointInertiaFloor` dominates the arm.** `CHAIN_REACH.jointInertiaFloor` (0.3 kg m^2) is
  larger than a stone upper arm's own inertia, so thinner, lighter bones change the arm's
  rotational response very little. That is why the skeletal arm can start from stone torques.

## Out of scope

Renaming the framework; dust, chips or any hit effect for bone (`src/damage-feedback.ts` is one
stone-burst for every body); a bone-specific wear shader (session 05 leaves bone without the
procedural plugin, so it shows no wear cracks); skeleton enemies in waves or dungeon floors;
shorter skeletal arms.

## Commands, every session

```powershell
npm test
npm run check
npm run build
```

Plus the fingerprint comparison above from session 02 on. Do not leave a dev server running.
Commit each session as it lands. Line endings: this clone has `core.autocrlf = true`; gate the
commit on `git diff --numstat` matching `git diff --ignore-cr-at-eol --numstat`.
