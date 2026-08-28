# Session 09 -- make programming the Warden the game

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
  | { op: "constant"; value: number | boolean }
  | { op: "not"; value: Expression }
  | { op: "and" | "or"; values: readonly Expression[] }
  | { op: "lt" | "lte" | "gt" | "gte"; left: Expression; right: Expression }
  | { op: "add" | "sub" | "mul" | "min" | "max"; values: readonly Expression[] };
~~~

A rule declares condition, utility expression, action/group, parameters and conflict priority. No
loops, mutation, arbitrary JavaScript, wall clock or body handle exist. Validation resolves every
sensor/action/group reference against a blueprint/control graph and refuses a required reference
that is unavailable. Rules may explicitly be optional so one program can degrade across related
machines.

Create `src/construct/sensors.ts`. Initial installable sensors publish self joint position/speed,
part health, contact, core attitude, power/heat/ammo, opponent relative centre/velocity, range and
line of sight. They publish facts only. Sensor records are pooled and rewritten; a program keeps no
reference across decisions.

Create `src/construct/mind.ts` with a pure evaluator and state for hysteresis/dwell. It evaluates
rules in stable program order, selects compatible positive-utility requests through the scheduler's
same claim rules and records the decisive sensor values. There is no fallback action: the blueprint
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
