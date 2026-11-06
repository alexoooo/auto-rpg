# Fresh layer boundary audit

The refactor does not yet satisfy the requested separation and invariants. The findings below are
current counterexamples: ownership leaks, closed extension seams, state that cannot restore,
inconsistent admission, incomplete cleanup and evidence that can misrepresent its inputs or
coverage. Passing import gates do not establish these semantic contracts.

This is an audit, with no implementation fixes. The [per-file
ledger](2026-11-05-fresh-layer-boundary-files.md) records the inspected files, criteria and
associated findings. A row without a finding means this review identifies no additional issue there;
it is not a proof that the file has no possible defect.

There are 56 confirmed findings: 6 P1, 45 P2 and 5 P3, plus six unresolved questions.

## Criteria

The criteria apply the requested clean boundaries alongside the [architecture](../architecture.md)
and [repository rules](../../AGENTS.md).

| ID | What is checked |
| --- | --- |
| C1 | Each module has one coherent responsibility, respects import/runtime direction and publishes only its owned public surface. |
| C2 | General contracts use declared capabilities and owner-defined identifiers; extension roles and dependency declarations remain open end to end. |
| C3 | Anatomy, algorithms, tuning, profiles, defaults and registration choices belong to their concrete owners; application composition selects them. |
| C4 | Configuration validation, applicability, execution and inspection consume the same facts; expected refusals retain their meaning before allocation. |
| C5 | Durable step state is plain and reachable from its owner; fresh restoration covers memory and invalidates caches; shared descriptions and tuning are immutable. |
| C6 | Read surfaces preserve observation identity and current topology without granting control authority or inventing body facts. |
| C7 | Transport preserves request meaning and cardinality, backpressure makes progress, and every construction/terminal path owns cleanup and settlement. |
| C8 | Evidence names actual code, body, settings and protocol; records agree, coverage is complete before success, unreached fixtures are explicit, and human figures remain a scale. |
| C9 | The applicable engineering rules hold: physical provenance and exact arithmetic, explicit state/screen/clock ownership, owner predicates, exhaustive unions, consumed exports and appropriate hot storage. |

P1 identifies a hang or a failure that undermines trustworthy execution/evidence. P2 identifies a
broken admitted configuration, extension, state, observation or lifetime contract. P3 identifies a
bounded low-priority violation. Unresolved questions have no defect severity and are listed
separately.

## Scope and evidence

The ledger covers all 707 source files, all 73 scripts, all 23 executable test/harness files, all
127 authored research programs, their inspected owner configurations, the authored vendor
overlay/provenance and application/build configuration. It contains 961 distinct inspected paths.
Every authored code file in these inventories has a full-read entry; the lockfile's narrower
inspection is explicit.

The full source reads trace producers through consumers. Bounded disposable probes exercise specific
admission, state, geometry, transport and cleanup questions. A conforming injected transport, stage
or callback is used where the question concerns a failure boundary; production source is not edited
to manufacture a failure. Probes establish only the effects stated beside each finding. No training,
skill-quality battery, rung acceptance, performance comparison or behavior-preservation claim is
part of this audit.

Generated evaluation/research rows are examined through their schemas and consumers rather than
individually revalidated. Binary art, upstream packaged source and installed transitive packages are
outside the full-read scope. The authored Rapier patch/build overlay is read; native solver
correctness is not established by reading that overlay. The dependency lock receives a structural
and solver-resolution inspection, rather than an audit of each upstream package.

## Foundations

These findings apply C2, C4, C5, C6, C7 and C9 at the physical/control and component owners.

### FF01 - P1: physics load accepts incompatible gravity and restores it behind a contradictory facade

