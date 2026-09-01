# Session 26 — axial-energy arrows and bolts

## Outcome

Make projectile wounds answer the projectile that physically arrived. Mass, cached arrival speed,
signed point-first alignment and a real head-contact zone determine damage. Solver impulse remains
diagnostic; projectile configuration no longer multiplies a generic 55-point arrow score.

The maximum wound from any one arrow or bolt is 3 combat-value-v2 damage before armour. A clean
0.12 kg Construct bolt at 42 m/s reaches exactly 3. An ordinary 0.035 kg arrow at 48 m/s is about
1.153 and a short 22 m/s shot is about 0.216.

## Frozen law and public shape

Add a pure projectile scorer beside `scoreHit` in `src/scoring.ts#L284`:

```ts
export const PROJECTILE_PENETRATION_V1 = Object.freeze({
  axialSpeedFloorMps: 8,
  joulesPerDamage: 34,
  maximumDamage: 3,
});

export interface ProjectileImpact {
  readonly massKg: number;
  readonly speedMps: number;
  readonly signedShaftAlignment: number;
  readonly contactedHead: boolean;
  readonly penetrationEfficiency: number;
}

export function scoreProjectileImpact(impact: ProjectileImpact): Score {
  if (typeof impact.contactedHead !== "boolean"
      || ![impact.massKg, impact.speedMps, impact.signedShaftAlignment,
        impact.penetrationEfficiency].every(Number.isFinite))
    throw new Error("projectile impact contains a non-finite physical input");
  if (impact.massKg <= 0 || impact.speedMps < 0
      || impact.signedShaftAlignment < -1 || impact.signedShaftAlignment > 1
      || impact.penetrationEfficiency <= 0 || impact.penetrationEfficiency > 1)
    throw new Error("projectile impact is outside the physical scoring bounds");
  const alignment = clamp01(impact.signedShaftAlignment);
  if (!impact.contactedHead || alignment <= 0) return { kind: "slap", quality: 0, damage: 0 };
  const axialSpeed = impact.speedMps * alignment;
  const usableEnergyJ = 0.5 * impact.massKg * Math.max(0,
    axialSpeed * axialSpeed - PROJECTILE_PENETRATION_V1.axialSpeedFloorMps ** 2);
  const uncapped = usableEnergyJ / PROJECTILE_PENETRATION_V1.joulesPerDamage
    * impact.penetrationEfficiency;
  const damage = Math.min(PROJECTILE_PENETRATION_V1.maximumDamage, uncapped);
  return { kind: damage > 0 ? "thrust" : "weak", quality: alignment * alignment, damage };
}
```

The cap is applied after efficiency as defense in depth; an imported blueprint can never produce a
projectile wound above 3. `penetrationEfficiency` is finite and in `(0, 1]`.

Advance Blueprint, SavedConstruct and the library envelope to v3. Replace the migrated v2
`ProjectileSpec.damageScale` at `src/construct/blueprint.ts#L31` with:

```ts
readonly penetrationEfficiency: number;
```

Built-in and Forge projectiles use 1. V2 values below 1 migrate unchanged; values at or above 1
migrate to 1. V1 imports first pass through the verified v1 -> v2 migration. Write a v3 library
only after every v2 entry validates and migrates. This is a documented semantic migration, not a
renamed arbitrary damage multiplier.

## Implement

1. Add the pure energy scorer and remove the `arrow` row's dependence on `pierceScale` in
   `src/scoring.ts#L208`. Hand-held edge/mass/point attacks remain on `scoreHit`; Centipede bite is
   not a projectile and must not acquire projectile mass semantics.

2. Extend `Striking` at `src/combat.ts#L54` with an optional immutable projectile impact profile:

   ```ts
   readonly projectileImpact?: Readonly<{
     massKg: number;
     lengthM: number;
     radiusM: number;
     penetrationEfficiency: number;
   }>;
   ```

   `Arrow` at `src/arrow.ts#L92` owns this profile from the same physical values used by
   `PhysicsBody.setMassProperties`; no second mass constant is permitted.

3. In `Combat.resolve` at `src/combat.ts#L404`, continue using the Arrow's cached pre-contact
   arrival velocity. Compute the signed dot against nock-to-head direction, not `abs`. A projectile
   contact zone is classified once from nock, head and the reported world contact:

   ```ts
   const nockToHead = head.subtract(nock);
   const shaftLengthM = nockToHead.length();
   const axis = nockToHead.scale(1 / shaftLengthM);
   const fromNock = point.subtract(nock);
   const axialM = Vector3.Dot(fromNock, axis);
   const radialM = fromNock.subtract(axis.scale(axialM)).length();
   const endZoneM = Math.max(profile.radiusM * 3, shaftLengthM * 0.12);
   const outside = radialM > profile.radiusM * 3
     || axialM < -endZoneM || axialM > shaftLengthM + endZoneM;
   const zone = outside ? "other"
     : Math.abs(axialM - shaftLengthM) <= endZoneM ? "head"
     : Math.abs(axialM) <= endZoneM ? "tail"
     : "shaft";
   ```

   Pass `zone === "head"` to the scorer and record that same zone in evidence. Route only
   projectile strikes through `scoreProjectileImpact`. Do not apply generic
   `weapon.damageScale` again at `src/combat.ts#L457`. Apply ordinary target armour after the
   scorer. A shield interception remains a physical block and creates no wound.

