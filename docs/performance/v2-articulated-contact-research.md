# Articulated contact research record

**Purpose:** Preserve the measurements and rejected mechanics hypotheses that led from the failed smart-combat gate to the current lifted-state work.
**Status:** current
**Canonical source:** feature-gated and test-only fixtures in `crates/sim/src/combat/resolution.rs` and `crates/sim/src/world.rs`.
**Update when:** The retained contact, generalized response model, lifted state, or mechanical-gate decision changes.

## Outcome

The Arena observation that motivated this work was real: learned and tactical
fighters could move their arms, but useful attacks and body decisions were rare. The
policy layer was not the only cause. A retained right-sword/Brute-body contact exposed
a mechanics defect: a local two-row impulse was evaluated through a projector that
also translated the target owner's held rows. The alpha search could therefore return
to the input energy without producing the intended restitution or wound allocation.

No production response repair has been authorized. Everything added after that
diagnosis is either behavior-neutral shared plumbing or behind the disabled
`cartesian-recoil` feature/test boundary. No default hash or ABI moved, and
`ARTICULATED_HASH` still does not exist.

## Facts that survived the investigation

- The retained fact is the Fighter's **right-arm sword**, not the left shield. Its
  source equipment mass is `81_264`; the arm is at height raw `16_384` and maximum
  reach raw `65_536`. Earlier MID/minimum wording came from conflating limb slots
  with equipment slots.
- The retained contact occurs at TOI raw `55_704`, leaving `9_832` of the tick. A
  post-impact generalized velocity is not the same thing as the whole-tick hand
  displacement. Any design that stores only one of those values loses information.
- A frozen, test-only Cartesian proposal ray at scale `65_560` lowers public energy
  from `381` to `105`, dissipating `276`. The real allocator/channel/anatomy seams
  map that provisional loss to cut/thrust/pressure `132/0/144` and one Legs integrity
  loss/wound gain of `12_672` (public fractions `65_536 -> 59_200` and
  `0 -> 6_336`). This proves composition only; the ray is not a production normal or
  Coulomb solution.
- The same committed frozen ray has normal residual `0`, tangent slip `(2,0)`, normal
  impulse `5_688`, physical tangent `(-102,3,0)`, and friction radius `1_422`. It is
  neither static (slip exceeds one raw word) nor sliding (the tangent lies deep inside
  the cone). Its widened entry, normal-only comparator, and combined numerators are
  `3_273_351_951_552`, `908_935_462_288`, and `907_535_410_717`. Damage never
  selects a mechanics candidate.
- A bounded ordinary-command sweep ran `7_560` predeclared cases. It found `2_608`
  contacts, `2_338` interior contacts, `1_669` uniquely attributed contacts, and
  `312` individually eligible rows, but **zero eligible mirror pairs**. No robust
  calibration fixture was selected.
- Smart39 reran that exact 7,560-orientation grid through the bounded lifted solver,
  in four canonical ordinal shards. The release audit took `5,286.6` seconds. It
  found 57 eligible individuals, **all `mirrored=false`**, zero eligible pairs, zero
  local runs, zero robust pairs, and no selection. Its predicate counters were
  missing/attribution `5,462`, crossing `7,176`, reach `5,602`, motion `5,462`,
  impulse `5,991`, dissipation `6,066`, refusal `0`, solver `3,347`, cap `0`, energy
  `0`, and alpha `5,462`; they overlap and therefore do not sum to the corpus size.
  The frozen audit checksum is `2f550f772c7a08e0`. The all-one-sided result supports
  a geometry diagnosis: keeping the anatomical right limb and asymmetric loadout
  unchanged while reflecting space was not a physical symmetry.
- Smart40 tested that diagnosis without changing the domain, response law,
  eligibility, tolerances, or selection: its mirror swapped left/right limbs and all
  reflected hand bindings, so the plain Hero's right sword/left shield became a left
  sword/right shield and the Brute's right club became a left club. The complete
  four-shard audit still found 57 eligible plain individuals and **zero eligible
  mirror individuals**, zero local runs, zero robust pairs, and no selection. Its
  internal timer read `3,832,944` ms and the command reported `3,836.5` seconds. The
  overlapping predicate counters were missing/attribution `5,792`, crossing `7,138`,
  reach `6,940`, motion `6,935`, impulse `6,033`, dissipation `6,233`, refusal `0`,
  solver `3,309`, cap `0`, energy `0`, and alpha `5,792`; the audit checksum was
  `3e8c6246190b6b28`. The anatomical-mirror hypothesis is therefore refuted under
  this exact corpus. No local or damage result was read, and no successor transform
  has been declared.
