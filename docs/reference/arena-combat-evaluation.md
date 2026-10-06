# Arena combat evaluation

`research/arena-combat.mjs` runs autonomous bouts through `Duel` and `World.step`, using the
actual gameplay default (`rapier-coordinate`), at 120 Hz. The initial scope is two unarmed
Warriors, symmetric sourced muscles, zero balance and unchanged injury rules. Both comparison
policies receive recovery in continuing bouts: Classic uses staged recovery; Point uses its
support-verified recovery. The engine revision and full recipe are stored in every row.

The protocol freezes these measurement choices before controller tuning:

| Choice | Value | Purpose |
|---|---:|---|
| Driven contact closing speed | at least 1 m/s | Exclude slow contact pressure |
| Hand motion relative to own COM along the contact normal | at least 0.5 m/s toward the other surface | Exclude tangential motion, retraction and body translation without a stroke |
| Pressure-only episode | at least 2 s | Report prolonged touching without a driven blow |
| Startup exclusion for blow accounting | 2 s | Exclude initial settling |
| Low-target diagnostic | opposing head below 0.8 m, or opposing body down | Identify contacts against grounded/rising opponents in the Warrior arena |
| Competitive cap | 60 s | Fixed exposure for initial evaluations |

Driven credit requires the command host to have an active `swing` for the colliding hand,
while it is not down. The evaluator samples physical point velocity before the physics step.
It subtracts own COM velocity and tests the signed normal component, independently for each
side of the core's symmetric blow. Hand/forearm interceptions are reported as blocks.
All other damage remains visible as incidental damage; every wound received is also recorded.
Damage sums use actual hit points taken by wound records, not nominal requested damage.
This classification is evaluation data, never hit authority or an addition of a striker to
the injury rules. It measures commanded closing contacts, not muscle work or perfect aim.

Exposure includes host/recovery phases, actual falls and returns upright, time down, hand
pressure, longest continuous pressure, pressure-only episodes, driven contacts, block contacts,
driven damage dealt, damage to the striking side, incidental damage and total wounds received.
The complete bout fixture reproduces Point's sustained pressure without giving it clean-strike
credit. Self-contact and fixed-world contact do not enter opponent-pressure exposure.

`combatPairs` constructs distinct conditions by varying starting gap, sense delay, and ordinary
facing orders with different release times. Mirrors exchange policy sides and the ordered side.
Development and held-out distributions use separate fixed generators. A label alone is not a
condition; tests check complete recipe/order uniqueness and split separation. Repeating an
unchanged deterministic bout does not add evidence.

Each mirrored pair is one uncertainty unit. Ratings report win score (draw = 0.5), a Wilson
interval using the pair count as conservative effective sample size, and relative Elo
`400 log10(score / (1 - score))` against that named opponent. Perfect scores have no finite
point Elo; their score interval remains available. These are relative opponent comparisons,
not an externally calibrated league rating. Injury wins and wins decided at the cap are
separate counts. A small health advantage at the cap does not establish stronger striking.

`research/arena-combat-run.mjs` uses worker threads, one sequential physics loop in each,
and checkpoints complete plain trial rows. Failed trials abort rating publication. Source
fingerprints are checked before/after every trial and before publication; changing implementation
during a run invalidates it. Results are under ignored `research/runs/` until a measured table
is selected for a durable reference record.

```powershell
node --test tests/arena-combat.test.mjs
node research/arena-combat-run.mjs --candidate point --opponent classic --pairs 8 --split development --workers 2
node research/arena-combat-run.mjs --candidate .tools/candidate.json --opponent point --pairs 100 --split heldout --workers 2 --output research/runs/heldout-point.json
```

The short development command is a diagnostic, not a promotion result. Promotion still requires
the physical strike/return gates, useful autonomous combat, defense checks, and held-out paired
wins specified by the active combat plan. Broader model/equipment claims require their own rows.

## Corrected gameplay baseline

Six autonomous 30 s Node Arena Duel probes, Rapier coordinate-gradient gameplay profile,
120 Hz, Warrior/Warrior, empty hands, balance 0/0, continuing recovery. These are diagnostic
fixtures, not six independent rating samples. Counts and damage exclude the first 2 s; pressure
exposure includes the whole bout. Damage is actual hit points taken.

| Policies (left/right) | Start gap (m) | Driven contacts L/R | Driven damage L/R (hp) | Pressure L/R (s) | Falls L/R |
|---|---:|---:|---:|---:|---:|
| point/point | 4 | 4/5 | 0.01233/0.03650 | 23.06/22.80 | 0/0 |
| point/point | 1.2 | 1/0 | 0.00639/0.00000 | 25.02/25.00 | 0/0 |
| point/point | 2.4 | 5/6 | 0.01542/0.02804 | 21.88/21.92 | 0/0 |
| point/classic | 4 | 5/6 | 0.02003/0.10453 | 17.34/16.63 | 0/0 |
| classic/point | 4 | 12/2 | 0.05678/0.00233 | 14.58/17.27 | 0/0 |
| classic/classic | 4 | 0/0 | 0.00000/0.00000 | 8.45/11.08 | 1/1 |

