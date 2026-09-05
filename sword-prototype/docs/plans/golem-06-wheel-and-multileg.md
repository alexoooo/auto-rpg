# Session 06 -- wheel and multileg locomotion

**Status (2026-09-04): implemented, human gate not yet asked.** Both options land through the
Session 05 contract unchanged, with the two cross-module comparisons measured and mutation-proven:
the 10 N.s that leaves the biped standing puts the wheel down, and the 12 N.s that fells the biped
leaves the multileg standing.

- **Wheel** -- `locomotion.wheel`, 368.30 kg, socket 1.160 m, no height range, carrier 2.0 m/s and
  2.6 rad/s, footprint r = 0.42 m. It rolls: the contact patch's own material velocity is
  0.019 mm/s against a carrier at 2000, and a starved spin motor is the control at 780.6. It cannot
  strafe, and says so in its envelope. Declared fall threshold 7.11 N.s, bracketed 6 up / 8 down.
- **Multileg** -- `locomotion.multileg`, 275.40 kg, socket 0.640 m (380 mm under the biped's, and
  everything bolted above it moves with it), no crouch, carrier 0.8 m/s and 0.7 rad/s, footprint
  r = 0.50 m. An alternating tripod keeps three of six pads down at every substep. Declared fall
  threshold 23.02 N.s, bracketed 20 up / 24 down.
- **Neither needed a change to `src/supported-locomotion*.ts`.** What did change: the bench stand
  takes the module's own socket height instead of the fixture's frozen 1.02.

Every threshold above is provisional and none of them is a verdict.

## Outcome

Two more locomotion options through the Session 05 contract, accepted on the bench: a wheel
(faster, cannot crouch, tips more easily, taller) and a multileg (slow, low, wide, hard to knock
over). They exist to prove the contract carries a real difference in feel, not to fill a shelf.

## Frozen choices

- **Wheel.** One rolling body under a fork under the torso. The carrier moves the golem; the
  wheel's spin is derived from carrier speed and the wheel is a real contact with the world, so it
  rolls rather than slides. No height range. Higher maximum speed and acceleration, a higher
  yaw rate, and a lower fall threshold through `gaitStabilityScale`. Support proof is wheel
  contact plus upright. A knocked-down wheel golem lies on its side and the rise is the actuator
  standing it back on the wheel.
- **Multileg.** A low, wide base with six short legs in a tripod gait that is visual and
  support-proving, as the biped's gait is. Footprint wide, so `braceCapacityMultiplier` is high
  and the fall threshold is hard to reach. Slow yaw. No crouch, because it is already low. The
  torso socket sits lower, so effector reach and head height change with it, which is the
  trade.
- Both use the carrier and state machine unchanged. If either needs a change to
  `src/supported-locomotion*.ts`, that change is made with a test and named in the record; the
  contract is allowed to grow, the files are not allowed to fork.

## Implement

1. `src/golem/locomotion/wheel.ts` and `src/golem/locomotion/multileg.ts`, each with its table
   in `src/golem/config.ts` and its shell.
2. Register both; extend the bench's locomotion mode to pick among the three.
3. Headless sequences and assertions for both in `tests/golem-locomotion.test.mjs`, including
   the wheel's lower fall threshold (the same shove that the biped survives knocks the wheel
   down) and the multileg's higher one (a shove that fells the biped does not fell the
   multileg). Those two comparisons are the contract doing work and they are the assertions
   that matter.

## Human gate

The owner drives all three back to back. The questions: do they feel different in the hands
(speed, turning, height); does the wheel roll; do the six legs read as legs. Verdicts per option
go into this file's status line.

**Not answered, and no number below answers it.** One thing worth the owner's eye before driving:
on the page bench the multileg reads as a low table with six stubby legs under a block rather than
as anything insect-like, because the legs are built vertical with no splay. That is a description
of what is on the screen, not a verdict on it.

## Verification

```powershell
npm run check
node --test tests/golem-locomotion.test.mjs
node scripts/golem-bench.mjs --locomotion wheel
node scripts/golem-bench.mjs --locomotion multileg
npm test
npm run build
git diff --check -- .
```
