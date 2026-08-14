# Articulated contact research record

**Purpose:** Preserve the measurements and rejected mechanics hypotheses that led from the failed smart-combat gate to the current lifted-state work.
**Status:** current
**Canonical source:** feature-gated mechanics and fixtures in `crates/sim/src/combat/{contact,lifted_solver,resolution,trajectory,wide}.rs`, `crates/sim/src/world.rs`, and `crates/sim/src/replay.rs`.
**Update when:** The retained contact, generalized response model, lifted state, or mechanical-gate decision changes.

## Outcome

The Arena observation that motivated this work was real: learned and tactical
fighters could move their arms, but useful attacks and body decisions were rare. The
policy layer was not the only cause. A retained right-sword/Brute-body contact exposed
a mechanics defect: a local two-row impulse was evaluated through a projector that
also translated the target owner's held rows. The alpha search could therefore return
to the input energy without producing the intended restitution or wound allocation.

No default response promotion has been authorized. The exact trajectory, detector,
lifted response, lifecycle accounting, and replay path now exist behind the disabled
`cartesian-recoil` feature; behavior-neutral reflection repairs are shared. Both
feature-only portability digests are registered. No ABI or legacy golden moved, and
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
- Smart49's direct reflected TOI is `38127|38127`, but the later
  `ticks=49 phase=none` report was a false green. Smart50 added a fallible wide
  evaluation to the production stage; its failure suppressed the very contact being
  diagnosed. Every Smart50 runtime diagnostic was removed. With the permanent two
  actuator-Y and four endpoint-interpolation repairs alone, Smart51 stops at
  `tick=33 phase=PostStepPose pair=right.hand.y 451340|451341`,
  `cause=none|none`. No Smart50 staged row is evidence, and Smart51 performed no pin
  measurement/update or full corpus.
- Smart52's frozen oracle proves the remaining commit asymmetry without touching the
  live path. Plain `O=30064771072/65536=458752 r0` and
  `H=59643830273/65536=910092 r1`; current `Q(H)-Q(O)` maps as
  `451340|-451341`, while `Q(H-O)` maps as `451340|-451340`. The mirror's consistent
  absolute anchor is `Q(O)+Q(H-O)=138484`, not old `Q(H)=138483`. The next-tick
  segment rebase invariant and relative shield-corner rule both passed. No behavior,
  pin measurement, or corpus ran.
- Smart53 landed shared held-relative publication/rebase authority and its focused
  segment/shield tests passed. The ordinal trace advanced to a new first boundary:
  `tick=33 phase=PostStepPose pair=body.y 524826|524827`, `cause=none|none`.
  It stopped before pin measurement or the 7,560-case corpus. The remaining subject
  is body-origin publication/rebase quantization, not held geometry or tolerance.
- Smart54 froze that body boundary without a live diagnostic. Its tick-32 Y words are
  `M=524288`, `R=35258369/65536`, zero momentum and finished group time. Absolute
  quotienting gives plain `34394996737/65536=524826 r1` and mirror
  `34324479999/65536=523749 r65535`, which maps to `524827`. The proven authority
  `P=M+Q(R)` instead gives `524826|523750`, summing exactly to the reflection constant
  `1048576`. Retained residuals `+1/65536|-1/65536` reproduce both exact numerators on
  the next tick, double reflection restores every word, and the Smart53 held-relative
  anchor is unchanged. Zeroing the `+1` remainder broke the frozen witness; restoring
  absolute quotienting broke the reflection sum as `1048575`. Both mutations were
  restored; all seven focused tests were green. Smart54 changed no production
  behavior and measured no pin or corpus.
- Smart55 landed `P=M+Q(R)` as the shared production body stage/rebase authority and
  fixed the prior tick-33 body-pose mismatch. The focused trace then stopped at the
  next first unequal authoritative word:
  `tick=33 phase=Resolution pair=resolution.point.y 514088|514089`,
  `cause=none|none`. No pin was measured or updated and the 7,560-case corpus did not
  run. This isolates the next subject to successful-row contact-point publication,
  downstream of the now-equal selected TOI and upstream of event consumers.
- Smart56 froze the successful exact recompute row and proved its TOI `38127`, mapped
  key/velocities, `WeaponBody` kind and Legs region `4` remain equal. Closest A.y is
  `52291122109816685043510180080016864147 /
  103775061921195370460915180666880 = 503889` remainder
  `9933407471017330090608963367827` plain, versus
  `56524917219262671732914416402937498733` over the same denominator `=544686`
  remainder `93841654450178040370306217299053` mirrored; closest B.y is exactly
  `524288/1` on both sides. Absolute A quotient, absolute B quotient, then integer
  midpoint are three separate publication boundaries and yield `514088|514089`.
  In key.a owner's tick-start motor frame `M0=458752|589824`, direct exact-midpoint
  publication gives `514088|534488`, summing to `1048576`; same-frame endpoints are
  `[503889,524288]|[544687,524288]`, with mapped words and opposite deltas for the
  normal. Seven tests passed. Restoring midpoint of absolute endpoint quotients and,
  separately, absolute endpoints made their declared mutations red; both were
  restored. No production behavior, pin, trace, or corpus changed.
- Smart57 landed exact-midpoint point publication and same-frame endpoint publication
  for the normal. Both prior geometry words now map. The focused trace stopped at the
  next first unequal authoritative word:
  `tick=33 phase=Resolution pair=resolution.velocity_a.y 4639|4640`,
  `cause=none|none`. No pin was measured or updated and the 7,560-case corpus did not
  run. Selection, TOI, region, distance, point and normal are now upstream-equal; the
  remaining subject is exact recompute's published contact velocity.
