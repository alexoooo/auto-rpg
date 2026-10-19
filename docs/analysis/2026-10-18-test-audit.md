# The test suite against the testing plan

Step 1 of the [testing plan](../plans/2026-10-18-testing-strategy.md): what each of the 260 test
files protects, its group, and what step 2 should do with it. Every file was read with the code
it imports; no test was run for this audit. Groups are the plan's: **contract** (software),
**floor** (the game still works, whatever controller runs it), **capability** (how well a
controller does), **policy** (source rules) and **research** (contracts of research code).

## What has been going red, and why

Three recent clean-ups had one cause. When the run's legs landed, about forty slow tests went red;
twenty were re-seeded or restated and nineteen became `todo` (`d752b1aa`). When the discrete
action protocol landed, bout bars were rewritten as properties (`0bbe519d`) and four slow tests
failing on main were removed as noise (`05d7eeea`). In each, a controller or body change moved a
capability number (a fall count, a pace, blows landed, a phase sequence, what a seed does) and a
test pinned to it failed with nothing broken. The fast tier's one red case today,
`core-strike-skill`'s "the_repertoires_club_blow_follows_a_head_that_moved_across_under_it", is
the same: it asks that the stance be back in `stand` when the watch ends (`stood`) after
catching the blow, and the stance now catches it in four or eight steps. The steering it means to
protect is held exactly by "a_recipe_thrown_turns_the_heading_after_its_target...".

## What the suite is

- Most files, about 190, are contracts or policy with exact or physical-law assertions, many with a
  negative control: the core's algebra and solvers, the engine, state and forks, senses, rules,
  parts and configs, the options fighter's logic, assets, the dungeon generator, the Lab and Arena
  screens, and the source rules. These stay as they are.
- About 70 files hold capability, alone or mixed with contracts. Of these, about 30 are in the
  fast tier (listed below) and gate every change.
- 76 `todo` markers in 45 files (more cases, since some are parametrised). Their causes are four,
  and only one case hides a broken contract:
  - the bare fist's striking surface is about 9 cm short of the open capsule its recipes were
    tuned on (the `combatStrike` files, `research-punch-calibration`, `core-ground-combat`,
    `lab-targets`, `research-blow`, `arena-control-cycle`, `core-combat-defense`, `behaviours`);
  - the open hand now bears on its palm's measured hull (`core-rise` ×8, `core-bar`,
    `core-defense`, `core-posture-hold`, `core-support-entry`, `research-posture`, `research-rise`);
  - the run's legs (`lab-research-rise`, `research-recovery-native`, `research-recovery-feedback`,
    `recovery-transfer`, `crypt-core`, `lab-actor`, `punch-stability`, `core-front-kicks`,
    `action-native-path`);
  - stale saved worlds and records (below).

  The one contract defect behind a `todo` is `crypt-core`'s "the_dead_are_held_once_the_party_has
  _walked_off...": a held body's quaternion drifts about 7.5e-9 a step.

## Capability in the fast tier

These gate every change. Each becomes a floor check, a property, or leaves the gate as an
experimental measurement.

