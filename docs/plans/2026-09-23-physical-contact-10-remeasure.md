# Physical contact 10: re-measure, write up, and the owner's eye list

## Re-measure

1. **Rerun all nine stat sweeps** on stone with the four probe minds and on the skeleton duelist
   mirror, at 192 blocks and at their current row levels. Every earlier table was measured against
   the old contact model and is void.
2. **Rerun the three giant presets** against x1.
3. **Re-derive each attribute row's `min` and `max`** from the new benches where a bench set them.
   Record any row whose range moves.
4. **x1 balance against session 01:**
   - stone, skeleton and human mirrors;
   - knockdowns, damage, bout length, and time spent down;
   - the stuck-down and downed-target censuses;
   - the stun-lock figures, for the owner's call;
   - the idle-dummy matrix, which must have no cell at zero wins.

## Write-up

- **`docs/analysis/2026-09-23-attribute-measurements.md`** gets a new "Physical contact" part:
  - the baseline;
  - what each session moved;
  - the new sweep tables.

  Each old stat section gets one line saying it was measured against the old contact model, with the
  new table beside it.
- **Row comments** in `src/golem/attributes.ts` take the new figures.
- **`AGENTS.md`** gets a trap or a rule for anything this set paid for.

## Final report

For the owner, in this order:

1. **The headline numbers:**
   - giant against x1;
   - x1 balance;
   - the censuses;
   - the lift and push counts.
2. **Chosen on the owner's behalf.** Every owner-level choice a session made with the recommended
   default, each with where it lives and how to reverse it.
3. **Anything a session stopped on** or left open.
4. **The owner's eye list** below.

## The owner's eye list

Collected from every session. Look at each on the dev server after the set is done. Each item names
the build and what to look for.

- **02:**
  - a body rising beside an opponent standing over it;
  - a body rising off a wall;
  - a skeleton knocked down mid-rise;
  - a grounded body swinging, worse than standing but not limp;
  - the worst stun-lock chain found, by build and seed. The owner decides whether physics alone is
    acceptable here;
  - stone, the wheel and the multileg lifted by the rise at the end of the 0.35 s dwell, before
    their fall has finished. Only the skeleton's table waits for rest; a general settle rule would
    be the follow-up if it reads as a puppet being picked up;
  - a maul from the floor: at `GROUNDED_TONE` it barely swings (3.8 m/s at the mark against 12.1
    standing, Node golem bench). Weak is the brief; check that it reads as weak and not as broken.
- **03:**
  - a standing golem finishing a fallen one with a blade, a mace and a fist;
  - the fallen one swinging and guarding back from the ground, weakly;
  - a skeleton finishing a skeleton: it touches the downed body in 87 % of the windows in reach and
    scores in a third of them, because its blows land under the energy floor.
- **04:**
  - the stone body walking, turning and falling at 247 kg, which is 2.7 times what it was. Its leg,
    waist, neck and wheel torques went up by the same factor, and the Node locomotion bench reads the
    walk as before; the owner has not seen it;
  - stone fights are shorter: a median x1 mirror ends in 13.4 s against 28.8 (mean 17.7 against
    32.9). A heavier trunk recoils less, so more blows land and each lands harder. Check that it reads
    as heavier bodies and not as a harder game.
- **07:**
  - the all-max giant lifting and launching a x1 from below;
  - pushing one back;
  - two x1 bodies pressing together with neither lifting.
- **10:** the all-max giant against a x1, which should look and win like a giant.
- **Carried from the attributes set**, still unchecked:
  - the attribute sliders in the arena setup corners and the dungeon hero dialog, with Reset and a
    URL round trip through a navigation;
  - the read-only line in the HUD diagnostics;
  - foot slip at movement x1.5 and turning x1.5;
  - the whole body at size x0.8 and x1.25.

## Chosen on the owner's behalf

Each entry names the session, the choice, where it lives and how to reverse it.

- **01, "within band".** An x1 control is within session 01's band when its 95 % bootstrap interval
  over blocks overlaps 01's, for per-body damage and knockdowns a bout. `research/control-band.mjs`
  reads both. To reverse it, name a different criterion in the overview's gate list.
- **01, the idle floor is an outright win.** A win through the 60 s overtime drain is shown beside
  it and does not count. `summarizeIdle` in `research/idle-dummy.mjs`.
- **01, the idle matrix runs 12 side-swap blocks a cell** (24 bouts, `--blocks 12`), not 24 blocks.
- **02, rising belongs to the body.** `recover` left the command: once the fall has settled and the
  dwell has run, a body rises whatever its mind asks. `risingEligibility` in
  `src/supported-locomotion-state.ts`. Reversing it would put the house rule "recovery cannot
  require the support state it exists to restore" back at the mercy of a mind that holds still.
- **02, `RISE_POSTURE_DEADLINE` = 2.** A rise that has not reached posture by twice
  `RISING_DURATION_S` goes back to `fallen` and retries. `src/supported-locomotion-state.ts`;
  `Infinity` restores the old wait-for-ever.
- **02, the relocation ring.** A refused recovery searches rings `RECOVERY_RING_STEP_M` (0.1 m) apart
  with `RECOVERY_RING_ANGLES` (16) candidates each, out to the reach the rise's acceleration bound
  allows in its floor duration (48 m/s² x T² / 6), trying angles away from the nearest occupant
  first. `findRecoveryTarget` in `src/supported-locomotion-production.ts`.
