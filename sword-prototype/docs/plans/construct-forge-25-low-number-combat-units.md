# Session 25 — low-number combat units and saved-content migration

## Outcome

Move every authoritative wound, durability and armour value into combat-value ruleset v2. A
Warrior torso has 10 durability, a head or ordinary limb has 5, and ordinary attacks live between
roughly 0 and 3. This is a unit migration plus an explicit rebalance of built-in Construct cores;
it is not a display divisor and not a second health pool.

The scale words apply to durability: 6 is modest, 10 is good, 15 is a lot, and 100 is effectively
invincible in ordinary play. They are not per-hit damage labels.

Localized part health, Construct joint/module durability, vitality weights, severance, fatal parts
and flat armour remain authoritative. `vitality` remains the existing normalized 0..1 observation.
No mass, geometry, motor, impulse, gait or timing constant changes in this session.

## Frozen values

Add beside the combat table in `src/config.ts#L788`:

```ts
export const COMBAT_VALUE_UNIT_VERSION = 2 as const;

// Human-scale anchors. Multipliers such as torsoHealth and pelvisHealth stay dimensionless.
partHealth: 5,
torsoHealth: 2,   // 10 durability
pelvisHealth: 1.8, // 9 durability

damageScale: 2.3,
chopScale: 3.2,
crushScale: 1.7,
fistScale: 0.9,
biteScale: 1.2,
severMargin: 0.05,
```

`pierceScale` is removed in Session 26 rather than assigned another balance number. Until that
session lands, set it to `2.75`, the exact `/20` bridge, so Session 25 is green and melee migration
can be proved independently.

The built-in durability anchors are:

| body or hardware | health | armour |
| --- | ---: | ---: |
| Warrior ordinary part / head | 5 | unchanged (none) |
| Warrior torso | 10 | unchanged (none) |
| Warrior pelvis | 9 | unchanged (none) |
| humanoid Construct fatal torso | 10 | 1.9 |
| humanoid Construct ordinary stone part | 6 | 0.8 |
| humanoid Construct joint | 8 | 0.6 |
| ordinary humanoid Construct module | 4.5 | 0.6 |
| Warden fatal core | 15 | 2.1 |
| Warden ordinary part | 6 | 0.9 |
| Warden joint | 8 | 0.6 |
| ordinary Warden module | 4 | 0.5 |
| Forge stone shield | 13 | 1.5 |

Every other existing health, armour and absolute damage threshold is converted by `/20` unless a
built-in anchor is explicitly replaced by the table above. Dimensionless durability multipliers,
vitality weights and weapon multipliers do not move.

Freeze the secondary conversions rather than leaving them to an audit: learning `minimumDamage`
is `0.0005`, the supported-damage evidence floor is `0.00373945`, the learning fitness damage
denominator is `15`, blood spray thresholds are `0.075` and `1.1`, and `severMargin` is `0.05`.
Research rollout ranking converts v2 damage through the named legacy-reward helper below.

## Implement

1. In `src/config.ts#L788` and `src/config.ts#L1204`, introduce the ruleset constant and replace the
   six melee/body base values. Convert `blood.minSpray` and `blood.fullSpray` at
   `src/config.ts#L938` to `0.075` and `1.1`. Grep every old absolute number before editing; update
   damage gates and prose, but leave historical measurement tables intact and label their units.

2. Convert Fighter construction at `src/fighter.ts#L1136`, the Centipede profile at
   `src/bodies/centipede.ts`, and selectable profile wiring in `src/units.ts`. Broot's dimensionless
   1.30 health scale remains 1.30. Add a table-driven
   unit test that enumerates every selectable unit's fatal and ordinary health range; no current
   selectable non-boss part may exceed 15 after this session.

3. Re-author built-in Construct health and armour at `src/construct/humanoid.ts#L21`,
   `src/construct/warden.ts#L14`, `src/construct/arbalest.ts#L37` and
   `src/forge/catalog.ts#L201`. Do not install a conversion in
   `ConstructDamageState` (`src/construct/damage.ts#L11`): blueprint values are already v2 values
   by the time damage authority receives them.

4. Advance `ConstructBlueprint` and `SavedConstruct` from v1 to v2 at
   `src/construct/blueprint.ts#L1` and `src/construct/codec.ts#L9`. Keep a frozen v1 parser whose
   sole purpose is migration. It must:

   ```ts
   verifyV1Digests(source);
   const migrated = divideDurabilityAndArmourByTwenty(source);
   migrateDirectAbsoluteHealthComparisons(migrated.program);
   return validateAndDigestV2(migrated);
   ```

   Retain the v1 validator, canonicalizer and digest grammar, including the old projectile
   `damageScale`, so verification happens before any value changes. Classify sensors through
   explicit sensor metadata, never a string prefix. The current program surface has one absolute
   health channel: `module-max-health-*`; divide a directly compared constant by 20 regardless of
   operand order. `part-health-*`, `module-health-*`, joint integrity and the published BodyView
   health values are normalized fractions and do not move. Refuse nested arithmetic that mixes an
   absolute maximum-health sensor with other values using this
   exact shape:

   ```text
   saved construct v1 program rule "<rule>" cannot migrate absolute health expression "<sensor>"
   ```

