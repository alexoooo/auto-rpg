# v2-17 — prove the scripted two-body mechanics

**Goal:** judge the deterministic two-body model against the exact fixture, script,
metrics, worker join, and visible-review evidence in
[`articulated-mechanical-gate.md`](../reference/articulated-mechanical-gate.md).

**Depends on:** green `v2-10` through `v2-16` and the v2-08 greybox renderer (or its
recorded replacement). Room art is not a dependency.

**Golden expectation:** all six legacy pins remain byte-identical. Record one
`ARTICULATED_HASH` only after every automated and visible threshold passes.

## Checkpoints

This session is too large to land in one commit, and its first half must not be
recorded until its second half has frozen the physics — a fixture recorded against a
model that then changes is worse than no fixture. It therefore runs as five ordered
checkpoints, each green on its own, in the manner `v2-14` used:

| # | lands | may move |
|---|---|---|
| A | the scripted and windmill policies, the `ARPG-SCRIPT-V1` digest, `lab articulated` | nothing — adds a policy and a CLI, touches no hashed state |
| B | the lethality decision and whatever mechanics change it justifies | articulated mechanics pins, named in advance |
| C | worker protocol V2, the generated snapshot regions, the debug draw | nothing in `sim`; the ABI grows |
| D | the twelve named replay fixtures, the 800-trial gate, the evidence JSON | nothing |
| E | the visible foreground review, then the single `ARTICULATED_HASH` pin | `ARTICULATED_HASH` is created |

**Checkpoint A is complete when** `lab articulated --seeds 400 --mirrored` runs and
reports its measurement. **A does not assert the gate thresholds** — it produces the
number that decides checkpoint B.

## What the carried-forward diagnosis got wrong

`v2-00-overview.md` carried a diagnosis into this session: that the contact model
gives an equipment collider one generalized point velocity — body plus *hand* — so a
swing's tip speed is not represented, and that the gate therefore needs "a tip-velocity
term or a roster whose regional maxima are scaled to what the solver delivers". Both
halves of that were measured before any of it was implemented, and **both are wrong**.

A prototype gave every segment collider two end velocities and evaluated each contact
fact at the point it happened rather than at the hand, staying inside the point-mass
framing with no angular state. Measured against the same fixture and policy:

| | baseline | per-point velocity |
|---|---|---|
| max single-blow `integrity_loss_raw` | 21,216 | **21,216 — byte-identical** |
| Σ dissipated energy | 14,240 | **11,975 — less** |
| `contact_cap_hits` | 20 | 461 |
| Brute end health, mean of 5 seeds | 0.911 | **0.927 — worse** |
| outcome | timeout | timeout |

The reason is structural and worth writing down so nobody prototypes it twice: the
energy budget is `closure_energy()` over collider rows, so it never sees the fact's
point velocity at all. Richer point velocities enlarge the *proposed* impulse, which
makes the bounded alpha search clamp harder, which dissipates *less*. The fact gets
more honest and the damage does not move.

Rescaling the roster was sized too: dividing both anatomies' maxima by 8 is the
smallest round factor that decides all five sampled seeds, and the window is one factor
wide — at 10 a Brute region maximum is under a single blow and every fight is a 31-tick
decapitation. At every factor the Fighter still finishes on 1.000. It makes fights end
without making them fights.

**What the same measurement pointed at instead** is `CONTACT_ENERGY_FLOOR`, raw 144,
which is legacy `rules::ENERGY_FLOOR` exactly — `1/2 * 1.24 * 0.06^2`, one Fighter
arming sword at `IMPACT_THRESHOLD`. In the legacy model that gates **one swing, once,
when it resolves**; the contact solver charges the same 144 against **every fact's
dissipated share, every tick**. Deleting it outright decided every sampled seed in 642
ticks. Read the next section before believing that means what it looks like.

## Checkpoint A landed, and its headline result was an artifact

The composed script ran 400 seeds in both orientations: **800 of 800 trials reached
tick 3,600**, the Fighter ending on 0.9879 mean health and the Brute on 0.9692, with
2,678,916 contact resolutions and zero refused commands. Taken at face value that says
the physics cannot be lethal even under a policy that chambers and commits, and the
next checkpoint should change the damage model.

**It says no such thing.** An adversarial pass showed the corpus is arithmetically
incapable of landing a blow, for a reason that is entirely the script's:

- Phases 3, 4, 7 and 8 emit `move_dir: Vec2::ZERO`. With `want = 0`,
  `apply_articulated_movement` decays body velocity to zero in about fourteen ticks, so
  **both bodies are stationary throughout every attack**.
- An equipment collider's velocity is `body_velocity + arm.linear_velocity`, so an
  attack's entire closure is the arm term alone.
