# Skeleton 05 -- a bone material and bone-shaped shells

**Depends on:** 04, because `headShell` must already take its table. **Moves:** no stone or
human body, and no stone or human pixel. **Lands:** one material recipe, created lazily; a new
file of bone shell builders; a `look` field on seven tables; and a total dispatch at each shell
call site those tables reach.

## What a shell is, and what that makes safe

A shell is cosmetic. Every mesh a shell builder makes is parented to a collider mesh, has
`isPickable = false`, and carries no body, shape or constraint. `src/golem/effectors/shell.ts`
and every module docstring say so, and `AGENTS.md`'s house rule is "Cosmetics never carry
authority". So a new look can change what a body looks like and cannot change what it does. The
tests below check that directly, by building one table in both looks and comparing the bodies.

## The material

In `src/golem/materials.ts`:

- `GolemSurfaceFamily` gains `"bone"`. `GolemMaterialRecipeKey` gains `"carved-bone"`.
- `GOLEM_MATERIAL_PROFILES` gains:

  ```ts
  "carved-bone": {
    family: "bone",
    // Ivory, warmer on the left and cooler on the right. A skeleton's faction colour is carried
    // mostly by its rune eyes, so the two bones differ only enough to tell apart in a mirror.
    albedoByFaction: { left: [0.80, 0.74, 0.62], right: [0.72, 0.73, 0.74] },
    metallic: 0,
    roughness: 0.62,
    emissive: false,
    grain: null,
  },
  ```

- `GolemMaterialPalette` gains `readonly bone: PBRMaterial`. **Created on first read, not with
  the palette.** Every stone and human scene then has exactly the materials it has today. That
  matters because `tests/arena.test.mjs` and `tests/golem-arena.test.mjs` count
  `scene.materials.length` in their lifecycle audits, and the fingerprint cannot see materials.
  In `golemMaterials`:

  ```ts
  let bone: PBRMaterial | null = null;
  const boneMaterial = (): PBRMaterial => {
    if (disposed) throw new Error(`golem.${faction} palette is disposed`);
    if (bone) return bone;
    const profile = GOLEM_MATERIAL_PROFILES["carved-bone"];
    bone = material(scene, `golem.${faction}.carved-bone`, profile.albedoByFaction[faction]);
    bone.metallic = profile.metallic;
    bone.roughness = profile.roughness;
    bone.metadata = { golemSurfaceFamily: "bone" };
    return bone;
  };
  // in the palette object:
  get bone() { return boneMaterial(); },
  // in dispose(), before the four existing material disposals:
  bone?.dispose(false, false);
  ```

- **No procedural plugin for bone.** `plugins` stays four long. The procedural shader has
  families for stone, bronze, plain and rune, and a bone family is out of scope. Without the
  plugin a bone shows no wear cracks, which is acceptable for now.
- `materialForGolemRecipe(palette, "carved-bone")` already resolves through
  `palette[profile.family]`, so it reaches the getter with no further change.
- `GOLEM_SURFACE_RULES` does **not** change. The roles still mean stone, bronze, wood and rune.
  Bone builders ask for `"carved-bone"` by recipe and for `"rune"` by role, for the eyes.

**Forge art leaves bone alone.** `dressGolemPart` swaps only 24-vertex boxes whose material family
is `carvedStone` or `rune`, 70-vertex cylinders in `functionalMetal`, and blade modules by id. A
bone builder must therefore never put a box in the rune material. The eyes below are spheres.
The session 05 test asserts this.

## The look, per table

In `src/golem/effectors/shell.ts`:

```ts
/** How a module's shells are drawn. `carved` is stone; `bone` is a skeleton. */
export type ShellLook = "carved" | "bone";

/** A limb bone: a carved slab with a ridge and bearing, or a bone shaft with two condyles. */
export const LIMB_SHELL: Readonly<Record<ShellLook, (scene: Scene, options: BoneShellOptions) => readonly AbstractMesh[]>> =
  Object.freeze({ carved: boneShell, bone: boneShaft });

/** A bearing: a stone ball with a bronze band, or a bone knuckle. */
export const JOINT_SHELL: Readonly<Record<ShellLook, (scene: Scene, options: BallShellOptions) => readonly AbstractMesh[]>> =
  Object.freeze({ carved: ballShell, bone: boneKnuckle });
```

`boneShaft` and `boneKnuckle` are imported from the new `src/golem/bone-shells.ts`, which imports
the option types back from `shell.ts` with `import type`. The cycle is type-only and erased at
runtime.