- **02, a wall may be left.** A sweep that starts inside a wall's band may leave it inward and is
  refused only if it ends in the band or never clears it: the flat arena's wall in
  `flatSupportedWorldRegistry` and the dungeon's solid in `buildDungeonWorld`. Without it a body
  that fell against a wall could not rise.
- **02, the fall ledger is zeroed as the rise begins.** A rise is then felled by a fresh fall-level
  blow and not by the ledger of the fall it is rising from. The fallen-to-rising edge in
  `src/supported-locomotion-state.ts`. Carrying it would make every rise fall at the first touch.
- **02, `GROUNDED_TONE` = 0.55, and a grounded body keeps its whole command.** The lowest tone at
  which every arm's stroke stray stays within twice its standing figure; the table is on the
  constant in `src/golem/golem.ts`, from `research/grounded-tone.mjs`. It replaced the skeleton's
  limp 0.08 with a neutral command, and full strength on every other body. A different value is one
  number; going back to limp means re-adding a per-body tone and the `NEUTRAL` override in
  `Golem.applyIntent`.
- **02, a rising carrier stands still.** While a body rises, its carrier ignores the mind's walk
  request, as a fallen one does. The rise owns the root, and a carrier walked off the rise target
  led the other body into it and had the rise refused. `PhysicalSupportedLocomotionPort.proposal`
  in `src/supported-locomotion-production.ts`. Reversing it would need the rise target to move
  with the carrier instead.
- **03, "in reach" for the finishing target.** A one-second window counts toward the target if, at
  any frame of it, the standing side's socket came within its own published `reach` of the downed
  body's core. `inReach` in `research/census-worker.mjs`. A stricter reading (the whole window in
  reach) would shrink the denominator and raise every share.
- **03, a downed body publishes no reach to stand off from.** While the other body is `fallen` or
  `rising`, the stand-off floor that its reach sets is zero, so each mind holds at its own strike
  range, and every stroke aims at the live core. `standOffReach` and `finishPoint` in
  `src/downed.ts`, called by every golem executor. Reversing it is one line in each helper.
- **03, `CHAIN_REACH.liftMin` stays at -0.95.** Strokes already touched a downed body in 87 to 99 %
  of the in-reach windows, so lowering the envelope would buy contact that already happens.
  `src/golem/config.ts`.
- **04, stone's body density is 1300 kg/m3, and "an arm cannot lift a body" is read per arm.** Half
  of solid stone, the lightest round density at which the strongest x1 stone arm falls short of an
  x1 stone body's weight by 1.25. Two x1 arms together still lift an x1 body (3876 N against
  2425 N); holding that as well needs about 5.5 times the shipped body, which is past solid stone.
  `STONE_BODY_DENSITY` in `src/golem/config.ts`, with the table. A different density is one number;
  every body torque follows it through `onBody`.
- **04, the ram's plate is at the body's density.** `HEAD_RAM.plateMass` is `bodyKg` rather than
  `kg()`, and `impactMassKg` follows it, because under `kg()` no torque factor restored the lunge:
  the hinge's inertia grew by less than its torques. It is still an item to the weight and size stats
  (`RAM_SIZE` in `src/golem/head/head.ts`), which is a separate rule. `src/golem/config.ts`.
- **04, the holding repair is a per-family ratio, not a global rescale.** The plan said to rescale
  `STAGGER_SPECIFIC_IMPULSE_MPS` and `FALL_SPECIFIC_IMPULSE_MPS`. Those two literals are shared by
  every family, and the skeleton and the human did not get heavier, so a global rescale would have
  made them easier to fell. So each family names the factor its own supported mass grew by
  (`StabilityAuthority.stabilityMassRatio`, 2.727 for the stone biped, 2.809 for the wheel, 2.768
  for the multileg, and 1 pinned on the skeleton and the human). A shove is read against
  `supportedMassKg / stabilityMassRatio`, so every family falls at the newton-seconds it fell at
  before; the decay stays put, since it is in the same units as the ledger. Sessions 06 and 08
  replace the ledger, and the ratio goes with it. `stabilityMassKg` in
  `src/supported-locomotion-state.ts`.
- **04, the human and the skeleton pin what they inherited from stone.** Leg, waist and neck torques,
  the bench shove and a ratio of 1, at the shipped values, because their masses did not move.
  `HUMAN_BIPED`, `HUMAN_WAIST` and `HUMAN_HEAD` in `src/golem/humanoid/body.ts`, `SKELETON_BIPED` in
  `src/golem/skeleton/body.ts`. The human's anthropometry check found nothing to correct; the
  skeleton was not re-tuned (see session 04's "What landed").
- **04, the skeleton keeps its mass, 25 % of the human's without items.** A reference man's skeleton
  is about a seventh of his body (ICRP 89), which would make it about 15 kg against 26.78. Lightening
  it would double the lift ratio session 04 was told to report rather than fix, and would move every
  skeleton baseline sessions 05 to 08 measure against. `SKELETON_*` masses in
  `src/golem/skeleton/body.ts`; to reverse, scale them by 0.56.
- **04, the knockdown gate is red and the set went on.** Stone's x1 knockdowns a bout fell out of
  session 01's band because stone bouts got shorter, not because a body got harder to fell: per
  second they rose. Restoring the count would need a per-second rate 60 % above session 01's, which
  is not a holding repair. The knockdown gate lapses at session 08, and session 05 recalibrates the
  energy a blow carries, so neither is served by moving a threshold here. To reverse it, rescale the
  ratios down by the bout length.