- The arm term is *smaller than the body term the script gave up*. Peak angular rate is
  `ARM_BEARING_MAX_SPEED_RAW * stat_factor(agility)`, which is **546 raw/tick for the
  Fighter** — agility 6 gives exactly one half — and 389 for the Brute. The pre-stat
  1,092 is not reachable by anything in this roster. Sword closure energy is 62.3 raw,
  club 47.0.
- The **theoretical maximum** for a synchronised double commit at full reach and full
  rate is **143.8 raw against a floor of 144**. Since `share <= dissipated <= before`,
  `available` is provably zero for every fact of every attack phase at every seed. The
  dissipation fraction never needed measuring.
- A *walking* body by contrast carries about 0.0503 units per tick into every collider
  it owns: sword 102.8 raw, shield 74.6, body 82.9.

So all 0.97 of the observed attrition comes from the approach and rest phases — bodies
leaning on each other — and the script does less damage in 3,600 ticks than
`advance_and_strike` does in 600. Checkpoint A did not remove the confound it existed
to remove. It replaced a policy that never swings with one that swings from a standstill,
which is a *slower* velocity regime, and the corpus measured "a stationary swordsman
cannot hurt anyone".

The floor is therefore binding **for this script**, not for this physics. With the feet
moving, the same closure sits three to four times above it.

## Checkpoint B: the controls first, the decision second

Two controls cost nothing and must run before any mechanics change:

1. the **windmill**, which already keeps walking while it swings — if it out-damages
   the composed script, this defect is the whole explanation, and the gate's
   "composed >= 6/5 windmill efficiency" requirement is in real trouble;
2. **attack phases that keep their feet**, `heading(toward, APPROACH_SPEED)` in place of
   `Vec2::ZERO`.

The second is not a licence to invent vocabulary. The twelve-phase table simply does not
name a move for phases 3, 4, 7 and 8, and checkpoint A resolved that silence as zero;
the same reference's fixture DSL defines `BT(h,m)` as "Brute **Attack**(F), move `m`"
and passes `m = (-1,0)` in several rows, so attacking while closing is established
vocabulary in the same document. The silence was resolved the wrong way, and the
reference must say which it means before the `ARPG-SCRIPT-V1` digest is pinned.

### Both controls ran, and neither rescues the physics

`--policy composed|windmill` and `--attack-moves` landed on `lab articulated`, the
second as `ClosingAttackControlPolicy` — a policy beside the script, so that nothing
speaking for `ARPG-SCRIPT-V1` changed by a byte. All three corpora are
`--seeds 400 --mirrored`, 800 trials each, on the same fixture.

| | composed | windmill | composed + closing attacks |
|---|---|---|---|
| decided by a body | **0 (0.0%)** | **7 (0.9%)** | **2 (0.2%)** |
| reached tick 3,600 | 800 (100%) | 793 (99.1%) | 798 (99.8%) |
| fighter wins, canonical / mirrored / difference | 286 / 266 / 20 | 400 / 400 / 0 | 394 / 373 / 21 |
| mean end health, fighter / brute | 0.9879 / 0.9692 | 0.9999 / 0.9334 | 0.9988 / 0.9456 |
| mean fight length, ticks | 3,600.0 | 3,580.4 | 3,596.9 |
| contact resolutions | 2,678,916 | 2,384,891 | 2,656,673 |
| `contact_cap_hits` | 19,202 | 14,098 | 19,819 |
| severance events | 8 | 35 | 15 |
| max single blow, weapon-body raw | 8,038 | 19,709 | 10,711 |
| worst tick's credited damage | 8.12 | 17.74 | 16.68 |
| refused solver ticks | 188,654 | 316,710 | 264,522 |

**The feet were the whole story about the attacks and none of the story about the
gate.** Putting them back multiplies the largest blow by 1.3x (closing) to 2.5x
(windmill), quadruples severances, and doubles the Brute's attrition — every
per-blow number moves in the predicted direction and by roughly the predicted factor.
The decisive count moves from 0 to 7 out of 800. The reference wants under ten percent
of trials on the clock; the best control is at 99.1 percent.

So checkpoint A's headline was an artifact *and* its conclusion survives the
correction: even a body that never stops walking into its own swing cannot finish a
fight inside 3,600 ticks. The floor is binding for this physics and not only for that
reading of the table, and B must choose a mechanics change.

Three cautions about the table, because two of its columns are ceilings rather than
measurements:

- **The windmill's zero side difference is saturation, not symmetry.** It wins all 400
  canonical and all 400 mirrored trials, so `abs_diff` has nowhere to go. It is not
  evidence about the `Fx`-flooring asymmetry the composed corpus's 20 detects, and the
  composed and closing corpora agree with each other (20 and 21) rather than with it.
