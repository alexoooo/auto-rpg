# Session 18 -- adversarial Construct/Warrior balance curriculum

## Status -- paused at 0/8 until supported locomotion lands (2026-08-30)

Make the separately selectable Twinblade Effigy earn its durability through control. The same
physical blueprint faces the real Warrior `duelist` in two modes: a posture-only idle Mind and the
active combat Mind. Reduce whole-construct durability until the idle body loses every frozen,
mirrored cell; improve the active Mind until it wins; then repeat at the next declared durability
rung. A victory without a witnessed physical action sequence is a failed session even if the
scoreboard says Construct.

The raw-gait curriculum and evidence checker below are implemented, but no Twinblade cell won.
The later visible clinch-heap finding invalidates further timing/aim tuning on that locomotion
foundation. Sessions 20--24 in `construct-forge-00-overview.md` must land first; then this exact
corpus is re-run with new saved control/program identities and an explicitly assisted-support
qualifier. The old 0/8 result remains historical evidence and is not copied forward.

The committed chassis is human-scale rather than giant-scale: `HUMANOID_SCALE = 0.75` produces a
1.8995 m crown. `constructStandingThresholds` remains profile-derived, and
`a_smaller_construct_profile_is_not_judged_by_a_hidden_human_height_floor` must continue accepting
a synthetic 0.90 m profile. A later chassis may therefore be smaller without weakening this
session's identical-body comparison.

## Landable implementation

1. `scripts/construct-warrior-curriculum.mjs` owns the four frozen FNV seeds, both construct
   sides, the 30-second real-Havok cells and the declared durability ladder
   `[0.5, 0.25, 0.1, 0.05, 0.02]`. `withDurabilityMultiplier` scales every part, joint and module
   health while preserving armour, geometry, mass, control and program. This is a measured ladder,
   not a binary-search domain: the 0.02 idle body may survive more often after early severance
   removes collision surfaces.
2. `src/construct/twinblade-combat.ts` owns the physical tactic. Every phase writes only declared
   motors. Sensor facts may select and re-plan a trajectory; no collision callback may advance a
   controller phase, move a body, apply damage or manufacture success.
3. `scripts/construct-warrior-bout.mjs` records the action-start facts, phase changes, exact module
   attribution, target vitality before/after, weapon damage scale, physical effector travel,
   support/posture and verdict tail. Its acceptance must witness one ordered attempt rather than
   infer competence from aggregate damage. `scripts/construct-warrior-curriculum.mjs` retains that
   detailed bout beside each cell, reconstructs the exact seed x side x mode matrix and counts a
   qualified win only when the tactic-specific physical checker accepts it.
4. `tests/construct-warrior-curriculum.test.mjs` pins identical active/idle body digests, whole-body
   scaling, the non-monotonic ladder and every threshold. `tests/construct-warrior-evidence.test.mjs`
   mutation-proves each ordered physical-evidence clause. Controller tests in
   `tests/construct-twinblade-policy.test.mjs` pin sensor-to-motor behavior separately from the
   physical corpus.

## Acceptance

- The idle posture-only Twinblade dies in 8/8 frozen cells at the current rung.
- The active Twinblade kills the Warrior in both mirrored sides and across the declared seed
  corpus before any lower durability rung is attempted. Active acceptance numbers remain zero
  until a real corpus establishes them; they are never filled from a desired outcome.
- One qualifying Twinblade victory contains, in one attempt, its `started` event, an unblocked
  first torso cut by the blocker-side sword, an opposite-effector fatal unblocked torso cut and
  `completed`, in time order. The start-frame equipment facts decide which effector owns each role;
  vitality is continuous between the two rows and no intervening damage may manufacture the kill.
- The qualifying attempt uses both ordinary 1.15-scale swords, commands and moves both effectors
  materially, remains supported and standing for the action, is perceived as a mounted threat at
  start and both cuts, and contains no `dual-cut` cancellation, refusal or failure.
- A verdict freezes both vitality values and stops the defeated body's Mind and motors. At most
  three seconds of tail may let the already-active winning action publish completion; tail
  collisions cannot add damage or create the qualifying contacts.
- Static timing, pose or aim sweeps that improve only one mirrored side are recorded as rejected,
  not selected.

No root-workspace golden hash applies to this standalone experiment. Saved-construct digests may
move only when their owned blueprint, control graph, program or sensor contract actually moves;
the curriculum records the exact digest used rather than copying a wished-for constant.

## Verification

~~~powershell
node --test tests/construct-warrior-curriculum.test.mjs tests/construct-warrior-evidence.test.mjs tests/construct-twinblade-policy.test.mjs tests/construct-twinblade.test.mjs
node scripts/construct-warrior-curriculum.mjs --durability-ladder
node scripts/construct-warrior-curriculum.mjs
npm test
npm run check
npm run build
~~~