[src/core/physics/rapier.ts:555](../../src/core/physics/rapier.ts#L555) `worldDigest` hashes
revision and constructed bodies/joints/grips/fixed colliders, but omits the world's gravity and
configured rate. `load` at 616 validates that digest before restoring Rapier's complete raw snapshot
at 620. Two identical one-body worlds built with gravity enabled and disabled accept each other's
snapshot. After loading the enabled snapshot into the disabled world, its public `gravity` remains
`[0,0,0]`, while one step produces vertical velocity `-0.08172209560871124`. The same probe accepts
a 120 Hz snapshot into a 60 Hz world (the gravity mismatch is the demonstrated contradictory
physical behavior).

This violates compatible-recipe state restoration and makes body dynamics/assist readers disagree
with the actual solver. Include immutable physical world conditions in save compatibility, and
reject before mutation.

### FF02 - P2: valid convex-corner clearance is refused as intersection

[src/core/bodies/spec/clearance.ts:61](../../src/core/bodies/spec/clearance.ts#L61) uses the maximum
hull-face signed distance as distance from a capsule to a convex hull. That is not Euclidean
distance outside an edge or corner. A sphere of radius 1 centered at `[1.8,1.8,0]` outside a cube
`[-1,1]^3` has positive clearance `0.13137084989847625`, yet the actual public `bodyIntersections`
returns `['cube intersects ball']`. Spheres use the capsule branch, so this is a supported shape
combination, not an unknown-shape issue.

A second bounded fixture confirms the hull/hull branch at 66 also misses edge-cross-edge separating
axes: two rectangular hulls have overlapping projections on every face normal (`faceGap =
-0.0409884911623869`), but a cross-edge axis separates them by `0.07493719317608322`.
`bodyIntersections` still returns `a intersects b`. Both hulls have half-extents [1, .3, .4]. The
first is centered at the origin with identity rotation; the second center is [-.021448899991810322,
-.9001908836886287, -.4753047737292945] and its quaternion is [.5892599642047703,
-.2511914421872364, .6865959021783768, -.34389187409584154].

`resolveCharacterChecked` calls this owner predicate for modified size/weight and can refuse
nonintersecting geometry. Replace this branch with proper capsule/polytope closest distance,
retaining refusal only when actual geometry overlaps.

### FF03 - P2: the open requirement registry is closed again by its tree helper

[src/parts/parts.ts:147](../../src/parts/parts.ts#L147) publishes `partRequirements(...): readonly
'support-reference'[]` and constructs `Set<'support-reference'>`, despite `Requirement = keyof
Requirements` and the open `Part.requires` declaration. Adding the legitimate augmentation
`interface Requirements { 'audit-power': true }` produces `parts.ts(157,62): TS2345 'audit-power' is
not assignable to 'support-reference'`. Therefore an extension cannot declare an independent
mechanical requirement without modifying the generic toolkit. Even without compilation, consumers
receive an incorrectly narrowed type.

Use the canonical open `Requirement` type throughout this generic traversal. The isolated compiler
fixture also reports unrelated missing application data-map augmentations; those unrelated
diagnostics are excluded from this finding.

### FF04 - P2: armed spec caching publishes mutable shared physical descriptions

[src/core/bodies/items/held.ts:65](../../src/core/bodies/items/held.ts#L65) caches `armedAnew`
results without freezing their new root, holdings, item or generated geometry;
[src/core/bodies/models.ts:177](../../src/core/bodies/models.ts#L177) returns these cached specs
from both trusted and checked loadout paths. Bare character resolution freezes the underlying spec,
but adding equipment introduces new mutable physical data. The public body/mind seam then reads that
same spec, and geometry readers cache by spec identity assuming immutability.

The actual `modelHolding('workshop-fighter', {left:'empty',right:'sword'})` result, held array and
item all report `Object.isFrozen === false`. Changing its item name changes the next call for the
same recipe to `'audit mutation'`. This is shared-cache contamination, independent of physics
execution. Deep-freeze the completed spec before publishing/caching it.

### FF05 - P2: public canonical up is writable and shared across bodies

[src/core/math/vector.ts:200](../../src/core/math/vector.ts#L200) returns the mutable `UP` Vector3
as a full writable `Vector3`. No type assertion is needed to call `.set(1,0,0)`. The next call
returns `[1,0,0]`, affecting stance turns, physical support and endpoint orientation readers in the
same realm. The comment promises a never-written shared direction, but neither runtime nor public
type enforces that contract. Freeze this canonical vector and expose an appropriate read-only
surface, or return a value that cannot mutate global meaning.

### FF06 - P2: partial core body construction leaks completed allocations

[src/core/bodies/build/build-body.ts:188](../../src/core/bodies/build/build-body.ts#L188) allocates
segments and joints before constructing configurations/toes. Only the returned body's `dispose` at
209 removes them; no rollback owns completed work if a later allocation fails. A real world with its
addBody callback reporting an error on the second body preserves the original error but leaves the
first successfully allocated rigid body unremoved (`made:1, removed:0`). The caller receives no
BuiltBody through which to release it. An enclosing world owner may eventually recover these
allocations, but public construction into an existing world does not.

Enclose successful segment/configuration/toe ownership in rollback until the returned body receives
it.

### FF07 - P2: paw support admission does not validate its declared endpoint

[src/control/quadruped/fit.ts:10](../../src/control/quadruped/fit.ts#L10) tests for a point
literally called `sole`, while `pawEndpoints` in `quadruped/paws.ts:17` passes the declared
`PawLimb.point` to `supportReader`; that constructor at `supported-motor.ts:76` requires the actual
point. A stock reptile spec with one declared paw point changed to an absent name receives
`fitsPaws(spec) === null`, then construction throws `unknown support endpoint
paw.front.left/undeclared-point`. This bypasses the owner admission path and turns unsupported input
into a construction defect. Conversely a real paw point with another name is incorrectly refused
solely because `sole` is absent. The same fit also omits the box condition required by
supportedMotor at 123 when `paw.sole` requests a rectangular sole (source-confirmed; only the
missing-point branch was executed).

Validate the actual declared endpoint and the requested support patch shape in the published fit
predicate before construction.

### FF08 - P2: legal sensed IDs collide with Object.prototype

[src/core/world/senses.ts:151](../../src/core/world/senses.ts#L151) checks `sensed.id in state` on a
normal `{}` record. The Sensed contract permits arbitrary strings, but adding the first body with id
`'constructor'` immediately throws `the senses carry a body called constructor already`.
`'__proto__'` and other inherited keys are similarly excluded without any declared restriction. Use
own-key membership and a safe keyed store so independent body identity does not inherit JavaScript
object names.

### FF10 - P2: two-freedom joint admission accepts a nonorthogonal constraint frame

[src/core/bodies/build/joint-kinematics.ts:17](../../src/core/bodies/build/joint-kinematics.ts#L17)
normalizes the first two DOF axes directly as x and y and checks each against its own copy. With two
freedoms the cross-product z is never checked. An actual copied two-DOF joint with axes `[1,0,0]`
and `[1,1,0]` is accepted with `dot(x,y)=0.7071067811865475` and z length `0.7071067811865475`,
despite BodySpec's mutually-square contract and the function's attempted owner assertion.
Building/reading a constraint in that frame violates the orthonormal frame assumed by the engine and
angle arithmetic. The bounded pure probe establishes acceptance, not a simulated trajectory claim.
Validate all pairwise orthogonality before constructing the constraint frame.

## Behavior and extension contracts

### BH-01 - Physical support is still equated to an effector actuator (P2, probe)

[src/skills/framework/action-resources.ts:40-43](../../src/skills/framework/action-resources.ts#L40)
compiles the legs' support resources only by looking up an effector footprint for the bearing
segment; `arbiter.ts` supplies the selected locomotion supports. A valid workshop-fighter spec with
only its optional foot effector declarations removed builds and its configured Option controller
returns `fits=null`; `skillSet` then throws `unknown support resource foot.left`. Physical feet and
their support chains remain present. The assembled skills fail before they can use the valid
physical foot observations.

The resource compiler must derive support ownership from the physical bearing chain independently of
optional effector actuation. Related transport: TechniquePart.bindings documents physical segments,
while action instances still compile controls through the same effector resource map; a generic
technique binding to a non-actuator segment has the same limitation.

### BH-02 - Default skill assembly loses memoryful aim state (P1, probe)

[src/skills/assembly.ts:38](../../src/skills/assembly.ts#L38) lets `configuredExecutors` create
default configured aims (`action-config.ts:29-30`), but never attaches those hidden Aim.state
objects to Skills.state. The stock Option path separately constructs/roots aims, so it masks the
default public assembly defect. An independent memoryful Aim built through default `kitSkills`
retains three calls after saving at one call and restoring Skills.state. The state root contains no
aim memory.

Construct aims once at assembly and root their declared state regardless of whether the caller
supplied the map.

### BH-03 - Logical resource names reserve otherwise valid segment names (P2, probe/read)

[src/skills/framework/action-resources.ts:25](../../src/skills/framework/action-resources.ts#L25)
rejects physical effectors named `legs`, `trunk`, or `assist`; lines31-35 also share the
physical-segment namespace with generated `pose:<segment>` resources. BodySpec and EffectorModel
declare arbitrary segment strings without those exclusions. The resource compiler probe rejects an
effector named `assist` before it can be used. This is a general contract restriction introduced by
the tactical resource encoding, not an anatomical limitation of a concrete skill.

Use tagged resources that distinguish physical segment identifiers from logical service and
configuration resources.

### BH-04 - Skill identity excludes data declared by the selected aim (P2, probe)

[src/skills/framework/profile.ts:565-570](../../src/skills/framework/profile.ts#L565) hashes
action/aim configuration and executor.reads, but never the selected AimPart.reads. Data loading
correctly follows the aim declaration elsewhere. Two otherwise identical custom actions whose
selected aim reads different loaded data produce the same digest `8d31a882ddd667bc`; the aim lookup
is never queried. Thus changing aim-owned data can reuse a profile labelled as the same skill.

Derive identity from the actual configured executor/aim dependency closure, preserving owner-defined
data identity selection.

### BH-05 - Admitted configurable hands receive undeclared stock configurations (P2, probe/read)

[src/skills/guard/guard.ts:320](../../src/skills/guard/guard.ts#L320) returns the human
configuration `open` whenever a covering segment has any configurations. COVER_GUARD.fits
(`guard-part.ts:44`) does not require that name. A valid stock hand adapted to declare only
`neutral` builds, fits, and the guard asks `open`.

The same unchecked assumption is present in `held-strike.ts:20` (`closesToStrike` tests any
configurations rather than a declared fist) and stock straight/swing commands
(`straight-punch.ts:532`, `swing.ts:216`) ask `fist`/`grip`. Those strike consequences are
source-traced; the retained zero-step reproduction is the guard. Keep generic actuators arbitrary;
the human implementation must explicitly fit the names/semantics it consumes or resolve the declared
actuator meaning.

### BH-06 - Authored guard tuning bypasses its own configuration validation (P2, probe)

[src/skills/guard/guard-part.ts:44,66](../../src/skills/guard/guard-part.ts#L44) accepts any
covering/hold tuning (`faults:()=>[]`). `{kind:'cover-guard',tuning:{covering:null}}` has
treeFaults=[] and fits=null, then `guard.command` throws `Cannot read properties of null (reading
'out')` at its first cover. A published research configuration is an admitted input, not an internal
bad-call assertion.

The guard owner must validate the full shape and semantic ranges it consumes before
construction/execution.

### BH-07 - Staged recipe fit omits consumed channel compatibility (P2, probe)

[src/skills/recovery/implementations/staged/techniques.ts:222-239](../../src/skills/recovery/implementations/staged/techniques.ts#L222)
checks stock record presence, while generic numeric tuning validation accepts an authored fold
posture naming an absent channel. Both treeFaults=[] and fits=null; construction with a genuine
OwnBody then throws `workshop-fighter cannot play this rise: stage fold asks unknown channel, which
workshop-fighter lacks` from the staged player.

Call the staged owner's channel/recipe applicability predicate for the resolved recipe from part
fit; keep numeric config faults separate from body applicability.

### BH-08 - Partial tuning admits durations the executor refuses (P2, probe/read)

[src/skills/strikes/stomp-part.ts:31-32,57](../../src/skills/strikes/stomp-part.ts#L31) accepts zero
for any partial numeric override; the full `validStompTuning` requires positive swing duration. On
the actual stock fighter `{kind:'stomp',tuning:{swingSeconds:0}}` gives treeFaults=[] and fits=null,
then make throws `invalid stomp executor settings`. Validation and execution disagree on an
explicitly supported partial override.

Related finite-only validation in `quadruped/{trot,crawl}.ts` accepts zero travel speed and zero
total stride duration, although paw-legs divides by selected travel speed and crawl derives speed
from stride duration; bite's `validBite` also admits zero `prepare`/`snap` used as divisors/path
durations. These related numerical failures are source-traced, not simulated. Validate resolved
complete settings with the owner's predicate; require positive divisors while preserving legitimate
zero settings.

### BH-09 - Accepted zero-duration profile trials yield NaN rates (P2, probe)

[src/skills/framework/profile.ts:158-173](../../src/skills/framework/profile.ts#L158) accepts a
failed zero-second trial with zero damage and no recovery. `cycleAt` returns cycle=0 and
`profileReading.rate` (`450-454`) computes 0/0; the peak path (`423`) does likewise. validProfiles
returns true and the rate is NaN. Immediate failed trials may be legitimate, so positive-duration
blanket rejection is not the only correction: the profile reader must define a finite failed-trial
rate or refuse the unusable rate query explicitly.

### BH-10 - Command equality drops live actuator goal fields (P2, probe)

[src/minds/command-layers.ts:278-290](../../src/minds/command-layers.ts#L278) omits
EffectorGoal.response, firm, unbend, origin, and drift from equality. At `164`, an otherwise equal
changed goal is not sent to `motor.reach`. The effector tracker stores the goal at reach and reads
those fields from that saved goal for tracking response, bracing, reach solve, and moving-frame
paths.

A zero-physics-step command-layer probe submits two goals differing in firm, response, and origin:
the selected real motor receives exactly one reach, retaining the first values. Compare the complete
semantic command or move equality to its owning actuator goal module.

### BH-11 - Valid zero pace hangs Option walk pricing (P1, probe)

[src/skills/intent/orders.ts:82](../../src/skills/intent/orders.ts#L82) allows pace=0 and
`minds/option/walk.ts` applies that ceiling. In `minds/option/places.ts:47-52`, nonzero travel
distance divides by zero; with a focus, pieces=Infinity and the pressure sampling loop never ends. A
disposable pure probe enters this code with an actual valid zero pace and is terminated by a
1.5-second child timeout, with no exception or return.

Treat no attainable travel speed as no finite walk model (or another explicitly defined stationary
result) before sampling. Finite but extremely small paces also make this ostensibly bounded pricing
loop arbitrarily large; sampling should respect the decision horizon/work bound.

### BH-12 - Pacing keeps an Orders alias instead of the decision's value (P2, probe)

[src/minds/decider.ts:112](../../src/minds/decider.ts#L112) stores `state.orders=ordered`. Its
callback may publish a plain mutable Orders object, as stateful providers can. Mutating that same
object changes both current and remembered values, so sameOrders misses the event and a decider
waits until its scheduled step. The probe changes a valid pace from 1 to 0 between ten-step
scheduled decisions: decide is called once, though the documented contract requires an immediate
second call.

Retain a detached value snapshot or canonical immutable representation of the orders the prior
decision read.

### BH-13 - Fallen navigation footprints discard support elevation (P2, probe)

[src/skills/locomotion/navigation/crowd.ts:104](../../src/skills/locomotion/navigation/crowd.ts#L104)
puts every fallen body's box at world y=.25 with height=.5, ignoring the observed segment heights.
routeWalker then correctly filters footprints against its own support level. A fallen body's
observed trunk at y=2.2 is generated at y=.25 and yields no footprint at support y=2. Elevated
fallen bodies therefore become invisible to this collision route policy.

Derive vertical extents from sensed collider/support geometry and retain them with the footprint.

### BH-14 - Exported roll tuning is only shallow frozen (P2, probe/read)

[src/skills/recovery/implementations/staged/stages.ts:217-243](../../src/skills/recovery/implementations/staged/stages.ts#L217)
exports ROLL_POSES frozen at the outer record while WIND/SWING/OVER/FLAT remain mutable.
Object.isFrozen(ROLL_POSES.wind) and `.swing` both return false. `rollOver` reads those same nested
records for future recipes, so a JS research consumer can mutate global tuning rather than pass an
override. No stock consumer was observed mutating it; the violation is the exported supposedly
immutable tuning surface itself.

Freeze the complete owned tuning graph. The immutable recipe generated from these poses does not
freeze the original records because rollingOver makes copies.

### BH-15 - Generic percept roles bind the profile provider's input protocol (P2, read)

[src/minds/option/parts.ts:59,72](../../src/minds/option/parts.ts#L59) makes the public `percept`
and `prediction` roles return `Percept<P>` / `Prediction<P>` from `percepts.ts`. Both consume the
concrete `Seen` representation (`percepts.ts:32,77`), including measured profile tables,
profile-model strikes/threats and its retained rise/reach context. The generic role has no
input-protocol parameter or declared model compatibility. An independent provider can supply its own
complete evaluation session, but cannot reuse these advertised roles with its own situation
representation without adopting or casting the profile provider's internals.

The direct stanceEnvelopeOf/defaultStrikeLimbs/threatReader imports in percepts/situation are
legitimate within the selected profile-model provider: the generic Option decider delegates to the
selected provider, and only profile-model builds these readers. They are not separately counted as
universal execution dependencies. The remaining ownership defect is the public role/type seam:
parameterize its input protocol, or explicitly scope those roles/contracts to the profile model.
This is a source-traced extensibility constraint, not a reproduced failure of an alternate provider.

## Application and gameplay

### APPF-001 (P2): disposal stops before workers are terminated when a post throws

[src/app/apart/host.ts:184](../../src/app/apart/host.ts#L184).

With two thread links and a first post that throws, no stop callback runs. Retrying disposal still
stops neither link.

A thrown transport post prevents every remaining stop and permanent disposed flag prevents cleanup
retry.

Attempt every stop in finally/owned cleanup even when stop notification fails; preserve transport
error.

### APPF-002 (P3): large cumulative reply counters corrupt ring offsets

[src/app/apart/box.ts:45](../../src/app/apart/box.ts#L45).

With both public ring counters at 2^53+1, putting a, b, c, d before taking them returns a, b, the
control character U+0001, d.

FIFO payload corruption after cumulative counters exceed exact integer Number range. Extremely high
cumulative traffic; ordinary runs unaffected.

Take BigInt modulo ring size, then convert bounded offset to Number.

### APPF-003 (P3): signed completion-counter rollover becomes a false timeout

[src/app/apart/wire.ts:80](../../src/app/apart/wire.ts#L80).

Storing 2^31 in the signed Int32 completion counter and waiting past 2^31-1 with a zero timeout
throws instead of observing completion.

Completed batch/step asks wrap negative at 2^31 and are treated as unanswered against monotonic
Number counts.

Define and implement counter rollover semantics consistently on producer and waiters, so a completed
sequence cannot compare older solely because Int32 wrapped.

### APPF-004 (P2): gait transport omits changes inside a stable object

[src/app/apart/thread.ts:38](../../src/app/apart/thread.ts#L38).

Native mindThread with dependency-injected conforming SeatHost: initial stopping value 1, producer
changes it to 9, next step Said omits gait.

A stable live getter gait changes values without identity and is never resent; Commander party speed
uses stale limits in worker-hosted minds.

Compare and retain detached gait values, including live getters, and resend when their values
change; do not use producer object identity as change detection.

### APPF-005 (P2): Initial world-worker presentation failure is neither reported nor disposed

[src/app/browser/worker/serve.ts:76](../../src/app/browser/worker/serve.ts#L76).

The second argument to then handles only construction rejection. Exceptions from frame/news/post
inside fulfillment produce an unobserved rejected continuation. Actual native serve module with
conforming injected stage.frame throwing yielded unhandledRejection initial frame failed, no fault
message, dispose count 0.

A startup presentation/transport defect can leave openWorld unresolved and the stage allocated,
instead of a reported stopped world.

Own the completed stage immediately and catch the full startup continuation, report the original
error and dispose on startup failure.

### APPF-006 (P2): Arena constructors retain owned Minds after a late construction failure

[src/game/arena/duel.ts:353](../../src/game/arena/duel.ts#L353);
[src/game/arena/team-bout.ts:150](../../src/game/arena/team-bout.ts#L150).

Both constructors acquire several hosted bodies/hooks before their final callbacks, with no
aggregate rollback. Actual stock controller creation, wrapped only at BodyHost.take to count
MindConstruction.dispose, plus an onBuilt callback throwing its exact Error: two minds made, zero
disposed in each constructor. Disposing the caller-owned world afterward does not dispose those Mind
constructions.

A late callback or later member-construction defect leaves earlier hosted Minds and their owned
non-world resources undisposed. The world-level evaluation catch cannot restore this missing
lifetime.

Use a construction scope encompassing every body, built body, senses and hook, transfer its
ownership only after full success.

### APPF-007 (P2): Dungeon local warming never disposes its temporary hosted Mind

[src/game/dungeon/run.ts:436](../../src/game/dungeon/run.ts#L436).

Local warm path discards createMind result, calls only built.dispose, and finally world.dispose.
Actual run with one hero and one distant unbuilt enemy creates two Mind constructions; after
run.dispose exactly one is disposed. The missing one is its warm Mind.

Every locally warmed spec/config can retain its controller-owned resources until broader realm
cleanup; custom controller disposers never run.

Dispose the returned local Mind body in a finally before disposing its built body/world; retain the
existing apart warm path.

### APPF-008 (P2): Arena optional measurement reports zero worker physics cost

[src/app/browser/ui/frame-meter.ts:93](../../src/app/browser/ui/frame-meter.ts#L93);
[src/app/browser/arena/main.ts:858](../../src/app/browser/arena/main.ts#L858);
[src/app/browser/arena/measure.ts:34](../../src/app/browser/arena/measure.ts#L34).

world() updates worker.ms and sample.steps but not sample.physics. Arena passes the returned sample
into arenaMeasurement, which sums sample.physics for mean/p95. Actual frameMeter module receiving
two steps and 8 ms returns physics 0, steps 2. The regular FPS popover separately reads worker.ms
and is correct.

?measure=1 reports 0 ms per step for worker worlds; interpolation-only frames may also put 0/0 into
its perframe step samples.

Publish explicit received-worker cost in the sample and have this panel use the corresponding total
with no zero-step division.

### APPF-009 (P2): Generic shape renderer rejects an admitted zero-span capsule

[src/app/browser/render/body-shapes.ts:38](../../src/app/browser/render/body-shapes.ts#L38).

Physical adapter src/core/physics/rapier.ts497 explicitly supports length zero. A copied workshop
spec with head capsule to=from builds through real coreStand; puppet builds but drawBody in
NullEngine throws cannot normalize a zero vector.

A body admitted by the physical shape owner cannot be drawn by its generic shape renderer.

Handle coincident capsule endpoints with spherical or identity-oriented zero-length geometry,
matching the physical shape owner.

### APPF-010 (P2): Failed browser benchmark protocols abandon completed simulations

[src/app/browser/physics-bench/cases.ts:55](../../src/app/browser/physics-bench/cases.ts#L55);
[src/app/browser/physics-bench/cases.ts:147](../../src/app/browser/physics-bench/cases.ts#L147);
[src/app/browser/physics-bench/cases.ts:336](../../src/app/browser/physics-bench/cases.ts#L336);
[src/app/browser/physics-bench/cases.ts:399](../../src/app/browser/physics-bench/cases.ts#L399).

All four exported protocols acquire Sim then dispose only at normal return. Actual Factory fault
probe first prepare throws the original Error; dispose count zero in all four. Browser page reports
failure but no longer owns the Sim.

Engine/control/measurement failures can retain native simulator resources across benchmark cases.

Enclose setup/execution/result reads under finally ownership once Factory returns a Sim.

## Evaluation and evidence findings

### EVD-001 (P1): subject execution metadata is lost at normalization and recording

Criteria C2, C4 and C8. `SubjectChoice` explicitly accepts body restrictions and character
attributes. The custom-subject branches in `locomotion/index.ts`, `match/index.ts`,
`court/index.ts`, `tournament/entrants.ts`, `strike/index.ts` and `rising-target/index.ts` discard
some or all of those fields. A bounded call through the actual factories supplies only the Warrior
and strength 1.1; the resulting subjects lose both fields, and the tournament expands the choice
across all five models. Named presets and the unseen/crowd adapters demonstrate that retaining these
facts is supported.

`recordedSubject` in `src/evaluation/record.ts` also versions and records only value and parts.
Metadata held outside that value cannot identify the subject or be recovered from its header. The
previous-value branch of `scripts/evaluate.mjs` revives `{value, parts: []}` without these execution
facts. Preserve the complete normalized subject through scheduling, identity and historical
reconstruction. The owner is the evaluation subject contract and its adapters; changing only a CLI
parser leaves the other paths inconsistent.

### EVD-002 (P2): standalone skill subjects have no implementation code identity

Criteria C2 and C8. `createCode.partNames` in `src/evaluation/code.ts` recognizes only `mind:` and
`commander:` parts. Custom strikes in `strike/index.ts` publish a `strike:custom` part, and rise
subjects in `rise/index.ts` publish `technique:` parts. The actual two subject inputs both produce
empty kinds, parts and data lists. Their recorded subject version therefore omits their
implementation's own code identity. Case-world identity has a separate path and is not shown to fail
by this probe. Let the subject's component declaration identify its role, implementation and
dependencies through the same owner protocol used for execution.

### EVD-003 (P1): partial evidence can satisfy a full table cell

Criteria C4 and C8. `verdictOf` in `src/evaluation/table/judge.ts` judges only the rows supplied.
One passing `run-held` row produces `met: 1 of 1 met, 0 fell`; that run cell requires the held, two
turning and stopping trials across four seeds and two air settings. `scripts/table.mjs` marks a
record current from subject version alone and its play path skips current evidence, so a partial
current record can suppress completion of the missing trials. Partial records are legitimate
reusable work; their presence does not establish complete coverage.

The same script's `rowsOf` retains fault rows with null readings, which the judge dereferences
instead of reporting their failed coverage. Resolve required current case keys from the actual
protocol, combine compatible records, retain faults, and require complete coverage before publishing
met/current or skipping work.

### EVD-004 (P2): a fatal lane error returns before sibling workers are stopped

Criteria C7. `src/evaluation/lanes.ts` catches a fatal error by preventing new jobs, while
`Promise.all` rejects before other lanes finish. In a two-worker bounded protocol probe, the
rejected call has stopped only worker one; worker two remains alive until its timeout. A synchronous
post exception also leaves its job timer alive. A loss reported during spawn, before the settle
callback exists, is discarded and becomes a timeout rather than the original failure. Own pending
failures, timers and all worker lifetimes at the pool level, and settle cleanup before returning a
fatal rejection.

### EVD-005 (P2): evaluation scripts retain unsaved simulation memory

Criteria C5. `src/evaluation/lone.ts` keeps cue indices, orders and step counters in closures.
`fall.ts` retains shove/stand/ledger progress, and `crypt.ts` retains its leg script and progress
the same way. Reader contracts also expose no state for their accumulating measurements. A bounded
actual Lone world saves every published world, body, mind, command and pool root plus physics
immediately before a cue. Continuing delivers one shove; restoring those roots and continuing
delivers none, because the closed-over cue index remains advanced.

These world kinds currently omit optional save/load rather than promising a complete public fork
operation. The defect is the repository's plain-state invariant and missing recoverable script
state, not a claim that an advertised evaluation fork works incorrectly. Put script and reader
progress in explicit state and aggregate it into their owning runtime before offering restoration.

### EVD-006 (P2): standalone technique construction leaks on refusal

Criteria C4 and C7. `techniqueTrial` in `src/evaluation/rising.ts` creates the world, body, ground
reader and commanded body before entering its cleanup scope. It also bypasses the selected part's
applicability check. A no-step call with a valid placed back fixture, `sit-back`, and an unknown
predecessor throws `unknown predecessor unknown-predecessor` after creating a world; that world is
undisposed at rejection. The probe observes construction/disposal through an in-memory module hook
and disposes the captured world afterward. Validate the complete technique request first and make
construction rollback cover every acquired resource.

### EVD-007 (P2): Cover cannot distinguish an unreached attack fixture from successful avoidance

Criteria C8. `src/evaluation/cover/read.ts` records contacts, cover, damage and falling but no
opponent attempt or attack-fixture admission. `cover/index.ts` passes the `untouched` result. An
eight-second reader fixture with no attacks or contacts therefore returns `untouched`, passed true.
This is a bounded reader demonstration, not a claim that a watched stock drill never attacks.
Successful avoidance can legitimately have no contact; retain independent evidence that the intended
attack was attempted and report an unreached fixture explicitly.

### EVD-008 (P1): record admission and duplicate agreement differ between consumers

Criteria C4 and C8. `readRecord` in `src/evaluation/record.ts` accepts a successful row containing
key, subjects, reading and null fault while omitting world, condition, code, digest and played
fields. Its whole-record promise is stronger than its validation. `poolsOf` in `history.ts` keeps
the first occurrence of a key without checking that later readings and digests agree. Two
individually admitted records with the same key and different readings silently produce the first
reading.

CLI row loading has a disagreement check, but browser Ratings loads records directly into pools.
Case lookup in `src/app/browser/ratings/analysis.ts` and reel selection in
`src/app/browser/arena/reel.ts` likewise select the first match from raw records. Validate complete
records at their owner and make cross-record agreement a shared admission rule for pooling, case
lookup and reels.

## Tooling findings

### TOOL-001 (P2): offline worker tools have incomplete terminal lifetimes

Criteria C7. `scripts/fingerprint.mjs` rejects a worker-reported failure without terminating that
worker and does not handle worker error/exit or put pool teardown in a failure scope.
`scripts/skills/recovery/righting/righting.mjs` also lacks error/exit settlement; a failed job
throws before the normal-path kill. Its worker and fork helper dispose worlds only after successful
step/load loops. These are source-confirmed terminal paths, not a claim of a completed long-running
experiment. Bind every pending job and acquired worker/world to a failure-safe owner; preserve the
original refusal or error when reporting it.

### TOOL-002 (P3): private geometry tool helpers remain published without importers

Criteria C1 and C9. Whole-repository references leave the exports `HAND_MODELS`, `handsFile`,
`handGeometry` in `scripts/humanoid/hand-envelope.mjs`, `MAN_GEOMETRY_FILE`, `manContactGeometry` in
`man-envelope.mjs`, and `trunkHulls`, `trunkHullFile` in `workshop-envelope.mjs` used only inside
their defining files. They are command internals rather than consumed extension entry points. Keep
them private under the repository's export-needs-an-importer rule. `hullSolid` does have a research
importer and is excluded from this finding.

### DOC-001 (P3): the isolation worker's ownership comment names a missing module

Criteria C1 and C9. [public/coi-sw.js:8](../../public/coi-sw.js#L8) says installation belongs to
`src/isolate.ts`, a path absent from this tree. The actual installer is
`src/app/browser/isolate.ts`. Correct the comment at its owner; its executable response-header logic
has no separate confirmed finding in this audit.

## Research and vendor consumers

### RF01 - P2: several retained research worker pools still lack lifetime settlement

[research/rollout-pool.mjs:21](../../research/rollout-pool.mjs#L21) listens only for messages.
`close` at 31 terminates workers without rejecting queued/in-flight requests, and no stopped state
prevents further submissions. A bounded actual probe creates its one worker, submits one real
rollout job, closes immediately and observes the returned run promise still pending after close has
finished. Worker error/exit also has no rejection path. `oracle.mjs` awaits these run promises and
owns close in finally, so an exit may prevent reaching cleanup.

Additional source-traced settlement/collective cleanup gaps occur in
`research/skills/recovery/core-rise.mjs`, `edge-profiles.mjs`,
`implementations/staged/rise-trace.mjs` and `rising-budget.mjs`. Their pending jobs and sibling
failures need the same terminal ownership. Related source-confirmed gaps remain in
`empty-hand-league.mjs:112` (no worker error/exit listeners or collective finally), and
`arena-combat-run.mjs:40` (error listener and collective finally exist, but a clean unexpected exit
does not settle its assigned trial). These are the same lifetime contract already implemented by
`worker-jobs.mjs` and CMA's pool, rather than an optional different concurrency design. All requests
should settle exactly once on failure/cancellation and a closed pool should reject new work.

### RF02 - P2: zero worker lanes returns apparent bout completion without playing any job

[research/bout-pool.mjs:22](../../research/bout-pool.mjs#L22) constructs no workers for
zero/negative/NaN `lanes` and then returns its preallocated rows as success. The actual
`playBouts([oneJob], 0)` returns length 1 with no first entry. Multiple CLI callers pass
`Number(--workers)` directly. `empty-hand-league.mjs:112` similarly accepts zero/NaN lanes, skips
its jobs and proceeds to a rating table. Reject unsupported lane counts before scheduling, as
workerJobs and CMA already do.

### RF03 - P2: combat evidence can publish a complete record under an identity it knows is wrong

[research/arena-combat-run.mjs:10](../../research/arena-combat-run.mjs#L10), 12 and 58 compare
actual source fingerprint with the checkpoint's fingerprint, but only print warnings on mismatch.
They still send/append successful physical rows and set `record.complete = true` under the original
fingerprint. `combat-records.mjs` then admits the record by that supplied fingerprint/whole
manifest; rows carry no alternate actual source identity. A loader seeing edits before or during a
trial can therefore mix code versions into one reusable season, despite the
evidence-reader/provenance requirement. The worker and publication checks should refuse or
explicitly retain a failed/version-separated row. This is source-confirmed control flow; the audit
did not mutate source during a physical run to create a mixed artifact.

### RF04 - P3: allocation-site output labels the wrong engine by default

[research/step-garbage.mjs:70](../../research/step-garbage.mjs#L70) builds its bout with
`BOUT_ENGINE`, but its sites heading at 78 prints `CORE_ENGINE`. With no environment override those
are the arena's `rapier-coordinate` and the stand's `rapier` respectively. The emitted measurement
is attributed to a different solver profile. Print the actual built world's engine/revision (or at
least BOUT_ENGINE). The non-sites stand mode uses CORE_ENGINE correctly. This finding follows
explicit imports/defaults; no allocation profiling was needed.

### RF05 - P2: learning environment startup has no owner for already-built pooled starts on later refusal

[research/case-learning-environment.mjs:218](../../research/case-learning-environment.mjs#L218)
begins collecting built starts before its final layout check at 229. If a later start or that layout
check fails, previous pool entries and the first nonpooled world have no rollback, and no returned
environment exists to dispose them. This is an externally supplied environment/layout validation
path, not merely an arbitrary throwing callback. In addition, `startOf` at 207 calls `p.kind.save`
before the later `s.kind.save/load` check at 224, so unsupported pooling can throw a TypeError
rather than its intended named refusal. A construction scope should own starts until the environment
returns; validate optional save/load before invoking save. This is source-confirmed ownership/order,
not an executed leak-counter claim.

### BR-01 - Posture writers resolve children outside their declared output directory (P2, read)

[research/humanoid/posture/core-posture.mjs:31,163,168](../../research/humanoid/posture/core-posture.mjs#L31)
and `man-postures.mjs:28,102,105` construct OUT with `new URL("../../runs/postures",
import.meta.url)` without a trailing slash. They create that directory, but resolve `records.json`,
`envelopes.json` and SVG child URLs against it as though `postures` were a file. The children
resolve into `research/runs/`, while `man-posture-starts.mjs:46` reads
`research/runs/postures/envelopes.json`. The default writer/reader pipeline therefore does not join.
`core-posture-runs.mjs` also resolves failed.json against its caller's same OUT. Give directory URLs
a trailing slash, or join a canonical filesystem directory. No search needs to run to establish URL
resolution semantics.

### BR-02 - The posture handover dereferences a nonexistent static-body spec (P2, read)

[research/humanoid/posture/core-posture-trials.mjs:1489](../../research/humanoid/posture/core-posture-trials.mjs#L1489)
calls `footOn(body.spec, side)` in handed(). Its actual staticBody producer at lines174-185 exposes
`built` but no `spec`; `spec` is `body.built.spec`. footOn immediately reads the supplied spec's
bearing declarations. Every handover reaching this construction throws before it can measure the
advertised stance handback. The correction belongs to this implementation tool's current caller, not
the physical stance algorithm.

### BR-03 - The stance envelope's default asset target is relative to the moved tool (P2, read)

[research/skills/locomotion/stance/core-stance-envelope.mjs:225](../../research/skills/locomotion/stance/core-stance-envelope.mjs#L225)
resolves `../assets/skills/locomotion/${legs}/${legs}-envelope.json` against the tool URL. This
selects `research/skills/locomotion/assets/skills/...`, while the runtime reads repository
`assets/skills/locomotion/stance/stance-envelope.json` or `walk-run/walk-run-envelope.json`. Both
--add and --write use this default; explicit --out is the only way around it. A successful
calibration can therefore fail at publication or update a directory the runtime never reads. Resolve
from the repository or the actual owner asset directory.

### BR-04 - Locomotion instrumentation still treats a bearing-end id as Side (P2, read)

[research/skills/locomotion/locomotion-run.mjs:195-214](../../research/skills/locomotion/locomotion-run.mjs#L195)
compares physical `swing.foot` to `left`/`right`, then passes `swinging.foot` to footOn.
`locomotion-wrench.mjs:149-157` repeats that conversion and compares Side to the end id when
excluding the swing foot. Current stance gait constructs SwingGoal.foot from `FootState.name`
([src/control/stance/gait.ts:47,114,133](../../src/control/stance/gait.ts#L47)), e.g. `foot.left`;
footOn accepts Side and searches `.side===side` (`support.ts:209-212`). At the first recorded
landing the tools ask for a side literally named foot.left and throw. Before then their
saturation/bearer attribution also classifies the swing limb incorrectly. Retain end identifiers for
lookup and explicitly resolve side only for bilateral sign conventions.

### BR-05 - Some recovery searches erase worker defects into ordinary failure scores (P2, read)

[research/skills/recovery/witness/climb-search.mjs:70,86](../../research/skills/recovery/witness/climb-search.mjs#L70)
and `crouch-steady.mjs:131,147` catch an implementation error in a worker and return
`{t:FAIL,error}`, but the caller immediately maps only `r.t`. The error text is discarded before
scoring and printing; every trial can throw and the tool will still print a normal mean failure time
and a best variant. This violates the reporting-boundary contract and makes a broken harness
indistinguishable from an attempted physical failure. Preserve/refuse errored trials before taking
numeric scores, and terminate the pool in finally. Other search tools retain error objects or
counters; they were not assumed equivalent to this proven discard path.

### BR-06 - The locomotion pairer silently overwrites distinct loadouts (P2, read)

[research/skills/locomotion/locomotion-pair.mjs:17-18](../../research/skills/locomotion/locomotion-pair.mjs#L17)
keys each row by model/track/pace/wind/seed but omits hold. Its producer
`locomotion-run.mjs:311-312` explicitly emits a separate row for every hold, and its documented
--holds empty,club command is valid. Map construction silently keeps only the last loadout row in
each key, so the paired report drops the other loadout and may pair unlike equipment if input
ordering differs. Include all scenario-defining fields (at least hold and run duration) and reject
duplicate/mismatched keys rather than overwrite them. This is evidence identity, not a request to
compare a changed gait as an identical implementation.

## Unresolved questions

These are specific remaining investigations, not confirmed runtime failures or permission to claim
the refactor complete.

- **Q-ALLOC (C9):** active world/support/bearing paths allocate arrays and records. The traced path
  includes `commandLayers.act`, `motorControl.control`, stance planning, `drawnOutline`,
  `bearingSole` and `motionAtToRef`. A profile must establish material hot sites before a storage
  rewrite; there is no measured regression in this audit. The roadmap already carries the step
  allocation work.
- **Q-REQUIREMENTS (C2/C4):** the bilateral technique factory unconditionally declares a support
  reference, including inert landing and pose-only modes. Narrow requirements to actual readers;
  the audit does not build a complete independent no-reference assembly for a runtime consequence.
- **Q-MOTOR (C2/C4):** recovery steadies and righting routes request stance/support goals during
  construction, while the motor maker has no preconstruction goal-capability declaration. A
  genuine independent motor is needed to settle admission versus execution for this path.
- **Q-GAIT (C2/C4):** MovePart deduplicates configurations after deleting a field literally called
  `runs`. The gait extension contract does not establish that this preserves all other semantics.
  An independent gait exercising that collision is still needed.
- **Q-DATA (C5):** DataStore calls its cache frozen but does not enforce freezing. The selected stock
  data modules freeze their records; arbitrary loader ownership and a documented enforcement
  boundary need a separate decision before this is labelled shared-data corruption.
- **Q-CONTACTS (C6):** contact caches describe the last completed interval. Immediate clearing on
  collider changes must be judged against that temporal contract, rather than assumed necessary.

## Repair dependencies

Correct capability/identifier and provider contracts first, then root state and freeze shared
descriptions. Make each concrete owner's complete admission predicate agree with execution. Repair
resource lifetimes at their actual construction and terminal owners. With those facts stable, make
scheduling, recorded subject identity, duplicate agreement, coverage and publication consume them
consistently. The audit's narrow regression recipes belong at these owners; physical skill claims
still require their existing drills. Re-read all affected producer/consumer paths before claiming
these findings closed.
