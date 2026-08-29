# Session 09 -- make programming the Warden the game

## Status -- runtime and installed vocabulary complete; whole-bout evidence superseded (2026-08-28)

The saved program, installed-sensor filter, typed expressions, stable arbitration and diagnostics
are implemented and mutation-tested. Every configured joint axis now installs distinct angle and
speed channels (single-axis IDs remain unsuffixed; multi-axis IDs use `-x/-y/-z`). The installed
Warden vocabulary also publishes opponent local position/velocity x/y/z and numeric core roll/pitch
in radians. Physical-bus tests prove values and units and prove destroyed joints/sensor modules
remove their facts. The former eight-row gameplay claim is superseded: those four seed labels did
not yet perturb physics, so they were mirror duplicates rather than independent seeded evidence.
Whole-bout acceptance requires a fresh corpus on the seeded runtime.

## Outcome

A versioned, no-code-friendly Mind program reads only installed sensors, scores rules and emits
concurrent action requests. The Bronze Warden can complete a whole auto-battle under an authored
program, and every selected/refused action has a human-readable reason.

## Implement

Create `src/construct/program.ts` with `CONSTRUCT_PROGRAM_VERSION = 1`. The v1 language is deliberately
bounded and total:

~~~ts
type Expression =
  | { op: "sensor"; id: string }
  | { op: "constant"; value: boolean }
  | { op: "constant"; value: number; unit: SensorUnit }
  | { op: "not"; value: Expression }
  | { op: "and" | "or"; values: readonly Expression[] }
  | { op: "lt" | "lte" | "gt" | "gte"; left: Expression; right: Expression }
  | { op: "add" | "sub" | "mul" | "min" | "max"; values: readonly Expression[] };

interface ProgramRule {
  readonly id: string;
  readonly condition: Expression;
  readonly utility: Expression;
  readonly action: string;
  readonly parameters: Readonly<Record<string,
    | Readonly<{ kind: "expression"; value: Expression }>
    | Readonly<{ kind: "enum"; value: string }>>>;
  readonly priority: number;
  readonly optional: boolean;
}

interface ConstructProgram {
  readonly version: 1;
  readonly rules: readonly ProgramRule[];
}
~~~

`SensorUnit` is `boolean | QuantityUnit`, using session 04's closed numeric set `scalar | metres |
metres-per-second | radians | radians-per-second | seconds | joules | watts`. Sensors publish `{ value, unit }`; boolean sensors
use `boolean`. `not/and/or` accept booleans, ordered comparisons require equal numeric units,
`add/sub/min/max` require equal numeric units, and `mul` requires one scalar operand and preserves
the other's unit. Validation infers every expression result and refuses the exact operator/path on
a mismatch. These rules land here, before program canonical bytes; session 11 merely presents them.

A rule declares condition, utility expression, action ID, parameters and conflict priority. The
action's group and claims come only from its installed `ActionSpec`; a rule cannot repeat or
override either. No loops, mutation, arbitrary JavaScript, wall clock or body handle exist.
Validation resolves every sensor/action reference and the action's installed group against a
blueprint/control graph, and refuses a required reference that is statically absent. Rules may be
optional only for a statically missing module or action so one program can span related machines.
A dynamically unavailable installed action--empty
ammunition, heat, power or damage--remains a live rule whose request is refused and diagnosed;
`optional` never hides that capability edge.

The condition must infer `boolean`, utility must infer finite `scalar`, and every parameter
expression must infer the kind/unit required by the selected action descriptor. Enum parameters
are explicit literals; boolean parameters use boolean expressions. No implicit radians/degrees,
metres/scalar or string conversion is performed.

Program rules are the saved sequence: IDs are unique diagnostics, but array order is semantic and
is not canonicalized away. Object keys within a rule remain canonical sets. Parsing refuses more
than 512 rules, 4,096 total expression nodes, depth over 64, priorities outside `[-32768, 32767]`
and any saved construct over the overview's 1 MiB ceiling before evaluator allocation.

Create `src/construct/sensors.ts`. Initial installable sensors publish self joint position/speed,
part health, contact, core attitude, power/heat/ammo, opponent relative centre/velocity, range and
line of sight. They publish facts only. Sensor records are pooled and rewritten; a program keeps no
reference across decisions.

Create `src/construct/mind.ts` with a pure evaluator and state for hysteresis/dwell. It evaluates
rules in stable program order and submits every positive-utility request with its frozen rule index
and priority to the public scheduler; it does not pre-filter conflicts through a second arbitration
implementation. Scheduler admission/refusal is the one result recorded with decisive sensor
values. There is no fallback action: the blueprint
must install an explicit safe `hold`/`brace` rule.

Commit `src/construct/warden-mind.ts`: recover when fallen, brace against imminent contact, walk
into viable range, track/attack with the installed dorsal module, cover with the shield, otherwise
orbit. The crossbow and sword variants share the program except for optional module-specific rules.

## Tests watched failing

Create `tests/construct-mind.test.mjs`:

- `a_program_reads_only_sensors_its_blueprint_installed`
- `unknown_actions_groups_sensors_operators_and_non_finite_values_are_refused_by_name`
- `rule_selection_is_stable_under_object_key_order_and_changes_under_rule_order`
- `compatible_rules_emit_concurrent_requests_and_conflicting_rules_follow_declared_priority`
- `an_optional_missing_module_rule_is_skipped_while_a_required_one_refuses_the_program`
- `dynamic_capability_loss_is_reported_even_for_an_optional_installed_rule`
- `oversize_or_overdepth_programs_refuse_before_evaluator_allocation`
- `the_Warden_program_recovers_closes_tracks_attacks_and_covers_in_a_real_bout`
- `every_action_diagnostic_names_the_rule_and_sensor_values_that_selected_it`

Mutation proof: expose opponent policy identity as a sensor and require the sensor whitelist test to
fail. Replace a closed-loop attack with a fixed joint timeline and require the shoved-mid-action
fixture to fail recovery/target alignment.

## Accept

- Two policy-controlled Wardens complete repeated bouts with non-trivial locomotion and attacks.
- A viewer can pause and understand what each machine is trying, why and which hardware refused it.
- No editor exists yet; programs are committed data and prove the runtime first.
- `npm test`, `npm run check` and `npm run build` pass.
