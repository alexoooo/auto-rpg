# Session 08 -- curriculum: where they start, and who they meet

**Status (2026-09-10): landed.** All six steps implemented and the four arms run in full --
60 iterations each, exit 0, zero restarts, 160 minutes. **No arm cleared the bar.** Against
`golem-driver` no arm reaches +0.1593 on either pool at any iteration, and at iteration 60 the
best arm leads the control by d +0.114 on random viable pairs against a bar of 0.2. Arm c, the
opponent schedule, is the only arm above the control and is also a quarter cheaper an iteration.
`docs/measurements.md` carries the table, the two deviations, and the finding that the target
figure this plan quotes is the record's `uniform` column rather than its `golem-driver` one.

## Outcome

Three schedules the trainer can follow across iterations -- the start separation, the opponent,
and the weapon class -- and four arms from scratch that say whether any of them reaches the
shipped league's rating in fewer iterations than the league did. The owner asked for a specific
start distance and specific opponent types; both are here, and the class schedule is the third
because the record already found the maul is where the signal is.

## Frozen choices

- **A schedule is a string, parsed once, printed in the header.** `value:from` pairs, the value
  in force from that iteration on; a schedule with one entry is a constant, so `--separation 1.2`
  and `--separation-schedule 1.2:0` are the same run and the old flags stay.
- **From scratch, because the question is speed of learning.** Every arm starts from the
  unfitted head, same seed, 60 iterations; a curriculum that only helps a warm start is a
  different claim and is not made here.
- **The start separation is the bout runner's.** `runBout` places the right corner at
  `CONFIG.fighter.separation`; the flag reaches it through the job and the config does not move,
  so the arena and every other harness start where they start today.
- **Opponents are the ones that exist.** `idle`, `uniform`, `golem-driver`, `golem-fencer` and
  the league's own pool; no new bot. The rollout pairs are `rolloutPairs(name, opponent)` as
  today, both corners, so an asymmetric stage is still paired.
- **Rated as Session 06 rates**: random viable pairs against `golem-driver` and `golem-fencer`,
  paired, mirrored beside it, from the same snapshots on the same pool.

## Implement

1. `../../scripts/train-ppo.mjs`: `parseSchedule(text)` -> `[{from, value}]`, `scheduled(schedule,
   iteration)`; flags `--separation`, `--separation-schedule`, `--opponent-schedule`,
   `--terminals-schedule`, each printed in the header and the value in force in every iteration
   row. `--opponent-schedule` takes the names above plus `self` and `league`, and `league` hands
   the iteration to the pool machinery of `../../scripts/league.mjs` when the run is a league;
   `--terminals-schedule` takes class lists joined with `+` and the word `viable`.
2. The separation: `scheduleJobs` in `../../scripts/tournament.mjs` and the job row carry
   `separation`; `../../scripts/tournament-worker.mjs` passes it; `runBout` in
   `../../scripts/bout-runner.mjs` takes `separation` in its options with the config's value as
   the default, and places the right corner at it. `--separation` on the tournament too, for
   the probes.
3. `../../scripts/league.mjs`: the same three flags, applied to the main's collection only; the
   exploiters and the pool are unaffected, because a curriculum for an opponent whose job is to
   exploit is not one.
4. Tests in `../../tests/ppo.test.mjs`: the parser on `1.0:0,2.5:20,4.0:40` and on a single
   value; `scheduled` at the boundaries; a schedule out of order is refused. In
   `../../tests/tournament.test.mjs`: a job with `separation` 1.5 starts the right corner at
   1.5 m on a real short bout, read from the first sample's gap; the byte-identical rerun at the
   default is unchanged.
5. The manifest, docs/sweeps/learn-08-curriculum.json: script `train-ppo`, from scratch, seed
   20260915, viable pool, 60 iterations, 7 workers an arm:

   | arm | schedule | tests |
   | --- | --- | --- |
   | a | none; Session 06's winning table if one won, else shipped | the control |
   | b | `--separation-schedule 1.2:0,default:20` in units of the pair's larger reach | start inside the fight |
   | c | `--opponent-schedule idle:0,uniform:10,golem-driver:20,league:40` | opponents by difficulty |
   | d | `--terminals-schedule maul:0,maul+mace:15,viable:30` | classes by decidability |

6. After: `rate-snapshots` every 8 iterations on both pools; the iteration at which each arm
   first reaches the shipped league's iteration-60 rating against `golem-driver` (from the
   record: +0.1593 +- 0.0466 mirrored at iteration 64), quoted with its interval; into
   `../measurements.md`.

## Human gate

None. The mechanical bar: an arm reaches the shipped league's iteration-60 rating against
`golem-driver` on the same pool in at most 40 iterations, and at iteration 60 leads arm a by
d 0.2 on random viable pairs. A curriculum that gets there faster and ends lower is reported
as both.

## Verification

```powershell
npm run check
node --test tests/ppo.test.mjs tests/tournament.test.mjs tests/league.test.mjs tests/docs.test.mjs
node scripts/train-ppo.mjs --iterations 2 --bouts 8 --workers 8 --separation-schedule 1.2:0,2.4:1 --opponent-schedule idle:0,uniform:1 --evaluate 0 --seed 20260915
npm test
npm run build
git diff --check -- .
```

## What remains

A schedule on the bout cap (short bouts first) is the same parser and one more flag, left until
a curve asks for it. Whether a curriculum's gain survives the league's own opponent mixing is
Session 10's question.
