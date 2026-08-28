# Session 01 -- freeze the body-blueprint vocabulary

## Outcome

A pure TypeScript blueprint can describe an arbitrary rooted graph of rigid parts, joints,
sockets and mounted modules. Validation gives one precise refusal for every malformed relation.
Nothing renders and no Havok object is constructed in this session.

## Implement

Create `src/construct/blueprint.ts` with the v1 grammar. Keep it free of Babylon and the DOM.

~~~ts
export interface ConstructBlueprint {
  readonly version: 1;
  readonly id: string;
  readonly rootPart: string;
  readonly parts: readonly PartSpec[];
  readonly joints: readonly JointSpec[];
  readonly sockets: readonly SocketSpec[];
  readonly modules: readonly ModuleSpec[];
}

export type PrimitiveShape =
  | Readonly<{ kind: "box"; sizeM: Triple }>
  | Readonly<{ kind: "capsule"; lengthM: number; radiusM: number }>
  | Readonly<{ kind: "cylinder"; lengthM: number; radiusM: number }>
  | Readonly<{ kind: "sphere"; radiusM: number }>;
~~~

Every ID matches `[a-z][a-z0-9-]{0,47}` and is unique across its own namespace. Transforms are
finite metres/quaternions with normalized rotations. Parts have positive dimensions and mass;
joints name existing parent/child parts exactly once, form one connected acyclic tree and carry
explicit parent/child attachment frames, axes, limits, damping, motor force and motor speed.
Sockets have an attachment frame and compatibility tags. Modules mount into exactly one compatible
socket. No role field may contain `arm`, `leg` or `turret`; those words belong to later control
groups, not the body grammar.

Create `src/construct/canonical.ts` for canonical key ordering, finite-number spelling and the
v1 integrity checksum. Do not use `JSON.stringify` on arbitrary object insertion order. Export
`canonicalBlueprintJson`, `blueprintDigest` and `parseBlueprint`, with the parser refusing unknown
keys rather than discarding them.

Add the contract and the hardware/control separation to `docs/design.md`.

## Tests watched failing

Create `tests/construct-blueprint.test.mjs`:

- `a_blueprint_round_trip_preserves_every_declared_part_joint_socket_and_module`
- `part_roles_do_not_exist_in_the_physical_grammar`
- `a_cycle_disconnected_part_duplicate_id_or_missing_reference_is_refused_by_name`
- `non_finite_non_positive_and_non_normalized_geometry_is_refused_at_its_field`
- `a_module_cannot_mount_to_an_incompatible_or_already_occupied_socket`
- `canonical_blueprint_bytes_ignore_object_insertion_order_and_change_with_every_contract_field`
- `a_version_or_unknown_key_from_the_future_is_refused_instead_of_repaired`

Mutation proof: remove the child-side attachment frame from the canonical writer and watch the
digest/round-trip test fail; change one cycle edge into a tree edge and watch only the cycle fixture
turn green.

## Accept

- The grammar describes hardware only and can express two, four or six identical limbs without
  deciding what they do.
- Parsing, validation and canonicalization allocate no Babylon object and import no runtime module.
- Every invalid fixture returns the offending ID and field in its refusal.
- `npm test`, `npm run check` and `npm run build` pass.
