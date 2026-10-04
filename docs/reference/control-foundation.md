# Control foundation: common tasks

## Protocol 2

The runner is `research/control-foundation.mjs`, with the fixtures in
`control-foundation-trials.mjs` and one sequential job stream per worker in
`control-foundation-worker.mjs`. It calls the existing core stand, blow evaluator, recovery
watch and arena world. It does not substitute another dynamics model or change control commands.

```powershell
node research/control-foundation.mjs --suite baseline --split development --workers 4
node research/control-foundation.mjs --suite recovery --split development --samples 16 --workers 4
node research/control-foundation.mjs --suite strike-block --split development --samples 16 --workers 4
```

Every run writes an exclusive `manifest.json`, an append-only `rows.jsonl` and a `summary.json`
under a new directory in `research/runs/control-foundation/`. `--out` selects a directory;
existing manifests cannot be overwritten. Failed runs leave completed rows and `failure.json`,
and terminate all workers. Row order on disk is completion order; stable task IDs identify rows.

`--actuation symmetric` preserves the gameplay reference; `--actuation directional` selects
separate anatomical bounds for each torque direction. Both use the same installed engine.
The law belongs to immutable world configuration, not to a policy's action. Protocol 2 includes
it in every task ID, summary cell and guard pairing. Protocol 1 records below predate this field.
Each run also writes `source.json.gz`: normalized source/JSON path-and-content pairs, including
the package manifests, with its hash in the manifest. Source changes during a run invalidate it.
The archive preserves dirty experimental code as well as its fingerprint.

The manifest carries the actual source/JSON content hash (including dirty and untracked research
code), Git revision, Node version, package lock identity and installed package entry hash. Body,
item and controller content share that source hash. Each job declares the model, loadout, initial
geometry, controller variant, rate and watch. The current fixtures use no root or weapon assist.
Policy and physics both run every step, at 120 Hz unless `--hz` names a finer multiple of 120.

### Starts and splits

`--samples` defaults to two per cell: a cheap screening battery, not a statistical claim of
capability. `--from` selects another range within a split. Development uses indices below
1,000,000; held-out starts at 1,000,000. A range crossing its split's bound is refused. The seed
is an index into explicit initial-condition parameters, not an unrecorded random state.

The fractional part is `(((seed + 1) * 2654435761) >>> 0) / 4294967296`. It sets the shove's
heading over 360 degrees, or a bout gap over [3, 5) m. Directions and gaps are not quantized.
Strike perturbations have the existing robustness battery's bounds: push timing +/-1/240 s,
activation scale +/-0.02. An offset target lies within +/-0.12 m across the recipe's place.
These are experiment settings, not anatomical values. Each job stores the resolved values.

Freeze controller/configuration candidates before held-out runs. Do not tune against held-out
failures and reuse them as independent evidence. Repeated identical seeds prove reproducibility;
they do not increase the number of independent starts. Rates reported over the deterministic
sample set describe that set, not all possible falls or encounters.

### Tasks and readings

| Task | Fixture | Outcome and denominator |
|---|---|---|
| Recovery | Existing `felled` shove: reference body, stand 1 s, impulse 1.5 N s/kg, wait at most 3 s to fall; watch 40 s | Both default lying and staged-rise minds; rose means 2 continuous seconds up. Summary success also requires up at the end. Denominator is falls, excluding held shoves. |
| Strike at place | Existing high-band recipe through `evaluateBlow`, either hand, empty or club | Target damage >0 and no fall; all trials in the cell are the denominator. |
| Strike offset | Same, with target offset disclosed at commitment | A stationary displaced target, not a moving-target test; same success definition. |
| Strike at nothing | Same throw without the target | No fall and back in stance phase `stand`; no damage is required for success. |
| Guard comparison | Mirror arena bouts capped at 20 s, both in pose versus either side covering at the identical gap | Head/total damage, falls, duration and preparation times; guard changes are paired by model, loadout, seed and rate. |
| Shared items / integrated sequence | No fixture yet | Explicit unsupported rows, never successful trials or excluded cells. |