4. Validate projectile bounds in `src/construct/blueprint.ts`. Muzzle kinetic energy
   `0.5 * massKg * muzzleSpeedMps ** 2` may not exceed its launcher's declared `energyPerShotJ`.
   Refuse the launcher and name both values. Do not derive penetration from visual material or
   radius-as-tip-area; neither is an authored combat material.

5. Keep wound energy and momentum separate. Do not combine joules, solver impulse and the existing
   authored stability shove into one score. This session does not retune knockdown. Add one
   immutable projectile record to `HitReport` in `src/combat.ts#L82`:

   ```ts
   interface ProjectileImpactEvidence {
     readonly identity: Readonly<{
       owner: Side; effectorId: string; poolIndex: number; shotSerial: number;
     }>;
     readonly massKg: number;
     readonly arrivalSpeedMps: number;
     readonly signedShaftAlignment: number;
     readonly contactedZone: "head" | "shaft" | "tail" | "other";
     readonly usableEnergyJ: number;
     readonly penetrationEfficiency: number;
     readonly uncappedDamage: number;
     readonly preArmourDamage: number;
     readonly postArmourDamage: number;
   }
   ```

   `shotSerial` increases on every pool launch and never resets when an Arrow is recycled. The
   Quiver owns it for ordinary human arrows; each Construct projectile pool owns the identical
   contract, so no live caller supplies `null`. That identity, rather than a recomputation, is
   shared by the HUD, cooldown and qualifier.

6. Correct per-limb cooldown ownership. A pooled projectile is already one-shot, so two distinct
   projectile serials contacting one limb in the same cooldown window must each be eligible to
   score once. Repeated callbacks from the same serial remain suppressed.

7. Advance every report/evidence version changed in Session 25 once more, and update the Arbalest
   qualifier validator and fixture so they require the v3 projectile record rather than
   `damageScale` or legacy 63-point contacts. Mark the old 8/8 qualifier stale until Session 30.

8. Update the arrow HUD to label axial kinetic evidence: mass, arrival speed, point-first
   alignment, usable joules, head contact, efficiency and final pre-/post-armour damage. Never ask
   the user to reconstruct the equation in a console.

## Tests watched failing

- `a_clean_42_mps_Construct_bolt_scores_exactly_three`
- `a_full_48_mps_ordinary_arrow_scores_the_axial_energy_value`
- `projectile_mass_changes_uncapped_damage_linearly`
- `usable_energy_obeys_the_frozen_floor_subtracted_squared_speed_ratio`
- `damage_is_zero_at_and_continuous_above_the_eight_mps_axial_floor`
- `tail_first_broadside_and_shaft_contacts_cannot_pierce`
- `no_projectile_can_exceed_three_damage`
- `a_launcher_cannot_claim_less_energy_than_its_projectile_muzzle_energy`
- `the_live_Havok_projectile_mass_is_the_mass_seen_by_the_scorer`
- `live_Havok_tail_shaft_and_head_contacts_are_classified_in_both_mirrors`
- `non_finite_projectile_inputs_are_refused_before_scoring`
- `two_distinct_projectiles_are_not_collapsed_by_one_limb_cooldown`
- `one_recycled_projectile_serial_scores_at_most_once`

Mutation proof: ignore mass; restore absolute alignment; force `contactedHead = true`; move the cap
before an unbounded multiplier; reuse the limb-only cooldown key. Each mutation must make its
corresponding test red.

## Digest and evidence prediction

- Every blueprint digest moves because the root grammar advances to v3; projectile-bearing payloads
  additionally change because ProjectileSpec changes.
- Control and program digests must not move.
- `BALANCE_CONFIG_DIGEST` moves when `pierceScale` is removed. Arrow/Arbalest and ordinary Archer
  corpora, qualification, combat reports, research fingerprints and every projectile damage total
  move. The old fatal-arrow qualifier remains historical evidence and is not re-recorded.
- Projectile paths, shot serials, collision times and ammunition cadence must remain unchanged.

## Verification

```powershell
node --test tests/scoring.test.mjs tests/arrow.test.mjs tests/construct-blueprint.test.mjs
node --test tests/construct-arbalest.test.mjs tests/construct-mounts.test.mjs tests/construct-damage.test.mjs
node --test tests/weapons.test.mjs tests/bout.test.mjs tests/policy-perception.test.mjs
node --test tests/construct-arbalest-qualifier.test.mjs
npm test
npm run check
npm run build
git diff --check -- .
```