| File | What it pins | Step 2 |
|---|---|---|
| `lab-locomotion` | all seven cases: rounds, the square, random destinations; paces, distances, touchdowns, laps | floor: no fall in 10 s, moves the way asked, the next order answered; the rest experimental |
| `lab-stance` | a 55 N s (Warrior) and 35 N s (Rogue) shove caught with a step, heading within 0.02 rad, `dx > 0.6` m | floor: stands, walks the way it faces, turns only while walking, stops |
| `simbicon`, `walk-run` | 5 m in under 12 s with a step count, sideways and back above a pace, a 10 m run, the brake's time | one scenario table over both walks; floor: moves the way asked more than across, does not fall, stops; hold, scaling and faults stay |
| `stride` | 5 m within 15 s, a stop within 0.6 m, an arm-swing correlation above 0.5 | floor for the walk; the correlation experimental |
| `run` | at least six landed flights on the spot | floor: no fall, a flight among its phases |
| `kick-walking` | the exact phases, a gait-speed band, a completed kick; up to 26 s | floor: the kick ends (completed or cancelled), its reservations are empty, the gait resumes, not down |
| `move` | three physical cases (one uses the club because empty-handed it fell) | property: the gait changes once, at the rule's distance, between steps; not down |
| `lab-loadout` | eight strides in 5 s with a club in each hand | floor: moved forward, never fell |
| `core-orders` | "a_body_walks_one_way_while_it_faces_another": facing bands from one stand reading | property: more along the walk than across, the heading kept |
| `core-skeleton` | the stance within 1 cm, the walk at its envelope's pace | floor: upright after 4 s, a walk order moves it |
| `straight-punch` | at least two wounding punches in 5 s | experimental; the settings faults stay |
| `core-blows` | the club lands on a skeleton's head within 12 s above 10 m/s and 50 J | a scripted swing for the record contract; the landing experimental |
| `core-rules` | a live `evaluateBlow` at 960 Hz must hit the head standing | price a fixed blow; the live landing experimental |
| `core-strike-skill` | the red steer case (above) | experimental, or `turned.done > unturned.done` with no fall |
| `research-blow` | `stood: true` after a landed and an empty blow | score synthetic records; one physical land/no-land floor without `stood` |
| `behaviours` | the gap opened 0.8 m in 4 s; a kick committed within 8 s | the gap moves the right way; no non-foot effector committed |
| `ground-step-up` | the half-kneeling Warrior stands within 4.5 s: seed 2, the exact attempts and phase keys | floor: stands within the rise cap, unassisted |
| `ground-survival` | the roll goes `'left'`, the kick meets with `foot.right` | fork equality and the handover stay; the rest experimental |
| `recovery-transfer` | release within 3 s, an exact bearing set; the right hand's start is already stale | property: no hand lifts while the centre is outside; a start not outside is an invalid fixture |
| `core-ground` | "a shoved body reads down, lying" passes only because the stance fails a 120 N s shove | read down on a forced fall; the 20 N s control is a floor |
| `lab-mind-log` | 120 N s fells and 20 N s does not; a 20 s run's exact notes | property: the log records who has the body, whatever happens |
| `core-touches` | twenty strides in a 10 s walk; a self-touch from the skeleton's guard pose | footfalls equal touches; a scripted self-contact |
| `action-native-path` | completion by a deadline | the lifecycle, any ending |
| `native-action-cycles` | kick, whole, low and low-wide complete their cycle, not down | keep as a floor; drop the exact phase list |
| `smoke` | wounds both sides, nobody down | floor (below); wounding experimental |
| `options-bout` | the same shape as `smoke` for the Classic matchup | merge into `smoke` as a second recipe |

Milder, kept with a note: `lab-blow`'s `done > 0.5`, `lab-ground`'s `end !== 'cap'`,
`core-sensed-bounds`' 200 N s premise, `recipe-actions`' `committedFrames >= 40`, `core-direct`'s
elbow reach, `core-environment`'s reach completion, `straight-actions`, `lab-attack`'s approach
phase, `core-contact-tracking`'s fours hold, `combination`'s second-drive case (give it an
explicit offset).

## Capability in the slow tier

The same pattern, gating in CI only. Each splits into its contract, kept, and its measurement,
experimental:

- **Strikes:** `core-combat-skill`, `-elbow`, `-arm`, `-uppercut`, `-range`, `-low-workspace`
  (all `todo`), `-openings`, `-overlap`, `core-point-strike` (18 to 36 cells that must all hit),
  `core-front-kicks`, `arena-kicks`, `punch-foundation`, `punch-stability`,
  `research-punch-calibration`, `lab-targets`. The five `combatStrike` files pin contact counts
  and closing speeds of one strike runner; one experimental measurement can replace them, with
  their pure path and tuning checks gathered in one fast file.
- **Stance and walk:** `core-stance` (exact phases, sub-cm drift, shove limits), `core-stance-
  envelope` (re-measures stored asset tables; six stale-turn `todo`s), `core-combat-locomotion`
  (asserts standing at 0.5 m/s, where `core-combat-turn-startup` has the same turn as `todo`),
  `core-support-transition`.
- **Rise and recovery:** `core-rise`, `core-supported-pose`, `core-supported-rise`,
  `core-support-pivot`, `core-support-load`, `reptile-recovery`, `research-rise`,
  `lab-research-rise` (all `todo`), `arena-control-cycle`, `arena-gameplay-physics`.
