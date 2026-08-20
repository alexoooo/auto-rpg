# Smart AI tactical policy

**Purpose:** Preserve the tactical controller's measured behavioral-gate result and downstream blocker.
**Status:** current
**Canonical source:** this record. The controller measured here was `crates/policy/src/articulated_tactics.rs` and the reference below came from `crates/lab/src/strong_strike.rs`; the session that deleted the articulated model deleted both, they were last runnable at `c4e9d67`, and **this measurement is not re-runnable on this tree**.
**Update when:** Tactical threat assessment, phase transitions, strike planning, or contact-energy behavior changes.

**Measured:** 2026-08-11, native MSVC x86-64.

## Result

The stationary-target corpus sampled more than 400 mirrored rows before the full run
hit the command's 120-second execution limit. Every sampled row named a region and
crossed it before tick 1,800; command refusals and solver rejections were both zero.
This supports the controller's geometric claim but is not the required outcome gate,
and it is explicitly a partial sample rather than a completed 100-seed result. Session
05 subsequently closed `revise`: changing the billing boundary could not create energy
the contacts did not carry.

The moving-fight diagnostic was:

```powershell
cargo run --release -p lab -- articulated --seeds 10 --mirrored --policy tactical
```

After `Seek` was corrected to advance along the subject's observed body yaw, the 20
runs produced 34,386 contact resolutions: 30,906 weapon/body, 1,845 weapon/shield and
1,635 weapon/weapon. They produced three severances and zero refused submissions.
All 20 reached tick 3,600 and were scored on points; zero were decided by a body.

The policy therefore fails the session's `95/100` body decisions before tick 1,800.
That threshold is not reduced. The result is `revise`: deliberate geometry and legal
commands exist, but the current contact-energy behavior does not turn them into timely
fight outcomes.

Smart103 later promoted the mechanics-selected ordinal-3144 schedule without tuning:
28-tick full-reach chamber, 28-tick commit at raw reach 61,440, and the existing
reflected eighth-turn arc. Its complete predeclared feature gate still returned
`0/50` canonical and `0/50` mirrored body decisions. Outcomes were 26 points and 74
draws; 484 published contacts split into 12 weapon/weapon, zero weapon/shield and 472
weapon/body. There were zero refused submissions but 156,430 solver-rejected ticks,
so the contact rows cannot support a competence claim. Worst body-decision tick is
zero. Command receipts were canonical `0x5e7de3dce75ff4ce` and mirrored
`0x0bc82fd274009158`; wall time was 181,143 ms and the final decision was `revise`.
No stdout log/SHA was retained. The threshold and selected schedule remain frozen;
at that stop the next work was first-rejection provenance, not retuning or Arena
promotion. The subsequent provenance sessions below supersede that handoff.

Smart106 then captured the first seed-0 rejection in both orientations without an
extra decision or step. Canonical refuses across tick `210 -> 211` on collider pair
`0,4`, Body entity 0 slot 255 to Segment entity 1 slot 1; mirrored refuses across
`110 -> 111` on pair `1,3`, Segment entity 0 slot 1 to Body entity 1 slot 255. Both
are present owner rows `0,1`, group time zero, with supported non-disjoint swept AABBs,
and both return `Scan / ExactUnsupportedSweep`, `key=None`, from the SegmentBody
branch. Canonical used 211 steps and decision counts `[18,12]`, with receipts
command/state `0xb253af14209d3b54 / 0xe89532e009d7dd50`; mirrored used 111 and
`[10,7]`, receipts `0x27dab82def0eafac / 0x2c826ddcb0629f86`. Offered and stored
commands were equal and no submission was refused. Five focused tests passed; exact
diagnostic erasure and SegmentBody-to-SegmentShield mutations were red and restored.
No log/SHA or policy-command stdout literals were retained. The next boundary is the
named SegmentBody primitive's per-region conservative-advance progress, not policy
retuning.

