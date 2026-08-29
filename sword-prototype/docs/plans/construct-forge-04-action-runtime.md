# Session 04 -- make actions the construct's only control language

## Status -- implemented; lifecycle trace edge repaired 2026-08-28

The public scheduler emits one terminal cancellation for every still-active action on handover,
verdict or disposal. `ConstructRecorder` queues command envelopes until publication and lifecycle
stops flush against the last host boundary immediately. This matters at the arena verdict edge:
`FightEnd` closes the active-sampling gate after the last ordinary sample, so waiting for another
sample made a valid cancellation permanently invisible. Real attached-recorder regressions cover
handover, disposal and the `FightEnd` transition, including exact-one/no-duplicate assertions.

## Outcome

A compiled construct is driven only through named, parameterized, closed-loop actions. Named
control groups turn generic joints into useful mechanisms; a deterministic scheduler runs
compatible actions together and refuses resource conflicts by name. This authority lands before
the first selectable Warden, so no privileged bootstrap motor path ever exists.

## Implement

Create `src/construct/actions.ts` with `CONSTRUCT_ACTION_VERSION = 1` and the pure declarations:

~~~ts
export type QuantityUnit = "scalar" | "metres" | "metres-per-second" | "radians" |
  "radians-per-second" | "seconds" | "joules" | "watts";
export type ParameterSpec =
  | Readonly<{ kind: "boolean" }>
  | Readonly<{ kind: "enum"; values: readonly string[] }>
  | Readonly<{ kind: "number"; unit: QuantityUnit; min: number; max: number }>;

export interface ControlGroupSpec {
  readonly id: string;
  readonly joints: readonly string[];
  readonly modules: readonly string[];
}

export interface ActionSpec {
  readonly id: string;
  readonly controller: string;
  readonly group: string;
  readonly claims: readonly string[];
  readonly parameters: Readonly<Record<string, ParameterSpec>>;
}

export interface ActionRequest {
  readonly action: string;
  readonly parameters: Readonly<Record<string, number | string | boolean>>;
}

export interface ScheduledActionRequest {
  readonly request: ActionRequest;
  readonly priority: number;
  readonly sourceIndex: number;
}
export interface ConstructCommand {
  readonly requests: readonly ScheduledActionRequest[];
}

export interface ConstructControlGraph {
  readonly version: 1;
  readonly groups: readonly ControlGroupSpec[];
  readonly actions: readonly ActionSpec[];
}
~~~

Groups, actions, members and claims are set-valued and canonicalize by ID as frozen in the
overview. Resolved claims use namespaced `joint:`, `module:` or `resource:` references and
validation resolves every one. Every joint in the resolved group becomes an implicit exclusive `joint:` claim;
the saved claim list adds only commanded/spent `module:` members of that group and at most 16
`resource:` claims. A read-only sensor module need not become exclusive. An explicit joint claim or
a module from another group is refused. Thus two admitted controllers cannot race on a motor merely
because an author forgot to claim it. The request does not repeat or override group, claims,
priority or declaration index: the scheduler derives those from the installed `ActionSpec` and the validated
source row. A program supplies its frozen rule index and integer priority in `[-32768, 32767]` as
scheduler metadata; a debug batch gets the canonical request-list index. Reversing
transport/insertion order while
retaining that metadata cannot change admission. Duplicate action requests remain distinct rows:
ordinary priority/index arbitration admits at most one and emits a refusal for each loser naming
the action and resolved group; a `Set` may not silently collapse them.

Export `parseControlGraph`, `canonicalControlJson` and `controlDigest`. Parsing refuses unknown keys
and versions, more than 128 groups, 64 members in a group, 256 actions, 32 parameters on an action,
more explicit module claims than the group's module set or 16 resource claims before allocating
scheduler state. Canonical bytes sort the two set
collections, enum values and all set-valued members/claims, but never acquire Mind rule ordering.
Numeric bounds are finite with `min < max`; enum values use legal unique IDs. Runtime requests must
match kind/unit-free wire type and bounds exactly--there is no clamping or string coercion.

Create `src/construct/scheduler.ts`. An action instance owns `enter`, `step`, `done`, `cancel` and a
read-only diagnostic. It writes motor targets only through a `MotorWriter` scoped to the joints its
resolved group owns. The scheduler sorts by descending bounded priority then ascending source
declaration index, admits rows whose resolved joint/module/resource claims are disjoint and returns one refusal
row for every rejected request. Object keys, Set order, request arrival and callback completion are
never tie-breakers.

Create `src/construct/controllers.ts` with bootstrap `hold-joints` and `turn-joint-to-angle`
controllers. Even these read current joint state and converge under blueprint speed/force limits;
neither teleports a part. Register controllers in a total table whose default is `never`, following
the weapon-builder rule.

Create `src/construct/view.ts`. Publish stable part/joint/module state, installed sensors, available
actions and active/refused action diagnostics. A synthetic six-part fixture endpoint accepts
`ConstructCommand` containing action requests; the debug host and later `ConstructMind` use this
exact type. The endpoint accepts metadata only from the installed source adapter, validates bounded
priority and a unique non-negative integer `sourceIndex` for every row, then passes it separately
from `ActionRequest`. Its `InstalledDriver.step` is command production -> scheduler -> controller
writes, the
construct half of session 02's frozen step contract.

Create `src/construct/control.ts` for that `construct-v1` endpoint. It binds a compiled runtime,
scheduler and installed command source without importing `Mind`, `FighterView` or `Intent`; policy
installation validates the surface/name before the first step. It publishes no human factory yet.

Add `src/construct/recorder.ts` as the construct implementation of `ControlRecordingPort`. Extend
the caller-owned `BoutRecorder` at `src/recorder.ts#L27` with a body-neutral, versioned control-event
envelope; the host stores those envelopes but never interprets construct payload as `Intent` or
`FighterView`. The port records request, admission, start, completion, cancellation and refusal
without reading whether the source was a person or AI. Sequence IDs are monotonic per side and the
`{ side, sequence }` pair is unique per bout; every accepted request produces exactly one terminal
completion or cancellation before verdict, handover or disposal. Existing humanoid behavior rows
and engagement bytes do not move.

## Tests watched failing

Create `tests/construct-actions.test.mjs`:

- `disjoint_actions_run_concurrently_and_shared_joint_claims_never_do`
- `priority_then_source_declaration_index_is_the_complete_arbitration_order`
- `a_request_cannot_forge_group_priority_or_claims_or_omit_a_group_motor`
- `oversize_control_graphs_refuse_before_scheduler_allocation`
- `an_action_can_write_only_the_motors_its_group_declares`
- `unknown_missing_non_finite_and_out_of_range_parameters_are_refused_by_field`
- `hold_and_turn_are_closed_loop_under_the_declared_motor_limits`
- `the_action_recorder_cannot_read_driver_identity`
- `the_debug_source_and_construct_mind_issue_the_same_ConstructCommand_shape`

Mutation proof: reverse request arrival while retaining source indices and require the admitted set
to stay the same; replace source index with arrival index and watch it fail. Remove the writer's
joint-ownership check and watch the foreign-motor fixture fail. Add driver identity to the recorder
API and require the source-boundary test, not merely an empty fixture field, to fail.

## Accept

- The synthetic construct runs two disjoint joint controllers at once and reports why a third
  conflicted.
- No construct caller outside controller implementations can set a physics motor target.
- The later Warden can use `hold-joints` through this public path; there is no direct bootstrap
  exception to remove.
- The construct contract adds no field to humanoid `Intent` or tactic v2.
- `npm test`, `npm run check` and `npm run build` pass.
