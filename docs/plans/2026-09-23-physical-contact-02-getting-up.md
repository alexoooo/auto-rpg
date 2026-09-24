# Physical contact 02: nobody stays down for ever

## Why

The owner sees a body go down and never get up. Exploration found four ways it happens. Session 01's
census says which of them occur in bouts and how often.

1. **No recover input.**
   - `locomotionCommand` in `src/golem/locomotion.ts` sets
     `recover: intent.forward !== 0 || intent.strafe !== 0 || intent.turn !== 0`.
   - No mind reads its own support state.
   - A mind that holds still never rises. A rise loses the flag at any boundary with no movement,
     and falls back with its dwell reset.
2. **Occupancy.**
   - `updatePairOccupancy` in `src/supported-locomotion-production.ts` refuses a rise while the other
     body stands over or beside it.
   - The separation it needs has to be under `MAX_RECOVERY_SEPARATION_M` (0.35 m).
3. **Walls.**
   - The recovery target is the root's own x/z.
   - A body lying within a footprint radius of a wall gets a sweep fraction of 0, and can never rise.
4. **Stuck mid-rise.**
   - After the rise duration, `rising` becomes `supported` only once `postureSupported` holds.
   - If posture never holds, the body stays in `rising` for ever.

The lying cap (`maxLyingSeconds`) bounds only `fallSettled`. It covers none of the four.

## Changes

1. **Rising belongs to the body, not the mind.**
   - `recover` is true once the fall has settled and the dwell has elapsed, whatever the intent.
   - The field goes from the command's derivation, and from any test that drives it.
   - This keeps the house rule "recovery cannot require the support state it exists to restore",
     now with the mind's input included.
2. **A rise relocates.**
   - When the root's own x/z is refused, the recovery target becomes the nearest point that is clear
     of walls and of the other footprint.
   - It is searched on a ring out to the rise's reach, which is derived from its peak speed and
     duration.
   - The actuator already drives toward `recoveryPairTarget`; that path generalises to this.
3. **A rise that does not reach posture retries.**
   - Posture must come within `RISING_DURATION_S` times a stated factor. Otherwise the state goes
     back to `fallen` with a short dwell, and the rise tries again.
   - Keep the lying cap. It is a house rule.
4. **No rise immunity.**
   - Delete `riseHoldsThroughHits` from the `Knockdown` interface, the skeleton's table and the
     production wiring.
   - A rising body falls on the same `fallAt` threshold a standing body does, from the same
     accumulator, instead of on the stagger-level `hitInterrupted`.
   - Add no authored immunity window and no authored escape in its place. The owner's rule is that
     stun-lock is left to physics: a rising body is exactly as hard to put down as its posture is.
     Until session 08 that is the standing threshold; from 08 it is the rising posture's own tipping
     capacity.
   - Rewrite `a_skeleton_struck_while_it_rises_gets_up_anyway` and its sibling in
     `tests/golem-knockdown.test.mjs` to pin the new rule. Pin both halves:
     - a fall-level hit during a rise puts the body down;
     - a stagger-level one does not.
5. **One grounded tone.**
   - Replace the per-body `fallenTone` (the skeleton's 0.08; null elsewhere) with one general
     `GROUNDED_TONE` in `src/golem/golem.ts` `motorTone`:
     - motors are at that share while fallen;
     - they ramp back to 1 across the rise.
   - The owner's rule: a body on the ground can still fight, but worse, and getting up costs
     fighting.
   - Choose the value on a bench:
     - a grounded arm's stroke stray and parry arrival at 0.25, 0.4 and 0.6;
     - take the lowest share at which a grounded arm still completes a stroke without its stray
       passing twice its standing figure.
   - Write the table into the constant's doc comment.
   - Record the choice under "Chosen on the owner's behalf".

## Measure

- **The census again**, against 01:
  - the count of episodes longer than 5 s by cause;
  - episode p50, p90 and max;
  - repeat knockdowns within 2 s of a rise, as a stun-lock check;
  - the share of bouts in which the first knockdown's victim loses, and the longest chain of
    knockdowns without the victim standing for 2 s.
- **Target:** no episode longer than 5 s unless the body is being struck through it.
- **The stun-lock figures are reported, not gated.** The owner makes that call at the end, from the
  figures and the eye list.
- **Before and after:** x1 against x1 either side (stone mirror and skeleton mirror, 384 bouts each)
  and the fingerprint diff.

## Owner's eye list (session 10)

- A body rising beside an opponent standing over it.
- A body rising off a wall.
- A skeleton knocked down mid-rise.
- A grounded body swinging.
- The worst stun-lock chain the census found, by build and seed: is it acceptable?

## What landed, 2026-09-23

Every figure is in `docs/analysis/2026-09-23-attribute-measurements.md` "Physical contact 02:
getting up", with its harness. What differs from the plan above:

- **A retried rise waits out a whole dwell again, not a short one.** Going back to `fallen` zeroes
  `fallenElapsedS`, so a rise put down by a blow, refused by the world, or past
  `RISE_POSTURE_DEADLINE` (2) goes through the same dwell and settle as the fall itself. A shorter
  retry dwell would be a second authored number for the same wait.
- **The fall ledger is zeroed as a rise begins.** Otherwise the fall a body is rising from is
  counted again, and a rise falls at the first touch.
- **`GROUNDED_TONE` is 0.55**, chosen from 0.25 to 0.60 on the Node golem bench. The table is on the
  constant. The skeletal mace sets it. The skeleton's neutral command while fallen went with its
  0.08: a grounded body keeps its whole command.
- **The target was missed: 347 skeleton episodes ran over 5 s, and 87 of them were not struck
  through.** The census learnt to name what put each rise back down (`RiseAbort` on the port's rise
  diagnostic). Most were refused because the other footprint sat just inside the rise's target.
  - **The first repair treated a symptom.** 7429947 read the overlap as rounding at the pair
    resolver's exact contact, and let a rise under way keep going until a footprint was 2 cm inside.
    The refusals came back at 2 to 5 cm once session 03's finishers stood closer.
  - **The cause was the rising body's own carrier.** The port gave a rising carrier the mind's walk
    request. Since this session, a grounded body keeps its whole command, so the carrier walked off
    the fixed rise target, and the other body followed it at exact contact into the spot the rise was
    bound for. A diagnostic build found the carrier off its target at nearly every refusal. The
    repair holds a rising carrier still, as a fallen one already was, and reverts the hysteresis
    (`a_rising_body_that_is_asked_to_walk_keeps_its_carrier_on_its_rise_and_gets_up`).
  - Both landed after session 03's view change, so their census is session 03's. After them, stone
    has one episode over 5 s and the giant group two, none struck through (no ground, and a wall).
    The skeleton has 363, of which 304 were struck through. The other 59 waited out the settle again
    after a *lying* skeleton's ragdoll moved into the rise target. That wait comes from the
    skeleton's `Knockdown` table, which session 08 re-derives.
- **The skeleton's knockdowns per bout rose past its band (4.85 to 5.36).** That is intended: a rise
  can now be put down. Damage and stone's band did not move.