- Smart41 removed one more pre-tick asymmetry without changing Smart40's domain or
  anatomical mirror: its controlled schedule bearing came from the declared spawn
  offset rather than the perception-noised `ObservedOpponent`. The complete
  source-41 audit still found 109 eligible plain individuals and **zero eligible
  mirror individuals**, zero local runs, zero robust pairs, and no selection. Its
  internal timer read `2,854,599` ms and the command reported `2,857.4` seconds. The
  overlapping predicate counters were missing/attribution `5,830`, crossing `7,092`,
  reach `6,695`, motion `6,685`, impulse `6,040`, dissipation `6,188`, refusal `0`,
  solver `3,218`, cap `0`, energy `0`, and alpha `5,830`; the audit checksum was
  `8ae36d7d170892dd`. Removing observation noise increased plain eligibility from 57
  to 109 but restored no mirrored eligibility, so the bearing-only hypothesis is
  refuted for this corpus. No local or damage result was read, and no successor has
  been declared.
- Smart42 repaired two Lab witnesses (mirror reach/motion now read the attributed
  left limb, and crossing uses ground-truth moving region geometry) and added
  feature-only first-rejection provenance. Its only measurement was the source-41
  ordinal-1536 pair. `Config`, `Command`, and `PreStepPose` mapped exactly; the first
  divergence was tick 1 `PostStepPose`, `right.hand.y 442259|442260`, with causes
  `none|none`. The asymmetry therefore begins as a one-raw actuator fixed-point
  reflection bias before contact. No full audit or damage measurement ran.
- Smart43 confirmed the local correction but stopped at its zero-pin firewall. Making
  the two actuator Y products odd-symmetric passed the focused tests, then the default
  native web test moved `ARTICULATED_STREAM_DIGEST` from `0xf7d3a9c73aa59981`
  (`17857803620601665921`) to `0x078dcf03bbd5ed88`
  (`544318744924908936`). The actuator source and tests were fully reverted; no
  ordinal-1536 trace or full corpus ran. The movement proves the shipped twenty-tick
  pose/event/region stream reaches the corrected arithmetic and must be reviewed as
  an owned values-pin change rather than hidden as a mirror-only repair.
- Smart44 restored that two-Y fix and its focused actuator tests passed, but the
  required ordinal-1536 trace found a later asymmetry before any pin measurement.
  The first difference was tick 33 `PostStepPose`, `right.hand.x 678247|677638`;
  rejection provenance was `none|mirror tick=32 phase=SolveGroup
  cause=ResolutionCount key=None`. Per the predeclared stop, no native/wasm digest
  comparison or pin update ran. Production and tests were fully reverted and the old
  default web digest is green again. This makes the tick-32 group/count boundary the
  next diagnostic subject; it is not evidence for widening a solver bound.
- Smart45 temporarily restored the same two-Y reproduction and found the earliest
  tick-32 group-0 boundary: `selected_time_raw` was plain `38127` and mirror `38111`.
  The plain rejection was `None`; the mirror detail was `EmptyDriverSet`. The
  16-raw TOI asymmetry is therefore already present in exact scan/geometry root
  selection, before recomputation or the lifted solver. All five focused provenance
  diagnostics passed, the actuator mutation was reverted cleanly, and no pin or full
  corpus ran.
- Smart46 found no wide-detector row: provenance was `CompatibilityFallback` under
  the temporary two-Y reproduction. Exact response was provably zero, so the exact
  dispatcher correctly routed through `scan_compatibility_candidates_into`; the
  `38127|38111` selected-time mismatch was unchanged. The wide premise was refuted,
  no primitive oracle or fix ran, the actuator was reverted cleanly, and no pin or
  corpus ran.
- Smart47 localized the compatibility fallback to one literal reflected
  segment/segment sweep: the same production primitive returned TOI `38127` plain
  and `38111` mirrored. Re-expressing both inputs about a shared origin did not change
  either answer, so absolute world-coordinate origin is not the explanation. It
  stopped before a fix or pin measurement, reverted the temporary actuator mutation
  cleanly, and ran no corpus.
- Smart48 found the first internal mismatch at iteration 1, entry time `37379`:
  interpolated endpoint `[0].y` was plain `452236` versus mapped mirror `452237`.
  `Fx::lerp` rounded `+1180*37379 -> +673` but `-1180*37379 -> -674`; closest point A
  and distance followed, while speed was equal at `8144`. Direct and shared-origin
  TOIs remained `38127|38111`. No fix, pin measurement, or corpus ran, and the
  temporary actuator mutation was reverted cleanly.
