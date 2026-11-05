# The mind boundary

## Goal and scope

Make a Mind a stateful computation from permitted observations and orders to requested body
control. A reader identifies its inputs, memory, outputs, timing and resource owner from the
public contracts. Keep construction simple, stepping allocation-free at the boundary, and the
contracts independent of any planner, skill framework, body shape or runtime.

This plan defines a target. Preserve simulation behaviour, arithmetic order, configurations,
reaction times, command timing, action ownership, replay and supported forks while migrating.
Keep tuning and algorithm changes separate. Use the existing snapshot service and concrete
state types; introduce additional abstractions only where a migrated caller needs them.

Coordinate package placement with [project organization](project-organization.md). This plan owns
the mind's computation and runtime contracts; that plan owns the directory and dependency layout.
[Option Mind's speed](2026-11-04-option-mind-speed.md) owns search and profile optimizations.

## Computation

```ts
/**
 * All mutable memory needed to resume a mind exactly.
 * Uses the data forms supported by saveState/loadState.
 */
export type MindState = object;

export interface Mind<S extends MindState> {
  readonly state: S;
  readonly control: BodyControl;

  /** Advance memory and write the complete command for this interval. */
  step(senses: MindSenses): void;

  /** Cancel ongoing work and leave control neutral. */
  interrupt(): void;
}
```

Each implementation declares a concrete state type. `MindState` names a documented contract;
TypeScript's `object` does not prove snapshot compatibility or completeness. The common
[snapshot service](../../src/core/state.ts) validates supported values when saving. Exact
continuation checks detect behaviour-changing memory omitted from the snapshot graph. Avoid a
recursive state-value union, schema language, state wrapper or per-mind serializer.

The mind owns its state root, control buffer and reusable working storage. `readonly` fixes the
public references, not their contents. Ordinary stepping writes existing storage; the caller
neither supplies state each call nor receives a reusable buffer disguised as a detached result.
Saving and loading are explicit simulation operations.

## Inputs and construction

```ts
export interface MindSenses {
  /** Current simulation time, in seconds. */
  readonly time: number;
  readonly body: BodySenses;
  readonly world: WorldSenses;
  readonly status: SelfStatus;
  readonly orders: Orders | null;
}

export interface MindModel {
  readonly body: BodySpec;
  readonly actuators: ActuatorModel;
}
```

Extract the payload records from the existing read-body, senses, observation and actuator
contracts. Publish data-only records and buffers, retaining the measurements each implementation
uses. Reuse one representation across in-process and worker execution; create detached inspection
snapshots only when a caller asks for one.

| Input | Meaning |
| --- | --- |
| `BodySenses` | permitted own-body poses, joint motion, strength, delivered effort, contacts, attachment, hand configuration and equipment condition |
| `WorldSenses` | permitted observations of other bodies, external objects and fixed collision geometry |
| `SelfStatus` | own life, participation, side and applicable bout-clock information |
| `orders` | the orders available to this mind for this interval, or null |

All changing inputs arrive through `MindSenses`. Resolve orders before calling the mind, in the
same phase and order their consumers require. Supply only permitted identities and contact data;
observation types contain neither engine handles nor callbacks that read a newer world. Derive
controller-specific views and dynamics from the permitted measurements, with reusable work owned
by the component that computes them. Preserve their arithmetic and contact-sampling order.

Pass immutable anatomy, actuator descriptions, configuration, rules, seed, phase and required
immutable resources at construction. Resolve channel, segment, hand and equipment indices once.
Keep model descriptions frozen and shared where safe. Dynamic strength, assist availability,
mass properties, geometry changes and equipment condition belong in observations, rather than
being assumed constant because the nominal model is immutable. Random-stream progress belongs
in state.

The timestep is fixed for the instance: supply `stepSeconds` from the world's `dt` at
construction. Each call computes one control interval of that duration. Observation age and the
interval since an infrequently scheduled planning decision are separate quantities; planners
retain their own timing. Resumption computes one interval on the new senses, without integrating
the entire suspended period as one step. Research worlds can construct instances at their own
fixed rates.

Inputs are borrowed. Their contents are stable for the execution phase that consumes them, then
the runtime can reuse their storage. A mind that needs historical values preserves selected data
in its state. Copying an entire observation is an explicit retention decision with a measured
cost. Do not freeze, clone or allocate observation wrappers merely to call `step`.

## Output and actuation

```ts
export interface BodyControl {
  readonly muscles: MuscleControl;
  readonly assist: AssistControl;
  readonly hands: HandControl;
  readonly equipment: EquipmentControl;
}

export interface MuscleControl {
  readonly activation: Float64Array;
  readonly velocity: Float64Array;
}
```

`AssistControl` holds the requested force and moment. `HandControl` and `EquipmentControl` hold
the permitted pose and equipment requests, using reusable slots and an active count where
requests vary. Define their concrete fields from existing operations, including request order,
atomicity and refusal semantics. Empty capabilities use empty storage or zero limits. Keep
construction-time capability checks separate from validation of changing command values; retain
required checks without making validation imply copying or freezing every command.

Only the mind writes its output. The runtime consumes it before the next write. Construction and
interruption leave zero activation, velocity, force, moment and active request counts. Each step
specifies a complete command; retained motor goals and requested hand configuration remain in
their owning component's state. An inactive request means no new operation, rather than undoing
an already applied operation. Every buffer slot has a defined initial value.

The runtime owns actuator application, limits, metering and transport. Delay and recording retain
their own copies or slots before output is overwritten. Preallocate command queues and preserve
the existing operation order. A read-only consumer type can hide mutation operations where
practical, but ownership is the rule; shallow `readonly` does not protect typed-array contents.
Avoid per-step proxies or defensive copies used only to enforce that rule.

## Observation and execution timing

| Timing | Owner | Meaning |
| --- | --- | --- |
| Sensing delay | sensing system | how old an available observation is |
| Decision delay | decision pipeline | when a prepared decision is eligible for execution |
| Actuation delay | runtime | when an emitted command reaches the actuators |

Keep actual observation times on records whose ages differ. `MindSenses.time` means the current
simulation time; it is not a timestamp for all measurements. Use a group timestamp only where
the group shares a sampling time. Fixed geometry needs no rolling history.

Preserve the configured external sensing delay and current immediate own-body/status readings.
The representation also admits delayed body feedback without changing the Mind interface;
introducing a new gameplay delay is separate work. Delayed motion and immediate status occupy
different groups. A snapshot restores historical attachment and strength alongside historical
motion, rather than combining old poses with present capability.

Separate delayed-decision execution into internal components where needed:

```ts
interface DecisionMotorExecution {
  produceControl(body: BodySenses): void;
  prepareDecision(senses: MindSenses): void;
}
```

This is an implementation-specific execution adapter, supplied by its factory together with the
Mind facade. Keep it out of the common Mind contract. Its operations use the constructed
`stepSeconds`; all future-affecting phase state belongs in the snapshot graph.

At a positive decision delay, produce control from the due decision and permitted body feedback,
publish the completed output, then prepare future decisions. The synchronous `step` facade runs
the same sequence. A worker scheduler uses the adapter to publish control before completing the
next decision, preserving overlap. At zero delay, decide before producing control. Give the
runtime exclusive access while either sequence runs; never call both the facade and its adapter
for one interval.

The motor phase receives external context only from its due decision, not fresh external
observations. Retain the context that execution actually needs, with its observation times and
ownership explicit. Resolve sample times, queue indices, publication, reports, interruption and
input-buffer reuse for each existing zero/positive-delay path before moving its callers. Preserve
any supported restrictions on delay values.

A raw muscle policy and a controller with delayed high-level decisions require different queue
placement. Map the existing paths explicitly: do not add a second delay to an already delayed
decision or grant a raw policy immediate actuation. Preserve phase order and worker publication
with a timing trace before treating the interface conversion as complete.

## Interruption, installation and inspection

```ts
export interface MindInstance<S extends MindState> {
  readonly mind: Mind<S>;
  dispose(): void;
}
```

Call `interrupt` once when active control is suspended. End the active sub-controller's work and
cancel pending decisions, preserving longer-lived memory. Leave output neutral. The runtime
separately releases actuators and clears its pending commands; suppression never depends on a
future mind step. Loading a snapshot restores state without replaying interruption or action
begin/end callbacks. Preserve sub-controller takeover and resumption order inside the composite
implementation.

The installed instance owns scheduling connections, subscriptions, worker seats and their
cleanup. Disposal stops execution before releasing resources and recursively cleans up any
implementation components that acquired resources. The simulation builder owns physical-body
disposal. A pure computation requires no resource cleanup method on Mind.

Keep names, active-controller reporting and inspection on explicit construction results or
inspection interfaces. Preserve the report's publication phase and observational behaviour.
Give the Lab a command-layer-specific result when it constructs command layers; avoid a generic
optional capability bag or controller-kind checks in the simulation loop.

| Existing construct | Destination |
| --- | --- |
| `OwnBody` | immutable construction model, observation records and output storage |
| `Mind.body` and command-layer `Body` | the command-layer implementation and its explicit Lab access |
| `PhysicalBody` | simulation ownership and actuator application |
| `Mind.has` and `name` | identification and inspection |
| `Mind.idle` | explicit computation interruption plus runtime command release |
| `Mind.move` | the decision/motor implementation and its execution adapter |
| `Mind.dispose` | installed-instance cleanup |
| `Experiment` | explicit options of the command-layer construction used by research |

Rename the command-layer `Body` to identify a goal controller rather than the physical body.
Move experiment overrides out of universal sensing and embodiment wiring while preserving the
same effective settings in local and worker research runs. Do not introduce research-specific
flags into the general Mind contract.

## State and forking

Use `saveState` and `loadState` for a single simulation state graph. Include mind memory, current
control, runtime command queues, sensing histories and their cursors, alongside physics and game
state. Preserve shared references and restore compatible storage in place. The mind's state and
control roots stay stable. Avoid retaining aliases to dynamic nested entries that loading can
replace; invalidate or reconstruct derived views and disposable caches before subsequent reads.

Any cache or unfinished computation whose absence changes decisions, random draws, work progress
or publication timing is state, or has an exact deterministic reconstruction rule. Scratch is
excluded only when its prior contents cannot affect continuation. Keep functions, engine handles,
subscriptions and worker resources outside the snapshot graph.

Save at a defined simulation boundary after required work is synchronized. Construct a compatible
simulation from its recipe before loading; check its identity using the existing mechanism.
Restore physics and data, then refresh views from the restored histories. Snapshot operations can
allocate; ordinary stepping does not perform them implicitly. Reusable snapshot destinations are
separate measured work if fork cost requires them.

Preserve supported local/mirrored forks and the explicit refusal to fork worker-hosted minds.
Adding worker capture/restore transport is separate work. The state representation must permit
that extension without changing Mind, but this refactor does not claim to implement it.

## Severing and changing capability

Keep the construction layout and channel indices stable for the body's lifetime. Report segment
connectivity to the root and current muscle strength in fixed-layout observation buffers. A
released ancestor disconnects its subtree even where internal joints remain attached. Give
unavailable measurements explicit validity or attachment semantics so stale buffer contents are
not mistaken for usable body feedback.

Preserve [cutting behaviour](../../src/core/rules/pool.ts): release the boundary joint, weaken cut
channels to zero and leave the detached parts in physics. The actuator layer enforces actual
physical capability even when the mind's permitted observation is delayed. Reassess affected
goals and invalidate connectivity-dependent calculations when the change becomes observable.
Severing alone does not imply whole-mind interruption; ending and suspension rules decide that.

Distinguish nominal geometry from current connected mass, inertia, contacts and held equipment.
Controller dynamics must respect the permitted connectivity and capability readings. An
interface conversion does not expand a solver that requires an intact tree. Restore connectivity,
strength, delayed observations and pending commands coherently when loading either side of a cut.

## Migration and validation

### Establish the behaviour and ownership map

Trace registered minds, command-layer drivers, recovery sub-minds, direct policies, Lab callers,
replay and local/mirrored/worker installation. Assign each current input, effect, state field,
subscription and cleanup action an owner in the target. Reuse the existing fingerprint and
Mind-contract cases as the behavioural baseline. Define timing traces for command delays,
publication, takeover, interruption and severing, including their first active interval.

### Introduce the data boundary

Extract only the model, observation and command records the mapped consumers need. Adapt one
direct policy and one command-layer composite end to end before generalizing. Keep compatibility
adapters only while callers migrate. Remove copies of equivalent records instead of creating a
parallel observation hierarchy. Verify complete output, borrowed-input lifetimes and unchanged
permitted observations before widening the conversion.

### Preserve scheduling and snapshots

Move phase-sensitive execution to the explicit adapter and installation resources to their
owner. Migrate the remaining controllers and callers through the same boundary. Preserve delayed
external observations, own-body feedback, orders, report publication, action ownership and raw
policy actuation timing. Exercise zero and supported positive delays, local/mirrored/worker
equivalence, interruption/resumption and severing with unchanged outputs and fingerprints.

Read exact continuation from supported snapshots with decisions and commands in flight,
interrupted control, observed/unobserved severing and retained inputs/outputs. Require each recipe
to reach its named case. Reuse the core boundary and command-queue checks, and run the relevant
fingerprint, worker and step-cost diagnostics explicitly. Additional tests follow the repository's
observed-regression rule. Do not replace expectations or relax checks to accommodate a refactor.

### Account for the cost and finish the boundary

Name the cost question before each performance-sensitive conversion: does the new boundary add
sampling, copying, allocation, retention or synchronization cost? Read the relevant existing
implementation and its replacement under the same Node/core/Rapier rate, bodies, loadouts,
configuration, data and seeds. Reuse the [step-cost harnesses](../reference/step-cost.md), screen
small, then widen where results are close or an affected runtime differs.

Warm implementations and alternate paired readings on a quiet machine. Report mean and tail
latency, bytes and allocation counts, retained storage, and GC-inclusive timing separately from
instrumented allocation runs. Check worker overlap on the worker path; local timings cannot
establish it. Treat small percentile movement within run variation as inconclusive and investigate
repeatable slowdowns. Record evidence and decisions in the run records and commit messages.

The abstraction requires no per-interval allocation. Each remaining implementation allocation
names its owner, readers, last use and reason near the code. Prefer stable buffers and resolved
indices; justify growth, retained results, copying and queue storage against their actual use.
Account for nested scratch use and observation histories. Do not trade reduced allocation for
unmeasured copying, persistent full-tree retention or unbounded work. Work quotas and resumable
search remain implementation concerns under the speed plan.

Remove superseded adapters, optional Mind capabilities and duplicate ownership paths as their
callers move. Update the architecture to the implemented contracts and the package plan's
placement map where names change. Run the checks required by each slice, including the complete
fingerprint for behaviour-preserving code changes; browser-facing changes also build and receive
a brief browser check. Land each coherent slice separately on main.

## Done when

- Mind exposes typed memory, reusable body control, one fixed-interval computation and explicit
  interruption, with immutable construction information separate from changing input.
- Every input, command buffer, pending decision, runtime connection and snapshot field has one
  explicit owner and lifetime; registered entrants use the same contract on different bodies.
- Existing behaviour, command timing, external sensing delay, supported forks, replay and worker
  publication are preserved exactly; severing leaves stable indices and coherent capability.
- The boundary adds no required hot-path allocations, and paired readings account for changes in
  mean/tail time, allocation, copying, retention and worker synchronization without a repeatable
  unexplained regression.
- Physical-body ownership, command-layer control, installation and inspection have distinct
  contracts, and superseded Mind fields and migration adapters are removed.
