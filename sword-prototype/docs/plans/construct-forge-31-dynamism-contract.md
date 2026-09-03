# Session 31 -- Swordbearer dynamism contract

**Status (2026-09-02): implemented; physical acceptance remains red.**
`scripts/effigy-warrior-dynamism.mjs` now retains the frozen four-seed/two-side 30-second real-
Havok corpus alongside matched Warrior rows and reconstructs all anti-turret metrics from its raw
samples. `tests/construct-effigy-dynamism.test.mjs` proves that erasing travel, heading, a terminal
or an unlabelled interval rejects the record. The current live corpus is evidence, not a receipt:
`4140987459/right` still fails supported-standing and `4124209840/left` plus
`4174542697/right` still fail the three-terminal attack floor, so Sessions 33--34 remain open
rather than accepting a lively-looking subset.

## Outcome

Create one retained, real-Havok reference that answers the player-visible question precisely:
does an active Swordbearer pursue, turn, orbit, defend, attack, recover and reposition at least as
dynamically as the Warrior Duelist, rather than damaging a Warrior from a near-stationary sweep
turret?

The fixture uses the four existing Construct qualification seeds, both Construct arena sides, a
30-second fixed 240 Hz horizon and the ordinary Warrior `duelist` sword-and-buckler loadout. Its
matching Warrior reference uses the same seed/side matrix and ordinary Warrior Duelist policy on
both bodies. It is a comparison of observable physical behaviour, not a win-rate or health test.

## Implement

1. Add an `effigy-warrior-dynamism` script module in `scripts/`. It must build through the ordinary Setup/runtime
   path used by `scripts/construct-warrior-bout.mjs#L1`, step real NullEngine/Havok at 240 Hz, and
   retain immutable per-step samples rather than a UI diagnostic. Export:

   ```ts
   export const EFFIGY_DYNAMISM_V1 = Object.freeze({
     seconds: 30, physicsHz: 240, constructSides: ["left", "right"],
     warriorSeeds: [/* the frozen Session-30 four-seed order */],
     maximumPassiveCombatS: 0.75, minimumCompletedAttacks: 3,
   });
   export function runEffigyWarriorDynamismCorpus(): Promise<EffigyWarriorDynamismCorpus>;
   export function assertEffigyWarriorDynamismCorpus(
     report: EffigyWarriorDynamismCorpus,
   ): EffigyWarriorDynamismCorpus;
   ```

2. Sample root position and heading, carrier request/allowance, support state, selected decision,
   active Action/controller phase, range, combat contact, and all action terminals. Reconstruct
   these metrics from samples, never trust a precomputed summary:

   ```ts
   interface DynamismMetrics {
     readonly groundPathM: number;
     readonly lateralExcursionM: number;
     readonly accumulatedHeadingRad: number;
     readonly orbitDirectionSwitches: number;
     readonly maximumPassiveCombatS: number;
     readonly completedAttacks: number;
     readonly damagingStationaryContacts: number;
   }
   ```

   `lateralExcursionM` is signed displacement orthogonal to the opponent line accumulated over
   contiguous motion, not net end position. Heading accumulation unwraps yaw. A stationary contact
   is one whose preceding one-second tactical window has under 0.20 m ground travel and under
   0.35 rad heading travel; only an explicitly labelled `counter` or `hold-ground` phase may
   exempt it.

3. Derive the Warrior reference from the matched Warrior-versus-Warrior rows. For path length,
   lateral excursion and accumulated heading, the Swordbearer must meet or exceed the lower
   quartile of the corresponding Warrior distribution. Every active Swordbearer cell must complete
   at least three attacks, change orbit direction twice, contain no unlabelled in-range passive
   interval longer than 0.75 s, and retain supported/recovery/self-clearance requirements from the
   current combat harness. This is the accepted meaning of “at least as dynamic as the Warrior”;
   it is not replaced by a kill, a high action count, or an attractive screenshot.

4. Add a `construct-effigy-dynamism` test module in `tests/` with
   `the_Swordbearer_dynamism_corpus_reconstructs_every_metric_from_physical_samples` and
   `a_stationary_sweep_turret_cannot_pass_the_Swordbearer_dynamism_gate`. Mutate retained samples
   to remove lateral travel, heading, an attack terminal, and one raw interval in turn; each must
   fail with the clause it invalidates.

5. Add the measurement protocol and its initial, expected-red current-body result to
   `docs/measurements.md`; link the definition from `docs/design.md#the-fixed-humanoid-construct`.
   The result is a negative control, not a qualification receipt. Do not change health, armour,
   sword mass, sword damage, locomotion controller, chassis geometry or Mind in this session.

## Verification

```powershell
npm test
npm run check
npm run build
git diff --check -- .
```

The expected initial corpus result is rejection. A green result before Session 33 is evidence that
the measurement is too weak and must be fixed, not permission to skip the tactical work.
