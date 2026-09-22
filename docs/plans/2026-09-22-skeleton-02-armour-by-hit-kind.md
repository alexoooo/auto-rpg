# Skeleton 02 -- armour that depends on the kind of blow

**Depends on:** 01. **Moves:** no stone or human body (fingerprint must read all `same`).
**Lands:** a type widening in `src/scoring.ts`, one extra argument through the damage seam.

## The problem

`GolemPart.armour` is one number, and `armouredDamage(raw, armour)` in `src/scoring.ts` takes the
same fraction off a cut, a thrust and a crush. The overview's table shows why that cannot make
blunt weapons relatively better against bone: a flat fraction scales the blade and the mace alike,
and the reduced-mass arithmetic already favours the blade on a light part. The skeleton needs
`cut 0.5, crush 0`, which one number cannot say.

## The change, in full

### `src/scoring.ts`

Beside `armouredDamage`, add:

```ts
/**
 * The kinds of blow a piece can be armoured against differently.
 *
 * Every `HitKind` but `weak`, derived rather than listed, so a new kind of blow is a compile error
 * in every armour table until somebody says what bone and plate do about it. `weak` is left out
 * because it never carries damage: every path that returns it returns `damage: 0` (`scoreHit`'s
 * floors and the projectile model's `damage > 0 ? "thrust" : "weak"`), so a fraction of it
 * would be a number with no reader.
 */
export type ArmouredHit = Exclude<HitKind, "weak">;

/** A fraction absorbed for each kind of blow. */
export type ArmourByHit = Readonly<Record<ArmouredHit, number>>;

/**
 * A piece's armour: one fraction for every blow, or a fraction per kind.
 *
 * The plain number is what every stone and human part carries and it means what it always has.
 * The table is for a material that answers different blows differently -- bone turns an edge and
 * shatters under a club.
 */
export type Armour = number | ArmourByHit;

/** The fraction `armour` absorbs from a blow of `kind`. */
export function armourAgainst(armour: Armour, kind: HitKind): number {
  if (typeof armour === "number") return armour;
  if (kind === "weak") return 0;
  const fraction = armour[kind];
  if (fraction === undefined) throw new Error(`armour table has no entry for a ${kind} blow`);
  return fraction;
}
```

`armouredDamage(raw, armour: number)` is unchanged, and it still validates the fraction on every
blow, so a bad table entry throws with its value in the message the first time it is used.

`armourAgainst` does not validate. The fraction goes straight into `armouredDamage`, and the rule
lives in one place.

### `src/golem/module.ts`

- `import type { Armour, HitKind } from "../scoring.ts";`
- `GolemPart.armour?: Armour`. Extend its doc comment by one paragraph: a table is answered per
  kind by `armourAgainst`, and a number means the same fraction against everything, which is every
  part built before the skeleton.
- Replace `partArmour`:

  ```ts
  /** How much of a blow of this kind this piece takes off, with the absent case answered once. */
  export const partArmour = (part: GolemPart, kind: HitKind): number =>
    armourAgainst(part.armour ?? 0, kind);
  ```

  `armourAgainst` is a value import:
  `import { armourAgainst, type Armour, type HitKind } from "../scoring.ts";`. `module.ts` is
  loaded by Node in the test run, so keep the `.ts` extension. Check that `scoring.ts` does not
  import anything from `src/golem/`, which would create a cycle. Today it imports only `config.ts`
  and `hands.ts`.

### `src/units.ts`

```ts
/** Body-owned armour may transform raw scoring damage into authoritative applied damage. */
applyDamage?(target: Limb, rawDamage: number, kind: HitKind): number;
```

with `import type { HitKind } from "./scoring.ts";`.

### `src/combat.ts`

One argument, in the block after `scoreHit`:

```ts
const damage = this.target?.applyDamage?.(limb, rawDamage, kind) ?? rawDamage;
```

`kind` is already destructured from `score` on the line above. The projectile path passes its own
score's kind (`thrust` or `weak`) the same way. Nothing else in `Combat` changes. `severs` still
reads the armoured `damage` and the unarmoured `quality`, which is the order the docstring on
`armouredDamage` argues for.

### `src/golem/golem.ts`

```ts
applyDamage(target: Limb, rawDamage: number, kind: HitKind): number {
  const armour = this.armourOf(target, kind);
  const applied = armouredDamage(rawDamage, armour);
  target.health -= applied;
  return applied;
}

private armourOf(limb: Limb, kind: HitKind): number {
  for (const module of this.modules) {
    for (const part of module.built.parts) {
      if (part.id === limb.key) return partArmour(part, kind);
    }
  }
  return 0;
}
```

`kind` is required, not optional. A caller that forgets it is a compile error in TypeScript. In
the plain-JS tests it arrives as `undefined`, and that is harmless for a numeric armour, so fix
each JS caller by hand (below) rather than relying on it.

### `src/golem/humanoid/body.ts`