- Smart58 located that velocity mismatch upstream in weapon centre-of-mass sampling.
  Hilt Y delta is `1180`, tip delta `7470`, swing `6290`, and balance `36044`.
  Their product is `226716760/65536 = 3459 r27736`; reflection is
  `-226716760/65536 = -3459 r-27736`, but ordinary `Fx` multiplication floors it to
  `-3460`. With hand velocity `1180|-1180`, sampled and final velocity becomes
  `4639|-4640`. Componentwise signed `mul_div` gives `3459|-3459` and therefore
  `4639|-4639`. Exact recompute contributes `C=H=0`, and key.b is zero throughout,
  proving response publication is not the cause. Eight tests passed; ordinary-mul
  and response/ownership mutations were red and restored. No production behavior,
  pin, trace, or corpus changed.
- Smart59 landed componentwise signed `mul_div` only for weapon COM swing scaling and
  fixed the prior resolution velocity mismatch. The focused trace then stopped at
  `tick=34 phase=PostStepPose pair=right.hand.y 441359|441358`,
  `cause=none|none`. No pin was measured or updated and the 7,560-case corpus did not
  run. Tick-33 selection, resolution geometry and velocity now map; the remaining
  subject crosses the contact commit/rebase boundary into tick-34 arm integration.
- Smart60 proved every tick-33 resolution, exact owner/rebase, committed hand/recoil
  and tick-34 entry word maps. Old/new direction Y `27667|-27667` and
  `30738|-30738` produce mapped length offsets `55334|-55334` and
  `61476|-61476`. Delta `6142|-6142` times balance `36044` is the first failure:
  ordinary `Vec3*Fx` gives `3378|-3379`, signed `mul_div` gives `3378|-3378`.
  With `com_accel=102`, `com_max=614`, the former yields relative hand
  `-14040|14041` and published `441359|441358`; the oracle yields
  `-14040|14040`. Six tests passed and both mutations were red/restored. No
  production behavior, pin, trace, or corpus changed.
- Smart61 landed signed componentwise scaling only for recoil actuator
  `(new-old)*balance`; focused tests are green and the permanent cumulative trace now
  returns `ticks=49 phase=none`. Checkpoint D is pending: no pin value has been
  captured or updated and no corpus has run. Pre-measurement attribution is split by
  reach. Smart51 actuator/geometry and Smart59 COM sampling are shared/default;
  Smart53/55/57 publication and Smart61 recoil execution are feature-only. A default
  registered pin may therefore be explained only by Smart51/59 reach, while the exact
  trace and eventual Smart41 checksum may reflect the entire cumulative repair set.
- Smart61 then stopped at checkpoint D with old constants installed. Geometry stayed
  `0x9d15344883cf6e9c` and contact behavior stayed `0x587b0259e877105a`, correcting
  the predicted geometry move: its fixture does not reach the repaired interpolation.
  Default native and wasm stream digests agree at `0xdbbd86fedd61c4c7`. Feature
  native stream is the unpinned `0x2d323ac56c901e88`, but feature wasm traps with a
  memory access out of bounds in `scan_detector_into`, so the portable audit is
  incomplete. The feature command witness `0x5fcaba34556b2737` is also deliberately
  unpinned; the JavaScript checker incorrectly compares a feature artifact to the
  default registered command constant. No constant was updated and no corpus ran;
  even the agreeing default stream update is deferred until feature wasm health is
  diagnosed.
- Smart62 independently reproduced the feature wasm OOB as shadow-stack exhaustion,
  not indexed heap corruption. Active frames are stream `352160`, advance `3568`,
  `World::step` `324944`, solve `183200`, and scan `243248`, totaling `1107120` bytes
  against the approximately 1 MiB default stack. Linear memory grew normally. Scan's
  two simultaneously live inline `WideSweptAabbPoints` each contain
  `[WidePoint;20]`, about 62 KiB apiece and about 124 KiB together; they are the main
  bounded removable frame cost. Publication arrays remain on stack and a global
  stack-size increase is rejected. No behavior or pin changed; the default stream
  update remains deferred.
- Smart63's native focused equivalence/capacity tests passed. A fresh feature wasm
  artifact passes `scan_detector_into`, proving retained AABB scratch removed that
  frame pressure, then traps later in
  `ExactKinematics::finish -> advance_exact -> FixedExactOwners::from_slice`.
  Remaining active stack is measured at `965788` bytes before the finish allocation.
  The earlier apparent same-scan failure used a stale artifact because
  `ARPG_WASM_PATH` was ignored and is superseded. No digest completed, no pin changed,
  and no full suite or corpus ran. Retaining two AABB vectors was necessary but not
  sufficient for default-stack feature wasm.
- Smart64 measured owner size `720`, option `720`, the 64-row array `46080`, and
  `FixedExactOwners=46096`. Wasm frames are scan `118912`, digest `352176`, advance
  `3568`, step `324976`, solve `183200`, finish `92192`, `advance_exact=93344`, and
  `from_slice=46096`; the finish chain is about `1095552` active bytes. The verified
  baseline artifact is `965788` bytes. A reverted complete-finish bypass artifact was
  `965243` bytes but still trapped earlier in `wide_vector_sub ->
  wide_segment_segment_points -> wide_segment_body_at_time -> exact_contact_at_pose`.
  Therefore a <=`46096` owner stage cannot establish 64 KiB headroom and only exposes
  the independent recompute peak. Full SHA-256 values belong to the independent log;
  neither byte size is a SHA substitute. No production change, pin or corpus ran.
- Smart65 measured the independent recompute chain at `1132464` active bytes: digest
  `352176`, advance `3568`, step-with `324976`, step `16`, solve `183200`, exact
  contact `88960`, body-at-time `32416`, segment-points `139904`, and vector-sub
  `7248`. Its geometry tail is `268528`; reaching 64 KiB spare on the roughly 1 MiB
  stack requires at least `149424` bytes of reduction. Borrowed inputs alone made a
  `965906`-byte artifact (`e0df...03d225`) which trapped in the borrowed vector
  subtraction. Adding caller outputs for all four translations made a `965803`-byte
  artifact (`08ba...187b0`) which trapped in segment-points. Both experiments were
  reverted. This is by-value/local fanout across the helper family, not one array or
  one signature; no behavior, pin or corpus changed.