Smart107 traced that progress. Canonical stops on Legs region 4, visit 21, times
`22139 -> 22140`, speed `227512707351111/1963290027425792`, feature 0, radius 23592;
mirrored stops on Torso region 1, visit 16, times `58016 -> 58017`, speed `2441/16384`,
feature 2, radius 28835. In both, current and adjacent integer times are separated,
safe-step floor/applied advance are zero, and the one-word swept AABBs overlap, so the
branch returns `UnsupportedSubRawInterval / ExactUnsupportedSweep`. The mirrored row
retained exact distance/separation/quotient words; the canonical closest A.x/y and
derived words exceeded the diagnostic's `i128` conversion and were `None`, with no
fingerprint captured. Four focused tests passed and region/AABB mutations were red and
restored. The swept one-word AABBs have no separating axis, but that broad-phase
overlap is not a contact certificate. This does not say whether contact exists between
the adjacent words; that requires a full 4096-bit continuous minimum/root oracle
before any fix or retune.

Smart108 answered that narrow question for both frozen intervals. The synchronous
eight-corner certificate accepted each at its root node: `nodes=1`, `leaves=1`,
`deepest=0`. Canonical axis/margin receipts were
`12638153115695167455 / 12577401769551740698`; mirrored receipts were
`12638153115695167455 / 5008836348223035923`. Six focused tests passed. Endpoint,
radius and omitted-eighth-corner mutations changed or invalidated the certificate and
were restored. The result proves separation only for those intervals; failure of the
bounded certificate remains the existing refusal. Smart109 may use that one-sided
fact in the scanner before the frozen competence gate is rerun.

Smart109 temporarily used that certificate in production. It removed the original
canonical tick `210 -> 211` and mirrored `110 -> 111` refusals, but canonical then
stopped at `240 -> 241` and mirrored at `148 -> 149`, both reported only as
`Scan / ExactScan`, `key=None`, `pair=None`. Command/state receipts were respectively
`1415213072758438895 / 191062832061666801` and
`5049344267239224054 / 9535803509025357177`. Since the public cause collapses several
internal seams and the pair diagnostic was absent, production was fully reverted
before wasm, pins or competence. Smart110 owns a diagnostic-only pre-mapping cause
capture; policy and Arena remain frozen.

Smart110 recovered the collapsed cause. Both later failures are `Preflight /
Trajectory(NonCanonical)` before pair ordinal 0, with 5 trajectories, 2 owners, 5
colliders and no staged/certified/recompute row. Canonical tick 240 owner 0 common Y
momentum is quotient/remainder `-4281 / +522941925551308800` at scale
`1283938665662054400`; mirrored tick 148 owner 1 is
`+13220 / -27462693414` at scale `59914856794`. Positions are exactly `0/0` in both.
The opposed quotient/remainder signs are the exact preflight violation. No combined
rational numerator was retained. Temporary behavior and diagnostics were reverted;
Smart111 now owns first-producer provenance across exact apply, advance, rebase and
World commit, not a validator relaxation or policy change.

Smart111's read-only producer audit localized the defect to clipped-wall reconciliation
in `World::commit_exact_contact`: it adds an integral delta to the common momentum's
velocity quotient but retains the prior remainder, so a quotient crossing zero leaves
opposed signs. Exact impulse application derives quotient and remainder together;
advance and tick rebase preserve momentum; staging copies it. The held wall path also
writes a zero remainder with its new quotient. The correction boundary is therefore
one common-momentum wall write, with rational identity preserved and preflight left
strict. Smart112 owns that production normalization before Smart109 and the frozen
competence gate may be retried.

Smart112's normalization and Smart109 certificate passed four normalization controls,
the Smart108 focused controls and feature compilation, but the first-provenance gate
still stopped. Canonical moved to tick `273 -> 274`, `Finish / ExactScan`, with no key
or pair and receipts `0x50eba156b8350eeb / 0x80acc66ed5168619`. Mirrored moved to
`183 -> 184`, `Scan / ExactScan`, on pair `1/3` SegmentBody with internal
`ArithmeticEnvelope`, no progress row, and receipts
`0xdd5576e91179dd8a / 0x3d8e384392310c22`. Finish subtype and mirrored arithmetic
operation/region/visit/certificate phase remain unknown. No full suite, wasm or
competence gate ran. The patch remains held only for Smart113 diagnostics; Arena and
retuning remain blocked.

