# Session 05 -- make actions the construct's control language

## Outcome

A construct is driven only through named, parameterized, closed-loop actions. Named control groups
turn generic joints into useful mechanisms; a deterministic scheduler runs compatible actions
together and refuses resource conflicts by name.

## Implement

Create `src/construct/actions.ts` with `CONSTRUCT_ACTION_VERSION = 1` and the pure declarations:

~~~ts
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
  readonly group: string;
  readonly priority: number;
  readonly parameters: Readonly<Record<string, number | string | boolean>>;
}
~~~

Create `src/construct/scheduler.ts`. An action instance owns `enter`, `step`, `done`, `cancel` and a
read-only diagnostic. It writes motor targets only through a `MotorWriter` scoped to the joints its
group owns. The scheduler sorts requests by explicit priority then stable program declaration
index, admits requests whose joint/module/resource claims are disjoint and returns a refusal row
for every rejected request. Priorities must be bounded integers and ties must not depend on object
or Set iteration order.

Create `src/construct/controllers.ts` with bootstrap `hold-joints` and `turn-joint-to-angle`
controllers. Even these read current joint state and converge under speed/force limits; neither
teleports a part. Register controllers in a total table whose default is `never`, following the
weapon-builder rule.

Create `src/construct/view.ts`. Publish stable part/joint/module state, installed sensors, available
actions and active/refused action diagnostics. The Warden endpoint accepts `ConstructCommand`
containing action requests; the debug host and `ConstructMind` will both use this exact type.

Add a construct action recorder in `src/construct/recorder.ts`, parallel to the humanoid
`BoutRecorder` at `src/recorder.ts#L27`. It records request, admission, start, completion,
cancellation and refusal without reading whether the source was a person or AI.

## Tests watched failing

Create `tests/construct-actions.test.mjs`:

- `disjoint_actions_run_concurrently_and_shared_joint_claims_never_do`
- `priority_then_declaration_index_is_the_complete_arbitration_order`
- `an_action_can_write_only_the_motors_its_group_declares`
- `unknown_missing_non_finite_and_out_of_range_parameters_are_refused_by_field`
- `hold_and_turn_are_closed_loop_under_the_declared_motor_limits`
- `the_action_recorder_cannot_read_driver_identity`
- `the_debug_source_and_construct_mind_issue_the_same_ConstructCommand_shape`

Mutation proof: reverse insertion order of the requests and require the admitted set to stay the
same. Remove the writer's joint-ownership check and watch the foreign-motor fixture fail.

## Accept

- The Warden can run two disjoint joint controllers at once and reports why a third conflicted.
- No construct caller outside controller implementations can set a physics motor target.
- The construct contract does not add fields to humanoid `Intent` or tactic v2.
- `npm test`, `npm run check` and `npm run build` pass.