The three Point self-play probes spend 22?25 s touching. Their few driven blows do little
damage. Classic produces faster occasional blows in mixed bouts, but Classic self-play falls
and spends the remainder attempting recovery. Correcting joint limits alone does not solve
combat. This baseline supports testing chamber space, reliable launch speed and recovery under
pressure before interpreting any win score as effective fighting.

## Body-targeting held-out evaluation

Frozen implementation `75e239d2`, Node Arena Duel, `rapier-coordinate`, 120 Hz,
Warrior/Warrior, empty hands, balance 0/0, continuing recovery and 60 s cap. Each
opponent has 100 distinct held-out recipes and their mirrors (200 bouts): variable
gap 1.2?6 m, sense delay 0?12 steps, and a seeded short initial ordinary facing order.
The source fingerprint, complete recipes/configs and tapes are retained in
[combat-body-heldout.json](combat-body-heldout.json), with independent per-opponent
paired ratings in [combat-body-heldout-ratings.json](combat-body-heldout-ratings.json).
The frozen checkout ran six sequential worker queues in 1,680.254 wall-clock seconds.

The candidate is `{kind:'arena-fighter',hand:'alternate',targeting:'openings',
repertoire:'mixed',openings:{head:0.3,upperTrunk:0,middleTrunk:0}}`. No low-combat
transition is enabled in this retained candidate. The comparison Combat is the linear
opening controller; Classic attempts staged recovery and Point uses tracked engagement.

| Opponent | Wins / 200 | Paired score, 95% interval | Relative Elo, 95% interval | Candidate/opponent falls | Mean driven damage candidate/opponent, hp per 60 s |
| --- | ---: | --- | --- | ---: | ---: |
| Classic | 192 | 0.960 [0.902, 0.984] | +552 [+385, +719] | 39 / 44 | 0.514 / 0.091 |
| Point | 200 | 1.000 [0.963, 1.000] | unbounded point estimate; lower bound +566 | 0 / 0 | 1.004 / 0.040 |
| Linear Combat | 199 | 0.995 [0.954, 0.999] | +920 [+526, +1,313] | 1 / 2 | 0.931 / 0.344 |

All 591 candidate wins end at the cap; none is an ordinary-wound finish. These are
relative estimates against each named opponent, not calibrated league ratings. The
Point result establishes substantially better target contact and health advantage;
finishing power is unresolved. Fall counts include all falls and do not assign their
cause. The Classic row requires recovery/pressure investigation. These results do
not establish armed or other-body performance, a browser cost budget, or promotion
against the decisive-combat proposal.

The selectable `ARENA_BRAWLER` uses this exact target preference and mixed repertoire. It
is exposed separately from retained linear Combat, so existing controller links keep their
meaning. The measured scope is Warrior empty hands; this exposure does not meet the proposed
majority-before-cap finishing gate or validate other equipment and anatomy.

## Built Brawler exposure and cost

The Arena's Brawler choice uses the exact body-targeting held-out candidate, while Combat
retains its earlier configuration. The URL recipe test checks both choices. A 30-second Node
ArenaDuel self-play test at 120 Hz, gameplay Rapier coordinate limits, empty-handed Warriors,
zero/zero balance and continuing recovery records 16/19 driven blows and 0.269/0.415 driven
outgoing HP, including guard contacts. Both sides remain standing; the longest pressure-only
interval is 0.467 seconds. This test checks the selectable recipe through the actual bout.

Six complete 60-second held-out results (the first mirrored recipe against each of Classic,
Point and linear Combat) are replayed on the exposure revision. Their entire accounting
records equal the retained records exactly. This is a sample replay check, not a new 600-bout
measurement or validation of additional body/loadout strata.

The built page at `?play=arena&matchup=workshop-fighter,workshop-fighter&control=brawler&held=empty&balance=0&cap=60&measure=1`
is inspected with both controller selectors, fists, ordinary attack/return movement and the
continuing-recovery choice visible. The optional DOM timing output observes 500 active frames,
5,921 physics steps at 120 Hz and 49.342 simulated seconds after the first two seconds.
Mean physics cost is 2.487 ms/step; the 95th percentile of per-frame batch means is 3.133 ms/step.
Whole-frame CPU median/p95 are 31.8/40.3 ms, including physics and the scene render call.

The controlled browser reports visible but delivers frames at roughly 1 Hz (median 1,011.8 ms).
The page advances at most 12 steps per delivered frame, so simulated/real time is 0.0993.
These observations do not establish a foreground 60 Hz frame budget or GPU cost; the step
percentile describes batch means, not individual steps. Foreground cost and optimization remain
open. Timing is passive screen instrumentation and changes no bout state. The owned preview
server and browser tab are stopped after inspection.
