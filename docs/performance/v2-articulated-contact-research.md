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