- Smart66 stopped before implementation at the scalar ABI prerequisite. The exact
  geometry wrappers cannot eliminate stack copies while `wide.rs` still passes the
  roughly 1032-byte `WideRational4096` by value through divisible add, multiply,
  divide, compare, negate and truncate. No partial geometry workspace or production
  edit landed. The borrowed/caller-output rational foundation is therefore a
  standalone prerequisite, not another contact-wrapper experiment.
- Smart67 landed only that prerequisite in `wide.rs`: borrowed/caller-output rational
  arithmetic and its lower signed/unsigned primitives use exactly eight caller work
  slots. Four focused tests passed; a zero-divisor mutation went red and was restored.
  The wasm lib-test compiled to
  `sim-401f47b6d6a19617.wasm`, `29938987` bytes, SHA-256
  `D30E53DC8CDFA2B24121197D1088996FBE552593A7EC3E52A14D4225B5312BDA`.
  `llvm-objdump` was unavailable, so this is compile evidence rather than a prologue
  measurement; the full sim suite was not claimed. No behavior or pin changed.
- Smart68 stopped before contact edits because Smart67's acceptance was premature.
  `checked_div_into` copies `work[7].numerator` and `.denominator`, roughly 516 bytes
  each, into by-value locals before calling multiply. That violates the no-copy
  prerequisite even though focused value tests pass. Smart68 keeps `wide.rs`
  immutable, so no workspace, behavior, pin or corpus change landed; the complete
  new primitive family now owes a source audit and an actual wasm prologue gate.
- Smart69 removed division's two reciprocal aggregate locals, directly wrote
  canonical zero, and propagated canonicalization refusal before output commit. The
  focused tests passed; restoring the aggregate-local shape made the frame gate red
  and was reverted. Its dependency-free parser's two tests passed and reported frame
  zero for all 12 matched borrowed rational drivers/helpers. The wasm lib-test was
  `29949694` bytes, SHA-256
  `23DCCA1790316BA7AD73C8A8DCE91084ADF2BA2B8C90DEE208042D449B43C49E`;
  the release feature web compile was `965792` bytes, SHA-256
  `F2995D778AD5E7EC229B0F0CE9683850A7A2F186F89C793DCFB7F5472E906957`.
  No feature digest, behavior pin or corpus ran.
- Smart70 stopped before edits after the production graph audit counted 179
  wide-helper invocations. `ExactWideScratch` still contains only candidate and AABB
  vectors, so an atomic scalar/output/workspace conversion was too large to land with
  meaningful mutation proof. The work is split into independently green scalar,
  point/vector/candidate, and retained-workspace checkpoints. No dormant storage,
  behavior, pin or corpus change landed.
- Smart71 stopped before contact edits because its mandatory baseline could not be
  measured. On the `29949694`-byte Smart69 lib-test artifact (SHA-256
  `23DCCA1790316BA7AD73C8A8DCE91084ADF2BA2B8C90DEE208042D449B43C49E`), the parser
  called `contact::wide_vector_sub` ambiguous: Rust emits `global.get; i32.const;
  i32.sub; local.tee; global.set`, while the tool accepted only a direct global set.
  No mechanics, storage, behavior, pin or corpus changed.
- Smart74 extended the dependency-free parser for Rust's direct, `local.tee`, and
  `local.set/local.get` stack-prologue forms. Five parser tests passed, including
  malformed/mismatched/hidden/truncated refusal. On the unchanged Smart69 artifact,
  `contact::wide_vector_sub` measures frame `9328` at body offset `2191458`; all 12
  borrowed rational helpers/drivers still measure frame zero. Smart71 may resume
  against that exact baseline. No Rust, behavior, pin or corpus changed.
- Smart71's first conversion was stopped and fully reverted when word equivalence
  found a Smart69 defect: borrowed equal-denominator addition exposes `0/3` for
  `-7/3 + 7/3`, while the old `from_words` path canonicalizes zero to `0/1`. The
  invalid overflow test was removed with the branch. No contact edit, behavior, pin
  or corpus survived; canonicalization must be corrected at the wide primitive first.
- Smart75 canonicalized borrowed addition's equal and both divisible fast branches
  before atomic commit. The two new word/branch tests and existing borrowed suite
  passed; removing fast-branch canonicalization made the canonical rows red and was
  restored. Its wasm lib-test artifact was `29968552` bytes, SHA-256
  `6A53736B360F13BF76D7C28A95341A7929DB925CBB75E9E63F13652425702C5A`.
  Every requested borrowed primitive measured frame zero; `contact::wide_vector_sub`
  remained `9328` at offset `2196213`. Smart71 may resume with no behavior or pin
  change.
- Smart71 stopped again before contact edits because its plan required the inlined,
  unnamed `wide_segment_segment_points_from_origin` as a frame root. The Smart75
  artifact instead supplies one stable retained caller per family:
  `wide_vector_sub=9328`, `wide_segment_segment_points=153376`,
  `wide_response_velocity=7536`, and `exact_contact_at_pose=107600`. Those exact
  baselines now own the signed-delta gate; if a retained name disappears, a
  byte-identical inline-never family driver must be compiled both before and after
  conversion. No mechanics, behavior, pin or corpus changed.
- Smart71's corrected first prototype was also stopped and fully reverted. One local
  `[WideRational4096;8]`, reused across the three borrowed subtraction axes, grew
  `wide_vector_sub` from frame `9328` to `12432` (`+3104`). This directly refutes the
  local-workspace checkpoint: borrowed arithmetic alone does not remove enough ABI
  copies to pay for eight inline rational slots. Smart72's local-output ordering and
  Smart73's scalar inventory are therefore unaccepted pending a minimum-work versus
  retained-seam measurement. No remnants, behavior, pin or corpus survived.