- **`--attack-moves` is not free of the confound it removes.** It closes during all
  four attack phases, so it also spends more of the cycle in body-on-body contact; some
  of its extra attrition is leaning, exactly as checkpoint A's was.
- **The severance counts are per fact, not per limb.** Two facts that between them empty
  a region are both reported, on `after_group`'s own rule.

Only if a control still fails does B choose among, recording which and why:

1. re-derive the floor at the granularity the solver actually bills it;
2. put the point mass at the blade's centre of mass rather than in the hand — the one
   prototype variant that moved the energy budget, 2.0x dissipation and 1.49x the max
   blow, and arguably what the existing point-mass framing already means;
3. rescale the roster;
4. nothing, because a control is already decisive.

Removing the floor must be checked for *attrition* rather than blows —
`docs/design/combat.md` states the floor exists so that a geometric touch deals no
damage, and a fight decided by a thousand grazes fails the visible gate's
"committed-attack" label even when the automated thresholds pass. Any change that raises
the contact-event rate must be checked against `MAX_COMBAT_EVENTS`: the per-point
prototype took the browser high-water corpus from 446 rows to 1,024 exactly, truncating
2,459 events and violating the `high_water * 2 <= MAX_COMBAT_EVENTS` rule by 2x.

A defender's body collider also still carries one velocity for all five regions, so an
arm swung into a blade contributes nothing to closing speed. Same defect class, other
side of the fact. Out of scope here; record it, do not fix it in this session.

## Three collateral findings that outlive checkpoint A

**The evidence JSON's zero-energy-creation field cannot fail as measured.** The lab
computes `after_raw.saturating_sub(before_raw)` over observed rows, but
`resolve_group_into` returns `Err(ResolutionError::Projector)` whenever `after > before`
and `World::resolve_contact`'s error arm *clears* the resolution list — so no row with
`after > before` is ever observable. `maxEnergyExcessRaw: 0` would be a tautology
committed as proof of soundness.

**Counted, and the blind spot is enormous.** `World::contact_solver_rejections` — an
unhashed diagnostic beside `cap_hits`, on the `ContactRuntime` doc comment's own
argument that nothing there reaches the digest — reports **188,654 refused ticks across
the composed corpus's 800 trials, 316,710 for the windmill, 264,522 for the closing
control**, every first cause `ResolutionError::Projector`. That is 236 of every 3,600
ticks under the reference script whose entire contact phase was computed, rejected, and
rolled back in silence, and `maxEnergyExcessRaw: 0` was about to be committed as proof
that this does not happen.

`resolve_group_into` says a violation "is a broken projector rather than a hard input"
because "alpha zero always satisfies it". That is true of `IndependentPointProjector`
and **false of `World`'s `ContactProjector`**, whose second pass sends every equipment
row through `joint_clamped_velocity` — hand out, joint inverse-mapped and clamped, hand
back — at every alpha including zero. The round trip can return a *larger* velocity than
it was given, so alpha zero is not the identity and the search has no guaranteed-valid
floor to fall back to. Diagnosed here, not fixed here: it is a contact-solver change and
this session is a measurement.

The evidence schema must carry the rejection count beside `maxEnergyExcessRaw`, and
checkpoint D may not write the latter as a soundness field while the former is nonzero.

**`contact_cap_hits` is a real 6x regression, not a 960x one.** The measured 19,202 is a
cumulative per-`World` counter read once, correctly, and increments at most once per
tick: 24 capped ticks per 3,600-tick run. The "baseline 20" it was compared against was
a five-seed total, i.e. 4 per run. Still fatal to a gate that requires exactly zero, and
consistent with a sword parked fully extended inside the opponent for sixty ticks a
cycle — phases 5 and 6 command effort zero, and zero effort means zero acceleration, so
the arm cannot retract.

**The side-advantage threshold has no margin.** 20/400 is not an artifact — the count is
`abs_diff` over `winner() == Some(Heroes)`, with no off-by-one available — but under
pure noise at p ~ 0.69 the standard deviation of that difference is about 13, so the
gate's `<= 20` is only 1.5 sigma wide and **a perfectly symmetric simulation fails it
roughly one run in seven**. The asymmetry it detects is real (`Fx` multiplication floors
rather than truncating toward zero, which is not equivariant under `y -> -y`), but the
threshold will re-roll under any physics change. Amend it with a stated rationale rather
than re-running until it passes.

## Implementation