`armour: part.armour ?? 0.35` already type-checks against `Armour`. No change.

## Why stone and human cannot move

Every part that exists today has `armour` absent or a number. `armourAgainst(number, kind)`
returns the number without reading `kind`. So `partArmour(part, kind)` returns exactly the old
`part.armour ?? 0`, and `armouredDamage` receives bit-identical input. The fingerprint confirms
this.

## Tests

In `tests/golem-torso-head.test.mjs`:

- The `partArmour` test (it asserts `partArmour({ armour: 0.4 }) === 0.4` and
  `partArmour({}) === 0`) becomes a loop over `["cut", "thrust", "slap", "crush", "weak"]`,
  asserting both for each kind.
- The stub `applyDamage: (hit, rawDamage) => ...` takes `(hit, rawDamage, kind)` and passes
  `kind` to `partArmour`.

New tests, in the same file beside the `armouredDamage` test:

1. `armour_against_a_number_is_the_number_for_every_kind`.
2. `armour_by_hit_answers_each_kind_from_its_own_row` -- use a table whose four entries are all
   different (`{ cut: 0.1, thrust: 0.2, slap: 0.3, crush: 0.4 }`) and assert each one. With equal
   entries, a lookup that returned the wrong row would still pass. Also assert that `weak` gives 0.
3. `a_table_missing_a_row_throws_by_name` -- cast a three-row table through `as`, and assert that
   the fourth kind throws `/no entry for a crush blow/`.
4. `a_bad_fraction_in_a_table_is_refused_when_it_is_spent` --
   `armouredDamage(10, armourAgainst({ ...table, cut: 1 }, "cut"))` throws `/fraction absorbed/`.
5. `every_registered_part_answers_every_kind` -- build every `GOLEM_MODULES` entry (reuse the
   build-and-dispose loop in `tests/golem-bench.test.mjs`, or the torso bench's arena). Call
   `partArmour(part, kind)` for every part and kind, and assert the value is finite and in
   `[0, 1)`. This catches a bad skeleton table at test time rather than in a fight.
6. `combat_passes_the_kind_to_the_body` -- through `hammerBlow` in the same file, run twice.
   `hammerBlow` builds a fresh arena and `Combat` per call, so the second blow cannot be eaten by
   the first one's `hitCooldown` on the same limb.
   - Give `hammerBlow` a second argument, `aim = "edge"`. `"edge"` keeps today's rotation, which
     turns the hammer's +X edge along the travel and scores a quality-1 cut. `"point"` uses
     `Quaternion.RotationAxis(new Vector3(1, 0, 0), -Math.PI / 2)` instead. That points the local
     +Y along `travel`; +Y is the axis `RigidStrike.bladeDirection` reads, and `tipPosition`
     extends it by `tipAlong` (0.25) to the leading end of the 0.50 m box. The contact is then
     within `thrustTipZone` (0.30) of the tip, with `bladeAlignment` 1 and edge alignment 0, so
     `scoreHit` takes the thrust branch.
   - The stub's `applyDamage` becomes `(hit, rawDamage, kind)` and pushes `kind` into each
     `applied` entry.
   - Assert first that `reports[0].kind` is `"cut"` for the edge run and `"thrust"` for the point
     run. A fixture that silently scores `"slap"` then fails on its own line rather than looking
     like a seam bug. Then assert that `applied.map((a) => a.kind)` deep-equals
     `reports.map((r) => r.kind)` in each run.
   - The existing plated-armour test calls `hammerBlow(torsoId)` and gets the default `"edge"`, so
     it is unchanged.

Mutations to watch go red before trusting the new tests:

- `armourAgainst` returning `armour.cut` for every kind turns test 2 red.
- `combat.ts` dropping the `kind` argument turns test 6 red.
- `Golem.applyDamage` passing a constant `"cut"` should turn something red. Today nothing would,
  because no registered part has a table. So test 6 is the one this mutation needs, and the
  skeleton's own test in session 06 is the first to catch it at the body level. Write that down
  in the session 06 test's comment.

The JS callers, updated to pass a kind explicitly:

- `tests/golem-loot.test.mjs`: `golem.applyDamage(limb, limb.maxHealth * 0.25, "cut")`.
- `tests/humanoid.test.mjs`: `body.applyDamage(arm, 10, "cut")`.
- `tests/golem-torso-head.test.mjs`, in `hammerBlow`: the returned `armour: partArmour(core)`
  becomes `partArmour(core, "cut")`. It only reports the fraction and is harmless either way.
  Pass the kind anyway, so that no call is left without one.

Before calling the list complete, grep `applyDamage(` and `partArmour(` across `tests/` and
`src/`.

## Verification

```powershell
node tests/harness/body-fingerprint.mjs --out .review/fp-before.json   # before editing
npm test
npm run check
npm run build
node tests/harness/body-fingerprint.mjs --out .review/fp-after.json --against .review/fp-before.json
```

Every section must be `same`. Commit.