- Smart76's semantic prototype passed but its minimum-work proof was invalid and was
  reverted: `K=2..7` failed only because it delegated to Smart75's fixed-eight API,
  not because subtraction independently required eight live slots. Its historical
  wasm lib-test was `30011202` bytes, SHA-256
  `829834D52D833D3CD3EB52D47FEDA3CA36827838403C5D51EB360A996494C7CF`.
  Production and local-K8 subtraction both measured frame `9328`; caller-retained-K8
  measured frame zero, and the delegated helper `1040`. Only the retained-K8
  architecture is valid evidence. No code, behavior, pin or corpus survived.
- Smart77 consumed one retained eight-slot scalar vector in all seven segment-origin/
  axis subtractions, then stopped and reverted when
  `wide_segment_segment_points` grew from `153376` to `184480` (`+31104`);
  `exact_contact_at_pose` stayed `107600`. The inline helper left caller-side point,
  vector, output and reference staging live, so scalar retention alone is actively
  harmful. No field, helper, test, behavior, pin or corpus survived. The next
  diagnostic must move the complete caller-output result unit or the whole segment
  computation, not another scalar seam.
- Smart78 initially stopped before edits because its caller-output prototype required
  Smart72's never-landed helper layer and then duplicated the segment solver beside a
  second state-machine implementation. The amended diagnostic tests only one
  heap-resident whole-segment state machine, with all scalar, point, vector, candidate
  and committed-result words named in the state. This is a scope correction, not a
  mechanics or pin result.
- Smart78's narrowed heap-state diagnostic passed exact semantics, refusals, atomic
  dirty reuse and its bound mutations, then was fully reverted. The historical wasm
  lib-test was `30141582` bytes, SHA-256
  `8527DC754B93918AE5F3917502B26F6E06877CE677AE108281BDB97BA5FCA5BC`.
  The outer driver was only `48`, versus production segment-points `153376`, but its
  hidden phases were translate `15536`, solve `59056`, project `61120`, select
  `14528`, and restore `23840`; exact-contact stayed `107600`. Driver plus maximum
  phase saves `92208` but leaves an estimated active `1040256`, still `57216` above
  the `983040` 64-KiB-headroom target. The state architecture works, while its phase
  arithmetic/output ABI still needs reduction. Exact high-water was translate eight
  points, solve eight scalars, project nine scalars, select five candidates, and
  restore two points, within diagnostic caps arithmetic 8, persistent scalar 16,
  point 10, vector 3, candidate 5. No production code, pin or corpus survived.
- Smart79 converted only translate and solve phase prototypes before stopping and
  reverting. Translate fell `15536 -> 0` with `vector_sub_into=1040`. Solve fell
  `59056 -> 9360` (`-49696`) but missed the required `3904`; its driver was `16`,
  `dot_into=2080`, and `point_at_into=4144`. Project/select/restore did not run.
  Driver `48` plus phase `9360` saves `143968`, leaving estimated active stack
  `988496`: `5456` above the `983040` target and about `60080` headroom, `5456` short
  of 64 KiB. The translation artifact was `30005584` bytes, SHA-256
  `B8A2B18DE840E6031A319B4A99798BDA0AD85750B0DF5D17C9946673276C67EA`;
  the separate solve artifact was `30058816` bytes, SHA-256
  `F0875CB344914844624BF68ADB5A97DE4A38E8798E6E2734DDCA45E3033EB8A0`.
  Semantics passed, but no production code, pin or corpus survived.
- Smart80 reduced the solve method to `1072`; point-at, determinant and parameter were
  frame zero, dot was `1040`, and the outer driver `16`. The nested
  `interior_candidate_into` remained `8288`, so solve plus candidate stayed `9360`.
  The remaining owners are a local negated rational per distance axis and final
  candidate aggregate assembly/copy. The artifact was `30038464` bytes, SHA-256
  `D2EED91F71520100CEA4E712F34EF8222A5A86FEA440723709568B27541D8F3B`.
  Everything was reverted; the candidate must fall to at most `2832` so its chain
  with solve `1072` reaches `3904`. No production code, pin or corpus survived.
- Smart81 made the retained interior candidate `1040`; solve and its outer driver
  became frame zero. Persistent scalar slot 13 exclusively owned the negated RHS,
  disjoint from arithmetic work, difference and accumulator, with no cap growth.
  Semantics, refusal, atomic reuse, ownership and mutations passed, then the prototype
  was reverted. The artifact was `30005691` bytes, SHA-256
  `C39C8C14A19AA965BD1C354F1739C1ACCB993D11C3B9766ADB00AFA9BB437683`.
  Production segment-points stayed `153376` and exact-contact `107600`. No production
  code, pin or corpus survived.
- Smart82 stopped and reverted at its first sequential checkpoint. Project semantics,
  refusal, atomic reuse and high-water mutations passed; the project frame fell
  `61120 -> 2080`, but its nested candidate was another `2080`, making the active
  chain `4160`, `256` above the `3904` ceiling. The complete driver was zero.
  The artifact was `30010736` bytes, SHA-256
  `75FBBD4C733BFF4E1520C36CDD09DBC109F8FCFF5970FE195B1DE70D995B0BBA`.
  Select and restore did not run. No production code, pin or corpus survived; the
  project/candidate boundary must be fused or otherwise flattened.
- Smart83 fused endpoint projection and direct candidate field commit into one `2080`
  frame with no nested candidate; the complete driver was zero. Exact two-phase
  words/refusals, atomic commit and four endpoint ordinals passed, while all declared
  frame/alias/order/early-commit mutations were red and restored. The artifact was
  `30085553` bytes, SHA-256
  `EC710419C1DF77AD5C9719C76D0CAA1CF8E5EF25369F538F2927D707A980D4C8`.
  The prototype was reverted; Smart82 may resume at select then restore using this
  fused phase as its control. No production code, pin or corpus survived.
- Smart82's resumed select checkpoint matched old ordering, high-water and refusal,
  then stopped/reverted at frame `4144`, `240` above `3904`; restore did not run. The
  comparator was inlined, and the remaining likely owner is a copied `(a, b)` wide-
  rational tuple for each point axis. The artifact was `30018343` bytes, SHA-256
  `0E5315A89AACF8EA91B7BF00DB74C69C0F5B8AD8B4F8264EB0578CCCBE23F10D`.
  No production code, pin or corpus survived.