Strike follow-through is watched for 3 s after the throw ends, with the evaluator's overall 8 s
cap and immediate stop on falling. A trace records commitment/preparation and whether a throw
completed. This prepared stand fixture does not measure approaching a target; the bout fixture
measures from the first active attack phase to chamber or swing. Repeated swing frames count
once, and approaches abandoned before committing add no completed preparation time.

Every measured task records a digest of all sampled segment poses, maximum joint-anchor
separation (both joint frames transformed independently), peak segment-centre speed, summed
normal impulse on fixed scenery, and integrals of applied assist force and moment magnitudes.
Peaks include startup and impact and are diagnostic, not driven-strength measurements. The
ground impulse is accumulated once from each dynamic segment toward fixed scenery, not once
from each side of an inter-body pair. It is not a penetration-depth reading or damage score.

Recovery and bout fixtures time the original `World.step` separately from diagnostic sampling.
The resulting mean and p99 are instrumented runs with the declared worker count, not an isolated
performance benchmark. The blow adapter reports null per-step timing and its reason. No timing
participates in physical digests or success. Non-finite legacy outcome values serialize as named
strings instead of silently becoming null; non-finite physical measurements fail the run.

Summary cells retain task, body, loadout, hand, target and controller variant. Rates carry counts
and Wilson 95% intervals (z = 1.959963984540054); zero eligible trials has no rate or interval.
Small screening samples have wide intervals. Paired guard rows retain both durations: less
damage in a shorter bout is not evidence of improved defense by itself.

### Capability gates and missing measurements

The initial battery establishes a baseline and detects changes; it does not certify gameplay.
Its operational successes are defined above before tuning. Time-to-useful-control, moving-target
interception, impact-attributed versus unforced falls, contact penetration and actual actuator
work are not measured yet. Standing for two seconds is not proof that the body can move, defend
or attack. These limitations are stored with results rather than filled with invented zeros.

The full phase's task thresholds and time budgets must be fixed before searching its new tasks.
Required loadouts include either hand, independent items and a shared item with release; a missing
loadout blocks completion even when the aggregate success rate is high. Anatomy remains the
sourced body model; the skeleton's placeholder mass/strength is declared, not treated as evidence
about real human or skeletal capability. Fresh held-out evaluation and visible-browser checks
remain required for the completed controller.

## Stock baseline

Harness: Node 24.19.0, core world and the task fixtures above, Rapier SIMD npm 0.21.0,
120 Hz, four workers, balance 0%, no weapon assist. Development indices 0 and 1, all three
bodies, empty hands or a right-hand club in recovery/bouts and either-hand clubs in strike tasks.
Command: `node research/control-foundation.mjs --suite baseline --split development --workers 4`.
The source content SHA256 is `2188a9d03283b6207092d6d485a411c34f76ec228760ad9c536978f2bbaaa549`;
the installed package entry SHA256 is
`956709f8dccb9cb4d7eb8cd2d7319089fb8864ac7b1a18a605913624c3ec82a1`.
The full manifest and physical rows, without wall-clock timings, are preserved in
[control-foundation-stock.json](control-foundation-stock.json). Each row joins its job by ID.

138 tasks: 24 recovery trials (lying and staged), 72 strikes, 36 bouts and 6 unsupported
shared-item rows. The table aggregates the small screening cells for orientation only; the raw
records retain both hands, targets, paired guard variants and per-cell uncertainty in the runner.

| Model | Held | Staged: rose and remained up / fell | Hit and stayed up / targeted throws | Stood after miss / misses | Fallen sides / 6 guard-comparison bouts |
|---|---|---|---|---|---|
| Warrior | empty | 1/2 | 8/8 | 4/4 | 2 |
| Warrior | club | 2/2 | 8/8 | 4/4 | 3 |
| Rogue | empty | 0/2 | 8/8 | 4/4 | 2 |
| Rogue | club | 0/2 | 8/8 | 4/4 | 6 |
| Skeleton | empty | 0/2 | 8/8 | 4/4 | 0 |
| Skeleton | club | 0/2 | 8/8 | 4/4 | 1 |

