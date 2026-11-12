# What a step costs

What one world step (`World.step`, `src/core/world/world.ts`) takes in time and memory, and how to read
it. `tests/core-step-cost.test.mjs` holds the step's allocation under ceilings
([below](#allocation-ceilings)); time and heavy-work counts are read with explicit diagnostics
when a change affects them.

## Reading a step

- **The harness**: Node, the core world, Rapier, 120 Hz, as each script's doc comment names. A
  step is 8.33 ms of game time: a world whose step takes less keeps real time with nothing drawn;
  a 60 Hz page takes two steps a frame and draws.
- **Bytes and counts are the same on any machine; times are the machine's.** Read times on a quiet
  machine and compare rows of one run.
- **A bout plays the same to the bit each playing**, so step k is the same work in every playing:
  the least of its times over the playings is what that work takes, and the rest was the
  machine's or the collector's. The first playing warms the compiler and is not read.
- **Lag behind real time** after step k is `max(0, lag + t_k - dt)` (`lagOf`, `research/lag.mjs`),
  read on a playing's own steps, collections included, past its first seconds. A lag under a step
  is never seen: the page draws a step behind the newest frame.
- **A speed rewrite** does the same operations in the same order, moves no fingerprint case, and
  reads its step with `research/step-time.mjs` before and after.

```powershell
node research/step-garbage.mjs --bodies 1,2,4,8,16,32,48   # time and allocation as bodies are added
node research/step-garbage.mjs --sites                     # where a bout's steps allocate
node research/step-time.mjs --profile                      # one bout's steps: the solver and the rest
node research/step-time.mjs --crowd --runs 4 --minds 4     # the crowd fight, its minds on worker threads
node research/call-count.mjs --crowd --cap 30              # the step's heavy work, counted
node research/reach-bed.mjs                                # a bout's reach solves, solved again
node research/crypt-plan.mjs --seeds 1,2,3,4 --profile     # a crypt run's planning in its step
node research/crypt-step.mjs --seeds 10,25 --seconds 60 --runs 3 --minds 4
node research/rest-probe.mjs --bodies 4                    # limp bodies put to sleep
node research/mind-make.mjs                                # making a Crypt mind
node research/mind-split.mjs --threads 1,3,4,5 --cap 60    # what splitting the minds off could give
node research/minds-apart.mjs --entrants --threads 1,2 --fork 10   # minds on worker threads and forks, the same to the bit
```

## Allocation ceilings

`CEILING` in `tests/core-step-cost.test.mjs`, in KiB a body a step, read by V8's sampling heap
profiler (`allocatedIn`, `tests/harness/garbage.mjs`), each reading in a process of its own
(`tests/harness/step-allocation.mjs`), so another fixture's optimization does not affect it:

| Ceiling | Fixture |
|---|---|
| `standing` | two skeletons standing (`standBodies`), 240 steps read from 3 s |
| `down` | the Warrior lying on its back under its ground reader, 240 steps read from 3 s |
| `fall` | the Skeleton's first stand-up target fall on the fall bed, its stand verified as the evaluation verifies it, 240 steps read from 3 s as it rises |
| `mind` | each game mind (`GAME_MINDS`) on both sides of a bout of the first body it fits, 3 m apart, holding the first of a sword, nothing and a club it takes, 240 steps read from 2 s |

A ceiling is the highest of five readings plus a quarter, rounded up. One `mind` ceiling holds
every game mind, the highest of them, so a mind added is read without a number of its own. A change
that goes over a ceiling takes its allocation out of the step or, where the allocation is the
feature's, raises the ceiling by this rule and says why in its commit. A lower allocation reading
alone does not establish faster execution: time is read apart from it. Read opening and route
searches with `research/call-count.mjs` and `research/crypt-plan.mjs` when their frequency is the
question.

```powershell
node tests/harness/step-allocation.mjs standing
node tests/harness/step-allocation.mjs down
node tests/harness/step-allocation.mjs fall
node tests/harness/step-allocation.mjs mind option workshop-fighter sword
node --test tests/core-step-cost.test.mjs                  # every ceiling
```