- Smart84 replaced the test-only copied candidate-field tuple with direct borrowed
  field comparison. Exact order/refusal, first-equal, dirty reuse and candidate
  immutability passed; copied-tuple, order, equality and alias mutations were all red
  and restored. The comparator frame was zero and the complete select frame `16`;
  production segment-points remained `153376` and exact-contact `107600`. The artifact
  was `30039898` bytes, SHA-256
  `74E3A431567CA4981226694975D9AFFAB9E432135613E304C3A23FF4D992AD4A`.
  The prototype was reverted. Smart82 may resume only the retained, field-atomic
  origin-restore phase; no production code, pin or corpus survived.
- Smart82's final restore checkpoint matched every old point/refusal word, committed
  feature last, reused exactly two retained points and measured frame zero; its
  aggregate, arithmetic, ordering, early-commit and alias mutations were red and
  restored. The artifact was `30024565` bytes, SHA-256
  `32341523CF1571F25B8D5259B921C1048731B9BC67E8E303E6106F4CCD01FB1D`.
  The complete independent phase evidence is translate helper `1040`/phase zero,
  solve plus candidate `2112`, fused project `2080`, select `16`, restore zero and
  driver `48`, all below `3904`. The prototype was reverted. Smart85 may integrate
  the heap state in production; no behavior, pin or corpus survived Smart82.
- Smart85's retained geometry passed focused exact equivalence and capacity reuse
  `2/2`, then was fully reverted because the real feature wasm still OOB-trapped in
  `FixedExactOwners::from_slice -> advance_exact -> ExactKinematics::finish ->
  solve_exact_contact_tick -> World::step_with_arm_rates ->
  compute_articulated_stream_digest`. Its fused artifact was `977834` bytes, SHA-256
  `11BF31BE3E591BF7D1CAE2A9B267DDEE53779581DEA0219E9469AA51F2D45BA4`.
  Frames were driver `16`, fused project `1568`, select `16`, interior candidate
  `1040`, exact-contact `76512`, segment-body `25152`, wide sweep `61520`, advance
  exact `93344`, step `325104`, and digest `352240`. The additive `833776` estimate
  was false because it omitted live wasm return ABI/caller rollback storage. The
  pre-fuse artifact was `976962` bytes with only SHA prefix `D7576D` retained; its
  project plus candidate chain was `2624`, not the predicted `2112`. No digest, pin
  or corpus completed. Owner/outcome staging is prerequisite to replaying the proven
  geometry design.
- Smart86 landed that owner prerequisite. Its `970464`-byte feature wasm artifact,
  SHA-256 `42F00A2F79C4FFEB2D69FED2FD7A9894108B4FECF19EB50737050891D6D7ADAA`,
  reduced advance to `1872` from `93344`, group apply to `304`, exact finish/apply to
  zero, solve to `480` from `183200`, and World step to `96256` from about `325000`;
  digest remained `352256`. The isolated owner runtime completed twice at
  `0x2d323ac56c901e88`, matching native, with wasm memory `1572864 -> 4784128` only on
  first initialization and unchanged on the second call. Focused advance/apply and
  clone re-reservation tests passed; one stale capacity expectation was corrected for
  the five declared Vecs. The full feature suite still has 28 reds while Smart85
  geometry is absent, so full-stream health is explicitly unclaimed. No registered
  pin or corpus ran; Smart87 must reapply geometry and classify every remaining red.
- Smart87's fused geometry passed five focused tests and runtime: its `984621`-byte
  artifact, SHA-256
  `8419C010257B6C036139B1E65E618EC5D029E1C46438BAD05CE06670CE56107E`,
  measured driver `16`, project `1568`, candidate `1040`, select `16`, while Smart86
  stayed step `96384`, solve `480`, advance `1872`, apply `304`, finish/apply zero.
  Two calls in each of two fresh wasm instances and native all returned feature digest
  `0x2d323ac56c901e88`; pages were `24 -> 74 -> 74`. No numeric summed headroom was
  recorded. The session still stopped: `a_solved_group_grows_no_retained_scratch`
  refuses `ExactScan` at `Recompute`, WeaponWeapon `0:1/1:1`, and the identical
  refusal persists after the complete geometry revert on the Smart86 baseline. Thus
  the semantic blocker is inherited, not a Smart87 regression. No geometry, pin or
  corpus survived; Smart88 owns cause diagnosis only.
- Smart88 froze that inherited case at `t=0`, WeaponWeapon `0:1/1:1`. Endpoint and
  closest evaluation, radius square and comparison all succeed; the first failure is
  candidate publication, where `wide_owner_motor_frame` returns
  `CompatibilityIdentity` because the pure behavior grammar has two equipment segment
  trajectories and no canonical owner body row. The reconstructed pre-Smart53
  absolute/rounded route succeeds with point zero, positive-X normal and velocities
  `+16384/-16384`. Four focused tests and all cause/boundedness/historical mutations
  passed red-after-mutation and green-after-restore; diagnostics were fully reverted.
  No arithmetic, search or tolerance defect was found. No behavior, pin or corpus
  changed; the next repair is a bounded equipment-only canonical frame fallback.
- Smart89 completed that bounded fallback with exact owner/entity consistency, Body
  preference and a strict one-row equipment-only grammar. Nine direct tests and all
  91 resolution tests passed after the final `owned_rows != 1` correction. The final
  isolated feature log is `target/smart89-feature-final.log`:
  `647 passed; 25 failed; 3 ignored`. Smart89 removed the pure-resolver recompute
  blocker but did not make the overall feature suite green; no pin or corpus ran.