Smart113 named both internal operations. Canonical Finish fails while advancing owner
0 common X from group time `64246` to `65536`: position changes from
`-8127/-55557784876107556454400` to the rationally valid but noncanonical
`-6582/+14911755380925766041600` at scale `1283938665662054400`; momentum is
`78533/+433395280414310400`. Mirrored pair `1/3` reaches the root certificate at
region 3, time 49602, axis 0, then its strict margin comparison cross-multiplies
positive rationals whose operand bit lengths are `2207/2151` and `2050/1994`; the
cross-products require 4201 bits and refuse inside the 4096-bit envelope. Diagnostics
were removed and feature checks were green. Smart114 may canonicalize the position
without changing its rational identity and compare those positive rationals without
materializing cross-products; widening, approximation, retuning and Arena remain
forbidden.

Smart114's four position and four positive-continued-fraction controls passed. Mirror
seed 0 then ran rejection-free through tick 1800; canonical first refused at
`299 -> 300`, `SolveGroup / ExactSolver`, on WeaponBody key hero entity 0 slot 1 to
monster entity 1 `BODY_SLOT`, with no pair diagnostic. Command/state receipts were
`0x667109859aa387b3 / 0x987128c826a69090`. Group ordinal/time/region, facts,
driver/lifted roots, internal solver variant and energy were not captured. No broader
gates ran. The held mechanics patch remains diagnostic, not complete; Smart115 owns
the exact solver provenance and an audit of whether body outcomes after bounded atomic
refusals can ever satisfy the roadmap's currently strict zero-refusal competence law.

Smart115 resolved that question negatively. Tick 299 first completes group 0 at time
`13408`; group ordinal 1 at time `14904` has one region-0 WeaponBody candidate/member/
fact/driver/lifted contact, hero 0 slot 1 to monster 1 `BODY_SLOT`, in a two-entity,
five-row closure. Impulse `[45288,-50928,-13422]` satisfies the final constraints,
then its exact physical-energy delta compares `Greater`, truncates to `+135766` with
`loss_raw=0`, and correctly returns `LiftedNoDissipativeCandidate`. The exact
318/301-bit numerator/denominator limb words remain in Smart115 rather than being
abbreviated here. The complete 28,791-byte audit log
`target/smart115-refusal-audit.log` has SHA-256
`7ABFD8F2CC4B6E71DEFC9A0FC8F3536E32036924EDE7CAF86DF88C3CE034DAAA` and ends at
`21/100` strict zero-refusal body decisions versus `55/100` outcome-only, with zero
body outcomes before a first refusal, 34 after, 8 clean points trials, 37 refused
points trials, 1,825 total solver rejections, and worst counts 96 canonical / 1,286
mirrored. Generalized 95/100 Tactical competence is blocked under either reading.
The selected schedule remains a valid controlled stationary mechanics result, not a
general Arena-default policy result. The roadmap therefore splits cleanly: Smart116
may land the independently proven normalization/comparison/certificate mechanics
with full gates and no competence claim; Smart117 may expose the exact canonical
ordinal-3144 source-41 fixture as a named controlled Arena preset using Tactical code
5 against a neutral Brute; Smart118 verifies that preset visibly. Smart104's default
Tactical premise is superseded, and no solver/policy retune is authorized.

Smart116 then held at its first complete feature gate. The default workspace is green
in `target/smart116-default.log` (113,717 bytes, SHA-256
`D3B2CB2142A924969B23D97C6E8113203621EE55562076D1BEC9BE2DF5E25959`), including
policy `138/138`, sim `560/560` with one ignored, determinism `10/10`, and web
`124/124` with four ignored. Feature Lab stopped at `88 passed / 10 failed / 5
ignored` in 189.79 seconds. Nine failures still unwrap the historical Smart103/106
first-rejection diagnostic that the certificate now advances past; the tenth expects
the composed refusal control `(0,None)` while production reports
`(19,Some(ExactUnsupportedSweep))`. The 35,992-byte feature log
`target/smart116-feature.log` has SHA-256
`93E842880F65F26E21C4A9A3ABB34A684B313AEBA56F5FD855EF171DF1C7D1A6`. No wasm,
digest, stack measurement, competence claim or Arena preset ran; the next action is a
test-authority audit, not a production correction.

