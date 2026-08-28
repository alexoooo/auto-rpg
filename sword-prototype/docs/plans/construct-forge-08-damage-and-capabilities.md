# Session 08 -- let damage rewrite the machine's available actions

## Outcome

Armour, joint damage, severed subtrees, power, heat, reload and ammunition are authoritative body
state. The construct view derives capabilities from what is alive and usable. An action disappears
or is cancelled on the exact step its required hardware becomes unavailable.

## Implement

Create `src/construct/capabilities.ts`. A capability is a factual, versioned row:

~~~ts
export interface ActionCapability {
  readonly action: string;
  readonly group: string;
  readonly available: boolean;
  readonly reason: string | null;
  readonly parameterBounds: Readonly<Record<string, readonly [number, number]>>;
}
~~~

Availability is recomputed from living part/joint/module IDs, sensor dependencies, ammunition,
power and thermal limits. A false row has one named reason chosen by stable precedence; it is not
omitted, because the Forge and Mind debugger must explain why yesterday's program stopped working.

Extend `src/construct/runtime.ts` with per-part health/armour and joint integrity. Severing a joint
detaches the whole child subtree, relayers it as debris and removes its sockets/modules from the
owner. Core fatality and vitality weights come from the blueprint, not names such as `head` or
`torso`. Extend `src/construct/scheduler.ts` to cancel an active action before its next motor write
when any claim becomes unavailable.

Create `src/construct/resources.ts` for a per-step power ledger, heat accumulation/cooling, reload
and ammunition. Resource arithmetic is fixed-step and finite. A power shortfall is resolved by the
same explicit priority/declaration order as action conflicts; it does not scale every motor by an
implicit fraction.

Update HUD diagnostics with the live part tree, active/cancelled actions and exact unavailable
reasons. Feed construct combat events into its recorder without coercing effectors into hands.

## Tests watched failing

Create `tests/construct-damage.test.mjs`:

- `severing_one_joint_detaches_exactly_its_child_subtree_and_relabels_it_debris`
- `losing_a_required_joint_cancels_the_action_before_another_motor_write`
- `capability_rows_name_missing_hardware_ammunition_power_and_heat_separately`
- `priority_resolves_a_power_shortfall_without_partial_hidden_throttling`
- `core_and_part_vitality_come_from_blueprint_weights_not_humanoid_names`
- `a_destroyed_sensor_removes_only_the_actions_that_declared_that_sensor`
- `damage_disposal_and_rebuild_return_every_resource_to_baseline`

Mutation proof: delay capability recomputation by one step and require the post-sever motor-write
counter to fail. Give a detached sword continued scorer ownership and require the debris contact
fixture to fail.

## Accept

- Shooting consumes ammunition and reload time; overheated or unpowered hardware refuses by name.
- A visibly lost mechanism immediately changes the actions the Mind can choose.
- The Warden can continue fighting in a degraded configuration when its remaining graph supports it.
- `npm test`, `npm run check` and `npm run build` pass.
