# Skeleton 04 -- builders read their own tables, and fatality is data

**Depends on:** 01 and 02, because `armour` below is typed `Armour`. **Moves:** no stone or
human body. One cosmetic change for humans: the human head's carved shell, drawn only on the
bench page, becomes human-sized. **Lands:** parameters on four builders, two fields on two tables,
and a factory for the wrist chain.

## The problem

The skeleton is built from the stone builders with its own tables, the way
`src/golem/humanoid/body.ts` builds the human family. Four builders cannot be used that way yet:

1. **`headShell` in `src/golem/head/head.ts` ignores the table it was built from.** It opens with
   `const N = HEAD_NECK`, so every head draws the stone head's 0.34 x 0.32 x 0.36 block. The human
   head's collider is 0.19 x 0.24 x 0.23, and its shell is still stone-sized. This is a live bug on
   the bench page, where `src/bench/main.ts` draws a human part's `shell` directly.
2. **`torsoModule` in `src/golem/torso/torso.ts` always uses `TORSO_WAIST`.** A ribcage on a thin
   spine cannot be stated.
3. **The wrist chain is a singleton over the globals.** `wristChain` in
   `src/golem/effectors/chains/wrist.ts` and `buildArmCore` / `twoBone` in `arm-core.ts` read
   `CHAIN_REACH` and `CHAIN_WRIST` directly. There is no way to build a thin, light arm.
4. **`fatal` is a literal.** `fatal: false` on the torso core in `torso.ts`, and `fatal: true` on
   the head in `head.ts`. The skeleton needs the opposite of both.

The arm tables also have no way to carry armour onto the chain's own parts, and neither does the
fist.

## The changes

### 1. `headShell` takes its table

```ts
function headShell(scene: Scene, options: {
  readonly name: string;
  readonly host: Mesh;
  readonly materials: GolemMaterialPalette;
  readonly table: typeof HEAD_NECK;
}): readonly AbstractMesh[] {
  const N = options.table;
  // ... unchanged
}
```

In `headModule`, pass `table: N` at the head part's `shell:` call. Stone heads use the default
`N = HEAD_NECK`, so they draw exactly what they drew before.

### 2. `torsoModule` takes its waist

```ts
export function torsoModule(
  id: string,
  label: string,
  tuning: TorsoTuning,
  W: typeof TORSO_WAIST = TORSO_WAIST,
): TorsoModuleDefinition {
```

Delete the `const W = TORSO_WAIST;` line. Everything below already reads `W.`. The default is the
same object reference, so a bench sweep that mutates `TORSO_WAIST` still reaches the stone torso
at build time, as it does today.

### 3. Fatality in the tables

- `TorsoTuning` gets `readonly coreFatal: boolean`, with this doc comment:

  > Whether losing the core ends the body. False for stone and human, where the head is the fatal
  > part and the core carries vitality. True for a skeleton, whose ribcage is what holds it
  > together. `beaten` in `src/bout.ts` ends a bout on a fatal part severed or at zero health,
  > and `Golem.sever` calls `die()` when a severed module carries one.

- `TORSO_PLAIN` and `TORSO_PLATED` in `src/golem/config.ts` each get `coreFatal: false`.
  `TORSO_PLATED` is a full literal, not a spread, so it needs its own line. `HUMAN_TORSO`
  spreads `TORSO_PLAIN` and inherits the value.
- `HEAD_NECK` gets `headFatal: true`, with the matching comment. `HUMAN_HEAD` spreads it.
- In `torso.ts`, the core part's `fatal: false` becomes `fatal: T.coreFatal`. Rewrite the comment
  above it: the stone body plan's reason ("the head is the fatal part") now belongs on
  `TORSO_PLAIN.coreFatal`.
- In `head.ts`, the head part's `fatal: true` becomes `fatal: N.headFatal`. The doc comment on
  that literal ("The fatal part. Losing it ends the golem ...") moves to `HEAD_NECK.headFatal`,
  reworded to be about the stone head.

The pelvis in `biped.ts` stays `fatal: true`. The owner wants the skeleton's pelvis fatal too, so
nothing there needs to vary yet.

### 4. The arm: `buildArmCore` takes `R`, and the wrist chain becomes a factory

In `src/golem/effectors/chains/arm-core.ts`:

```ts
const twoBone = (R: typeof CHAIN_REACH, reach: number): { alpha: number; beta: number } => {
  const L1 = R.upperLength;
  const L2 = R.foreLength;
  const cosBeta = clamp((reach * reach - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
  const beta = Math.acos(cosBeta);
  return { alpha: Math.atan2(L2 * Math.sin(beta), L1 + L2 * cosBeta), beta };
};

export function buildArmCore(
  ctx: ModuleBuild, narrowed: ChainLimits | null, crossing: ChainCrossing | null,
  R: typeof CHAIN_REACH = CHAIN_REACH, armour?: Armour,
): ArmCore {
```

- Delete `const R = CHAIN_REACH;`. The three `twoBone(x)` calls inside `buildArmCore` become
  `twoBone(R, x)`. All three are inside the function; checked 2026-09-22.
- Add `...(armour === undefined ? {} : { armour })` as the last key of the collar, upper and fore
  part literals. With no armour this adds no key, so the part objects have the same shape as
  today.
- Keep every arithmetic expression's operand order exactly as it is. Floating-point addition is
  not associative, and "tidying" `a + b + c` into `c + a + b` is the easiest way to move the
  fingerprint.

In `src/golem/effectors/chains/wrist.ts`, wrap today's `defineChain({...})` in:

```ts
export interface WristChainOptions {
  /** A family whose hands hold a refitted shelf. See `EffectorChainDefinition.fitTerminal`. */
  readonly fitTerminal?: EffectorChainDefinition["fitTerminal"];
  /** Armour on every one of the chain's own parts. Absent is bare, which is stone. */
  readonly armour?: Armour;
}

export function wristChainFrom<K extends ChainId>(
  id: K, label: string, R: typeof CHAIN_REACH, W: typeof CHAIN_WRIST, options: WristChainOptions = {},
) {
  return defineChain({
    strokes: ARM_STROKES,
    pointTarget: true,
    id,
    axes: 5,
    label,
    massKg: R.collarMass + R.upperMass + R.foreMass + W.ringMass + W.wristMass,
    swingInertia: /* today's expression with CHAIN_REACH -> R and CHAIN_WRIST -> W */,
    ...(options.fitTerminal ? { fitTerminal: options.fitTerminal } : {}),
    build(ctx, limits, crossing, carriedKg) {
      // today's body, with:
      //   const R = CHAIN_REACH; const W = CHAIN_WRIST;   -> deleted (parameters now)
      //   buildArmCore(ctx, limits, crossing)             -> buildArmCore(ctx, limits, crossing, R, options.armour)
      //   CHAIN_REACH.jointInertiaFloor (castToCarried)   -> R.jointInertiaFloor
      //   ring and link part literals                     -> ...(options.armour === undefined ? {} : { armour: options.armour })
    },
  });
}

export const wristChain = wristChainFrom("wrist", "wrist - reach plus roll and bend", CHAIN_REACH, CHAIN_WRIST);
```

Keep the object's existing key order and add `fitTerminal` only when it is given. Move the long
doc comments on `massKg` and `swingInertia` with the code, and reword "`CHAIN_WRIST.carryRatio`"
to "`W.carryRatio`" only where a comment describes this code rather than the stone table.

**`reachChain` is not converted.** The skeleton does not need a three-axis arm, and `reach.ts`
keeps calling `buildArmCore(ctx, limits, crossing)` with the defaults. Converting it would only
widen the diff.

Search once more after the edit. `grep -n "CHAIN_REACH\|CHAIN_WRIST" src/golem/effectors/chains/wrist.ts src/golem/effectors/chains/arm-core.ts`
must show only the import, the default parameter, the `wristChain` line and comments.

### 5. The fist reads optional armour

In `src/golem/effectors/terminals/fist.ts`:

`fistDefinition` is an `export const` arrow
(`export const fistDefinition = (config: typeof TERMINAL_FIST = TERMINAL_FIST) => defineTerminal({`).
Keep it an arrow and widen only the parameter's type:

```ts
export const fistDefinition = (
  config: typeof TERMINAL_FIST & { readonly armour?: Armour } = TERMINAL_FIST,
) => defineTerminal({
```

and in the part literal: `...(F.armour === undefined ? {} : { armour: F.armour })`. Its
`label: "fist"` stays hardcoded. The human fist is labelled "fist" too, and the skeleton's
needs no other word.
`TERMINAL_FIST` has no `armour` key, so stone and human fists build exactly as before.
`humanEquipment` builds its fist from `{ ...TERMINAL_FIST, radius: 0.045, mass: 0.35 }`, which
has no `armour` key either.