Add `look: "carved" as ShellLook` to each of these tables in `src/golem/config.ts`, using
`import type { ShellLook } from "./effectors/shell.ts"`. `config.ts` imports nothing at runtime
today and must stay that way.

| Table | Read by |
| --- | --- |
| `LOCOMOTION_BIPED` | pelvis, thigh, shin and foot shells in `biped.ts` |
| `TORSO_WAIST` | the waist ball's shell in `torso.ts` |
| `TORSO_PLAIN`, `TORSO_PLATED` (and `TorsoTuning`, as `readonly look: ShellLook`) | the core's shell in `torso.ts` |
| `HEAD_NECK` | the neck and head shells in `head.ts` |
| `CHAIN_REACH` | collar, upper and fore shells in `arm-core.ts` |
| `CHAIN_WRIST` | ring and link shells in `wrist.ts` |
| `TERMINAL_FIST` | the fist's shell in `fist.ts` |

The `HUMAN_*` tables spread these and inherit `carved`, so nothing about the human family
changes. `multileg.ts` calls `boneShell` directly for its femurs and shins. It is stone-only, has
no table field for this, and is left alone.

### The call sites

Each becomes a lookup in a total record, never a ternary:

- `arm-core.ts`: collar `JOINT_SHELL[R.look](...)`, upper and fore `LIMB_SHELL[R.look](...)`.
- `wrist.ts`: ring `JOINT_SHELL[W.look](...)`, link `LIMB_SHELL[W.look](...)`.
- `fist.ts`: `JOINT_SHELL[F.look](...)`.
- `head.ts`: neck `LIMB_SHELL[N.look](...)`. For the head itself, add a record beside `headShell`:
  `const HEAD_SHELL: Readonly<Record<ShellLook, typeof headShell>> = { carved: headShell, bone: skullShell }`.
- `torso.ts`: waist ball `JOINT_SHELL[W.look](...)`, and core
  `CORE_SHELL[T.look](...)` with `{ carved: torsoShell, bone: ribcageShell }`.
- `biped.ts`: thigh and shin `LIMB_SHELL[B.look](...)`. The pelvis and the foot differ in shape
  between the looks, so give each its own record inside `build`:

  ```ts
  const pelvisShell: Readonly<Record<ShellLook, () => readonly AbstractMesh[]>> = {
    carved: () => Object.freeze([pelvis.mesh]),   // the collider is the drawing, as today
    bone: () => bonePelvisShell(ctx.scene, { name: pelvis.name, host: pelvis.mesh,
      width: B.pelvisWidth, height: B.pelvisHeight, depth: B.pelvisDepth, materials: ctx.materials }),
  };
  const footShell: Readonly<Record<ShellLook, (leg: BipedLeg, suffix: string) => readonly AbstractMesh[]>> = {
    carved: footPlate,
    bone: (leg) => boneFootShell(ctx.scene, { name: leg.foot.name, host: leg.foot.mesh,
      length: B.footLength, width: B.footWidth, height: B.footHeight, materials: ctx.materials }),
  };
  ```

  The pelvis part's `shell:` becomes `pelvisShell[B.look]()`, and the foot's `plate` becomes
  `footShell[B.look](leg, suffix)`.

## `src/golem/bone-shells.ts` (new)

Every builder here follows the same rules:

- It **hides its host** (`host.isVisible = false`), because a bone shell is the whole drawing of
  its part. That is how the human skin treats its hosts (`p.host.isVisible = false` in
  `src/golem/humanoid/appearance.ts`), so it is not a new convention. A carved shell leaves its
  host visible, as it does today.
- Every mesh is parented to the host, has `isPickable = false`, has an identity
  `rotationQuaternion` unless it states a turn, and is returned in a frozen array.
- Materials: `materialForGolemRecipe(materials, "carved-bone")`, plus
  `materialForGolemRole(materials, "rune")` for eyes only. There is no bronze anywhere.
- Tessellation stays low (spheres `segments: 8`, cylinders `tessellation: 10`, tori
  `tessellation: 16`). A skeleton has about 30 pieces, and each should cost what a stone slab
  costs.
- The file imports only Babylon and `materials.ts`, plus types from `shell.ts` and `config.ts`.

The shapes, in each host's local frame. Y runs along the bone. For the head, pelvis and torso,
+Z is forward, matching `headShell`'s brow at `+browOffset`.