That audit later closed test-only. The final default workspace receipt is
`target/smart116-default-final.log`, 113,717 bytes, SHA-256
`7EDBC8D60D167AA0008146F40662217B9B13154BB5DC6F34F56246DD4D20F32A`; the final
feature receipt is `target/smart116-feature-final3.log`, 124,051 bytes, SHA-256
`24C423C0124AE3747F1E6F62AC7769B1523CFBFCC501E05533DC808C7E6B41EE`, with Lab
`91/91`, policy `138/138`, sim `705/705`, determinism `10/10` and web `124/124`
(their documented ignored tests unchanged). Default wasm passed `28/28`. A prior
feature-wasm green was invalid because the checker consumed the default artifact.
The fresh feature artifact is 1,042,367 bytes, SHA-256
`25AFCA90C385F47FC701D9F47B8886E97122C02BFB67D38D177E764E14D8E1A3`; its checker
reaches a stale command expected-value mismatch after five of 23 feature checks, then
the actual feature run traps out of bounds in the `validate_owner` exact-advancement
chain. No feature witness, pin, stack headroom, Smart117 or UI result is accepted.

Smart119 measured that exact feature stack: stream digest `359328`, `Sim::advance
3568`, World step `16`, arm-rate step `108224`, contact resolution `110992`, exact
tick solve `464`, group resolve `6672`, lifted solve `177216`, trial `169616`,
by-value exact apply `112640`, exact-row validation `0`, owner validation `208`.
Their active total is `1,048,944`, 368 bytes over wasm's 1,048,576-byte stack. The
existing caller-output `apply_exact_group_into` frame is 304 bytes, predicting
936,608 active bytes and 111,968 headroom. The checker independently compared feature
command receipt `0x5fcaba34556b2737` with default expectation
`0xd1da6a40df0480b2`; that is default-expectation noise, not a new pin. No Smart119
edit survived. Smart120 owns retained `ExactTrajectoryWork` plus a separate accepted
owner stage inside `LiftedSolverScratch`, with the accepted swap only after exact
physical-energy success.

Smart120 landed that authority. The fresh 984,816-byte feature artifact
`target/smart120-feature-wasm/wasm32-unknown-unknown/release/web.wasm` has SHA-256
`45AD3C11A2C899D433AB637F4D0926D0D1D5E873212B8A8BC5C11EE0F79F5F2C`. Its active
frames total 422,384 bytes: stream `313264`, advance `3568`, World step `0` inlined,
arm-rate step `16096`, contact resolution `18864`, exact tick `464`, group resolve
`6672`, lifted solve `45344`, trial `17600`, caller-output apply `304`, row validation
`0` inlined and owner validation `208`. Headroom is 626,192 bytes. Feature native and
both calls in each of two fresh wasm instances agree at `0xa6835666303601d2`; both
instances report pages `23/77/77`, proving no second-call growth. Default/feature
workspaces and parser fixtures are green, registered pins did not move, and Smart117's
controlled preset is unblocked.

