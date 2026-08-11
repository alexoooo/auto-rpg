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
  attack's entire closure is the arm term alone. *(That formula was true when this was
  measured and is not true now: checkpoint B's mechanics change samples a held
  segment at `+ balance * swing`, the blade's centre of mass. It does not rescue the
  reading — the term it adds is the arm's own motion rescaled, and the body term the
  script gave up is still the larger one.)*
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

### The projector defect was fixed first, and it moved the baseline the decision is made against

The three corpora above were measured on a solver that was throwing 6.5% of its ticks
away (see the collateral findings below). That is fixed, so all three were re-measured
before any calibration is chosen. **No calibration was touched**: no
`CONTACT_ENERGY_FLOOR`, no `WOUND_PER_ENERGY`, no roster maximum, no actuator constant,
no change to the point-mass framing. The only change is that
`ContactProjector::project` no longer re-derives a row whose hand nothing moved.

| | composed | windmill | composed + closing attacks |
|---|---|---|---|
| decided by a body | **3 (0.4%)** | **11 (1.4%)** | **4 (0.5%)** |
| reached tick 3,600 | 797 (99.6%) | 789 (98.6%) | 796 (99.5%) |
| fighter wins, canonical / mirrored / difference | 274 / 255 / 19 | 400 / 400 / 0 | 398 / 396 / 2 |
| mean end health, fighter / brute | 0.9890 / 0.9680 | 0.9998 / 0.9159 | 0.9991 / 0.9406 |
| mean fight length, ticks | 3,594.6 | 3,575.3 | 3,590.5 |
| contact resolutions | 3,087,875 | 3,265,399 | 3,274,836 |
| `contact_cap_hits` | 53,494 | 70,987 | 62,112 |
| severance events | 20 | 47 | 21 |
| max single blow, weapon-body raw | 13,892 | 18,848 | 12,663 |
| worst tick's credited damage | 18.00 | 17.82 | 17.84 |
| refused solver ticks | **0** | **0** | **0** |

**Recovering the rejected ticks does not rescue the gate, and that is the finding.**
Every lethality column moves the right way -- the composed script's largest blow grows
1.7x, its severances 2.5x, its decisive count from 0 to 3 -- and the reference still
wants under ten percent of trials on the clock against a best control of 98.6 percent.
The floor is binding for this physics on a solver that now bills all of it, so B still
has to choose a mechanics change and the four options below stand unchanged.

Two second-order readings worth carrying:

- **`contact_cap_hits` roughly tripled** (19,202 to 53,494 on the composed corpus).
  More impulse survives the energy check, so more pairs re-sweep inside the tick and
  more ticks exhaust the group cap. A gate that requires exactly zero cap hits is
  further away than checkpoint A measured, not closer.
- **The check this file demanded was run, and `MAX_COMBAT_EVENTS` failed it.** The
  browser high-water corpus went from 446 rows to 556, which is under the 1,024 cap but
  past the `high_water * 2 <= MAX_COMBAT_EVENTS` rule, so the capacity is 2048 and the
  publication budget is 279,040 bytes. Nothing was dropped at either size. Note what
  this was *not*: that corpus refuses no tick and refused none before, so the extra
  rows are contact the solver used to discard as an energy gain it never was.

Only if a control still fails does B choose among, recording which and why:

1. re-derive the floor at the granularity the solver actually bills it;
2. put the point mass at the blade's centre of mass rather than in the hand — the one
   prototype variant that moved the energy budget, 2.0x dissipation and 1.49x the max
   blow, and arguably what the existing point-mass framing already means;
3. rescale the roster;
4. nothing, because a control is already decisive.

### The floor was swept 144 to 0, and option 1 is not the first move

The controls did fail, so the choice above was made by measurement rather than by
argument. `CONTACT_ENERGY_FLOOR` was made readable from an environment variable through
one `OnceLock` — default 144, so an unset run is byte-identical to the shipped tree —
two unhashed diagnostic columns were added beside each `ContactResolution`, and the whole
composed corpus was re-run at nine floor values. **The instrumentation is reverted and
nothing was committed**; floor 144 reproduces the post-projector-fix table above exactly,
which is what says the harness is inert.

