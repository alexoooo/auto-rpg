# Option Mind's speed

## Why

Option Mind decides by the tree chooser (`TREE_CHOOSER`, `src/core/option/chooser.ts`) at 100 runs
a decision. A bout with an Option Mind on each side steps in 17.8 ms at the 99th percentile; the
target is a step's 8.33 ms at the 99th percentile. Fewer runs fit the target but stand the body
from fewer falls, so the runs stay and the decision is made cheaper.

Where a bout's time goes (one CPU profile over three match bouts, Node, core world, Rapier, 120 Hz):

| Part | Share of the bout's time |
| --- | --- |
| The tree's searches | about 23 % |
| ... of which scoring each new state (its leaf) | about 21 % |
| ... of which reading the strike profiles (`pressureAt`, `dealtAt`, nearest trials) | about 9 % |
| The physics (Rapier) | about 22 % |

A search begins about one mind-step in seven (2800 in the three bouts), its median 3.9 ms and its
90th percentile 12.6 ms. The profiles are small (10 strike profiles, 200 trials, at most 56 in
one), so a read is cheap and their count is the cost; scoring a state runs the leaf's one-deep
search (every Option on offer, run again or held, and every walk to a site) with each Option's
model there.

## How it works

- **The search does not change.** Each step makes a decision cheaper, rarer or spread over more
  steps; the tree's runs, exploration, backup and leaf patterns stay as they are unless a step
  says otherwise.
- **Determinism and forks hold**: a fixed amount of work a step, never a time budget; what a step
  keeps is in the chooser's state (`src/core/state.ts`), so a bout forked mid-decision plays on to
  the bit (the Mind contract, `tests/mind-contract.test.mjs`).
- **A speed rewrite** does the same operations in the same order and moves no fingerprint case
  ([step cost](../reference/step-cost.md)). A step that changes what is computed (a decision spread
  over steps, a kept tree, a profile table, a learned leaf) is a change of the mind: its moved
  cases are named and it is judged as one.

## The readings

- **Cost**: `node research/lying.mjs --a option --b option --cases 0,10,20,30,40,50 --workers 1
  --time`, a quiet machine: the step's median, 99th and 99.9th percentiles, ms. The baseline is
  17.8 ms at the 99th. Where the time goes: `node --cpu-prof` over a few match bouts, or
  `research/step-time.mjs --profile`.
- **Quality**, for a step that changes the mind: `npm run match` against the tree before it, and
  the stand-up target's falls, standard and fresh, paired by fall against the tree before it.
- **In the browser**, once the target is met: the Arena, the crowd fight and the Crypt with their
  minds on workers (`npm run preview`), without slow motion.

## Steps

Each lands green on its own: `npm run check`, `npm test`, `npm run build` where browser code
changes, and the cost reading before and after.

### 1. The report copied once it changes

`saidOf` snapshots every mind's report with each answer, comparing records and arrays by value
and copying only changed branches. The copy stays a snapshot no later live write changes. A speed
rewrite: no fingerprint case moves. Check: the cost reading; the worker tests replay to the bit.

### 2. A decision spread over steps

A decision's runs are made a share a step (`runs` over a few steps) on one tree kept in the
chooser's state, the Options running meanwhile as they were; it acts once its runs are made. The
share a step is set by the cost reading; the steps a decision takes are read against the body's
reaction time (0.15 s), which they add to. A fork mid-decision rebuilds its tree from the root and
the runs made, or keeps the tree as plain data, whichever the Mind contract's fork test holds.
Check: the cost reading; the match and the stand-up falls against the tree before it.

### 3. The tree kept from one decision to the next

Where a new decision's state is within the drift a held price keeps (`Holding`, `stillHeld`) of
the state the last tree searched from, or of a state that tree predicted, the search goes on in
that subtree rather than from a new root: its runs add to those already made. The drift that
admits a state is set by the match. Check: the cost reading, searches made afresh a bout; the
match and the stand-up falls.

### 4. The profiles read from a table

Each profile's reading (`ProfileReading.expect`, `rate`, `peak`, `fastest`) is made once, at load,
on a grid of starts at half the spans its nearest trials are taken over (`NEAREST`: range 0.05 m,
velocity 0.125 m/s, place 0.05 m), and read at the nearest point or between them; the trials stay
the source the table is made from (`research/strike-profiles.mjs`, `research/edge-profiles.mjs`).
An exact index of the trials (a k-d tree) is the alternative where the table moves the match; at
most 56 trials a profile, it gains little over the pruned scan. Check: the cost reading; the
match.

### 5. A learned value at the leaf

The leaf's one-deep search is replaced by a value fitted to the tree's own values of the states it
searched (its runs past each state, read from bouts), a small model with fixed weights in
`assets/`, read in the core's exact arithmetic. It is fitted on match cases a reading does not
play. Kept where it holds the match and the stand-up falls at the lower cost; the leaf's patterns
stay where a reading shows what the value misses. Check: the cost reading; the match on fresh
cases; the stand-up falls.

## Done when

- A bout with an Option Mind on each side steps in 8.33 ms or less at the 99th percentile, at 100
  runs a decision or more, on the cost reading.
- Each step that changes the mind holds the match against the tree before it and does not set the
  stand-up target's falls back, standard or fresh.
- The Arena, the crowd fight and the Crypt play in the browser without slow motion.

## Not in it

- Fewer runs a decision.
- A new search: the chooser's policy, backup and exploration are the tree's.
- The physics' cost, the step's allocation ([step cost](../reference/step-cost.md)).