- Smart90 isolated the next replay failure at loop index `79`, diagnostic tick `80`:
  one mapped WeaponBody member at `902` recomputes to no fact and reaches
  `EmptyDriverSet`. The right weapon has hilt start/delta
  `[704359,9233,58982]/[135,2569,0]`, tip start/delta
  `[835023,-1099,58982]/[495,9421,0]`, radius `2621`; the brute Legs segment is
  `[827064,13107,91750]` to `[814776,13107,58982]`, radius `9830`, combined radius
  `12451`. At `902`, exact closest quotients are
  `A=[813803,693,58982]`, `B=[814776,13107,58982]`. Exact distance remains
  `Greater` through `904` and becomes `Less` at `905`; candidate publication and the
  Smart89 frame are never reached. This is a scan/mapped-membership timing defect,
  not solver or publication evidence. Diagnostics were reverted; no behavior, pin
  or corpus changed.
- Smart91's boundary-started exact certification found the frozen WeaponBody contact
  at `905`, but stopped its architecture decision because the sweep witness point is
  `[814289,6900,58982]` while canonical fixed-pose recompute publishes
  `[814289,6901,58982]`; all other displayed words matched. The byte-equality gate
  therefore failed, all prototypes were reverted, and no behavior, pin or corpus
  changed. Smart92 must prove sweep publication can be discarded without affecting
  time/region/key selection, normal or velocities across WB, WW and WS.
- Smart92 stopped that proof at the next exact mismatch: for the same WeaponBody pair
  and certified time `905`, the sweep witness feature is `0` while canonical
  fixed-pose recompute publishes feature `4`. Its required selection/publication
  feature equality therefore failed before WW/WS authority could be generalized.
  All diagnostic code was reverted; no behavior, pin or corpus changed. Feature's
  role in selection, normal, suppression and publication must be audited before a
  time-only certification row can omit it.
- Smart93 completed that audit. At WB time `905`, sweep feature `0` differs from
  fixed-pose feature `4`, but poisoning copied sweep feature to `255` together with
  copied point/normal/velocity leaves `(time,key,Legs,medial)` and canonical point
  `[814289,6901,58982]` unchanged. An identical-geometry comparator alias with feature
  `0|255` is deterministic with identical publication. WW/WS poisoning controls also
  leave certified time/key and fixed-pose facts unchanged. Suppression reads only
  key/global/normal/relative velocity, so primitive feature cannot enter. Smart90's
  three focused tests and feature/default compile controls were green; diagnostics
  were reverted. No behavior, pin or corpus changed. Exact certification may retain
  only time/key/region/medial and let fixed-pose recompute own published feature.
- Smart94's temporary production integration made the frozen replay green at exact
  time `905` with canonical point Y `6901`; restoring the compatibility shortcut made
  the mutation red. It still stopped and was fully reverted: the zero-response exact
  behavior corpus refused `CompatibilityIdentity`, and group provenance recorded
  zero `wide_toi` rows where one was expected. After revert all 91 resolution tests
  passed. These are separate compatibility-grammar and diagnostic-carry seams, not
  permission to restore primitive fact authority. No behavior, pin or corpus changed.
- Smart95 proved all zero-response behavior cases `0..=6` have valid exact grammar.
  Smart94's `CompatibilityIdentity` was an unreserved direct audit: omitting retained
  `try_reserve(64)` made the exhaustive inventory red; restoring it made every case
  green. Parallel primitive evidence paired by `(key,time)` is non-authoritative:
  poisoning accepted root, closest feature, visits and comparison changes only the
  diagnostic, while selection, canonical fixed-pose fact and suppression remain
  equal. `None` evidence made its refusal mutation red; stale key/time clears key and
  `wide_toi` atomically. Feature focused/provenance filters reported nine green total.
  No production behavior, pin or corpus changed.
- Smart96's Smart94+reserve+parallel-evidence reland stopped at the frozen replay:
  public rejection was `ExactScan` rather than expected `ExactSolver`. No reland
  phase/key/internal scan cause was retained, so it was fully reverted before later
  gates. Post-revert replay returned `ResolutionCount`, the known Smart90 baseline,
  not Smart96 drift. No pin or corpus ran; a test-only reconstruction must name the
  reland's first exact refusal before another production attempt.
- Smart97 recovered that first refusal exactly: tick `79`, Recompute `ExactScan`, WB
  fighter RightArm to brute Body, selected `902`, scan/mapped/recomputed `1/1/0`.
  Provenance is `CompatibilityFallback`, Legs, root `902`, zero visits, feature `0`.
  Thus Smart96 never entered exact certification: proven-zero `scan_detector_into`
  returned compatibility candidates early. An exact WB sweep would be
  `SegmentBodyRegion` with visits and root `905`. Hooks were reverted; no behavior,
  pin or corpus changed. The correction belongs only to feature exact scanning;
  compatibility/non-feature callers keep their contract.
- Smart99 completed the exact-domain correction after the intervening certification
  and provenance proofs: feature exact scanning now certifies every supported hostile
  WW/WS/WB trajectory pair from the current group boundary, requires one exact
  `wide_toi` row per mapped member, and retains compatibility sweep evidence only when
  compatibility actually enumerated that key. The frozen WB replay selects exact time
  `905` and canonical publication, while a response-created second group is valid with
  no compatibility witness. The first complete feature run exposed only two stale
  reservation fixtures and eight stale Smart51 captured-strike literals; test-only
  repairs preserved their assertions. Final gates were resolution `97/97`, feature
  `680 passed / 0 failed / 3 ignored` plus determinism `10/10`, and default
  `537 passed / 0 failed / 1 ignored` plus determinism `10/10`. The exact logs are
  `target/smart99-resolution.log`, `target/smart99-feature-final.log` and
  `target/smart99-default-final.log`. No pin was measured or updated, no corpus ran,
  and retained segment geometry remains absent pending Smart100.