**Option 1 is refuted as the first move, on its own terms.** A contact episode — a
maximal run of consecutive ticks carrying a weapon-body row for the same *(attacker,
weapon slot, defender, region)* — lasts a mean of 10.50 ticks over 160,626 episodes,
median 3, and is **not bimodal**: episodes opened during attack phases run 11.56 ticks
against 9.68 elsewhere. Duration does not distinguish a committed cut from leaning, and
the per-swing/per-tick conversion factor is soft by a factor of two depending on which
population it is taken over (10.50 over all episodes, 19.81 with the region column
dropped, 20.00 over episodes carrying enough summed share to have been a swing — and
that last selection is circular, since it selects on the quantity the floor is compared
against). The derived floor is therefore 7, or 14, according to taste. Both were swept.

| floor | 144 | 96 | 72 | 48 | 24 | 14 | 12 | 7 | 0 |
|---|---|---|---|---|---|---|---|---|---|
| decided by a body, of 800 | 3 | 0 | 1 | 2 | 1 | 2 | 1 | 5 | 2 |
| **facts ≥ 65,536 raw** | **39** | **27** | **41** | **41** | **41** | **43** | **29** | **28** | **34** |
| damaging facts per trial | 3.8 | 5.8 | 8.1 | 13.5 | 28.6 | 44.4 | 50.0 | 72.6 | 266.5 |
| median damaging fact, raw | 6,400 | 5,376 | 4,288 | 2,784 | 1,728 | 1,440 | 1,248 | 960 | 192 |
| median admitted closing ÷ `IMPACT_THRESHOLD` | 1.09 | 0.94 | 0.81 | 0.64 | 0.51 | 0.42 | 0.39 | 0.29 | 0.10 |
| side difference, gate wants ≤ 20 | 19 | 7 | **30** | 12 | 10 | 10 | 9 | 2 | 3 |

**The `≥ 65,536` row is the finding.** A Brute region holds 196,608 raw, so that bar is a
third of one — the scale of a blow that takes something. It is flat within Poisson noise
across the entire sweep while total credited loss grows 7.0x, the damaging-fact count
grows 69x, and the median damaging fact shrinks 33x. **Deleting the floor entirely adds
no decisive blows at all.** Every raw unit taken off it is spent on facts too small to
see, which is precisely the attrition failure this file demanded be checked for, now
measured rather than feared.

A second bar agrees, and it is `docs/design/combat.md`'s own. At 144 the median contact
the floor admits is closing at **1.09x legacy `IMPACT_THRESHOLD`** — the raw 3,932 that
defines "is this a swing at all". That could have landed anywhere in the table. Below 96
the model starts billing wounds for touches the design document calls geometric.

**What the sweep diagnoses instead is upstream of every constant in `channels`.** Over
2,051,588 weapon-body rows the median closing speed at contact is **67 raw against
`IMPACT_THRESHOLD`'s 3,932** — only 0.12% of contacts reach it, only 1.42% carry a blade
whose own `1/2 m v²` is 144, and the total weapon-body share dissipated across a whole
3,600-tick fight is 4,745 raw, about 0.072 units of energy. The blade is arriving roughly
sixty times slower than the legacy bar for a swing. No threshold value can rescue energy
that was never generated, and that is why the sweep's own best result anywhere — the
windmill with the floor deleted, 91 of 800 decided — still leaves **88.6% of trials on
the clock against a reference that wants under ten percent**.

**The order therefore flips: option 2 first, option 1 deferred rather than dismissed.**
Because the floor subtracts a fixed amount, raising the energy scale and keeping 144
compose better than either alone: a tail fact at share 289 — the largest observed, the
one that credits the 13,892 max blow — moves to about 434 under a 1.5x scale and credits
290 instead of 145, while the median fact at share 0 to 4 still credits nothing at either
scale. The floor acts as a high-pass filter and option 2 raises the signal above it,
which is *bigger blows without more grazes*, the exact shape the visible gate at
checkpoint E asks for. Lowering the floor first would flood the same corpus with
sub-visible facts and make that review harder to pass, not easier.

**Option 1 remains a real defect and must be re-derived once option 2 lands.** Charging
144 against each of the 520,752 facts that carry any energy is 74,988,288 raw against a
corpus budget of 3,795,677 — a **19.8x over-charge**, five times larger than everything
the model has to spend, suppressing 86% of the damage the physics could otherwise
deliver. The form is wrong: it charges per fact per tick a number defined per swing. It
is simply not the binding constraint yet. Thresholding accumulated energy once per
episode instead of once per tick was measured directly as the better-shaped rule and
releases 982 raw/trial against 636 — 1.54x, and nowhere near enough on its own.

