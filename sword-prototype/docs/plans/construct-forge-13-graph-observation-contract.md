# Session 13 -- encode variable bodies and variable action sets

## Entry gate

Begin only when session 12 records that authored Minds produce controllable, non-trivial bouts and
the build-program-diagnose loop is worth extending. Learning is not a repair for broken locomotion,
self-collision or unusable actions.

## Outcome

A construct of any supported topology becomes a stable graph observation, and every currently
available parameterized action becomes a candidate row. The contract has no fixed count of limbs,
mounts or actions and no padding constant that quietly becomes the real game limit.

## Implement

Create `src/construct/learning/observation.ts` with
`CONSTRUCT_OBSERVATION_VERSION = 1`. Encode:

- one node row per living/dead part, joint, module, sensor, control group and action;
- typed edges for physical parent/child, socket/module, group/member, action/group, sensor/source
  and resource dependency;
- normalized dynamic facts: relative transforms/velocities, health, integrity, contact, power,
  heat, ammunition, capability and active-action phase;
- opponent facts through installed sensors only, attached to the sensor node that published them.

Stable order is canonical type then blueprint/control declaration index. IDs are diagnostics and
join keys, never numeric features. Translation is relative to the construct core; rotation uses a
declared local basis. Mirror rules explicitly swap lateral axes and symmetric attachment roles.

Create `src/construct/learning/candidates.ts`. Each available action/group pair is one candidate
with parameter bounds and required claims. A policy scores candidates through shared weights,
rather than producing one output column per action ID. Selected continuous parameters are normalized
inside the candidate's declared bounds and refused if decoding produces a non-finite value.

Create `src/construct/learning/contract.ts` with the canonical node/edge/feature/action grammar and
digest. Keep it entirely separate from humanoid feature v4 and tactic v2. Synthetic older and future
headers must refuse before a physics step.

## Tests watched failing

Create `tests/construct-observation.test.mjs`:

- `two_four_and_six_limb_blueprints_encode_without_padding_or_truncation`
- `blueprint_array_order_does_not_change_canonical_graph_order_or_features`
- `mirror_twice_returns_exact_graph_and_candidate_bytes`
- `a_destroyed_module_changes_only_its_dynamic_rows_edges_and_capabilities`
- `an_uninstalled_sensor_cannot_leak_an_opponent_feature_into_the_graph`
- `candidate_rows_cover_every_available_action_once_and_no_unavailable_action`
- `every_contract_field_participates_in_the_digest_and_stale_versions_refuse_early`

Mutation proof: sort nodes by ID instead of declaration index and use IDs deliberately chosen to
reverse one symmetric pair; mirror/canonical-order tests must fail. Add opponent range directly to
the core row and require the sensor-leak test to fail.

## Accept

- The same encoder handles both Warden variants and at least one deliberately asymmetric construct.
- A random candidate policy can select only requests the scheduler accepts.
- Existing humanoid feature/action/artifact digests and research fixtures are byte-identical.
- `npm test`, `npm run check` and `npm run build` pass.