- Smart100 landed the previously proven retained segment state machine after Smart99
  removed Smart87's inherited recompute blocker. Five focused tests passed; final
  feature was `685 passed / 0 failed / 3 ignored` plus determinism `10/10`, and
  default was `542 passed / 0 failed / 1 ignored` plus determinism `10/10`. The
  `1016491`-byte feature wasm artifact has SHA-256
  `91680879C030A904C707B95B8367728369FB2A9C89F24878A78B72E1D9BAEB0B`.
  Its explicit named scan chain sums to `589376`, leaving `459200` bytes below 1 MiB;
  the separate conservative implementation estimate is `555104`, leaving `493472`.
  Native and wasm agree at the unpinned feature digest `0xa6835666303601d2`; wasm
  pages are `24 -> 75 -> 75`. The frozen trace returns `ticks=49 phase=none`. No pin
  was updated and no corpus ran; Smart101 owns the paired default pin audit before
  the unchanged source-41 corpus.
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

## What is retained but remains off

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

The first World adapter was rejected on an exact trajectory counterexample rather
than rounded into service. For mass `196_608` and momentum `262_144`, tick-one
position `1` carries remainder `4_294_967_296`; another half tick exposes position
`2`, while interpolation over published integer endpoints still exposes `1`. The
retained implementation resolves that boundary by summing rotating motor geometry
with exact response translation in one evaluator used by scan, recomputation, and
commit.

The feature path now includes exact owner advancement, retained wide segment
geometry, certified group membership, lifted normal/circular-Coulomb selection,
grip-release and boundary accounting, state hashing, and ordinary-command replay.
Its retained wasm call chain is 422,384 bytes with 626,192 bytes of stack headroom;
feature native and two fresh wasm instances agree at the unregistered stream receipt
`0xa6835666303601d2`, with memory pages `23/77/77` on both calls.

The ordinary north-wall replay supplies the lifecycle proof that the stopped
east-wall fixture could not. The unchanged 56-command strike produces the accepted
WeaponBody group at ticks 45/46, both exact remainder classes through tick 56, a
defender body-lane `WALL` row at tick 45 with `-9_986_235_012 / 8_589_934_592`, and
the independent right-hand release at tick 54 with
`-1_073_625_268_272 / 8_589_934_592`. Two live runs and recorded replay agree at
every tick, with zero refusal and cap. Smart122 registered that replayed trajectory
transcript at `0x83051e8c6b4ef20f`, with native MSVC and wasm32 integration agreement.
Smart123 separately registered the lifted-Coulomb solver corpus at
`0x83cd7bb2b73aeb9e`. Unlike Smart122's 56-tick lifecycle transcript, each of its
eighteen source-41 cases terminates at the first qualifying contact. Continuing the
controlled fixture admits the already-recorded later refusal, so a `+1` lifecycle
tick is deliberately not part of that solver grammar.

## Decisions and next boundary

Do not resume scalar alpha tuning, imported normal brackets, black-box Jacobian
fitting, or damage-selected search. Each was rejected by an exact counterexample.
Do not train or promote the tactical/learned policy while the mechanical corpus lacks
a robust mirrored productive strike.

The remaining mechanics sequence is explicit in the live plans: Smart122 and
Smart123 registered the trajectory and lifted-Coulomb solver/corpus digests; Smart124
now closes the feature authority documentation. Both registrations preserved the
default hash grammar and passed fresh native/wasm agreement. Documentation closure
permits a new policy gate; it does not itself authorize feature promotion, learning,
`ARTICULATED_HASH`, or `v2-18`.

Smart101 completed the deferred paired default pin audit after the exact wasm stack
repairs. With the old constants still installed, native MSVC and a fresh default wasm
independently answered `ARTICULATED_STREAM_DIGEST = 0xdbbd86fedd61c4c7`, replacing
`0xf7d3a9c73aa59981`. This is a values-only move caused by the Smart51
reflection-safe actuator/interpolation and Smart59 weapon-COM sampling reaching the
twenty-tick publication script; no ABI layout, stride, section, count grammar or
fixture command changed. The controls stayed `COMBAT_GEOMETRY_HASH =
0x9d15344883cf6e9c`, `CONTACT_BEHAVIOR_DIGEST = 0x587b0259e877105a`, and 3,548
contact-corpus bytes. The fresh pre-update wasm was 654,355 bytes with SHA-256
`D0955C84322627886495D0F4BD084EDDD59490D34CA06D6C724BFB050612F184`.
The paired constant update and feature gate succeeded (`685/0/3`, determinism
`10/10`), but the workspace gate stopped before the source-41 corpus. Lab's windmill
control reported `solver_rejections=1` instead of zero in
`a_zero_energy_excess_is_only_evidence_while_the_solver_refuses_nothing`; the isolated
log is `target/smart101-lab-control.log`, and the workspace Lab result is
`78 passed / 1 failed / 5 ignored`. The zero published energy excess therefore audits
nothing for that run. No one of the 7,560 corpus orientations ran, and no retune,
damage selection, policy or UI work is authorized until Smart102 names the refusal.
Smart102 named the default-only refusal at seed `5`, tick `2564`:
`EnergyNumerator`, alpha `369`, one raw dissipated unit, two simultaneous keys
(fighter WeaponBody `0:1 -> 1:BODY_SLOT` and reverse WeaponShield `1:1 -> 0:0`), and
allocation weights `[0,0]`. Windmill totals are 2,197 contacts, zero published excess,
one refusal; composed is 2,440/zero and closing 2,287/zero. Temporary diagnostics were
reverted. The authorized correction is test-only: composed/closing continue to own
the zero-refusal energy audit, while a separate windmill regression freezes exactly
one `EnergyNumerator` refusal and may not call zero excess evidence. Smart101 remains
stopped until that correction and the full workspace are green; no corpus ran.
The Smart102 test-only correction is now green: Lab reports
`79 passed / 0 failed / 5 ignored`, while independent count and cause mutations are
red. The workspace continued and stopped at policy's
`an_empty_off_hand_does_not_lengthen_the_arm_it_hangs_from`, where an exact guard-reach
equality fails although both values format as `0.8101`; policy reports
`132 passed / 1 failed`. The raw literal/ownership audit is pending. This does not
reopen Smart101: no corpus row has run and no policy or test correction is authorized
from rounded output.
That audit is now exact: the held-out capsule is raw `53095`, the resting control is
`35604`, and `53096` was the stale ordinary-multiply expectation predating Smart51's
reflection-safe signed product. The authorized correction changes only that policy
test literal and the reference table's paired `53,096 / 0.81019` prose to
`53,095 / 0.81017`; command reach, production policy and the empty control are
unchanged. The corrected run made policy `133/133` and default sim
`542 passed / 0 failed / 1 ignored`, then stopped in web: the boundary clinch reaches
the cap at tick `89` rather than `85`, and event high water is `301` rather than
`346`; web is `122 passed / 2 failed / 4 ignored`. Those two fixture movements await
ownership audit. Smart101 remains corpus-held until the full workspace is green.