Three things to carry forward from the run:

- **The `<= 20` side-advantage threshold is confirmed broken by evidence, not only by
  arithmetic.** Floor 72 produced a difference of **30** — a gate failure on a change
  that moved no other column. Amend it with rationale, as the collateral findings below
  already argued from the 1.5-sigma width.
- **A future floor change moves two non-legacy pins and five unit tests**: the v2-14
  behavioural contact corpus `ARPG-CONTACT-BEHAVIOR-V2` = `0x587b0259e877105a`, paired in
  `crates/sim` and `crates/web`, at *every* value other than 144; and the v2-16
  native/wasm pose/event stream digest at floors <= 14 but not at 24 and above. **All six
  legacy pins held at every swept value including 0**, verified by full-suite run.
- **The `MAX_COMBAT_EVENTS` check passes and the pass is nearly vacuous.** The high-water
  corpus reports 556 rows, 0 dropped, at every floor value. One event row is published
  per contact *resolution*, and the floor changes neither the impulse, the alpha search,
  nor the sweep — it only redistributes an existing row's share between channels. The one
  path from floor to event count is severance changing geometry, and that corpus severs
  nothing. Where severance does happen, total resolutions *fall* as the floor drops
  (3,087,875 at 144 to 3,032,261 at 0). Lowering this constant cannot break the rule.

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

### Option 2 landed, and the bar the floor sweep could not move is the one it moves

A held segment's collider velocity is now sampled at the blade's **centre of mass**:
`clamp(body + arm.linear_velocity + balance * ((requested.tip - previous.tip) -
(requested.hilt - previous.hilt)))`, with `velocity - hand` carried on the row as
`velocity_offset` so `joint_clamped_velocity` can take it off before the joint sees it
and put it back afterwards. `EquipmentSpec::balance` and not a hardcoded half: it is
already validated, already fingerprinted, and `rules::grip_limit` already calls it the
weapon's centre of mass, so the articulated model now agrees with a definition this
repository had already written down and no scenario byte moved. The **differential** and
never the tip's absolute displacement — both endpoints carry the body, so the
subtraction cancels it, while the tip alone would swap the row's unclipped `World::vel`
for the sweep's wall-clipped locomotion and be a second change in disguise. **No
calibration was touched:** no floor, no `WOUND_PER_ENERGY`, no roster maximum, no
actuator constant. The shield is deliberately untouched, because `derive_shield_pose`
already puts its centre at the hand.

| | composed | windmill | composed + closing attacks |
|---|---|---|---|
| decided by a body | **12 (1.5%)** | **14 (1.8%)** | **15 (1.9%)** |
| reached tick 3,600 | 788 (98.5%) | 786 (98.2%) | 785 (98.1%) |
| fighter wins, canonical / mirrored / difference | 332 / 332 / 0 | 400 / 400 / 0 | 400 / 400 / 0 |
| mean end health, fighter / brute | 0.9847 / 0.9323 | 0.9993 / 0.7344 | 0.9980 / 0.8394 |
| mean fight length, ticks | 3,575.8 | 3,573.1 | 3,562.0 |
| contact resolutions | 2,231,703 | 2,382,139 | 2,283,955 |
| `contact_cap_hits` | 45,714 | 50,596 | 47,563 |
| severance events | 50 | 154 | 96 |
| max single blow, weapon-body raw | 49,711 | 82,792 | 70,919 |
| worst tick's credited damage | 18.00 | 17.20 | 17.59 |
| refused solver ticks | **0** | **0** | **0** |

**The decisive count is still not the finding, and the `>= 65,536` row is.** That bar —
a third of a Brute region, the scale of a blow that takes something — sat flat at
39/27/41/41/41/43/29/28/34 across the entire floor sweep while grazes multiplied 69x.
Every row below is measured by the same instrumentation on both arms, and the baseline
column reproduces the floor-144 sweep exactly, digest included, which is what says the
harness is inert.

| composed corpus | baseline | centre of mass |
|---|---:|---:|
| **facts >= 65,536 raw** | **39** | **108** |
| facts >= 16,384 raw | 406 | 545 |
| facts >= 8,192 raw | 1,279 | 1,964 |
| damaging facts per trial | 3.8 | 7.5 |
| median damaging fact, raw | 6,432 | 5,184 |
| weapon-body rows in the corpus | 2,051,588 | 1,514,745 |
| total credited loss, raw | 29,634,144 | 55,160,736 |