5. Advance the library envelope and storage key at `src/forge/library.ts#L7`. Loading browser
   storage checks v2 first, then migrates the complete v1 library in memory. Write the v2 key only
   after every entry validates; retain the v1 key untouched as the recovery copy. Imported v1 JSON
   follows the same path. A request that cannot migrate is returned to the Forge as a named
   refusal, not logged and discarded.

6. Advance the exact persisted/reporting owners: `ENGAGEMENT_INSTRUMENT_VERSION` 1 -> 2 and
   `BodyNeutralControlEvent.version` 1 -> 2 in `src/recorder.ts#L13`; its Construct surface tag
   becomes `construct-v2` in `src/construct/control.ts#L21` and in the independently authored
   combat event at `src/recorder.ts#L80`; playtest `REPORT_VERSION` 3 -> 4 and
   its storage key move together in `src/playtest.ts#L12`; `CONSTRUCT_LAB_REPORT_VERSION` 1 -> 2 in
   both `CONSTRUCT_LAB_ROW_VERSION` and `CONSTRUCT_LAB_REPORT_VERSION` advance 1 -> 2 in
   `src/construct/lab-report.ts#L3`; and the Construct-Warrior bout, curriculum and qualification
   envelopes each advance once in their owning scripts. Normalized observations remain
   schema-compatible. Update the Arbalest's absolute
   `desperateLauncherHealth` from 9 to 0.45; that is a program change, not a display change.

7. Preserve learning selection pressure deliberately. Human-facing damage is v2. Reward code that
   intentionally weighs damage against fixed win bonuses converts through one named helper rather
   than scattering `* 20` literals:

   ```ts
   export const combatValueToLegacyRewardWeight = (damage: number): number => damage * 20;
   ```

   Apply it to Construct reward and research rollout ranking where v2 damage is compared with fixed
   legacy win bonuses. Do not apply it inside `fitnessComponents` at
   `src/learning/meta.ts#L627`; that function keeps `record.damage` in v2 units and replaces only its
   `300` damage denominator with `15`. Convert
   `minimumDamage` at `src/construct/learning/schedule.ts#L47` from `0.01` to `0.0005`, and mark the
   entry gate's old source/run pair stale until Session 30 requalifies it.

8. Update the Arena, Forge and report formatters to show at most two decimal places without
   rounding authoritative state. The Forge summary must distinguish part, joint and module
   durability rather than presenting summed part health as a body HP pool.

## Tests watched failing

- `Warrior_torso_and_head_use_ten_and_five_durability`
- `every_selectable_body_uses_the_v2_low_number_range`
- `the_low_number_migration_preserves_melee_health_fractions_and_death_decisions`
- `an_exact_divide_by_twenty_fixture_preserves_post_armour_Construct_damage`
- `a_v1_saved_Construct_is_digest_verified_before_values_are_migrated`
- `a_failed_library_entry_prevents_the_atomic_v2_storage_write`
- `complex_v1_absolute_health_arithmetic_is_refused_by_rule_and_sensor_name`
- `normalized_health_program_expressions_in_both_operand_orders_and_nested_forms_do_not_move`
- `Forge_reports_parts_joints_modules_and_armour_without_a_fake_total_HP_pool`
- `learning_reward_order_is_preserved_across_the_combat_unit_migration`

Mutation proof: make each migration run before v1 digest verification; leave one armour value in
legacy units; divide a normalized health sensor; partially write a mixed-validity library; remove
the reward conversion. Each mutation must make its named test red before restoration.

## Digest and evidence prediction

- Every built-in, Forge, saved and curriculum blueprint digest moves, including scaled-locomotion
  pins. Replace `ARBALEST_WARRIOR_CURRICULUM_ACCEPTANCE` with an explicitly stale/unqualified
  historical record; do not install a new blueprint digest beside its old 8/8 thresholds.
- Control digests must not move: `canonicalControlJson` contains the unchanged Action graph, not
  the body-neutral reporting surface tag. The Action vocabulary and controller parameters remain
  byte-equivalent.
- Arbalest's program digest moves because its one absolute maximum-module-health threshold moves. Other
  program digests move only where an absolute health constant is proved.
- Saved/library/report schema identities, `BALANCE_CONFIG_DIGEST`, playtest protocol digest,
  `CONSTRUCT_LEARNING_CORPUS_DIGEST`, `CONSTRUCT_LEARNING_SCHEDULE_DIGEST`, learning source
  fingerprints and qualification sources move.
- Warrior-versus-Warrior and exact-`/20` fixture contact times, action lifecycles, transforms and
  melee verdicts remain equivalent. Re-authored Construct cores intentionally change balance; run
  fresh Session-25 physical rows and mark the committed Arbalest 8/8 qualifier historical/stale
  rather than retaining its outcome under a new blueprint pin.
- Historical measurement tables remain byte-for-byte factual and gain a nearby note that their
  damage values are legacy combat units. Fresh v2 evidence is rerun, never calculated from prose.

## Verification

```powershell
node --test tests/scoring.test.mjs tests/bout.test.mjs tests/construct-damage.test.mjs
node --test tests/construct-blueprint.test.mjs tests/construct-library.test.mjs tests/forge-model.test.mjs
node --test tests/construct-learning.test.mjs tests/learning.test.mjs tests/ai-evaluation.test.mjs
npm run measure -- --only duelist-swinger --bouts 120 --seed 20260823
npm test
npm run check
npm run build
git diff --check -- .
```