Smart117/118 complete the deliberately narrower visible goal. The controlled preset
uses Tactical code 5 for the Fighter with shield and 2-unit sword at `(9.5,7)`, a
neutral Brute at `(12,8)`, Legs height, 28 chamber ticks and up to 28 strike ticks.
Like source 41, it stops immediately after the qualifying contact: `maxTicks=53`, raw
event tick 52, published frame 53, 54 frames. Continuing with `maxTicks=54` was
measured and admits one later rejection, so the earlier 54-tick recommendation is
superseded rather than hidden. Fingerprint `0x82012ef80cd9be11` produces group energy
`346 -> 68`, dissipation/share 278, cut 133, thrust 0 and pressure 145 with zero
rejection. The UI showed Brute Legs integrity `0.94`, wound `0.06`, health `0.989`.
Two visible runs were semantically identical (recording times 3,182 ms / 2,480 ms),
and a screenshot was captured. This is a controlled, mechanics-selected strong attack
in the Arena. It does not alter the honest generalized result: `21/100` strict and
`55/100` outcome-only remain below the frozen 95/100 competence gate, so Tactical is
not promoted as the ordinary Arena default.

**Correction, 2026-08-15: that blow is now 3.8x weaker and nothing went red.**
Re-measured through the release wasm at the same preset bytes, the fingerprint is
still `0x82012ef80cd9be11`, the event is still raw tick 52 on published frame 53, the
region is still Legs and the pressure channel is still `145`. Everything else moved:

| | Smart117/118 | 2026-08-15 |
|---|---:|---:|
| group energy | `346 -> 68` | `346 -> 166` |
| dissipated / allocated share | 278 | 180 |
| cut | 133 | 35 |
| Brute Legs integrity | 0.94 | 0.983 |
| visible wound | 0.06 | 0.017 |

The incoming closure energy is unchanged, so this is not the striker missing or
arriving slower: **the projector now leaves more energy in the pair**, the allocated
share falls with it, and `available = share - CONTACT_ENERGY_FLOOR` turns a 134-unit
cut budget into a 36-unit one. Which commit did it is not yet identified; the ledger
region of `resolution.rs` was last restructured by `aa9dfaf`, and that refactor is a
candidate rather than a finding.

**How it stayed invisible is the more useful half.**
`robust_strike_arena_publishes_the_attributed_event_and_matching_damage` asserted
`dissipated > 0`, `cut > 0 || thrust > 0`, `after <= before` and "integrity fell" --
four one-sided bounds, every one of them satisfied by a blow getting four times
weaker. This is the failure mode AGENTS.md names: a bound from one side is satisfied
by a range far wider than the decision it was protecting. That test now pins the exact
published ledger `(346, 166, 180, 35, 0, 145)` from both sides, and the pin was
confirmed to fail on a one-unit change before it was accepted. The row above is what
it pins to; moving it means naming the mechanic that moved it.

Smart121 then translated the same ordinal-3144 ordinary schedule to the east wall to
close the older exact-lifecycle replay requirement. Its accepted WeaponBody receipt
was `45/46`; both exact remainder classes survived ticks 45 through 56, and the
ordinary right-hand release published at tick 54 as Fighter lane 2 with numerator
`-1_073_625_268_272` over denominator `8_589_934_592`. Live, rerun and recorded
replay matched every tick. The defender body produced no `WALL` external row, so the
predeclared gate stopped and the temporary branch was reverted. Receipt:
`target/smart121-east-wall.log`, SHA-256
`25B3D423C3425DA0BC6D11FD0113ECB7F8E1D313521B01D03F76EA861DC648B3`.
The result does not weaken the controlled Arena demonstration. At Smart121's stop it
also did not authorize either then-missing feature-only digest registration; both
were blocked on a reviewed classification of the absent ordinary wall reaction.

That classification is now complete. The retained response points west/north, away
from the stopped east-wall fixture, and the commit path previously accounted for
held wall energy without a distinct body row. Body lane 0 now records the body mass
at the same solved-to-settled clip while held lanes remain separate. The unchanged
schedule at the response-aligned north wall produces the body row at tick 45, release
at tick 54, both remainder classes, zero refusal/cap, and live/live/replay equality
through tick 56. This closes the lifecycle witness but did not itself register either
feature digest or promote Tactical. Smart122 later registered that lifecycle
transcript, while Smart123 registered a separate terminal-at-first-contact source-41
solver corpus; neither result promotes Tactical.