- Smart49's direct reflected TOI is `38127|38127`. A fresh complete reproduction with
  both actuator Y products and all four swept-segment endpoint interpolations
  corrected returned `ticks=49 phase=none`. This supersedes the earlier tick-33
  one-raw report: that run was mid-edit, with the first endpoint still using
  `Vec3::lerp`, and later witness edits compounded it. Smart50's staged response,
  commit, recoil, actuator, and pose provenance also mapped exactly across all 49
  ticks, so there is no post-contact defect. The temporary repairs were reverted;
  no pin measurement or full corpus ran.
- A full-domain actual-projector normal probe sampled 27 scalar words and 101 unique
  component projections. The adjacent envelopes jumped from `[-4,-4]` to `[-4,2]`
  with no restitution-valid root: `NormalGap`.
- The preceding fixed static grammar generated 160 routes but only 48 unique XYZ
  words; every one failed restitution. Its imported normal words came from a different
  tangent state, so the run was evidence of a missing local bracket, not a reusable
  search coordinate.
- The alternate Cartesian seed impulse `[-297,-5681,0]` produces residual `[0,2,0]`
  only in that alternate mapper. The production projector gives `[64,-101,0]` for
  the same attributed fact and words. Mapper provenance is therefore part of every
  response claim.
- The input-derived production proposal is `[-183,-3508,0]`. Its entry residual is
  `[-6346,113,0]` and the actual projector returns `[68,-11,0]`. Six fixed `h=64`
  probes produced columns `[231,-4,0]`, `[3,-172,0]`, `[0,0,-103]` and midpoint
  defects `[1,-2,0]`, `[-5,-44,0]`, `[0,0,3]`. The local response is nonlinear; a
  Jacobian/trust-region fit was stopped rather than widened.
- Integer division also defeats an exact affine Cartesian projector. With owner body
  mass `2*ONE`, one held mass `ONE`, and total owner mass `3*ONE`, two raw impulses of
  two each expose zero separately, while their sum exposes one raw velocity word.
  The mass-weighted exposed change is three words for four supplied. This is a state
  precision issue, not a search-radius issue.

## What was built but remains off

The disabled `cartesian-recoil` work establishes useful seams without promoting them:

- exact contact finalization, TOI remaining-fraction endpoint mapping, allocator and
  `after_group` composition. Finalization and endpoint mapping validate every row
  before mutation and preserve the exact remaining-fraction parenthesization;
- separate equipment-COM post-contact velocity, checked motor-work/fatigue arithmetic,
  and named release/replacement/sever/cap/wall diagnostic accounting;
- checked scalar momentum and position remainders with
  `p += impulse*65_536` and `X += p*dt`, including exact `55_704 + 9_832` interval
  composition;
- one- and two-held owner decomposition with common plus relative momentum, complete
  common/relative energy cross terms, and a fixed XYZ extension. Body/common Z is
  refused while held-relative Z remains supported. Sign mirror and planar X/Y
  permutation are exact in the bounded fixtures.

These tests prove arithmetic and plumbing, not a World-ready authoritative state.
They do not yet define initialization, grip transfer, contact commit, collision
geometry, actuator work, clear accounting, hashing, replay, or wasm agreement for the
lifted remainders.

The first attempted World adapter stopped on an exact trajectory counterexample
instead of rounding it away. For mass `196_608` and momentum `262_144`, tick-one
position `1` carries position remainder `4_294_967_296`. Integrating another
`32_768` raw time exposes position `2` with zero remainder. The existing fixed-point
endpoint interpolation from public positions `1 -> 2` still exposes `1` at that
time and reaches `2` only at `65_536`. The feature test
`lifted_toi_position_can_cross_before_the_integer_endpoint_sweep` makes this failure
load-bearing. No provisional lifted row or commit adapter survived it.

The earlier recoil prototype appends a fixed active tag and COM XYZ words to the
**feature-only** state hash and canonicalizes inactive values to zero. Reset energy is
recorded in an unhashed diagnostic ledger. Actual cap, wall, and anatomy-driven
severance end-to-end fixtures are still missing; the presence of helper-level
accounting is not lifecycle proof.

## Decisions and next boundary

Do not resume scalar alpha tuning, imported normal brackets, black-box Jacobian
fitting, or damage-selected search. Each was rejected by an exact counterexample.
Do not train or promote the tactical/learned policy while the mechanical corpus lacks
a robust mirrored productive strike.

The next session is the single live plan in `docs/plans`: preserve each body's,
segment's, and shield's rotating motor trajectory while adding exact owner/held
response translation, and make their sum the one geometry evaluator used by scan,
recomputation, and commit. Its first authoritative World field must land with exact
TOI integration, lifecycle accounting, fixed hash grammar, replay, and native/wasm
agreement. Failure returns to a wider authoritative precision/layout decision.
Passing it only permits a later bounded multi-contact normal plus circular-Coulomb
solver; it does not itself authorize mechanics, Lab calibration, learning, or
`v2-18`.