| Builder | Takes | Draws |
| --- | --- | --- |
| `boneShaft` | `BoneShellOptions` (`taper` is ignored) | A cylinder along Y, diameter `2 * radius * 0.85`, height `length * 0.84`, and two condyle spheres of diameter `2 * radius * 1.45` at `y = +/-(length / 2 - radius * 0.5)` |
| `boneKnuckle` | `BallShellOptions` (`band` is ignored) | A sphere of diameter `2 * radius`. With `axleLength`, also a cylinder along Y of that length and diameter `radius * 1.1` |
| `ribcageShell` | `{ name, host, tuning: TorsoTuning, materials }` | A spine cylinder (radius 0.016, full core height) at `z = -depth * 0.38`. A sternum cylinder (radius 0.012, height `0.55 * coreHeight`) at `z = +depth * 0.44`. Five ribs as `CreateTorus` (thickness 0.014), stacked from `y = -0.30 H` to `y = +0.36 H`, with diameter `width * [0.78, 0.92, 0.98, 0.94, 0.80]` and `scaling.z = depth / width` to make them elliptical. A clavicle cylinder across X at `y = +0.46 H` |
| `skullShell` | `{ name, host, table: typeof HEAD_NECK, materials }` | A cranium sphere of diameter `headWidth`, scaled on Y by `headHeight / headWidth` and on Z by `headDepth / headWidth`, raised `0.08 H`. A jaw box `0.62 W x 0.22 H x 0.50 D` at `y = -0.36 H, z = +0.18 D` in bone. Two eye spheres of diameter `0.20 W` at `x = +/-0.22 W, y = +0.02 H, z = browOffset * 0.85` in rune |
| `bonePelvisShell` | `{ name, host, width, height, depth, materials }` | A torus of diameter `width * 0.9`, thickness `height * 0.35`, turned a quarter about X so it stands upright facing forward, with `scaling` flattening it to `depth`. A sacrum cylinder (radius `height * 0.25`, height `height`) at `z = -depth * 0.35` |
| `boneFootShell` | `{ name, host, length, width, height, materials }` | Three metatarsal cylinders along Z (length `0.7 * length`, radius `height * 0.18`) at `x = -0.3 W, 0, +0.3 W`, and a heel sphere (diameter `height * 0.9`) at `z = -0.38 * length` |

These numbers are a first draft for a person to adjust on the bench in session 06. Only their
structure is tested.

## Tests

New file `tests/bone-look.test.mjs`. It has no Havok bouts, so it is fast. Build modules through
their *definitions* on a stand (`buildGolemStand` and `createHeadlessArena`, with the context
fields that `tests/golem-torso-head.test.mjs` passes).

1. `a_look_changes_no_body` -- for each of `bipedDefinition`, `torsoModule`, `headModule` and
   `wristChainFrom` (paired with `fistDefinition` through `effectorModule`), build the stock
   table and then `{ ...table, look: "bone" }` in a fresh arena. Assert that the two builds have
   the same number of parts, and that each pair of parts has an identical mass, inertia and
   centre of mass (`getMassProperties()`), the same mesh position and rotation quaternion, and the
   same shape type and bounding extents. Exact equality, not a tolerance.
2. `a_bone_look_hides_its_hosts_and_draws_only_bone_and_rune` -- in the bone build, every part's
   host has `isVisible === false`. Every shell mesh's material is the palette's `bone` or `rune`.
   No shell mesh has a `physicsBody`. No rune-material mesh has 24 vertices, which is what forge
   art would swap.
3. `a_carved_look_is_unchanged` -- in the stock build, every host is still visible and no mesh
   anywhere uses the bone material.
4. `the_bone_material_exists_only_once_asked_for_and_dies_with_its_palette` -- a fresh palette
   adds exactly the four materials it adds today. Reading `palette.bone` adds one, and a second
   read returns the same object. `palette.dispose()` removes all five from `scene.materials`.
   Reading `.bone` after disposal throws.
5. `every_look_has_a_builder_at_every_site` -- `Object.keys(LIMB_SHELL)` and
   `Object.keys(JOINT_SHELL)` equal the `ShellLook` members. This is the runtime half of what the
   `Record` type already enforces, and it exists because `.mjs` tests cannot see types.

Watch 1 go red by giving `boneShaft` a physics body by mistake: call
`new PhysicsAggregate(...)` on the shaft in a scratch edit, and the "same number of bodies" or the
mass comparison should fail. Remove the edit afterwards.

## Verification

```powershell
node tests/harness/body-fingerprint.mjs --out .review/fp-before.json   # before editing
npm test
npm run check
npm run build
node tests/harness/body-fingerprint.mjs --out .review/fp-after.json --against .review/fp-before.json
```

Every section must be `same`. No page check is possible yet, because nothing registered uses the
bone look. The first visual review is in session 06. Commit.