Smart125 then tested one ordinary-policy correction independently of that lifecycle
blocker: at the Chamber-to-Commit boundary it reran the existing deterministic plan
choice against the current observation before issuing the first Commit command. Its
focused moving-target proof passed with 141 policy tests, and restoring the stale
cached plan made that proof red. The unchanged 100-fight gate nevertheless regressed
from Smart115's 55 outcome-only body decisions to 49: 20 canonical and 29 mirrored.
Outcomes were 37 Fighter, 12 Brute, zero mutual, 35 points and 16 draw. It produced
564 contacts (15 WeaponWeapon, 12 WeaponShield, 537 WeaponBody), zero refused
submissions, 2,534 solver-rejected ticks and worst body-decision tick 549. Command
receipts were `0xddaef180716517a1 / 0xcf2e2207dd26125b`; wall time was 286,636 ms.
No retained stdout log or SHA was reported.

More contacts did not buy more body outcomes, so the recertification is a measured
regression rather than a promotion candidate. Its production branch and focused
tests were fully reverted, the prior policy suite returned to 140 unit tests green,
and the controlled Robust Strike preset remained unchanged. One unresolved policy
hypothesis remains durable: `choose_plan` may certify a hypothetical new
chamber-to-commit sweep while the runtime immediately executes only
observed-blade-to-commit. Any successor must measure those two sweeps separately and
predeclare its acceptance rule; the failed recertification does not authorize a
retune.

## Why the composed script cannot use a faster arm

Measured 2026-08-15 over 359,068 Fighter weapon-arm ticks, 100 mirrored trials, when
the bearing ceiling doubled. It is the `21/100` competence result seen from the
mechanics side, and it has a single cause with two halves.

**Eight of twelve phases command `effort: Fx::ZERO`.** `arm_available` multiplies
commanded effort into `available`, and `bearing_accel = ARM_BEARING_ACCEL_RAW *
available`, so at zero effort the acceleration is zero and `chase` returns the entry
speed unchanged: the arm coasts once and then cannot move. The composed script asks
for full effort on the weapon arm in phases 3, 4, 7 and 8 only -- `tucked` in seven
others and `rest` in one.

**On the four phases it does swing, arrival ends the swing rather than the ceiling.**
A phase is 30 ticks and the largest commanded travel is a quarter turn, which at the
old ceiling took `546 x 30 = 16,380` against a 16,384-raw target -- critically timed.
Doubling the ceiling let the same arc finish in half a phase, so the arm spent the
remainder parked:

| Fighter weapon arm, per tick | composed 1x | composed 2x | windmill 1x | windmill 2x |
|---|---:|---:|---:|---:|
| mean commanded effort | 0.321 | 0.328 | 0.993 | 0.971 |
| mean commanded reach | 0.427 | 0.430 | 0.995 | 0.978 |
| bearing step exactly zero | 64.0% | **68.6%** | 21.8% | 32.1% |
| arrived (zero bearing error) | 4.8% | **8.5%** | -- | 7.3% |
| mean blade-tip speed raw | 1,510 | 1,821 | 3,405 | 5,904 |

**Doubling the ceiling made the composed arm less often at its cap and more often
parked**, which is why its decided-fight rate did not move. The windmill chases a
target it can never reach -- `|bearing error| >= 8,192` on half its ticks -- so it is
speed-capped every tick and the whole profile rises with the cap, mean step `248.8` to
`423.8`. Fatigue explains none of it anywhere; it never exceeds `0.04`.

Contact *opportunity* is not the problem. The composed script is within three units of
the Brute on 81.9% of ticks and resolves 1,732 weapon/body rows per fight, more per
tick than the windmill at 2x. **99.5% of them carry zero cut and thrust**: it touches
the Brute constantly, below the energy floor, with a parked blade at 43% extension.

**The measured lever is phase length, and only phase length.** One edit at a time
against the reference script, decided fights at 2x: `PHASE_TICKS` 30 gives 3%, 20
gives 8%, 15 gives 28%, and 15 with closing footwork gives 59%. A monotone
dose-response is the signature of an arrival-limited swing. Two negative results
matter more than that curve:

