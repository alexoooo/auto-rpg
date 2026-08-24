# Session 05 -- two bare Duelists enter punching range

## Outcome

An unarmed Duelist closes through its sword-specific crowd threshold, completes real punch
cycles and leaves the non-punching fist on the incoming line. It still backs out of genuine
body-to-body crowding. Fist attacks and blocks are visible in the ordinary bout readout and
measurement corpus.

## Implement

1. At `src/policies.ts:732` and `:1440-1465`, remove the contradictory range ordering where
   bare hold/strike are 0.78/0.72 m but `DUELIST.crowd` retreats at 0.85 m. Derive a bare
   crowd threshold from surface measure and the actual fist/arm reach, or introduce one
   measured bare constant beside `FIST_RANGE`; do not change sword crowding.
2. Keep `attackHand()` at `src/policies.ts:120-170` choosing the farther fist to punch so the
   nearer hand can cover. Keep `planOffHand()` at `:522` on the real incoming line.
3. Make punch phase legibility explicit through existing combat/action diagnostics: attack
   attempts on option entry, damaging fist contacts, and fist blocks. Do not add a gameplay
   block state; hand/forearm collision is the defence.
4. Extend `scripts/measure.mjs` with Duelist-vs-Duelist and Duelist-vs-sword bare cells at
   three predeclared seeds. Record approach, time inside punch range, punch attempts, landed
   damage, blocks, retreat occupancy, result and duration.

## Tests first

In `tests/minds.test.mjs` and `tests/integration.test.mjs` add:

- `an_unarmed_duelist_closes_through_its_sword_crowding_threshold`
- `an_unarmed_duelist_completes_a_punch_cycle_in_a_real_bout`
- `the_non_punching_fist_stays_on_the_incoming_weapon_line_and_records_blocks`
- `a_bare_duelist_still_disengages_when_body_to_body_crowded`
- `fist_attack_and_block_events_name_the_exact_hand`

Restore the shared sword crowding threshold and park the cover hand at rest; the approach and
cover tests must fail independently. The full-bout test must observe a completed attack and a
real contact, not only an intent field changing.

## Acceptance

Two bare Duelists must enter multiple exchanges rather than orbit to the cap. Preserve the
current rule that fists do less damage than steel and never sever. Record at least one visible
punch and one visible physical cover from each hand across mirrored bouts.

```powershell
npm test
npm run check
npm run build
npm run measure -- --only fists --bouts 40 --seed 20260824
```
