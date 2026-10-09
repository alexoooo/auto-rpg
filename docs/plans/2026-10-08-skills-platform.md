# Robust skills: the competency suite, physiques, one whole-body layer and the explosive punch

## Outcome

Skills that keep working when the body changes. A body that is resized, made stronger or heavier,
or given another item, is measured again by one command, not searched again. This plan builds
the instrument that says whether a skill is robust, the attributes that vary the body, the shared
whole-body layer that skills are written against, the skill contract that tactics will choose
by, and the first skill in that form: an explosive punch thrown at full reach. The rest of the
competency ladder ([roadmap](../roadmap.md#next-phase)) follows on the same layer, each skill
with a plan of its own once the spike below has settled the layer.

## Why, from what is measured

Today's skills are made for one body:

- **A searched recipe is its body's own.** `assets/core/strikes.json` holds a chamber pose and
  timed muscle pushes per body, item and height band, and "no other body throws it"
  ([blows](../reference/blows.md#another-bodys-recipe)). A cell is searched again whenever its
  body, its item or the rule changes; the 36 searches took 4 h on 24 threads.
- **The staged rise is a script.** It spends 14.7 s in poses of set time before the 3 to 4 s it
  lies settling. Every pose time scaled by 0.75 keeps most rises, and by 0.5 breaks every one.
  The workshop hands' hulls cost it 2 to 4 rises of 16 because its stages were tuned on capsule
  hands ([rising](../reference/rising.md#staged)).
- **Pushes searched on today's punch are fragile.** A schedule scored at 120 Hz read 14.8 N s
  and 3.1 at 960 Hz. Scored at the worse of 480 and 960 Hz, it fell apart in a cell 2 cm away.
- **The punch's speed is capped by its controller and its distance, not by the body.** The planted cross
  reaches 4.3 to 5.3 m/s. The body brings the hand to 8.6 m/s at full reach from the guard in
  0.33 s, and to 12 m/s with a wind-up, with the stance kept and its own muscles. The cell's pad
  stands 0.3 m from the guard, where the flat-out arm reaches 4.5 m/s. The game's cross turns
  the striking shoulder back (`attackPath`, `torso = side * tuning.torso`).
- **Contact impulse is not rate-converged.** With nothing pushed, the punch's impulse reads 6.19
  N s at 240 Hz, 4.50 at 960 and 3.62 at 1920. Hand speed and timing converge.
- **A released stance chatters.** With `stance: null` on planted feet, `servoSolve` drives lumbar
  and hip flexion into a two-step oscillation at 120 Hz. The servo takes the root to be held;
  that cause is a hypothesis.

The study behind these figures, with its probes and raw rows, is
`docs/analysis/2026-10-08-punch-and-rise-speed.md@7f3ebcdb`. The recovery adapter's failed
experiments are `docs/analysis/2026-10-05-recovery-support.md@7f3ebcdb`.

## Decided

- **The direction is the owner's (2026-10-08).** Physically based bodies as a platform for AI
  control experiments, built into a game. There is an array of skills, and tactics choose among
  them. Skills and tactics come in many flavours, and may be specific to a body, its attributes
  or its loadout. The more general and robust a skill is, the better.
- **Every competency passes unassisted.** An assist adds to a skill that works without one, and
  is metered (`Assist`).
- **Gates read rate-converged quantities**: speed, timing, success, staying up. Impulse and
  peak force are reported beside them, not gated, until the contact model converges.
- **The explosive punch is next** (owner, 2026-10-08), built on the shared layer, not as
  another push schedule.
- **Classic stays as the baseline** every new fighter is compared with
  ([presets](../reference/controller-presets.md)).

## Owner's choices this plan puts

1. **The gates' thresholds.** Decided 2026-10-08: the owner accepted chunk 1's thresholds; a
   competency passes only where it meets them at 120 and 480 Hz; the walk is gated on the speed
   travelled ([competencies](../reference/competencies.md#thresholds)). None is lowered after a
   held-out run.
2. **The physique's attributes and ranges.** Decided 2026-10-08: size x0.9 to x1.18, weight
   x0.85 to x1.25, strength x0.8 to x1.25 and speed x0.85 to x1.15. Weight is a load the same
   muscles carry. The ranges are data that a run can change without a code change (chunk 2,
   "Flexible by construction").
3. **Extend or replace the whole-body layer.** Chunk 3 records what `wholeBodyTracking` achieves
   on the spike, at what cost per step. Asked 2026-10-08: the owner chose the cheaper option that
   meets the punch's bar, first a punch layer on today's stance, then the whole-body solve during a
   blow. Neither meets it: the solve lands at 4.2 to 4.4 m/s
   ([whole-body spike](../reference/whole-body-spike.md)), and the layer lands almost nothing.
   Asked for all it can give each step, the solve lands at 2.8 to 4.6 m/s, while the body itself
   has a straight blow over the bar at every cell searched
   (`docs/analysis/2026-10-08-punch-layer.md`). Chunk 4 goes ahead on the owner's call among
   that study's choices.

## Chunks, each landing green

Every chunk runs the gate its changes need (AGENTS.md, "Validate according to what changed")
and the line-ending gate, and is committed as it lands. Research chunks change no default.

### 1. The competency suite, and today's skills on it

**Files:**
- `research/competencies.mjs` (**new**): each competency's fixture, metrics, human target and
  threshold.
- `research/control-foundation-trials.mjs`: suite `competency`, with `--competency`.
- `research/control-foundation.mjs`: grid cells in the manifest and summary.
- `tests/research-control-foundation.test.mjs`
- `research/README.md`
- `docs/reference/competencies.md` (**new**)

The suite extends the existing runner. Its manifest, development and held-out splits, workers,
source archive and append-only rows stay as they are. Each competency wraps a fixture that
already exists and reads what a person's motion is judged by:

| Competency | Fixture | Gated | Reported | Human target to source |
|---|---|---|---|---|
| stand | `shove` (`research/core-stance-trials.mjs`) | least shove held from every direction; upright 10 s | step count | none sourced (roadmap) |
| guard | `defense` suite (`src/core/tasks/defense.ts`) | blows covered; upright | contact impulse | to read |
| punch | `punchStand` (`research/punch-calibration.mjs`), the pad at full reach and at the cell's place, and a miss | hand speed over the last 10 cm; command-to-contact time; return to guard; upright | impulse, effective mass, peak force | 8 m/s, 22.8 N s untrained (`HUMAN_PUNCH`, Adamec); 17.2 N s trained (`TRAINED_ATTACKS`) |
| walk | `walk`, `turn` (`research/core-stance-trials.mjs`) | steady speed held every heading; upright | pace error | about 1.4 m/s preferred, to source |
| rise | `felled` (`research/core-rise-trials.mjs`) | share risen within the watch; time to standing with control | attempts | a few seconds, to source |
| kick | `frontKickStand` (`research/front-kicks.mjs`) | foot speed at contact; return to stance; upright | impulse | to read |
| run | none yet: a row marked unsupported | none yet | none yet | 3 to 6 m/s, to source |

**The grid:**
- each workshop model, with empty hands and with the club;
- at 120 Hz and at 480 Hz, the second as the convergence check (AGENTS.md, Measurement).

Attribute cells join once chunk 2 lands. A competency with no fixture for a cell writes an
`unsupported` row, so a gap can't vanish from a pooled figure.

**The record:**
- each target and its source;
- the proposed thresholds;
- the baseline today's skills read: the path fighter's planted punch, the staged rise, the
  stance's walk, the front kick and the predictive guard;
- per-cell denominators and uncertainty.

The record is the "before" table of every later chunk.

**Test:** fixture construction, metric accounting and seed replay for one cell of each competency.
Mutate a metric's reader and see the test go red.

**Commands:**
```powershell
node research/control-foundation.mjs --suite competency --split development --workers 8
node research/control-foundation.mjs --suite competency --competency punch --hz 480 --workers 8
```

**Gate:**
- every competency has a row for every cell, unsupported ones included;
- the 480 Hz rows of the converged quantities agree with 120 Hz within the record's stated
  tolerance, or the disagreement is recorded as a finding.

### 2. Physiques: size, weight, strength and speed

**Files:**
- `src/core/human/physique.ts` (**new**): `Physique`, `physiqueFigure`.
- `src/core/human/figure.ts`: `HumanFigure.muscled`, the body mass its regional muscle is a share
  of.
- `src/core/human/spec.ts`: `humanoidSpec(model, physique?)`.
- `src/core/human/segments.ts`: each segment's breadth by `weight`.
- `src/core/human/muscle.ts`: `peakTorque` reads `muscled`, times `strength`.
- `src/core/human/speed.ts`: `jointSpeed`'s unloaded speed times `speed`.
- `src/core/sources.ts`: `owner-physique`.
- `src/core/models.ts`
- `research/physiques.mjs` (**new**): `PHYSIQUE_GRID`, `physiqueGrid`.
- `research/control-foundation-trials.mjs`, `research/control-foundation.mjs`: grid cells by
  physique, with `--grid` and the axis overrides.
- `tests/core-human.test.mjs`, `tests/core-spec.test.mjs`, `tests/research-control-foundation.test.mjs`
- `docs/architecture.md` (Spec)

**What a physique is.** `Physique` is plain data, `{ size, weight, strength, speed }`, each a
`Quantity` read from `owner-physique`. Absent, the figure is unchanged. Each attribute changes one
thing, so a skill that breaks on the grid says which change broke it:

| Attribute | Changes | Leaves | Rule in `physiqueFigure` and the spec |
|---|---|---|---|
| `size` | every length, and the mass at the same density | joint speeds | points, hulls, feet and hands scaled through the existing `scale`; mass and `muscled` times size cubed. Torque follows the muscled mass, so it grows as size cubed |
| `weight` | mass: a load the same muscles carry | lengths, joint centres, torques, speeds | every segment's mass times `weight`, and its breadth across its long axis (a capsule's radius, a hull's and a foot's extents, a hand's hull) times its square root, so every segment keeps its density. `muscled` is unchanged |
| `strength` | every peak torque | mass, shape, speeds | `peakTorque` times `strength` |
| `speed` | how fast each muscle shortens | mass, shape, torques | each exertion's unloaded speed, w0 in `jointSpeed`, times `speed`; the curvature is unchanged |

A strong, heavy body is the weight and the strength axes together. Hit points are unchanged. A
physique is a character's declared difference, recorded with its source, not a muscle raised for
feel.

**Flexible by construction.** The ranges are the owner's today, and may change:
- **The core knows no range.** `Physique` takes any positive factor, and `physiqueFigure` refuses
  only a factor that is not positive and finite. A character may carry a physique of its own.
- **The ranges are one record of data.** `PHYSIQUE_GRID` (`research/physiques.mjs`) is frozen data:
  `{ size: [0.9, 1.18], weight: [0.85, 1.25], strength: [0.8, 1.25], speed: [0.85, 1.15] }`, each
  axis a list of values, 1 always added. Changing a range is an edit to that record and nothing
  else.
- **A run can override it without an edit**, by `--size 0.85,1.2`, `--weight …`, `--strength …`
  or `--speed …`, each a list of any length. The manifest records the grid the run used.
- **The cells are built by one rule.** `physiqueGrid(grid, design)`:
  - `"axes"`, the default: the default physique, and each axis's values with the others at 1.
    That is 9 physiques for two values an axis.
  - `"full"`: every combination of the axes' values (81 for two values an axis).
- **A new attribute is three edits:** a field of `Physique`, its rule in `physiqueFigure` or the
  spec, and an axis of `PHYSIQUE_GRID`. Reach (the limbs' length against the stature) would be the
  example. The runner, summary and record take the axes as they come.

**Tests:**
- size 1.1 lengthens every segment by 1.1, and multiplies mass and every peak torque by 1.331,
  with every unloaded speed unchanged;
- weight 1.2 multiplies every segment's mass by 1.2, keeps every length, joint centre and
  segment's density, and changes no torque or speed;
- strength 1.2 multiplies every peak torque by 1.2 and changes nothing else;
- speed 1.1 multiplies every unloaded speed by 1.1 and changes nothing else;
- `specProvenanceFaults` stays empty;
- the default spec is equal to today's in a whole-record comparison;
- `physiqueGrid` makes 9 physiques by axes and 81 in full from the default record. With a third
  value on one axis, it makes 10 and 108;
- a factor outside the default ranges (size 1.3) builds a body;
- an override reaches every job and the manifest;
- a non-positive factor is refused.

**Commands:**
```powershell
node research/control-foundation.mjs --suite competency --grid axes --workers 14
node research/control-foundation.mjs --suite competency --grid axes --hz 480 --workers 14
```

**Gate:**
- the full gate (bodies and specs are shared physical behaviour);
- the arena fingerprints don't move at the default physique;
- the competency baseline of chunk 1 is extended to the grid's physiques and recorded. That table
  is the measure of how brittle today's skills are.

### 3. Spike: one whole-body layer under a punch and a stance

**Files:**
- `research/whole-body-spike.mjs` (**new**)
- `docs/reference/whole-body-spike.md` (**new**)
- `src/core/control/whole-body.ts`, `src/core/control/tasks.ts`, `src/core/math/quadratic.ts`:
  only as the spike needs, behind options that change no default.

**The question.** Can `wholeBodyTracking`, the bounded torque solve over the coupled dynamics with
contacts and joint stops, carry both of these across the grid, within a step budget for two
fighters in real time?
- **Standing:** the body stands under shoves from every direction, with the root free, so that
  nothing is held that the contacts do not hold. That is the servo's chatter, addressed.
- **The explosive punch:** a hand goal in task space, at a target at full reach, sequenced from
  the legs and pelvis through the trunk to the arm, with the trunk turning the striking shoulder
  forward.

It is read on the chunk 1 cells and gates, unassisted, at 120 and 480 Hz.

**The record:**
- each cell's result;
- the solve's time per body per step, against the 8.33 ms step and the 0.46 ms a body costs today
  ([step cost](../reference/step-cost.md));
- infeasibility reports;
- what failed, and why where it is read.

**Gate:**
- the record exists with every cell, failures included;
- the owner's choice 3 is put with its numbers.

### 4. The skill contract

**Files:**
- `src/core/skills/skill.ts`
- `src/core/skills/skills.ts`
- `src/core/mind/tactics.ts`
- `tests/core-strike-skill.test.mjs`
- `tests/skill-contract.test.mjs` (**new**)
- `docs/architecture.md` (Skills)

`Skill` today has only `resume`. It gains what tactics choose by, as plain data:
- `ready(view, goal)`: whether the body can begin, and if not, what it lacks (standing, a free
  hand, range);
- `estimate(view, goal)`: the expected seconds and the chance of success from here;
- `report`: the phase, and how the skill ended (done, failed, interrupted).

A goal is a union by kind (`never` default): a point to strike with an effector, a place to stand,
a threat to cover, standing up. The existing strike, guard, kick and locomotion skills answer the
contract from what they already report. Tactics read only the contract.

**Test:** each existing skill answers `ready` and `estimate` for a goal it can and one it can't
meet. A tactics fixture chooses by `estimate` and is shown choosing differently when one skill's
estimate is mutated.

**Gate:** routine code checks plus the bout fingerprints. The contract changes no motion.

### 5. The explosive punch

**Files:**
- `src/core/skills/punch.ts` (**new**)
- `src/core/control/whole-body.ts` (or what chunk 3 chose)
- `src/core/skills/skills.ts`, `src/core/mind/config.ts`: a fighter that selects it;
- `src/lab/scenarios.ts`: a scenario that throws it;
- `tests/core-punch.test.mjs` (**new**)
- `docs/reference/competencies.md`
- `docs/architecture.md`

**The skill.** A punch is a goal (`strike`, effector `hand.left` or `hand.right`, a target point)
and a generator that turns it into task-space motion within the body's own limits:
- the target is placed at the body's reach, from the spec;
- the timing comes from the body's limits, not from a search;
- the legs, pelvis and trunk turn in sequence into the arm;
- the fist leads; the hand returns to guard;
- a miss is caught by the stance.

No constant is fitted to one body. A setting the generator needs is derived from body quantities
by a named rule, or recorded as a tuning with its sweep in the record.

**Test:** the whole path on the stand, both hands, the default Warrior. The hand closes on the
target, returns, and the body stays up, both on a hit and on a miss.

**Gate:**
- the full gate;
- the punch competency on the whole grid at 120 and 480 Hz, against chunk 1's baseline and the
  owner's threshold;
- a lab scenario for the owner's eye (`?play=lab&scenario=punch`).

A cell that fails is recorded, not hidden. The plan is complete when the punch meets the
threshold on the grid. Otherwise it closes with the record and the owner's call.

## Out of scope here

These are the roadmap's, each with a plan after this one:
- the rest of the competency ladder;
- items;
- the assist kinds;
- retiring the controllers this replaces;
- the rising rules.

The existing fighters, Classic and the path fighter's presets, keep playing unchanged
throughout.
