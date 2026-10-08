# Man's hands on the human family

## Outcome and owner decisions

Standing up and punching have been hard. One suspected cause was the body's contact layout: the
Warrior's hand is a capsule, its foot a box fitted to a boot, and it has no toe joint. Phase A
tested a fitted palm and fist, a barefoot sole and a passive toe with diagnostics, and failed its
gate. The owner chose the gate's second option, applied to the human family itself, so that the
body layer is settled once and the controller work that follows does not recalibrate for body
changes:

- Each workshop human's hands take their fitted contact geometry from their own skin: the open
  pose is the palm hull, the fist pose the fist hull, with the fist's `strike` point on its
  surface. The grip pose and the shape a held item seats against stay today's capsules, so club
  holding and its grip frame are unchanged.
- Feet stay the boot box, with no toe joint.
- The crypt skeleton keeps its own hands, from its own art.
- A hand is one rigid body in every pose, with today's mass properties and surface stiffness.
  Balance assistance is 0 everywhere. No strength changes.

The punch measurement that informed the choice is
[Man's hands on the punch](../reference/man-punch.md).

Left to the owner at [B4](#b4-the-bare-hand-blow-closes-the-fist): whether the game's own bare-hand
blow closes the hand's collider into the fist, as the renderer already draws it.

## Phase A result

Phase A landed (`2a111961`, `b43619f6`, `15e820ce`, `2f46395d`) and changed no runtime
behavior. Its records:

- [Man's contact anatomy](../reference/man-anatomy.md): the geometry artifact
  `assets/humanoid/man-contact-geometry.json`, measured from the Warrior's skin by
  `scripts/core/man-envelope.mjs`.
- [Man's postures](../reference/man-postures.md): the statics on the boot, the bare foot and the
  passive toe, and the installed holds and transfer with the palm and the bare foot.
- [Man's passive toes](../reference/man-passive-toes.md): the toe joint on the game's solver.

Gate A failed. No posture the boot fails holds on the toe, and the bare foot loses rows, because
it is a smaller base than the boot box. The passive toe fails on the solver at 120 and 480 Hz.
The palm bears on more points, spread wider, than the capsule. On the punch, the fist hull
strikes on a real surface of the fist and delivers more impulse than the capsule; the open palm
changes nothing, because today's game blow lands with the open hand's fingertips on either
geometry.

## Phase B: the hands in the core

Phase B changes shared runtime. Each chunk lands green and is committed on its own.

Constraints carried into every chunk:

- **A hand's `shape` stays today's open capsule.** It is what a held item seats against
  (`rigidOf` builds a held compound from it, `handShapeAt` returns it for a held grip) and what
  `grip.ts` reads. The empty hand's colliders are its poses (`handPoses`).
- Hand geometry is data on the figure, by model. A figure without fitted hands builds today's
  capsule poses. No reader names a model.
- Every number is a sourced `Quantity`: hull points and patch centres come from their artifact
  through `sourced` and the fit scale through `derive`, as `research/man-hands.mjs` does.

### B0. The behavior lock

Before B1, take a pinned runtime lock from a `git archive` snapshot of the commit B1 starts from:

```powershell
node scripts/fingerprint.mjs --workers 12 --json research/runs/man-hands/lock-before.json
```

B1 and B2 must compare equal to it (`--compare`). B3 moves every case that builds a workshop
human. Take `research/runs/man-hands/lock-after.json` at B3's commit, and hold B4 and B5 to it,
or to B4's own lock if B4 lands.

### B1. Hand artifacts for both workshop humans

- Add `scripts/core/hand-envelope.mjs`, holding the hand measurement now in `man-envelope.mjs`'s
  `hand`, with the model as an argument: palm hull and patch, fist hull, `knuckles`, and
  `strike` where the wrist-to-knuckle line leaves the fist hull. It adds `palm`: the patch
  outline's centroid on its plane, where an open hand bears. It reads `workshop-rogue`'s GLB as
  well as `workshop-fighter`'s, since both share the rig and the `base__skin` mesh.
  `man-envelope.mjs` imports `hand` from it and its artifact is unchanged.
- `node scripts/core/hand-envelope.mjs --write` writes `assets/humanoid/<model>-hands.json` for
  both models, in the body frame at the authored size, rounded to 0.1 mm.
- `SOURCES` (`src/core/sources.ts`): `workshop-fighter-hands` and `workshop-rogue-hands`.
- Test `tests/hand-envelope.test.mjs`: the artifacts are what the script measures; left mirrors
  right; each hull is convex; `strike` lies on the fist hull's surface (within 0.1 mm) and
  `knuckles` inside it; `palm` lies on the open hull's patch face; each model's `knuckles` at
  the fit scale equal its figure's (`humanSegments`) within 0.1 mm.
- Document the rules in `docs/reference/man-anatomy.md`, renamed `docs/reference/hand-anatomy.md`
  if the feet and toes sections move out, with the numbers for both models.

No runtime change. Checks: the new test, `tests/man-envelope.test.mjs`, `npm run check`, and the
`src/` trio (`core-boundary`, `exports`, `comments`).

### B2. Pose-correct construction and readers

Bit-identical against `lock-before.json`. Every change here is a no-op while every pose is a
capsule and `shape` equals the open pose.

- `src/core/build/build-body.ts` (`buildSegment`): build the physical body from the initial
  pose's rigid configuration (`poses[initial].rigid`), not from `rigidOf`'s, so the collider
  matches `handPose.applied` from the first step.
- `src/core/mind/rise/limbs.ts` (`endOf`, `endLimb`): a hull pose bears where its lows do. Its
  corners within `DOWN` of the ground bear at their mean, otherwise at the lowest corner, with a
  radius of 0, through `lowsOf` (`src/core/control/ground.ts`). For two capsule ends this is
  today's rule. Keep the capsule path's arithmetic and order as it is, so the lock holds.
  `src/core/mind/rise/stages.ts` (`onEnd`) accepts a hand whose poses are hulls.
- `src/render/body-shapes.ts`: draw a posed hand from its applied pose, not `spec.shape`, and
  swap to a hull mesh without reading a null `rotationQuaternion` (a hull mesh needs one set
  when it is made).
- `src/core/control/whole-body.ts`: take each hand's lift-off radius from its applied pose at
  each read, not once at construction.
- Tests, each on a spec carrying B1's hulls as a fixture (`tests/fixtures/`), not yet the game's:
  - `tests/core-hand-poses.test.mjs`: unloaded swap between hulls, a blocked swap deferred, mass
    properties and velocities unchanged, replay in a fresh world, and the first step's collider
    is the open hull;
  - `tests/core-rise.test.mjs`: an end limb on a palm hull bears at its corners' mean when they
    are down;
  - the render test in `tests/core-hand-poses.test.mjs` swaps to and from a hull.

Checks: `npm test`, `npm run check`, `npm run build`, and `scripts/fingerprint.mjs --compare
research/runs/man-hands/lock-before.json`, which must report no difference.

### B3. The workshop humans' hands

- `src/core/human/figure.ts`: `HumanFigure` gains optional `hands`, per side `palm` (hull points,
  `palm` point) and `fist` (hull points, `strike`), each a sourced `Quantity`.
  `src/core/human/workshop.ts` fills it from `<model>-hands.json` at the fit scale;
  `src/core/human/skeleton.ts` leaves it out.
- `src/core/human/segments.ts` (`humanSegments`): with `figure.hands`, a hand's `handPoses` are
  `{ open: palm hull, fist: fist hull, grip: the capsule fist }`, `shape` stays the open capsule,
  and `points` gain `strike` from the artifact and `palm`. Without it, everything is as today.
- Delete `research/man-hands.mjs` and `punchStand`'s `hands` option once the game's spec carries
  the hulls. `tests/research-man-hands.test.mjs` becomes a case of `tests/core-human.test.mjs`.
- Tests in `tests/core-human.test.mjs`:
  - provenance (`specProvenanceFaults`) of both workshop specs;
  - the open and fist hulls clear the thigh and the trunk in the reference pose, measured
    geometrically;
  - `strike` is on the fist hull;
  - the skeleton's hands are unchanged.
  Update the tests that pin the capsule hand's poses (`tests/strike-pad.test.mjs`'s open-to-closed
  reach, and `tests/core-ground.test.mjs`'s lone hand) to read the poses they mean.
- Take `research/runs/man-hands/lock-after.json`. Every workshop case moves; the skeleton's
  stand cases must not.

Checks: the full gate below.

### B4. The bare-hand blow closes the fist

The owner's choice. Today no game controller closes the hand. A bare-hand blow aims the knuckles
(`aimOf`) and lands with the open hand's fingertips, about 9 cm past the knuckles, while the
renderer draws a fist (`src/render/strike-hands.ts`). With B3's palm, the fingers that strike are
straight.

If chosen: a bare hand closes for its strike cycle and aims `strike` in every combat skill set,
the part of `physicalFists` that is about the hand. The impact response stays as it is today
(`impactSeconds`, `impactTravel` and `normalAlignment` remain research settings). In
`src/core/skills/combat.ts`, `CombatExecution` splits into the hand's closing, which is on
whenever the hand is bare, and the optional impact response. `effector-feedback.ts` already
reads `strike` in the fist. Tests: `tests/core-combat-*.test.mjs` cases assert that a bare hand
is in `fist` during `swing` and `open` in guard, for both hands. Every bout's fingerprint moves:
take a new lock.

If not chosen, B4 is skipped and the record says the game strikes with the open hand.

### B5. Recalibrate once

Re-measure, on the built body, the records whose claims rest on the hand, and update them in
place with the harness commit:

- the force battery (`research/attack-force.mjs`): `docs/reference/attack-force.json.gz`,
  `docs/reference/trained-attack-force.md`;
- the punch calibration (`research/punch-calibration.mjs`): `docs/reference/punch-calibration.md`
  and its JSON;
- the recovery cycle: `docs/reference/recovery-cycle.md` and its JSON, since the hands bear in
  the rise;
- the installed holds (`research/control-foundation.mjs --suite posture-hold`):
  `docs/reference/posture-hold.md` and its JSON;
- the presets against Classic: `docs/reference/controller-presets.md` and its JSON.

A record that cites a figure measured before B3 and is not re-measured keeps its harness commit,
which already dates it. Update `docs/architecture.md` (the hand's poses and where their geometry
comes from) and `docs/roadmap.md`. Then delete this plan.

## Landing each chunk

Phase B chunks change shared runtime:

```powershell
npm test
npm run check
npm run build
node scripts/fingerprint.mjs --workers 12 --compare <lock.json>
git diff --numstat
git diff --ignore-cr-at-eol --numstat
```

The two numstats must be equal. Re-run a dropped test count on a quiet machine. Stage and commit
only the chunk's files. If a gate fails, keep the failure in its record. Do not raise strength,
add assistance, or reduce a task to turn it green.
