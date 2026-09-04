# Session 34 -- live Effigy dynamism parity and adversarial review

**Status (2026-09-03): accepted real-Havok receipt.** The physical corpus retains pose, carrier,
support, phase, admitted Action/controller, terminal and contact evidence, and its verifier refuses
forged summaries. All eight mirrored cells now exceed the Warrior movement floor, complete 13--21
attacks, change lane three or more times, retain support for the entire 30-second horizon, retain at
least 0.0503 m sword/core clearance, and have no unlabelled stationary damaging contact. Every cell
also contains a physically admitted gauntlet `drive` or `hold`; this prevents an idle guard pose
from counting as two-arm combat. The repair preserved the originally rejected rows as history and
did not relax durability, damage, health, armour or standing thresholds. The durable receipt is in
`docs/measurements.md`.

## Outcome

Turn the Session-31 reference from an expected-red baseline into an eight-cell green physical
record. The result is a combat-quality prerequisite for later balance work, not a replacement for
the still-red wider locomotion and competitive qualification gates.

## Implement and prove

1. Extend the planned `effigy-warrior-dynamism` script module in `scripts/` to retain declared tactical phase, source Action,
   carrier request/allowance, root/world travel and action-scoped sword/core clearance together in
   every sample. A phase label without its admitted public Action is invalid evidence.

2. Require every cell to meet Session 31’s lower-quartile Warrior movement envelope and all of:

   - three completed sweeps or explicitly completed counterattacks;
   - at least two completed orbit directions and one withdrawal after an attack;
   - a real turn-and-move interval of at least 0.25 s;
   - a real off-hand guard interval against a moving visible weapon when that opportunity occurs;
   - no unlabelled passive in-range interval above 0.75 s;
   - no damage while fallen, while a sword/core action margin is non-positive, or from an
     unlabelled stationary window.

   The harness records any exception, including a valid counter/held-ground one, rather than
   letting a boolean hide it.

3. Add adversarial fixtures to the `construct-effigy-dynamism` test module in `tests/`:
   `the_Swordbearer_orbits_turns_and_repositions_in_both_mirrors`,
   `the_Swordbearer_does_not_win_the_dynamism_gate_by_sweeping_from_a_planted_carrier`, and
   `a_destroyed_sword_or_left_arm_removes_only_its_dependent_tactical_behaviour`. The first test
   uses retained physical samples. The second forges travel, action and contact summaries
   independently; neither forged form may pass. The third runs real severance/fall events.

4. Run the currently red broader supported-locomotion boundaries before interpreting the result.
   If scaled recovery or held-weapon wall pressure is still red, record the dynamic corpus as
   mechanically green but competitively unqualified. Do not lower Effigy durability, lower Warrior
   durability, reduce sword damage, or alter hit attribution to force a pleasing outcome.

5. Only after the dynamism corpus is green, run the existing durability ladder as a diagnostic
   comparison. A balance change belongs back in the owning low-number/qualification session and
   must preserve the retained dynamic records; a static kill never supplies balance evidence.

6. For the permanent gauntlet extension, run `scripts/effigy-gauntlet-contact.mjs` beside the
   corpus. It must find one real Havok contact during an armed `gauntlet-strike` `drive` or `hold`,
   identify the exact named `effigy-gauntlet` leaf and ordinary weapon kind, and reject a chamber
   pose or an attribution that lacks the source module. A blocked physical contact may correctly
   deal zero damage; it is evidence of the manifold, not a special hit exception.

## Verification

```powershell
node --test tests/construct-swordbearer-duelist.test.mjs
node --test tests/supported-locomotion-physical.test.mjs tests/scaled-supported-locomotion.test.mjs
node scripts/effigy-warrior-dynamism.mjs
node scripts/effigy-gauntlet-contact.mjs
node scripts/construct-warrior-curriculum.mjs --durability-ladder
npm test
npm run check
npm run build
git diff --check -- .
```