The shape is the opposite of the floor sweep's. There, every raw unit released went to
facts too small to see and the top bar did not move; here the top bar grows **2.8x while
the number of chances to hit falls 26%** — 1.90 facts per 100k weapon-body rows becomes
7.13, a 3.7x rate — and the share of all credited loss carried above the bar goes 20.4%
to 28.0%. The other two corpora agree and one of them harder: the windmill's bar goes
80 to 248 and the closing control's 39 to 309.

**Not an artifact of the extra decisive fights**, which was the obvious objection and
was measured rather than argued: of the 108, only **13 come from the 12 fights a body
decided**. Restricted to the 788 that ran the full clock the bar still goes 33 to 95,
carried by 91 distinct trials against 28 of the baseline's 797.

Upstream, against the numbers the floor sweep diagnosed the physics with:

| composed corpus | baseline | centre of mass |
|---|---:|---:|
| median closing speed at contact, raw (legacy `IMPACT_THRESHOLD` 3,932) | 67 | 113 |
| weapon-body contacts whose blade carries >= 144 raw of its own `1/2 m v²` | 1.42% | 4.75% |
| contacts closing at or above `IMPACT_THRESHOLD` | 0.12% | 0.59% |
| total weapon-body share dissipated per fight, raw | 4,745 | 8,241 |

So the blade now arrives about thirty-five times slower than the legacy bar for a swing
rather than sixty, and the energy the channels have to spend per fight is 1.74x. That is
the scale change option 2 was chosen for, and the floor at 144 kept its high-pass job
while it happened: the median damaging fact barely moved.

Three things the table does not say, which the next reader needs:

- **Two of the three zero side differences are saturation and the third is noise.** The
  windmill and the closing control win 400 of 400 in both orientations, so `abs_diff`
  has nowhere to go. The composed corpus's 332/332 is a real tie, but under pure noise
  the standard deviation of that difference is about 13, so 19 to 0 is a coin flip's
  distance and is **not** evidence that the `Fx`-flooring asymmetry is gone. The
  threshold is still 1.5 sigma wide and still wants amending with a rationale.
- **Fewer contacts, not more.** Resolutions fall 28% and cap hits 15%. A blade that
  carries its own swing into the impulse separates the pair it hit, so the same clinch
  spends fewer ticks re-resolving one key. The browser high-water corpus says the same
  thing from the other end: 556 rows to **354**, nothing dropped, against a capacity of
  2,048 — the rule this file demanded be checked passes with more headroom than before,
  in the direction nobody predicted.
- **The extra damage is energy the old model discarded, not energy redistributed.** A
  rotating blade's centre of mass really does move faster than the hand that holds it,
  and `closure_energy` now bills that. `max_energy_excess` is still 0 and no group's
  ledger grows, so nothing here weakens the solver's own conservation — but the budget
  it conserves is a bigger one, and that is the whole mechanism.

**Option 1 is still owed.** The 19.8x per-fact over-charge is untouched by this change
and its re-derivation is the next thing checkpoint B has to decide, now that the signal
it filters is above it.

### The off arm stopped moving, and the shield is not what moved the corpus

**A control-surface change and not a mechanics change**, landed on 2026-08-10 for a
reason outside this plan: the game is aimed at first-person human control of one hero,
and a human cannot drive two independently articulated hands. So
`articulated_script.rs` overwrites the arm that is not the weapon arm with one fixed
target in body frame -- `(commanded body yaw, MID, 3/4, 1/2)` -- in the composed script
and both controls alike. Nothing in `sim` changed, no calibration was touched, and the
wire format is where it was: `ArticulatedCommandV1` still carries both arms and the
51-byte payload inside 55 of framing is untouched. The bearing is chosen so the shield
is coherent; that argument and its measurement live in
[`articulated-mechanical-gate.md`](../reference/articulated-mechanical-gate.md).

**The prediction was that lethality would fall somewhat**, on the reasoning that a
shield parked in a fixed forward guard blocks more consistently than one swung around
and dropped to a tuck for a third of every cycle. **It half held, and the half that
failed is the more interesting one.**