Add `Scenario::articulated_duel` in `crates/sim/src/scenario.rs`,
`crates/policy/src/articulated_script.rs`, and the `lab articulated` command. Use the
fixture and twelve 30-tick script phases in the reference verbatim. The command
script consumes only `ArticulatedObservation`; it never reads `World`. Its vocabulary
is approach, withdraw/rest, body turn, low/mid/high guard, left/right cut, and thrust.
The only ordinary heights emitted are `LOW`, `MID`, and `HIGH`. The Dev intermediate
control emits raw height `24_576` (3/8) through the same 55-byte command path.

`Scenario::articulated_duel` already exists and its fingerprint is pinned at
`0x2a6cc9678c08730d`; this session does not change it. Its two bodies spawn 10.8 units
apart against a 9.6 sight range, which the overview carried forward as a blocker. It is
not one: the script's `toward` retains current yaw when nothing is visible, and the
faction-derived spawn yaws already point the two bodies at each other, so phase 0
closes the gap and sight is acquired inside the first approach.

Add the twelve named replay fixtures and evidence rows in the reference. Each fixture
records the exact scenario bytes, seed, canonical command-stream digest, replay
digest, hash domain/schema, final state digest, pose digest, event digest, cap hits,
maximum energy excess, and asserted qualitative predicate. These fixtures are tests,
not hand-edited recordings.

The reference's phase table is underspecified for phases 5, 9, 10 and 11, which name a
rule for one arm and leave the other's height or reach unstated. Checkpoint A resolves
each gap, and the reference gains the complete twelve-by-two arm matrix marking which
cells are quotations and which are resolutions. The `ARPG-SCRIPT-V1` digest is only
meaningful downstream of that matrix.

## Worker and renderer join

Regenerate `client/src/protocol/abi.generated.ts`. Update
`client/src/protocol/messages.ts`, `client/src/runtime/sim-worker-host.ts`,
`client/src/runtime/sim.worker.ts`, `client/src/runtime/sim-client.ts`,
`client/src/state/snapshot.ts`, and the three worker/snapshot tests to implement the
exact model selector, transferable 55-byte command, acknowledgement, pose/event
snapshot sections, visibility filtering, offsets, and pool sizing in the reference.
Legacy init/commands/snapshots remain accepted and unchanged in meaning.
Update the now-expanded canonical message and snapshot shapes in
`docs/reference/worker-protocol.md` in the same implementation commit.

Draw debug region volumes, actual and target hands, weapon segments, shield rectangle,
contact point/normal, contact-group ordinal, and energy ledger from the final v2-16
row layout. Debug nodes use the same
filtered identity set as actors, start off, and never bypass fog. The non-debug read
must expose guard height, commitment, parry/deflection, arm loss, and leg impairment.

## Automated gate

Run seeds `0..399`, each in the canonical and exact spatial mirror: 800 trials. The
reference fixes denominators, integer forms of `<10%` and `<=5 percentage points`,
minimum event/pose coverage, exact-zero energy/cap requirements, and the separate
100-seed windmill comparison. `lab articulated --record` writes
`docs/performance/evidence/v2-articulated-gate.json` using the schema in the reference.
No threshold may silently change to fit a result; amend this plan with rationale and
rerun if a threshold was inappropriate.

## Visible foreground gate

Capture the fifteen label-free two-second clips and matching overlay stills named in
the reference from a genuinely visible foreground browser. A reviewer blind to the
fixture labels classifies each clip. Pass requires at least 12/15 overall and at least
2/3 for each of the five phenomena, plus exact overlay agreement on identity, region,
height, normal, and severance. Commit the review Markdown and SHA-256 manifest. Record
exactly `pass`, `revise`, or `stop` here after review; deterministic but unreadable or
uncontrollable is `revise` or `stop`.

**Gate result:** pending.

## Pin and registry updates

Only after both gates pass, pin the canonical seed-zero original-orientation final
digest as `ARTICULATED_HASH` with `HashDomain::ArticulatedV1` and schema `1` in:

- `crates/sim/tests/determinism.rs`;
- `tools/wasm_check.js`;
- the golden registry in `docs/reference/hashes.md`.

The registry row names `Scenario::articulated_duel`, seed zero, the scripted-policy
digest, stop-at-outcome rule, both pin sites, and the only permitted re-record path:
repeat this whole gate. Never re-pin a legacy hash.

Both pin sites decode the same committed codec-V2 replay bytes with `include_bytes!`;
neither runs the policy. Native, replay, and wasm must return the identical
ArticulatedV1 `(domain, schema, value)` tuple before the value is recorded.

```powershell
cargo test
cargo run --release -p lab -- articulated --seeds 400 --mirrored --record
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
npm ci
npm run generate:abi
npm run check
npm run build
node tools/check_docs.js
git diff --check
```