- **Bouts and screens:** `arena-combat` (the Brawler pair's blow counts), `arena-core` (wounds both
  ways, `blows: 0` after a shove, phase names `"stand up: brace"` and `"lie"`), `arena-controls`
  (the stage name and a 4 s countdown), `lab-actor` (110 N s fells unaided, held at 25 %),
  `lab-routine` (seed 11, exact endings, at most 7.3 s), `lab-sound` (a logging contract behind
  four capability preconditions), `core-fighter`, `core-guard` (3 cm in 0.3 s), `core-sub-mind`,
  `dungeon-party` (party control is parked), `dungeon-hearing`, `audio-bodies`, `core-assist`
  ("a_pull_the_soles_cannot_hold..."), `core-reptile` (the trot's pace), `reptile-combat`,
  `research-control-foundation`.

## Fixtures

- **Raw saved worlds**: done. A save names the world it was made in and a world built otherwise
  refuses it. `core-active-contact` finds its case in a fall it plays; the fours fixture is a placed
  pose (`FOURS`, `tests/fixtures/fours-support.mjs`); the kneel of `core-support-load` is placed too,
  and loses its toe and hand within a few steps, so that file is a measurement
  (`core-support-load-capability`). `actual-rear-sole-world.bin` (`core-supported-rise`'s two
  `todo`s) is refused until those cases have a recipe.
- **Stored records** of an earlier body: `research-native-posture`'s half-kneel tape (the open
  capsule), `research-recovery-feedback`'s witness (the old legs), `CLUB.readings` (capsule hands)
  read by `core-strike-skill`, and the stance and stride turn tables `core-stance-envelope`
  re-measures.
- **Fork windows pinned to controller timelines.** `core-fork` hard-codes save windows
  (`STRIKER`'s step ranges, the rise's exact stages, stride counts); `arena-fork` needs Classic to
  win within a minute and a cover to fire; the fork cases of `arena-kicks`, `core-combat-range`,
  `core-combat-uppercut`, `core-combat-openings` and `core-combat-overlap` wait for a skill to
  fire. The fork contract (`assertForks`, every state field sorted) is sound. Find each window
  with a scout pass (as `arena-fork` does for the cover), cap the bout (`capSeconds`) so a verdict
  never depends on a mind's strength, and report "the fixture never reached its phase" as an
  invalid fixture, apart from a fork failure.

## Contracts held only behind capability

Each is in a case that cannot run until a controller succeeds, so it protects nothing today:

- `core-combat-combinations`: a follow-up is admitted only after contact (`todo`). Use a placed
  target that guarantees contact, with a negative control.
- `core-supported-pose`: fork equality during the fold (`todo`).
- `research-recovery-environment`: a recorded action tape replays exactly (`todo`); replay needs
  no success.
- `core-rise`: the ground a rise reads and the shin's bearing need fours reached; use a placed pose.
- `core-ground-combat`: wholly `todo`; its fork during the approach and the stand order need no
  admitted swing.
- `research-stand-up-acceptance`: its own negative control (an assisted action is rejected) no
  longer fires, since the push no longer fells the body at Balance 100.
- `crypt-core`: the held body's quaternion drift (above).

## Pure tests in the slow tier

Slow only by where they sit, so they gate in CI alone: the link, tape and key cases of
`arena-core`; `arena-controls`' link tests; `arena-combat`'s three scoring units; the `levelsOf`
and `stirs` cases of `core-levels`; five of `hand-presentation`'s six; the rule and asset-reading
cases of `core-stance-envelope`; `research-rise`'s `risenAt`; `lab-targets`' draws and dummy
specs; the pure cases of `core-combat-defense`, `-lateral`, `-turn-startup`, `core-point-strike`
and `core-motion`; `core-human` (spec only); `crypt-detail` and most of `reptile-integration`.
`lab-scenarios` round-trips a full cartesian product of the Lab's choices and `crypt-sight` 300k
cells: a sampled sweep makes both fast.

## Pinned to implementation detail

Red on a legitimate rewrite with no contract broken: stage names and the reason string in
`kick-actions`, stage names in `whole-body-actions` and `arena-control-cycle`'s cancel, the phase
strings `"stand up: brace"` and `"recovery: rise"` (`arena-core`, `arena-controls`, `lab-actor`),
the vendored revision `adapter-11` in `punch-mass-audit`, a Rapier panic string in
`research-joint-shapes`, `dungeon-dressing`'s collider sha256 (compare visuals on against visuals
off instead). Asset hashes and inventories (`robot-skin`, `arena`, `dungeon-reference`) are
recorded-asset contracts with controls and stay.

## Duplicates