| | composed | windmill | composed + closing attacks |
|---|---|---|---|
| decided by a body | **8 (1.0%)** | **19 (2.4%)** | **13 (1.6%)** |
| reached tick 3,600 | 792 (99.0%) | 781 (97.6%) | 787 (98.4%) |
| fighter wins, canonical / mirrored / difference | 317 / 320 / 3 | 400 / 400 / 0 | 399 / 399 / 0 |
| mean end health, fighter / brute | 0.9890 / 0.9410 | 0.9995 / 0.7319 | 0.9983 / 0.8804 |
| mean fight length, ticks | 3,585.0 | 3,550.7 | 3,575.8 |
| contact resolutions | 2,755,892 | 2,262,604 | 2,654,164 |
| `contact_cap_hits` | 56,914 | 48,607 | 52,853 |
| severance events | 63 | 111 | 71 |
| max single blow, weapon-body raw | 40,128 | 57,778 | 78,116 |
| worst tick's credited damage | 17.91 | 17.26 | 17.83 |
| refused solver ticks | **0** | **0** | **0** |

Against the immediately preceding centre-of-mass baseline (12/14/15 decided, 98.5/98.2/
98.1% on the clock, 50/154/96 severances, 49,711/82,792/70,919 max blow), on the
blows-versus-grazes bars this file reads lethality by:

| | composed | | windmill | | closing | |
|---|---:|---:|---:|---:|---:|---:|
| | before | after | before | after | before | after |
| **facts >= 65,536 raw** | **109** | **123** | **258** | **209** | **310** | **165** |
| facts >= 16,384 raw | 545 | 378 | 3,636 | 3,515 | 1,834 | 1,523 |
| facts >= 8,192 raw | 1,964 | 1,393 | 7,024 | 7,087 | 3,377 | 2,909 |
| damaging facts per trial | 7.5 | 6.2 | 20.4 | 20.5 | 9.9 | 9.0 |
| median damaging fact, raw | 5,184 | 4,992 | 6,528 | 6,720 | 6,432 | 6,048 |

**The decisive count is noise and should not be read as anything else.** Eight, twelve,
thirteen, fourteen, fifteen and nineteen out of 800 are all within about 1.5 Poisson
sigma of each other; the windmill going *up* 14 to 19 and the composed script going
*down* 12 to 8 in the same change is the clearest possible statement that this column
cannot resolve the effect. The `>= 65,536` bar is the one this plan reads, and it does
not agree with itself either: **+13% composed, -19% windmill, -47% closing**. Only the
closing corpus's move is comfortably outside Poisson noise on its own count.

So **lethality fell on two of the three corpora on the top bar and did not fall on the
composed one**, while every corpus lost middle-bar facts and lost grazes. The shape is
"fewer chances, similar top end" rather than the "bigger blows without more grazes" the
centre-of-mass change produced.

**The Brute's empty hand is the larger half of the change, and the expectation that it
would cost nothing is wrong.** The obvious reading is that this is the shield: the
Fighter now carries a plate at three-quarter reach through the four attack phases that
used to tuck it. That was measured against rather than assumed, by running the composed
corpus with the override applied *only to an off hand holding equipment*, so the Brute
keeps its old tuck and the Fighter is the only body that changes:

| composed corpus | baseline | static shield only | both off arms static |
|---|---:|---:|---:|
| decided by a body | 12 | 13 | **8** |
| mean end health, fighter | 0.9847 | 0.9884 | 0.9890 |
| mean end health, brute | 0.9323 | **0.9282** | **0.9410** |
| contact resolutions | 2,231,703 | 2,536,264 | 2,755,892 |
| severance events | 50 | 77 | 63 |
| facts >= 65,536 raw | 109 | 128 | 123 |
| damaging facts per trial | 7.5 | 6.5 | 6.2 |

**The shield alone moves nothing decisive** -- 12 to 13 -- and it makes the Brute
*worse* off, not better (0.9323 to 0.9282). The whole of the drop to 8, and the whole of
the Brute's recovery to 0.9410, arrives with the Brute's own empty left hand. The
mechanism is geometric and is not about shields at all:
`geometry::body_region_volumes` builds each arm region as a capsule from the shoulder
to **the hand**, so extending an empty off hand from a quarter reach to three quarters
lengthens that body's `LeftArm` collider forward by half an arm length. On this roster
an arm region holds the same integrity maximum as the torso, so a Brute with its left
arm out has a longer fleshy interceptor between the Fighter's sword and everything
behind it, and the pair separate earlier: contacts rise 23% while damaging facts fall
17%, which is exactly the signature of more early, non-damaging contact.

