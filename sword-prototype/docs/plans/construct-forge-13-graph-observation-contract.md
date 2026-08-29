# Session 13 -- encode variable bodies and variable action sets

## Status -- software implemented, production entry remains blocked 2026-08-28

The v2 graph now includes core-relative local position/orientation, linear/angular velocity,
normalized joint state, module health/contact/power/heat/ammunition, installed sensor facts,
capabilities and active action rows. Mirror swaps symmetric role IDs and negates lateral physical
channels. Reflection now distinguishes polar vectors from axial angular velocity, carries declared
joint-axis parity rather than guessing from IDs, and mirrors graph/candidate/control/command bytes
involutively. Mirrored physical BC/PPO applies the policy-frame observation and converts its command
back into the public physical frame. Two/four/six-limb, hardware sensor-leak and dynamic
resource/action mutations are green; the polar/axial sign mutation was observed red before restore.
Each joint encodes fixed x/y/z axis slots with presence masks, angle, speed, limits, motor limits and
declared mirror parity; two- and three-axis fixtures prove stable encoding and involution. This
replaces the former first-axis-only row and intentionally moved graph/checkpoint/policy identity.
The live adapter derives its sensor rows from the saved blueprint's installed channels rather than
reading the whole Warden catalog; a real two-step BC shard on `crossbow-three-limb` now proves the
absent rear-right contact/slip channels are neither read nor encoded.
The session-12 authored gate is still rejected, so this contract has no promotion authority.

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
`CONSTRUCT_OBSERVATION_VERSION = 2`. Encode:

- one node row per living/dead part, joint, module, sensor, control group and action;
- typed edges for physical parent/child, socket/module, group/member, action/group, sensor/source
  and resource dependency;
- normalized dynamic facts: relative transforms/velocities, health, integrity, contact, power,
  heat, ammunition, capability and active-action phase;
- opponent facts through installed sensors only, attached to the sensor node that published them.

Stable order is canonical type rank then stable ID for every blueprint/control set, exactly
matching sessions 00/01. Program rules are the only declaration-order sequence and do not reorder
graph topology. IDs are diagnostics and join keys, never numeric features. Translation is relative to the construct core; rotation uses a
declared local basis. Mirror rules explicitly swap lateral axes and symmetric attachment roles.

Create `src/construct/learning/candidates.ts`. Each available action/group pair is one candidate
with parameter bounds and required claims. A policy scores candidates through shared weights,
rather than producing one output column per action ID. Selected continuous parameters are normalized
inside the candidate's declared bounds and refused if decoding produces a non-finite value.
Candidate rows sort by action ID then group ID, cover each available pair exactly once and carry no
caller-supplied priority or claim override.

Create `src/construct/learning/contract.ts` with the canonical node/edge/feature/action grammar and
digest. Keep it entirely separate from humanoid feature v4 and tactic v2. Synthetic older and future
headers must refuse before a physics step. Enforce the overview's byte/count ceilings before graph
allocation. Freeze `MAX_OBSERVATION_NODES = 1_151`: 128 parts + 127 joints + 256 modules + 128
groups + 256 actions + 256 sensor channels. Freeze `MAX_OBSERVATION_EDGES = 29_694`: 254
joint-endpoint + 256 module/socket-owner + 8,192 group/member + 256 action/group + 256
sensor/source + 20,480 action/claim relationship rows. Each relationship is stored once in
canonical source/target orientation; message passing gathers both endpoints without serializing an
implicit reverse row. These maxima and the per-kind terms participate in the digest. Variable size
means no padding/truncation inside named limits, not unbounded hostile imports.

## Tests watched failing

Create `tests/construct-observation.test.mjs`:

- `two_four_and_six_limb_blueprints_encode_without_padding_or_truncation`
- `blueprint_array_order_does_not_change_canonical_graph_order_or_features`
- `mirror_twice_returns_exact_graph_and_candidate_bytes`
- `a_destroyed_module_changes_only_its_dynamic_rows_edges_and_capabilities`
- `an_uninstalled_sensor_cannot_leak_an_opponent_feature_into_the_graph`
- `candidate_rows_cover_every_available_action_once_and_no_unavailable_action`
- `every_contract_field_participates_in_the_digest_and_stale_versions_refuse_early`

Mutation proof: sort nodes by input declaration index instead of canonical ID and reorder one
symmetric pair; mirror/canonical-order tests must fail. Add opponent range directly to
the core row and require the sensor-leak test to fail. The destroyed-module fixture installs at
least one sensor, action and resource edge that actually depends on that module; an isolated leaf
cannot exhibit the dependency-pruning defect.

## Accept

- The same encoder handles both Warden variants and at least one deliberately asymmetric construct.
- A random candidate policy can select only requests the scheduler accepts.
- Existing humanoid feature/action/artifact digests and research fixtures are byte-identical.
- `npm test`, `npm run check` and `npm run build` pass.