- `simbicon` and `walk-run`: one scenario list written twice; one table over the implementation.
- `lab-stance`, `core-stance` and `lab-loadout`'s last case: stand, walk and stop three times.
- `options-bout` and `smoke`; `arena-core`'s "runs to its verdict" and `smoke`.
- `arena-gameplay-physics`' `todo`s and `arena-control-cycle`'s: the same cycles.
- `treeFaults(PRESETS)` in `core-controllers` and `core-parts`.
- `core-hand-poses`' hull and non-hull twins (fork, blocked opening).
- `character-lab` and `character-motion`; `core-collision`'s runner case and
  `research-control-foundation`; `research-solvers` and `core-collision`.
- `lab-research-rise` (all `todo`) and `research-rise`; `core-fork`'s hand-back mid-step and
  `core-sub-mind`'s.
- `punch-foundation`, `punch-stability` and `research-punch-calibration` (one pad instrument).

## Research code read only by its test

Retire with its experiment when that closes: `research/stand-up-qualification.mjs`,
`stand-up-detached-dynamics.mjs`, `stand-up-tracking-policy.mjs`, `stand-up-contact-model.mjs`,
`stand-up-foot-design.mjs` (with `docs/analysis/2026-10-11-stand-up-planning.md`),
`stand-up-beam.mjs`, `punch-stability.mjs`, `reptile-motion.mjs`, and the search-config pin of
`rising-search.mjs` in `ground-techniques`. `predictPointContacts`
(`src/core/build/contact-step.ts`) is core code with no game reader. The toe cases of
`research-posture` test the toe joint the body does not have.

## The floor

Built from cases that exist, with bars far below today's capability:

- **A bout** (`smoke`, with `options-bout` as a second recipe): runs its seconds with every state
  finite and no body over a speed bound, plays the same twice, an order changes where the
  commanded body is and the next order is answered. A capped bout reaches a verdict.
- **Standing**: each human and the skeleton, unpushed, upright after 4 s (`core-skeleton`,
  `lab-stance`, `arena-core`'s turn-to-foe, `lab-actor`'s guard); a 20 N s shove leaves it
  standing (`core-ground`'s control); a weak gust leaves it up (`lab-wind`, which has its control).
- **Moving**: each walk and the run, asked a way, moves that way more than across and does not
  fall in 10 s, and stops when told (`simbicon`/`walk-run` table, `stride`, `run`, `lab-loadout`).
- **Acting**: a kick, a straight and the native cycles end (`native-action-cycles`,
  `kick-walking`, `straight-actions`); a blow at a placed target lands something and a blow at
  nothing does nothing (`research-blow`).
- **Down and up**: a body that is down lies still and is handed to its sub-mind
  (`core-sub-mind`); a placed half-kneel stands within the cap unassisted (`ground-step-up`).
- **The Crypt** loads and its bodies stand (`crypt-core`); the Lab's scenarios load and step.

## Step 2, in order

1. **The fast tier** (the table above): done. Each capability bar is now a
   `<stem>-capability.test.mjs` in `tests/experimental.json`, beside a floor check in its old
   file; `options-bout` is the second recipe of `smoke`. The locomotion files went from 59.6 to
   35.7 s, the strike and bout files from 47.3 to 31.4 s. Under `npm run test:experimental`,
   `core-strike-skill-capability`'s steer case is red as it was in the gate. Two things it found:
   SIMBICON's run under Move, asked 2 m/s, falls at about 3 s on the 200 m ground and stands on
   the 80 m one (the ground box is the only difference), so each case keeps its ground; and the
   skeleton's self-touch case still needs its guard pose to touch.
2. **The snapshot check**: done (Fixtures, above).
3. **Fork windows**: done. `core-fork`'s felled and taken windows are found by what the trunk
   saw, and its fixtures assert they reached their case before the fork asserts run;
   `arena-fork`'s Classic bout is capped at 60 s; `core-combat-range`'s and
   `core-combat-openings`' forks no longer wait on the capability their neighbours measure.
4. **The slow tier**: pure cases moved to fast files; measurements moved out of the gate.
5. **The `todo`s**: each that is a capability becomes an experimental measurement; each contract
   behind one is freed (the list above); the four root causes are tracked as known capability
   gaps, not as tests.

Measurements leaving the gate have a home that keeps them runnable: `tests/experimental.json`,
beside `tests/slow.json`, which `npm test` and `npm run test:all` skip and
`npm run test:experimental` runs. CI keeps running `test:all`, which then holds contracts and the
floor.
