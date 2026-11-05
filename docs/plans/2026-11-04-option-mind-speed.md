# Option Mind's speed

## Why

Option Mind decides by the tree chooser (`TREE_CHOOSER`, `src/core/option/chooser.ts`) at 100 runs
a decision. The target is a world step's 8.33 ms at the 99th percentile, at 120 Hz. Average cost
also matters: a decision's CPU work and garbage collection consume the time available to advance
the world, even when a change does not move a percentile clearly.

Each new tree state is priced by its leaf's one-deep search over the Options on offer, their
models and the strike profiles. The search builds model and offer caches, predicted situations,
path records and tree nodes. Their construction and how long they remain reachable are part of
the decision's cost. Make this work cheaper while preserving the search before changing when a
decision is made or how its value is estimated.

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
- **Each hot-path allocation has a reason**: identify its owner, readers and last use. Give data
  fresh storage where values must coexist or escape; reuse temporary work only after its readers
  finish, with independent frames for nested calls. Keep published offers and reports stable.
  Explain non-obvious ownership near the code; keep measurements and before/after records with
  the run evidence and commit message.
- **Mean cost and tails are read together** with allocation volume, retained lifetime and GC
  pauses. A small percentile movement within observed run-to-run variation is inconclusive,
  rather than an automatic rejection of a mean-time and allocation gain. Investigate a repeatable
  tail slowdown; do not claim a GC-pause improvement from fewer allocated bytes alone. The final
  step-time target still holds.

## The readings

- **Cost**: keep per-step and per-search times from paired before/after playings on a quiet
  machine, with the same scenarios, bodies, loadouts, engine and rate. Warm up each variant,
  alternate their order and report mean, median, 99th and 99.9th percentiles from saved rows.
  Report raw GC-inclusive times separately from any least-per-corresponding-step reading;
  record which statistic is used. `node research/lying.mjs --a option --b option
  --cases 0,10,20,30,40,50 --workers 1 --time` reads whole-step percentiles. Where the time goes:
  `node --cpu-prof` over a few match bouts, or `research/step-time.mjs --profile`.
  `research/step-time.mjs` also reports means and tails for its bout harness.
- **Allocations and lifetime**: sample allocated heap bytes, including collected objects, by
  stack in a separate playing. Count constructors, positive and negative cache hits, occupancy,
  repeated query keys and last-reader lifetime separately. Constructor counts do not establish
  which objects V8 materializes; overlapping inclusive byte totals are not added. Use minimally
  instrumented playings for GC frequency, duration and step overlap, without per-leaf timing
  records or trace hashing in the measured loop. A collection's location does not identify which
  allocation caused it. Reuse evidence only when code, model/skill data and protocol match; state
  the Node/page harness, engine, rate, recipes and warmup protocol with each reading.
- **Quality**, for a step that changes the mind: `npm run match` against the tree before it, and
  the stand-up target's falls, standard and fresh, paired by fall against the tree before it.
- **In the browser**, once the target is met: the Arena, the crowd fight and the Crypt with their
  minds on workers (`npm run preview`), without slow motion.

## Steps

Each lands green on its own: `npm run check`, `npm test`, `npm run build` where browser code
changes, and the cost reading before and after.

### The report copied once it changes

`saidOf` snapshots every mind's report with each answer, comparing records and arrays by value
and copying only changed branches. The copy stays a snapshot no later live write changes. A speed
rewrite: no fingerprint case moves. Check: the cost reading; the worker tests replay to the bit.

### Exact profile queries

Each nearest-trial query (`src/core/skills/framework/profile.ts`) keeps the distances its
selection computed in sample scratch and reuses them when aggregating the selected trials.
Only the interval visited by that query is valid; trials admitted beyond it by the tie tolerance
have their distances computed during aggregation. Query work holds clamped start coordinates and
neighbour bounds in frames reused by call depth through aggregation; fixed input tuples are read
by index, and distance insertion uses a shared helper. The distance arithmetic and trial order hold.
Check: complete profile readings, interleaved and nested queries, the fingerprint, allocation
samples and paired search and step timings.

### Exact pressure queries

Each tree decision reads its pressure through a private cache of exact range and velocity starts
(`cachedPressure`, `src/core/option/percepts.ts`). Fixed arrays hold at most 256 rates in four-way
hash buckets; a bucket evicts its least recently used start. Duration is applied after each
lookup. The pressure is read lazily, and the live situation and saved chooser state retain their
own predictions. Check: exact query results, eviction, decision isolation, the fingerprint and
paired search and step timings.

### Exact predicted situations

Each search shares the read-only sight, report and prediction overlays that end the actions and
incoming blow (`placing`, `src/core/option/option.ts`). Search-local weak maps find the overlay
for each input sight or prediction, and map an overlay to itself so descendants reuse it.
Each situation keeps its own geometry, posture and grace, with the same arithmetic and inherited
readings. Check: complete placements, lazy getters, independent inputs and searches, the
fingerprint and paired search and step timings.

### Exact model and offer storage

Replace `space`'s per-situation Option maps and target arrays (`modelAt`,
`src/core/option/chooser.ts`) with an indexed result row for each situation. Identify a slot by
Option identity and target index; preserve first-use and model-call order, root entry checks,
and the distinction between an unknown result and a known refusal (`null`). A negative result
need not have a container of its own. Do not remove model calls or negative knowledge merely
because a particular reading finds no negative-cache hits.

