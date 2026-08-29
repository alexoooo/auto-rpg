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

export type Triple = readonly [number, number, number];
export type Rotation = readonly [number, number, number, number]; // x, y, z, w
export interface FrameSpec { readonly positionM: Triple; readonly rotation: Rotation; }

export type PrimitiveShape =
  | Readonly<{ kind: "box"; sizeM: Triple }>
  | Readonly<{ kind: "capsule"; lengthM: number; radiusM: number }>
  | Readonly<{ kind: "cylinder"; lengthM: number; radiusM: number }>
  | Readonly<{ kind: "sphere"; radiusM: number }>;

export interface PartSpec {
  readonly id: string;
  readonly shape: PrimitiveShape;
  readonly massKg: number;
  readonly centreOfMassM: Triple;
  readonly friction: number;
  readonly restitution: number;
  readonly health: number;
  readonly armour: number;
  readonly vitalityWeight: number;
  readonly fatal: boolean;
  readonly shell: Readonly<{
    style: "plate" | "collar" | "bearing" | "piston" | "core";
    visualClearanceM: number;
  }>;
}

export interface JointSpec {
  readonly id: string;
  readonly parentPart: string;
  readonly childPart: string;
  readonly parentFrame: FrameSpec;
  readonly childFrame: FrameSpec;
  readonly angularAxes: readonly Readonly<{
    id: "x" | "y" | "z";
    minRad: number;
    maxRad: number;
    damping: number;
    maxTorqueNm: number;
    maxSpeedRadS: number;
  }>[];
  readonly health: number;
  readonly armour: number;
}

export interface SocketSpec {
  readonly id: string;
  readonly part: string;
  readonly frame: FrameSpec;
  readonly accepts: readonly string[];
}

export type ModuleKind = "contact-sensor" | "attitude-sensor" | "opponent-sensor" |
  "power-core" | "shield" | "sword" | "launcher" | "magazine";
export interface ModulePrimitiveSpec {
  readonly id: string;
  readonly frame: FrameSpec;
  readonly shape: PrimitiveShape;
  readonly shell: PartSpec["shell"];
}
export interface ModuleSpec {
  readonly id: string;
  readonly kind: ModuleKind;
  readonly socket: string;
  readonly compatibilityTag: string;
  readonly geometry: readonly ModulePrimitiveSpec[];
  readonly massKg: number;
  readonly health: number;
  readonly armour: number;
  readonly capacityJ?: number;
  readonly maxOutputW?: number;
  readonly maxHeatJ?: number;
  readonly coolingW?: number;
  readonly reloadSeconds?: number;
  readonly heatPerShotJ?: number;
  readonly energyPerShotJ?: number;
  readonly ammunition?: number;
  readonly sensorChannels?: readonly string[];
  readonly striker?: Readonly<{
    localTipM: Triple;
    localEdgeDirection: Triple;
    localFlatDirection: Triple;
    damageScale: number;
  }>;
  readonly projectile?: Readonly<{
    poolSize: number;
    massKg: number;
    radiusM: number;
    lengthM: number;
    muzzleSpeedMps: number;
    damageScale: number;
  }>;
}
~~~

Every ID matches `[a-z][a-z0-9-]{0,47}` and is unique across its own namespace. Each reference
field names its namespace (`parentPart`, `socket`, and so on); later scheduler claims use explicit
`joint:`, `module:` or `resource:` prefixes so equal local IDs cannot alias. Transforms are finite
metres/quaternions in x/y/z/w order;
the parser refuses `abs(lengthSquared - 1) > 1e-6` and never normalizes input as a repair. Parts
have positive dimensions, mass, health and finite material/resource fields. Every non-root part is
the child of exactly one joint, the root is never a child, and parents may own many children; the
result is one connected acyclic tree. Joints carry
explicit parent/child attachment frames, axes, limits, damping, motor torque and motor speed.
Sockets have an attachment frame and compatibility tags. Modules mount into exactly one compatible
socket, and each socket holds at most one module. Optional module fields are allowed only on the
kind that owns them: power cores own capacity/output, heat-producing modules own thermal limits,
magazines own ammunition, launchers own reload/shot energy/projectile facts, swords own the
orthonormal striker frame derived against their declared geometry, and sensors own channel IDs. A
launcher cannot silently accept a power-core field, and no controller registry supplies a hidden
physical default for an omitted kind-owned value. There is no `role`
field at all: `arm`, `leg` and `turret` may appear in a human-readable ID, but never become physical
type authority. The implicit collision contract is the overview's all-intact-owned-parts-exempt
rule; v1 contains no unimplementable arbitrary pair-exclusion field.

The blueprint owns every physical value sessions 03--10 consume: shell clearance, health, armour,
vitality/fatality, joint integrity, socket compatibility, installed sensor channels, power output,
thermal limits, launcher projectile/heat/reload and magazine ammunition. Later sessions add dynamic
state and control logic, not unversioned physical side tables.

Create `src/construct/canonical.ts` for canonical key ordering, finite-number spelling and the
v1 integrity checksum. Reuse `canonicalJson` and `artifactChecksum` from
`src/learning/artifact.ts#L98`; do not fork a third checksum implementation or use `JSON.stringify`
on arbitrary object insertion order. Blueprint collection arrays and tag/member lists are sets:
validate duplicates, then sort them by stable ID/byte spelling before writing. `-0` writes as `0`.
Program-rule ordering is not part of this file and remains a sequence. Export
`canonicalBlueprintJson`, `blueprintDigest` and `parseBlueprint`, with the parser refusing unknown
keys rather than discarding them.

Enforce the overview ceilings before allocating proportional arrays. `parseBlueprint` refuses an
oversize input, excessive count or excessive nesting by field and limit; module sensor channels
count against both their per-module and global ceilings. It never truncates.

Add the contract and the hardware/control separation to `docs/design.md`.

## Tests watched failing

Create `tests/construct-blueprint.test.mjs`:

- `a_blueprint_round_trip_preserves_every_declared_part_joint_socket_and_module`
- `part_roles_do_not_exist_in_the_physical_grammar`
- `a_cycle_disconnected_part_duplicate_id_or_missing_reference_is_refused_by_name`
- `non_finite_non_positive_and_non_normalized_geometry_is_refused_at_its_field`
- `a_module_cannot_mount_to_an_incompatible_or_already_occupied_socket`
- `canonical_blueprint_bytes_ignore_object_insertion_order_and_change_with_every_contract_field`
- `blueprint_set_arrays_canonicalize_by_ID_while_duplicate_members_refuse`
- `a_version_or_unknown_key_from_the_future_is_refused_instead_of_repaired`
- `oversize_blueprints_refuse_before_allocating_runtime_state`

Mutation proof: remove the child-side attachment frame from the canonical writer and watch the
digest/round-trip test fail; change one cycle edge into a tree edge and watch only the cycle fixture
turn green; replace canonical ID sorting with input order and watch a reordered valid blueprint
change bytes.

## Accept

- The grammar describes hardware only and can express two, four or six identical limbs without
  deciding what they do.
- Parsing, validation and canonicalization allocate no Babylon object and import no runtime module.
- Every invalid fixture returns the offending ID and field in its refusal.
- `npm test`, `npm run check` and `npm run build` pass.