- **Widening the commanded arc does not work and a lot of it is actively worse.**
  Chamber and commit at `+-3/8` of a turn decided 2%, *below* the 3% baseline, despite
  a higher tip speed. A follow-through alone was also worse than baseline.
- **The highest tip speed in the whole sweep decided only 10%.** So speed is not the
  lever; speed *while the blade is on the line* is, and anything that moves the blade
  off `toward` trades the gain away.

### Both candidate repairs are coupled to the learned model, and that is the finding

The chamber reach looked like the cheap one and is not. Raising phase 3 from three
quarters to full reach was implemented and measured on the shipped command --
**planted composed goes from 2.0% to 5.0% of duels decided and severances from 76 to
108, and it is neutral once the feet close** (14.5% to 14.0%, severances 144 to 150) --
and then reverted, because `Posture::Chamber` in `learn-core`'s model is *defined* as
"three quarters out, full effort, attacking" and is one of the five learned action
heads. Raising it either moves `LEARNED_INFERENCE_DIGEST` and owes a re-score, or
collapses `Chamber` and `Commit` into the same `(reach, effort, attack)` triple and
leaves the model two actions it cannot tell apart.
`the_action_table_is_frozen_by_hand` is what caught it, which is what that
test exists for. **It was `the_action_table_is_the_scripts_own_vocabulary` until session
06**, and the rename is not cosmetic: the script that supplied the other half of the pin
was deleted, so the four constants this table is frozen against are now frozen *by hand*
rather than against anything. `crates/learn-core/src/model.rs` keeps the old spelling in
the new test's own body, so a reader arriving from an older record can still find it.

So the two levers are coupled by two different routes -- phase length through
`CYCLE_TICKS`'s clock feature, chamber reach through the posture action head -- and
**there is no zero-cost repair to this script.** Any real fix to composed is a
learned-layout change that owes a checkpoint re-score against the recorded mean return
`88.922`, and should be planned as one rather than discovered halfway through. The
measured sweep above is what it should be planned from.

`PHASE_TICKS = 20` is the clean point rather than 15. `Stats::decision_period` is 12
for a Fighter and **18 for a Brute**, so at 15 the Brute's decision period exceeds a
phase and it drops phases -- part of that 28% is the Brute getting worse rather than
the Fighter getting better, visible as Fighter end health rising to 0.9880. At 20 the
Fighter's end health is essentially unchanged.

Changing it is not free and is not a script-local edit. `PHASE_TICKS` is shared with
the windmill control, which alternates on `(tick / PHASE_TICKS) % 2`, so a
composed-only change needs its own constant. `CYCLE_TICKS` is additionally a **learned
model input** -- a feature is built as `(tick % CYCLE_TICKS) * 65536 / CYCLE_TICKS` and
pinned at 360 -- so touching it moves `LEARNED_INFERENCE_DIGEST` and owes a re-score of
`checkpoints/v2-probe.ckpt` against its recorded mean return `88.922`. `ARPG-SCRIPT-V1`
moves for every corpus. No other registered golden is reachable from a script change.

**And part of the level defect is inherent.** A cadence that guards and rests spends
ticks not swinging, and four attack phases against the windmill's twelve is a 3x duty
handicap that no re-timing removes. That handicap is what the guard buys. A composed
script should not be expected to reach the windmill's 96.5%.

## Controlled strong-strike reference

The first fixed `strong-strike` diagnostic found one legal high-speed tip contact whose
closure ledger remained `381 -> 381`. Session 10 superseded that hand-placed row with a
28-tick chamber and 28-tick commit derived from public observation, parameterized over
seed, mirror, target anatomy and all nine frozen offsets. That calibration is the
authoritative current result: 519 of 900 rows are invalid because the reference misses
or produces ambiguous facts, so held-out was not opened. Exact counts, CSV digest and
the retained quick diagnostic are in
[Smart AI matched tactical mechanics](smart-ai-matched-tactical.md). The earlier row
remains useful provenance for the dissipation hypothesis, not a corpus result.