## Why stone and human cannot move

Every default is the object the code read before (`HEAD_NECK`, `TORSO_WAIST`, `CHAIN_REACH`,
`CHAIN_WRIST`, `TERMINAL_FIST`). `coreFatal: false` and `headFatal: true` reproduce the literals
they replace. No stone or human caller passes armour. Every arithmetic expression keeps its
operand order. The one visible change is the human head shell's size, and that is cosmetic.

## Tests

In `tests/golem-torso-head.test.mjs` unless noted. Build each module directly with the context the
existing tests pass to `golemModule("torso.plain").build`: `scene`, `side`, `name`,
`socket: stand.socket("torso")` (or `"head"`), `layers: golemLayers("left")` and
`materials: stand.materials`. Call the *definition's* `build`, because none of these test modules
is registered.

1. `a_head_shell_is_sized_by_the_table_the_head_was_built_from` -- build `humanHead` from
   `src/golem/humanoid/body.ts`. Find the shell mesh whose name ends `.block`, and assert that its
   bounding box (`getBoundingInfo().boundingBox.extendSize` times two, before any parent scaling)
   equals `HUMAN_HEAD.headWidth`, `headHeight` and `headDepth` to within 1e-9. Do the same for
   `headPlain` against `HEAD_NECK`. Mutation: put `const N = HEAD_NECK` back and watch the human
   half go red.
2. `a_torso_reads_the_waist_it_is_given` -- use
   `torsoModule("torso.test", "test", TORSO_PLAIN, { ...TORSO_WAIST, ballMass: 3 })`. Its
   `massKg` is `3 + TORSO_PLAIN.coreMass`, and after building, the waist ball's body mass is 3.
3. `fatality_is_read_from_the_table` -- a torso built from `{ ...TORSO_PLAIN, coreFatal: true }`
   has a fatal core. A head built from `{ ...HEAD_NECK, headFatal: false }` has a non-fatal head.
   The stock `torsoPlain` and `headPlain` keep today's answers. Mutation: restore either literal
   and its half goes red.
4. In `tests/golem-bench.test.mjs`: `a_wrist_chain_from_other_tables_builds_those_tables` --
   `wristChainFrom("wrist", "test", { ...CHAIN_REACH, foreRadius: 0.02, foreMass: 0.4 },
   CHAIN_WRIST, { armour: { cut: 0.5, thrust: 0.5, slap: 0, crush: 0 } })`. Pair it with the
   blade through `effectorModule` and build it on a stand. Assert:
   - the fore part's body mass is 0.4 to within 1e-6, and its collider radius is 0.02 to within
     1e-6 (read the shape's extents). Havok stores both as float32, so `getMassProperties().mass`
     reads back 0.4000000059604645 and an exact comparison fails. The wrist cast test in the
     same file already compares "to a part in a million" for this reason. Test 2's `ballMass: 3`
     is exactly representable and may stay exact;
   - every one of the chain's five parts carries the armour table, and the blade's part does not.

   Reusing the `"wrist"` id is only for the test: it is never registered.

   This test changes radius and mass and keeps both link lengths, so a `twoBone` still reading
   `CHAIN_REACH` would pass it. The grep under change 4 is what catches a leftover `CHAIN_REACH`
   read inside `twoBone` in this session. Session 06 then shortened both links for the skeleton's
   arm, and from there the registered skeletal pairs cover it: a `twoBone` made to read
   `CHAIN_REACH` turns six bench and idle-stability tests red (measured 2026-09-22).
5. The existing pins must stay green untouched: the wrist cast masses in
   `tests/golem-bench.test.mjs`, the swing inertia equal to `STROKE_INERTIA.ref` in
   `tests/golem-arena.test.mjs`, and the two-fatal-parts and 5.4-weight test.

## Verification

```powershell
node tests/harness/body-fingerprint.mjs --out .review/fp-before.json   # before editing
npm test
npm run check
npm run build
node tests/harness/body-fingerprint.mjs --out .review/fp-after.json --against .review/fp-before.json
```

Every section must be `same`. If `bench:effector.wrist.*` moved, compare the diff for reordered
arithmetic before anything else. Commit.