The change is symmetric in code and asymmetric in effect, as expected -- but the
asymmetry runs the other way from the prediction. The body that gains is the one whose
off hand is *empty*.

Three things to carry forward:

- **`ARTICULATED_STREAM_DIGEST` did not move and could not have.** The fixture behind it
  is driven by `stream_digest_command` in `crates/web/src/lib.rs`, a hand-written
  command submitted once on tick zero; it never calls this crate. No change confined to
  `crates/policy` can move that pin. It reads `0x6f879c13430adfc1` before and after,
  native and wasm agreeing, and [`hashes.md`](../reference/hashes.md#golden-registry)
  now says so in the registry note so the next session does not predict a move it
  cannot get.
- **`ARPG-SCRIPT-V1` moved on all three corpora, which is the whole point of it.** Seed
  zero, canonical orientation: composed `0x6494b2aca46d9d44` to `0xd560b0bd102b1d0e`,
  windmill `0x4e7382510e4aa41c` to `0x98c360ce9f3409ef`, closing
  `0xceb99674adec24f5` to `0x1c2aa34c5d0e8df7`. The seed-zero `ArticulatedV1` state
  digests moved with them: `0x93fe9da65156f17d` to `0x92edc5829928bfef`,
  `0xa16982a100cd03c7` to `0xca30739947f30f48`, `0xad3488669d7bc74f` to
  `0x657358fa504b0518`. None of these is pinned anywhere; `ARTICULATED_HASH` is still
  absent and is still created once, at the end of v2-17.
- **All six legacy pins held**, verified by full-suite run and by `wasm_check.js`.

**The `<= 20` side-advantage threshold re-rolled again and is still not a measurement.**
The composed corpus went from a difference of 0 to 3 and the other two are saturated at
400/400 in both orientations. Nothing here is evidence about the `Fx`-flooring
asymmetry; the threshold is still 1.5 sigma wide and still wants amending with a stated
rationale rather than a passing run.

### The empty half of that pose was a defect, and the diagnosis above named the wrong column

The section above is left standing whole. Its geometry is right, its arithmetic is
right, and its conclusion -- "the body that gains is the one whose off hand is
*empty*" -- is right. What it got wrong is **why**, and the correction is only visible
from a configuration it did not run.

The pose applied to an empty off hand changed two columns of that arm at once: the
reference table had left it at `tucked` = `(MID, reach 1/4, effort 0)` and the override
put it at `(MID, reach 3/4, effort 1/2)`. The probe above removed both together, so it
could not say which one mattered. Landed 2026-08-10: the reach becomes conditional and
nothing else does.

```text
off arm holding equipment = (commanded body yaw, MID, reach 3/4, effort 1/2)
off arm empty             = (commanded body yaw, MID, reach 1/4, effort 1/2)
```

A quarter is `ARM_MIN_REACH_RAW` exactly -- the joint's own floor, and where `tucked`
and `actuator::tucked_arm` already park an arm nothing is driving -- so it is a resting
reach and not a chosen one. Effort stays a half either way: an empty hand still has to
be *held*, or contact leaves it wherever it put it, and that is what "static" was
supposed to mean. The arm is still fixed in body frame, still turns with the torso,
still identical on all twelve phases, still read off `ArmRoles::weapon` so a Fighter
that loses its sword arm freezes the stump, and still applied by one function in all
three policies. No calibration was touched and the wire format did not move.

**The geometric claim is exact and it holds.** Measured on the fixture through the
observation, where the perception blur cancels in `upper - lower`, the Brute's
`LeftArm` capsule is **35,604 raw (0.54328 units) at the resting reach and 53,096 raw
(0.81019 units) held out at three quarters -- 1.491x**, half an arm length of
flesh-grade collider grown out of the shoulder for a hand carrying nothing.
`an_empty_off_hand_does_not_lengthen_the_arm_it_hangs_from` pins both numbers, and the
resting figure is also what the pre-override tuck produced, so this configuration
restores the baseline's arm geometry exactly.

**The corpus claim does not hold.** The last three configurations are identical except
in that one arm's two columns -- the Fighter's shield is static in all three -- so the
composed corpus decomposes them:

| composed corpus, 800 trials | empty hand `(1/4, e0)` | `(1/4, e1/2)` | `(3/4, e1/2)` |
|---|---:|---:|---:|
| | *shield-only probe* | *this change* | *the unconditional pose* |
| brute mean end health | 0.9282 | **0.9424** | 0.9410 |
| contact resolutions | 2,536,264 | 2,502,035 | 2,755,892 |
| facts >= 65,536 raw | 128 | 101 | 123 |
| decided by a body | 13 | 8 | 8 |

Giving the empty hand the authority to hold station is worth the **whole** of the
Brute's recovery -- 0.9282 to 0.9424, past the 0.9410 the unconditional pose reached --
and extending it afterwards is worth 0.0014, which is nothing. So the interceptor is
real, it is 1.49x, and on this corpus it does not move the body it hangs from; what
moved the Brute was `integrate_arm` finally having some acceleration to chase a
contact-displaced hand back with. The paragraph above blamed the reach because the
probe it had could not see the effort.

Four configurations, three corpora, one instrumentation. **Counting convention:**
a damaging fact is a `WeaponBody` resolution row with `cut_raw + thrust_raw > 0`,
valued at the **unclamped** `(cut_raw + thrust_raw) * WOUND_PER_ENERGY`; the clamp
against pre-group integrity is not visible from a published row. That convention
reproduces every prior column in this file to the digit, including the seed-zero
`ARPG-SCRIPT-V1` digests, which is what says the harness is inert. (The one place
this file disagrees with itself -- 108 against 109 for the centre-of-mass composed top
bar -- resolves to **109**.)

| composed corpus | baseline | shield-only | unconditional | **conditional** |
|---|---:|---:|---:|---:|
| decided by a body | 12 | 13 | 8 | **8** |
| reached tick 3,600 | 788 | 787 | 792 | **792** |
| side difference, gate wants <= 20 | 0 | **19** | 3 | **1** |
| mean end health, fighter / brute | .9847 / .9323 | .9884 / .9282 | .9890 / .9410 | **.9886 / .9424** |
| contact resolutions | 2,231,703 | 2,536,264 | 2,755,892 | **2,502,035** |
| `contact_cap_hits` | 45,714 | 52,146 | 56,914 | **51,664** |
| severance events | 50 | 77 | 63 | **54** |
| max single blow, raw | 49,711 | 39,603 | 40,128 | **31,338** |
| facts >= 65,536 raw | 109 | 128 | 123 | **101** |
| facts >= 16,384 raw | 545 | 549 | 378 | **438** |
| facts >= 8,192 raw | 1,964 | 1,744 | 1,393 | **1,643** |
| damaging facts per trial | 7.5 | 6.5 | 6.2 | **6.4** |
| median damaging fact, raw | 5,184 | 5,568 | 4,992 | **5,376** |
| refused solver ticks | 0 | 0 | 0 | **0** |

| windmill control | baseline | shield-only | unconditional | **conditional** |
|---|---:|---:|---:|---:|
| decided by a body | 14 | 21 | 19 | **20** |
| mean end health, fighter / brute | .9993 / .7344 | .9994 / .7244 | .9995 / .7319 | **.9990 / .7325** |
| contact resolutions | 2,382,139 | 2,209,743 | 2,262,604 | **2,204,699** |
| severance events | 154 | 164 | 111 | **163** |
| max single blow, raw | 82,792 | 191,873 | 57,778 | **99,812** |
| facts >= 65,536 raw | 258 | 266 | 209 | **264** |
| facts >= 16,384 raw | 3,636 | 3,625 | 3,515 | **3,598** |
| facts >= 8,192 raw | 7,024 | 7,204 | 7,087 | **7,121** |
| damaging facts per trial | 20.4 | 20.8 | 20.5 | **20.7** |
| median damaging fact, raw | 6,528 | 6,624 | 6,720 | **6,624** |
| refused solver ticks | 0 | 0 | 0 | **0** |

| closing control | baseline | shield-only | unconditional | **conditional** |
|---|---:|---:|---:|---:|
| decided by a body | 15 | 14 | 13 | **9** |
| mean end health, fighter / brute | .9980 / .8394 | .9985 / .8529 | .9983 / .8804 | **.9984 / .8827** |
| contact resolutions | 2,283,955 | 2,508,908 | 2,654,164 | **2,521,981** |
| severance events | 96 | 64 | 71 | **82** |
| max single blow, raw | 70,919 | 40,042 | 78,116 | **53,712** |
| facts >= 65,536 raw | 310 | 249 | 165 | **185** |
| facts >= 16,384 raw | 1,834 | 1,749 | 1,523 | **1,568** |
| facts >= 8,192 raw | 3,377 | 3,253 | 2,909 | **3,021** |
| damaging facts per trial | 9.9 | 9.6 | 9.0 | **9.3** |
| median damaging fact, raw | 6,432 | 6,240 | 6,048 | **6,048** |
| refused solver ticks | 0 | 0 | 0 | **0** |

**The decisive column resolves nothing and neither does most of the rest.** Across the
whole matrix it runs 8 to 21 out of 800, and every pairwise difference in it is under
1.2 Poisson sigma -- including 13 to 8 on the composed corpus and 15 to 9 on the
closing one, which are the two that look like findings. The top bar is barely better:
the only move anywhere in the twelve runs that clears two sigma on its own count is the
closing corpus's 310 to the static family's 165-249, and that belongs to the previous
change rather than this one. This change's own top-bar moves against the unconditional
pose are +22 composed, -55 windmill, -20 closing: 1.5, 2.5 and 1.1 sigma, disagreeing
in sign, and Poisson understates all three because the facts cluster by trial.

So **this is a design correction with no demonstrated mechanical benefit**, and it
should be read as one. The argument for it is that an empty hand carries nothing, so a
guard's reach on it buys nothing and costs a 1.49x collider; the argument against it is
that the composed corpus's top bar -- the bar this file reads lethality by -- is the
lowest of the four configurations at 101, and 123 to 101 is exactly the size of move
this file has twice refused to bank in the other direction. Three things do lean for
it: the Brute ends healthiest of the four on two of three corpora, the side difference
is 1/1/0 against the shield-only probe's **19** on a gate that wants <= 20, and it is
the only configuration whose off-arm pose can be argued from the model rather than from
a corpus.

Two pin notes:

- **`ARPG-SCRIPT-V1` moved on all three corpora again**, seed zero, canonical
  orientation: composed `0xd560b0bd102b1d0e` to `0x97255a963c48b662`, windmill
  `0x98c360ce9f3409ef` to `0xf2e3bc19d3cf76e7`, closing `0x1c2aa34c5d0e8df7` to
  `0x08731f9f5ee587f6`. The seed-zero `ArticulatedV1` state digests moved with them:
  `0x92edc5829928bfef` to `0x799b67da7745b462`, `0xca30739947f30f48` to
  `0xa004102c529507f8`, `0x657358fa504b0518` to `0x6620a0bc34ffde06`. None is pinned.
- **`ARTICULATED_STREAM_DIGEST` did not move**, as the registry note now predicts it
  cannot: `0x6f879c13430adfc1` before and after, native and wasm agreeing. All six
  legacy pins held, verified by full-suite run and by `wasm_check.js`.

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

**Fixed by checkpoint B (2026-08-10), and all three corpora now refuse nothing.** The
cause was narrower than "the round trip can return a larger velocity": it re-derives
rows *nothing moved*. Instrumented over seed 0, 156 of the first 166 refusals had no
joint limit involved at any row — pure forward/inverse drift, up to 68 raw units of
hand movement, added to an absolute velocity the group had not touched — and the ten
that did were the same drift landing 1 or 2 raw units under `ARM_MIN_REACH_RAW` on an
arm already at minimum reach. `ContactProjector::project` now keeps the body-translated
velocity whenever the accumulator and the entry clamp between them moved the hand
nowhere, which is the rule the final commit already kept and for the same reason, and
makes alpha zero the identity by construction rather than by measurement. The lab test
that asserted a nonzero rejection count is inverted rather than deleted.

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

**Retired on 2026-08-10 rather than answered.** The matrix is written out in the
reference, and its off-arm column is one static pose repeated twelve times -- one pose
per body, since the same day's correction made the reach conditional on what the hand
holds, but still one pose for the whole fight and the same one on every row. There is
no longer a second arm to underspecify: whatever those four rows decline to say about
the off arm, the pose has already said. The resolutions above are still live for the
arm each phase *names*, whose height or reach the table also leaves out in places.

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
