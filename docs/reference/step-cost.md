# What a step costs

What one world step (`World.step`, `src/core/world/world.ts`) takes in time and memory, and how to
read it. `tests/core-step-cost.test.mjs` holds the step's allocation under ceilings
([below](#allocation-ceilings)); time and heavy-work counts are read with the diagnostics here
when a change affects them.

## Reading a step

- **Bytes and counts are the same on any machine; times are the machine's.** Read times on a quiet
  machine and compare rows of one run. A step is 8.33 ms of game time (120 Hz); a 60 Hz page takes
  two steps a frame and draws.
- **A bout plays the same to the bit each playing**, so the least of step k's times over the
  playings is what that work takes; the rest was the machine's or the collector's. The first
  playing warms the compiler and is not read.
- **Lag behind real time** after step k is `max(0, lag + t_k - dt)` (`lagOf`, `research/lag.mjs`).
  A lag under a step is never seen: the page draws a step behind the newest frame.
- **A speed rewrite** moves no pose in the fingerprint (`node scripts/fingerprint.mjs --json
  <before>`, then `--compare <before>`), and where it touches a mind or its saved state,
  `research/minds-apart.mjs --fork` plays the same to the bit. Its time is read paired with
  `research/step-time.mjs`: the code before and after played alternately, each warmed, against a
  noise band from the same reading taken twice on the code before. It is kept when its time is
  equal or better and its allocation is not worse; a slower rewrite is dropped whatever it saves
  in allocation. A change too small for the band is read by its profile's own time and allocation
  sites, and the time once over a group of them.
- **A bout's slowest steps are Option Mind's decisions**: a speed rewrite moves the mean more than
  the tail. A change to what the search computes is a change of the mind, judged on its play
  (`npm run match`), not on the fingerprint.

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

`CEILING` in `tests/core-step-cost.test.mjs`, KiB a body a step by fixture (`standing`, `down`,
`fall`, `mind`; each test's comment says what its fixture plays), each reading in a process of its
own. A ceiling is the highest of five readings plus a quarter, rounded up; one `mind` ceiling
holds every game mind. A change that goes over a ceiling takes its allocation out of the step or,
where the allocation is the feature's, raises the ceiling by this rule and says why in its commit;
an allocation that falls well below its ceiling lowers it. A lower allocation alone does not
establish faster execution: time is read apart from it.

```powershell
node tests/harness/step-allocation.mjs standing
node tests/harness/step-allocation.mjs down
node tests/harness/step-allocation.mjs fall
node tests/harness/step-allocation.mjs mind option man sword
node --test tests/core-step-cost.test.mjs                  # every ceiling
```