The prepared strikes work in these starts while recovery and bouts expose failures. This does
not establish moving-target accuracy, robust recovery, or effective defense; two seeds are too
few for those conclusions. The held-out split has not been evaluated or used for tuning.

## Directional actuator screening

Harness: Node 24.19.0, core world, vendored Rapier 0.21.0-auto-rpg.2, 120 Hz, four
workers, balance 0%, no weapon assist, the same development starts and watches as stock.
Run the baseline command with `--actuation symmetric` and `--actuation directional`.
Both runs used source SHA256
`8071ac63169f1858129c8065dc5d4f5e2f83da3bef92eb66380ed4329d9cba22`.
The symmetric run reproduces all 138 stock physical rows exactly, excluding task-ID changes
and wall-clock timing. [Directional rows and manifest](control-foundation-directional.json)
preserve the corrected-law comparison.

| Model | Held | Staged: rose and remained up / fell | Hit and stayed up / targeted throws | Stood after miss / misses | Fallen sides / 6 bouts |
|---|---|---|---|---|---|
| Warrior | empty | 2/2 | 8/8 | 4/4 | 4 |
| Warrior | club | 2/2 | 8/8 | 4/4 | 2 |
| Rogue | empty | 0/2 | 8/8 | 4/4 | 2 |
| Rogue | club | 0/2 | 8/8 | 4/4 | 6 |
| Skeleton | empty | 0/2 | 8/8 | 4/4 | 4 |
| Skeleton | club | 0/2 | 8/8 | 2/4 | 4 |

Finite velocity commands can pull or brake, each under that direction's anatomical envelope.
Infinite velocity commands mean one-way torque: the opposing bound is zero. Allowing the
opposing muscles to brake an infinite command changed its meaning under an external load;
the external-load regression in `core-muscle.test.mjs` checks both command forms and signs.
The delivered mean torque and both applied bounds are saved with the muscle state.

Corrected actuation does not yet pass the recovery and integrated capability gates. In the
Warrior fours diagnostic (Node stand, directional law, empty, pinned rate 120 Hz, balance 0%),
`riseLimbs` changes a predicted right-shin support from the knee to the knee–foot midpoint
as a foot corner enters its 3 cm proximity band. At consecutive steps 1019/1020 the support's
z coordinate changes from 1.279402 to 1.059866 m, while COM changes only about 0.1 mm.
This is a discontinuity in a desired support estimate, not measured contact motion. Together
with the flat-hand motion mismatch in the rising record, it blocks treating a controller
residual or a completed stage as proof of a stable handover. The body/contact work precedes
default migration; no anatomical strength or capability assertion has been relaxed.

## Controller replacement

`tests/core-direct.test.mjs` uses the Node core stand, Rapier 0.21.0-auto-rpg.2 at 120 Hz,
directional actuation, zero assist, no ground and a pinned lower trunk. Warrior, Rogue and
skeleton each reach 0.6 rad right-elbow flexion within 0.025 rad after 2 s and remain within
that band for another second. Experiment gains are explicit: 0.1 s error decay, maximum
3 rad/s requested velocity, full activation. This is a bounded joint reach and hold, not free
standing. The policy uses detached observations and validated actions, without constructing
the fighter's motor/stance/skill stack. It also passes replay, idle/resume and disposal checks;
an arena fixture runs this mind alongside the fighter and restores both together.

The common body adapter retains the game's stance-height fall allowance separately from the
unconditional physical standing-height reading. Removing that allowance is a rule migration,
not implicit in replacing a body interface. Under the adapter, all 138 screening rows equal
stock exactly, excluding timing and task-ID metadata. Harness: Node 24.19.0, core world,
Rapier 0.21.0-auto-rpg.2, symmetric actuation, 120 Hz, four workers, balance 0%, no weapon
assist; source SHA256 `f9298bba5c42a69248feeb172eee5100825f65a2559fd0a0b6c2400dfe8f8844`.
