# Session 06 -- wheel and multileg locomotion

**Status (2026-09-04): planned.** Depends on 05. Optional before 08. Human gate: not yet asked.

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
