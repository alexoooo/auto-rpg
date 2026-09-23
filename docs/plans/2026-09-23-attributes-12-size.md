# Attributes 12 -- size

Size scales every length of the body by `s`, and the physics follows. This is the largest session
of the set and may split in two: the laws and the trunk first, then the arms. It follows the
per-stat protocol in `-00-overview.md`. The scaling argument is in the analysis doc's "Size"
section.

## The laws

Under geometric similarity at constant density:

| Quantity | Law |
| --- | --- |
| lengths, radii, socket offsets, reach, footprint | s |
| mass | s^3 (times weight, session 11) |
| rotational inertia | s^5, which follows from mass and geometry in the solver, never written |
| torques that hold a pose against gravity | s^4 |
| forces for the same acceleration | s^3 |
| linear rates and speeds (carrier, anchor) | sqrt(s) |
| angular rates (yaw, wrist, joint targets) | 1 / sqrt(s) |
| durations (strides, dwell, rise) | sqrt(s) |
| dimensionless (ratios, fractions, armour, health scale) | 1 |

**Health has no physical law.** A part's health could scale with its cross-section (s^2) or its
volume (s^3). Toughness (session 09) is the separate stat for health, so size leaves health alone
at first. If the owner wants size to carry health too, that is their call. Put the question in the
report; do not decide it here.

## The mechanism

- **Declare a law for every field.** Every table a builder reads gains a `SIZE_LAWS` declaration
  beside it, mapping each numeric field to one law above. `scaleTable(table, laws, s, weight)` in
  `src/golem/attributes.ts` returns a scaled copy per build.
  - A field with no declared law is a **refusal at build**, not a silent 1. That is the ternary
    trap in AGENTS.md: a default branch is a silent substitution.
  - A test walks every declared table and asserts that every numeric field has a law, so a field
    added later without one goes red.
- **Modules first:**
  - the biped, and the wheel and multileg once session 03 has them taking tables;
  - `torsoModule`, `headModule` and `HEAD_RAM`;
  - `buildArmCore` / `wristChainFrom` and the skeletal reach;
  - the pitch and none chains, after session 10's refactor.
- **Equipment keeps its own size.** Terminal tables are not scaled. A terminal's metre `limits` are
  fitted onto a scaled arm the way `onBoneArm` (`src/golem/skeleton/body.ts`) already fits a
  terminal to a shorter arm. That is the precedent to generalise, not a second mechanism.
- **Refused for now.** `golemSetupRefusal` refuses `size ≠ 1` on any module without laws, with a
  message naming the module. That covers:
  - the human family, whose skin is a fixed-size `warrior.glb`;
  - the anatomical arm, whose lengths are literals and live in `kinematics.ts` `ARM_LENGTHS`;
  - anything not yet declared.

  The UI disables the size slider on such a build and says why.
- **Shells and looks.** Shells take their dimensions from the tables, so they follow. The forge
  appearance fits each part's bounding box (`src/forge-models.ts`), so it follows too. Check both
  by eye at 0.8 and 1.25.
- **`defaultGolemDimensions` is a second copy of the arithmetic**, gated by
  `tests/golem-arena.test.mjs`. It must take `s`, or be retired in favour of the built body's
  geometry. It must not drift.

## Constants measured at today's size

These are re-derived on the bench at both ends, not trusted to their law:

- `TERMINAL_WHIP.lashReach`: equipment, so not scaled, but the whip on a scaled arm is re-benched.
- The footprint radius and height. These are the collision radius and the dungeon's path radius
  (`DungeonActor.radius`), so check that a large hero still fits the dungeon's corridors.
- The carrier limits and `braceCapacityMultiplier`.
- `anchorRate` and the `ANCHOR_DRIVE` forces. The force derivation is "850 N per the Warrior's
  6.50 kg of arm and sword, times what the bench prints". Run it again with the scaled arm's
  `massKg`.
- `STROKE_INERTIA.ref` stays pinned to the default arm. A scaled arm reads a scaled inertia and a
  retimed stroke, which is the intended consequence.
- Mind-side geometry is **not** scaled in this pass: `GOLEM_TACTICS.circleMin`/`circleMax`
  (1.3 m, 2.6 m) and the stroke shapes. The sweep measures what that costs.

## Bench (Node harness) at 0.8 and 1.25

- published reach and driven mass;
- the stroke bench: stray, lag and peak tip speed;
- the shove threshold;
- top speed;
- rest-pose ripple;
- a clearance check: no plate or blade inside its own trunk across a driven sweep, measured from
  `mesh.position` against the trunk box, as the plate once was. A collision filter forbids the
  evidence, so it has to be measured.

Widen past 0.8–1.25 only after both ends pass, and write the table that justified the widening.

## Sweep

Run the protocol levels within the bench's range. Read the per-mind split and the reach
difference: a larger body out-reaches the minds' fixed circling band.

## Done when

- Size is `live` on every module that declares laws, and refused by name on every module that does
  not.
- The field-coverage test holds.
- Both ends pass the bench and the eye check, and the tables are recorded.
- The fingerprint reads all `same` at 1.00.