Share immutable Option/target descriptors across situations (`Pair`); retain independent offered
membership and order for every situation (`pairsAt`). Recursive queries and tree branches must
not overwrite one another's lists. Keep the existing reuse of the path record and run stacks.
Check: complete offer records for tree and valued choosers, repeated and refused models,
multiple targets, duplicate Option identities, root entry gating, nested and sibling states;
the complete fingerprint, allocation samples and paired mean and tail timings.

### Exact completed-search lifetime

For decisions that build a fresh tree, retain only final root prices and terms in the returned
lookup (`treeSearch`, `searching`). Build that lookup in a scope that captures its result data
without retaining the root node, descendants or search workspace. Preserve the first match for
duplicate Option/target entries, and keep published appraisal records independent of mutable
work. Release the tree only after every run and backup finishes.

Check: identical root offers and model terms, repeated lookups, decision isolation, cache release
between decisions, the complete fingerprint and a reachability reading. Read live retention
separately from allocated bytes and GC pauses. Deliberate tree reuse across decisions has its own
state and drift contract below.

### Exact temporary search work

Treat each construction below as a separate paired change, preserving evaluation and arithmetic
order. Reuse demonstrated caches; make their representation and lifetime earn their cost.

- Separate a line's temporary `Step` work from the records retained by tree edges. Hold a
  temporary frame through recursive valuation, isolate nested calls and release object
  references once their last reader finishes.
- Give cut edges an absent or immutable empty child store; only expandable edges need writable
  outcome slots. Replace synchronous backup, edge-building and lookup callbacks with indexed
  loops where their iteration contract holds.
- Share static immutable model asks where their fields are identical. A model may retain its
  readonly input, so a mutable argument cannot be overwritten for the next call. Read repeated
  open-model queries by the exact situation, Option, target and horizon duration before choosing
  any cache; price its own storage and preserve the model's input and percept-read contract.
- Keep child predictions distinct by parent situation. Replace serialized child keys only with
  the same field-presence and numeric equivalence, including the existing signed-zero behaviour;
  measure whether lookup savings outweigh new indexing storage.

Check: complete returned records, nested reads and retained inputs/outputs, cut and expandable
edges, key edge cases, the complete fingerprint, allocation samples and paired mean, GC and tail
readings. Keep one implementation under test per iteration and record why it is kept or dropped.

### A decision spread over steps

Choose fixed work units from root, run and leaf cost readings; a whole run is not assumed to be
small enough. Include initial root scoring and unfinished leaf aggregation in the resumable
work. Keep the same runs, draws and backup order on one tree, with the current Options running
until the decision is ready. Set the work quota from mean and tail cost, and read the added
decision latency against the body's reaction time.

Keep the pending root, progress and random-stream state in plain chooser state, or reconstruct
them deterministically without drawing twice. Define when an obsolete pending decision is
discarded. Check forks partway through a leaf and a run, as well as completed decisions; the cost
reading, added latency, the match and the stand-up falls against the tree before it.

### The tree kept from one decision to the next

Where a new decision's state is within the drift a held price keeps (`Holding`, `stillHeld`) of
the state the last tree searched from, or of a state that tree predicted, the search goes on in
that subtree rather than from a new root: its runs add to those already made. The drift that
admits a state is set by the match. Check: the cost reading, searches made afresh a bout; the
match and the stand-up falls.

### The profiles read from a table

Each profile's reading (`ProfileReading.expect`, `rate`, `peak`, `fastest`) is made once, at load,
on a grid of starts at half the spans its nearest trials are taken over (`NEAREST`: range 0.05 m,
velocity 0.125 m/s, place 0.05 m), and read at the nearest point or between them; the trials stay
the source the table is made from (`research/strike-profiles.mjs`, `research/edge-profiles.mjs`).
An exact index of the trials (a k-d tree) is the alternative where the table moves the match; at
most 56 trials a profile, it gains little over the pruned scan. Check: the cost reading; the
match.

### A learned value at the leaf

The leaf's one-deep search is replaced by a value fitted to the tree's own values of the states it
searched (its runs past each state, read from bouts), a small model with fixed weights in
`assets/`, read in the core's exact arithmetic. It is fitted on match cases a reading does not
play. Kept where it holds the match and the stand-up falls at the lower cost; the leaf's patterns
stay where a reading shows what the value misses. Check: the cost reading; the match on fresh
cases; the stand-up falls.

## Done when

- A bout with an Option Mind on each side steps in 8.33 ms or less at the 99th percentile, at 100
  runs a decision or more, on the cost reading.
- Exact storage changes account for hot-path ownership and last use; kept changes have paired
  mean and tail readings, allocation evidence and unchanged complete fingerprints.
- Each step that changes the mind holds the match against the tree before it and does not set the
  stand-up target's falls back, standard or fresh.
- The Arena, the crowd fight and the Crypt play in the browser without slow motion.

## Not in it

- Fewer runs a decision.
- A new search: the chooser's policy, backup and exploration are the tree's.
- General command assembly, navigation, control and physics costs or allocations: those belong
  to the broader [framework allocation goal](../roadmap.md#framework) and
  [step cost](../reference/step-cost.md). This plan covers work specific to Option Mind's search,
  models, predicted situations, percepts and profile reads.