The web witnesses were owned post-Smart51/59 fixture movements, and their test-only
corrections completed the workspace: `target/smart102-workspace-final-3.log` reports
Lab `79/79`, policy `133/133`, sim `542 passed / 0 failed / 1 ignored`, determinism
`10/10`, and web `124 passed / 0 failed / 4 ignored`. Smart101 then ran the unchanged
source-41 corpus in full. Its 812,866-byte log
`target/smart101-corpus-final.log` has SHA-256
`55975673586889218FCBD1FA64F4F8C2C01DE19143C2222249D5AA4E5442703F` and records
7,560 central orientations, 2,826 local orientations, 157 eligible plain rows, 157
eligible mirror rows, 124 robust pairs, checksum `272625115ee9a09a` and internal
elapsed time 7,885,045 ms. The frozen maximin-dissipation/duration/ordinal law selected
ordinal 3144: chamber 28, strike 28, reach raw 61,440, Brute, offset raw
`(-163840,-65536)`, worst dissipation 278. All 18 local strike/reach/mirror cases were
eligible and dissipated 278. Damage did not participate. The next boundary is to copy
that exact schedule into the tactical policy and require the unchanged 95/100
moving-fight competence gate before making Tactical the Arena default.

Smart121 later tested the still-owed ordinary lifecycle boundary without changing
that source-41 schedule after measurement. It translated ordinal 3144 to the east
wall and ran the complete predeclared 56 ordinary-command ticks. The accepted
WeaponBody receipt was `45/46`; both exact momentum and position remainder classes
survived ticks 45 through 56. The ordinary right-hand release published at tick 54 as
a Fighter lane-2 exact external row with signed numerator
`-1_073_625_268_272` and denominator `8_589_934_592`. Both live runs and recorded
replay matched at every tick. The defender body produced no `WALL` row, however, so
the experiment stopped and its temporary code was reverted. The retained log is
`target/smart121-east-wall.log`, SHA-256
`25B3D423C3425DA0BC6D11FD0113ECB7F8E1D313521B01D03F76EA861DC648B3`.
This is replay/remainder/release evidence, not the missing Smart36 checkpoint-E
boundary proof. `EXACT_TRAJECTORY_STATE_DIGEST` is registered at
`0x83051e8c6b4ef20f` from the ordinary north-wall witness.
At Smart121's stop, `LIFTED_COULOMB_SOLVER_DIGEST` remained unmeasured pending a
reviewed lifecycle classification. Smart123 has since registered it from the
terminal-at-first-contact corpus; it does not absorb this later lifecycle record.

The reviewed successor classified the absence rather than retuning the strike. The
east-wall response was west/north, so east settlement was structurally behind the
motion; production also had no body-lane wall-energy append, only held lanes. The
commit path now records body lane 0 separately from held lanes 1/2 at the same
solved-to-settled clip. Translating the unchanged source-41 geometry to the
response-aligned north wall yields the tick-45 body row and closes the ordinary
lifecycle witness with a demonstrated mutation: suppressing only the body append
makes the real wall-commit test red while settlement and the held row remain green.
That statement was the Smart127 handoff. Smart122 subsequently registered the
ordinary lifecycle transcript and Smart123 the terminal source-41 solver corpus.

## Registered exact-mechanics receipts

Smart122's 56-tick north-wall direct/rerun/replay transcript registered
`EXACT_TRAJECTORY_STATE_DIGEST = 0x83051e8c6b4ef20f`. It owns the accepted strike,
both retained remainder classes, body-wall external row, later ordinary release and
their replayed states. The feature wasm was 1,012,971 bytes, SHA-256
`8C8546CD60DADA2F5F8948A01288900DA267E69886DD0CA8A0B395669ECCA472`, with memory
pages `29/165/165`; both wasm modes passed `29/29`, the final default artifact was
655,770 bytes with SHA-256
`190B95523B666D69D023FCEBD32D271AE44318EB103AAD46CF020F7BBE452DD0`, and no existing
pin moved.

Smart123 registered `LIFTED_COULOMB_SOLVER_DIGEST = 0x83cd7bb2b73aeb9e` over the
source-41 ordinal-3144 neighbourhood in literal strike/reach/mirror order. All
eighteen ordinary-command cases terminated at their first qualifying WeaponBody/Legs
contact and matched direct, rerun and recorded replay. Each carried an interior TOI,
nonzero opposing impulse, full alpha, physical dissipation 278, both exact remainder
classes in the post-contact state, matching mirrored anatomy, and zero refusal/cap;
damage was read only after the mechanical row passed. The policy and sim command
receipts also agreed.

The named response mutation proved the ordering rather than merely reporting it.
Bypassing the normal/restitution check made the test fail at selected-score
classification before damage; independently bypassing selected-score equality made
the reader reach damage. Restoring both checks returned the proof to green. Native
debug and release agreed with the fresh feature wasm. That artifact was 1,059,211
bytes, SHA-256
`D294A4A56C56FB89E2DA86556AAD449197F3A1502E3AFE9A1C12EA6BE0935F0B`, with memory
pages `165/259/259`, and the feature checker passed `30/30` without second-call
growth. No existing pin moved, the feature stream receipt remained unregistered,
and `ARTICULATED_HASH` remained absent. Smart124 is the remaining authority-document
closure; neither receipt promotes the feature or establishes generalized Tactical
competence.
