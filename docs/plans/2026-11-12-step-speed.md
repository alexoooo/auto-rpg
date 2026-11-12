# A fight step's speed

## Why

A world step is 8.33 ms at 120 Hz. A bout with an Option Mind on each side spends it, in CPU
profile shares (`research/step-time.mjs --profile`), on:

- the mind's report, snapshotted at every answer (`saidOf`, `src/minds/seat/create-mind.ts`);
- Rapier;
- Option Mind's search (`TREE_CHOOSER`, `src/minds/option/chooser.ts`, 100 runs a decision);
- the control solvers;
- the string-keyed command: postures, pushes and ownership slots looked up by channel name every
  step.

The target is a step within 8.33 ms at the 99th percentile. Average cost matters too: CPU work and
garbage collection consume the time available to advance the world, even when a change does not
move a percentile clearly. The garbage collector takes a small share of the step; allocation is
held under the step's ceilings (`tests/core-step-cost.test.mjs`) and read beside time, never in its
place.

## How it works

- **A speed rewrite** does the same operations in the same order and moves no pose in the
  fingerprint ([step cost](../reference/step-cost.md)). A change that alters what is computed (a
  decision spread over steps, a kept tree, a profile table, a learned leaf) is a change of the
  mind: its moved cases are named and it is judged as one.
- **Determinism and forks hold**: a fixed amount of work a step, never a time budget; what a step
  keeps is in its module's state (`src/core/state.ts`), so a bout forked mid-step plays on to the
  bit. The command-queue check in `tests/minds/contract.test.mjs` does not establish search-state
  completeness.
- **Each hot-path allocation has a reason**: its owner, readers and last use. Data that must
  coexist or escape gets fresh storage; temporary work is reused only after its readers finish,
  with independent frames for nested calls. Published offers and reports stay stable. Non-obvious
  ownership is explained near the code; readings go in the commit message.
- **The baseline first**: before any rewrite, each cost reading is taken twice on the same code.
  The spread between the two is the noise band, and "equal" below means within it. The baseline
  records each workload's mean, 99th percentile and profile shares as numbers in this plan, and
  whether its slowest steps are the decision steps: where they are, the exact rewrites move the
  mean more than the tail, and the parked changes of the mind are what move the tail.
- **Kept on time**: a change is kept when its paired time is equal or better and its allocation is
  not worse; a slower change is dropped whatever it does to allocation. Where allocation falls
  well below a ceiling, the ceiling is lowered by the step-cost rule so the gain is held.
- **Mean cost and tails are read together** with allocation volume, retained lifetime and GC
  pauses. A small percentile movement within run-to-run variation is inconclusive, not a
  rejection of a mean-time and allocation gain. A repeatable tail slowdown is investigated; a
  GC-pause improvement is not claimed from fewer allocated bytes alone. An inconclusive workload
  does not disqualify a confirmed gain in another; a promising gain is confirmed by an independent
  paired repeat.

## The readings

- **Cost**: per-step times from paired before/after playings on a quiet machine, the same
  scenarios, bodies, loadouts, engine and rate; each variant warmed, their order alternated; mean,
  median, 99th and 99.9th percentiles from saved rows, raw GC-inclusive times apart from any
  least-per-corresponding-step reading, naming the statistic used.
  - `node research/step-time.mjs --link "?matchup=workshop-fighter,workshop-fighter&control=option,option&left.loadout=empty,sword&right.loadout=empty,sword" --runs 4`: the bout harness, means and tails.
  - `node research/lying.mjs --a option --b option --cases 0,10,20,30,40,50 --workers 1 --time`: whole-step percentiles.
  - `node research/step-time.mjs --crowd --runs 4 --minds 4` and
    `node research/crypt-step.mjs --seeds 10,25 --seconds 60 --runs 3 --minds 4`: minds on worker
    threads.
  - The Warrior's Crypt encounter with three reptiles, recorded once with its setup and input
    tape kept, the same steps replayed through combat on each variant. Node inline cost is read apart from
    browser worker throughput; a two-fighter gain alone does not establish this case.
  - Where the time goes: `research/step-time.mjs --profile`, or `node --cpu-prof` over a few
    match bouts.
- **Allocations and lifetime**: `node research/step-garbage.mjs --sites` by stack, in a playing of
  its own; `node tests/harness/step-allocation.mjs <fixture>` against each ceiling. Constructor
  counts do not establish which objects V8 materializes; overlapping inclusive totals are not
  added. GC frequency, duration and step overlap are read on minimally instrumented playings. A
  collection's location does not identify which allocation caused it.
- **Heavy work counted**: `node research/call-count.mjs --crowd --cap 30`.
- **Sameness**: `node scripts/fingerprint.mjs --json <before>` then `--compare <before>`, no pose
  moved; `node research/skills/recovery/rising-bed.mjs --target`, every fall identical;
  `node research/minds-apart.mjs --entrants --threads 1,2 --fork 10` where a mind or saved state is
  touched.
- **Quality**, for a change of the mind: `npm run match` against the code before it, and the
  stand-up target's falls, standard and fresh, paired by fall against the code before it.
- **In the browser**, once the target is met: the Arena, the crowd fight and the Crypt with their
  minds on workers (`npm run preview`), without slow motion.

## Exact rewrites

Each lands green on its own: `npm run check`, `npm test`, `npm run build` where browser code
changes, the fingerprint, and the cost reading before and after. A change smaller than the noise
band is read by its profile self-time and allocation sites, and the step time is read once over
the group of such changes in one module. The search's storage built so far
(profile and pressure queries, predicted situations, model and offer slots, release of a completed
search) is in the [architecture](../architecture.md#minds).

### The report published on change

A mind's answer (`act`) is followed in the same prepare hook by its decision (`think`,
`src/minds/seat/embodiment.ts`), which writes reported state: the prospects always, actions and
endings on a release or resume. Commanders read the report in the next step's sense and prepare
hooks, after that decision, so a copy made on read is not the answer: what is published is fixed
at answer time.

Today `saidOf` walks every field by value at every answer (`snapshot`), and `sameKeys`
(`src/minds/seat/create-mind.ts`) finds each key's place by scanning the other record again, a
cost that grows as the square of a record's keys; a live action has about seventeen.

- **Values replaced, never written in place.** Each report field's owner gives it a new value when
  it changes: the prospects (the decider, `src/minds/option/profile-model.ts`), the actions'
  statuses and the ledger (`src/skills/framework/action-instances.ts`), the navigation report
  (`src/skills/locomotion/navigation/navigation.ts`), the gaits' limits (a record the legs replace,
  in place of getters over them). The heading is a number; the kit is deep-frozen when a mind is
  made (`kitOf`). Ledger records are already made once, at an action's end.
- **Published by identity.** `saidOf` takes a field whose value is not the object it last took, and
  deep-freezes each field it publishes (`deepFreeze`, `src/core/state.ts`: a lookup for a value
  already frozen). An unchanged field costs one comparison. A write in place to a published value
  throws where it is made, in any playing, not only under a test. `snapshot` and `sameKeys` go.
- **Actions publish `ActionStatus` records** kept apart from the instances' internals (executor,
  attribution, target segments), replaced when a status field changes.
- **Saved state**: `loadState` gives a frozen slot a new object, so a loaded or forked mind's
  report values are fresh, frozen again when next published; reading the menu, which saves and
  loads the mind's state, renews them the same way.
- **A mind apart** (`src/app/apart/thread.ts`) sends the fields whose values were replaced, in
  place of a key of the gaits and a clone of every field at every answer; `hear`
  (`src/app/apart/host.ts`) merges what came.
- **Checked** by a test that compares, at every answer, the published report with a full copy of
  `reportNow` taken at that moment, on an Option Mind bout, a Crypt run (navigation) and a fall
  the body rises from (a release and a resume): every field changes in one of them.

### Option Mind's search: its temporary work

Each construction is a separate paired change, preserving evaluation and arithmetic order.
Demonstrated caches are reused; their representation and lifetime earn their cost.

- Predicted situations (`placedWith`, `src/minds/option/option.ts`) stay prototype overlays of the
  root's percept memo; their property descriptors are not made afresh at each call.
- A line's temporary `Step` work is separate from the records tree edges retain: a temporary frame
  is held through recursive valuation, nested calls are isolated and references released once
  their last reader finishes.
- Cut edges have an immutable empty child store; only expandable edges get writable outcome
  slots. Synchronous backup, edge-building and lookup callbacks become indexed loops where their
  iteration contract holds.
- Static immutable model asks are shared where their fields are identical. A model may retain its
  readonly input, so a mutable argument is not overwritten for the next call.
- Offers at a held or arrived leaf are cached by situation, as the tree's own offers are.
- Open-model results cached by exact situation, Option identity, target and requested remaining
  duration, kept where the duel's gain repeats and the Crypt shows no repeatable slowdown.
- Child predictions stay distinct by parent situation. A serialized child key (`keyOf`) is
  replaced only by the same field presence and numeric equivalence (`-0` and `0` alike, `NaN`
  alike, absent apart from present, the first child's place kept), where the lookup's saving
  outweighs its indexing storage.
- A situation's prior reads its profile reading once (`prior`, `src/minds/option/percepts.ts`);
  the profile lookup builds no key a call (`readProfile`, `src/skills/framework/profile.ts`).
- Strike pricing, blow lives and a standing rest's outcomes build no throwaway arrays or spreads
  (`strike.ts`, `value.ts`, `rest.ts`).

Check: complete returned records, nested reads and retained inputs and outputs, cut and expandable
edges, key edge cases. One implementation under test at a time; why each is kept or dropped goes
in its commit.

### Repeated solves

Only a repeat whose inputs are bit-identical is skipped; a solve that reads physics each step is
not cached. `research/call-count.mjs` reads how often each runs, before and after.

- **The feet's support** (`readSupport`, `src/control/support.ts`) is read two or more times a
  control step on unchanged segment poses (`src/control/stance/stance.ts`, then skills' own reads
  in the stomp, support-fold and the staged rises). Callers pass different sets of feet to
  average, so the call's result is not what repeats: each foot's reading is (its sole's middle,
  edge and bearing), and the average over the chosen feet costs little. Each foot is read once a
  control step, by one owner at the step's start where the order of calls allows it, or else
  carrying the step it was read on; every other caller reads the feet as read.
- **An effector's three reach solves** (`src/control/effector-tracker.ts`), at `time - dt`, `time`
  and `time + dt`, start from the same angles. Where their targets are equal (the path clamped
  before its start or past its end) the solve runs once and its answer is copied; the equality
  is read on the targets, not inferred from the time.

### A data-oriented command

The index is the body's channel order (`muscleChannels`, `src/core/bodies/muscle/driver.ts`), which
the mind's mirror already uses (`src/minds/seat/mirror-channel.ts`). Each part lands green on its
own.

- **Ownership slots as integers**: `src/skills/framework/action-resources.ts` compiles every
  channel, effector and pose slot to an integer once; ownership, validation, the arbiter's
  `writes` and the instances' snapshot read an owner table, with no `channel:${name}` string,
  colon parse or `includes` scan a step.
- **Pushes by channel**: the motor indexes the first push of each channel once a `setPushes`,
  keeping first match and locomotion's pushes before the claims' (`src/control/motor.ts`,
  `supported-motor.ts`, `paw-motor.ts`); the rise's held pushes (`src/skills/recovery/held-body.ts`)
  are handed on by index, not as a push a channel.
- **The command assembled in place**: the arbiter writes the step's `BodyCommand` into arrays its
  state owns, in place of a deep copy and freeze each step; its finite-number check stays. The
  view's angles are filled in place (`feel`, `src/minds/motor-layers.ts`).
- **The posture as a channel array**: a `Float64Array` and a presence array (absent is not 0 for
  ownership; absent reads as 0 at the motor). Skills resolve channel names to indices when made
  (as staged rises do, `src/skills/recovery/implementations/staged/staged.ts`) and write by index;
  the override order stays guard, locomotion, support, arms, then claims in live order. Producers
  move a family a commit: the guard; walk, run and cycle-run; support-fold and lowering; the
  quadruped's crawl and trot; the strikes; the rises; then the motors read by index. Per-step
  channel-name templates, entry filters and name patterns in the strikes become index sets made
  at construction. It is the largest part and comes last: property reads on records of a fixed
  shape are already fast in V8, and the per-step strings, scans and copies go with the three
  parts before it. After them, the posture's share of the step is read and put to the owner before
  the producers move.
- **Its price**: the arbiter's and the motor's saved state change shape (typed arrays, which
  `saveState` takes), so the fingerprint's state hashes move and its pose hashes do not. Before
  the posture moves, a code search shows whether any saved file (assets, saved results, tapes)
  holds command state; the commit says what it finds.

## Changes of the mind, parked

Each moves what the mind computes and is judged as a change of the mind (*The readings*,
quality). None is in work.

### A decision spread over steps

Fixed work units chosen from root, run and leaf cost readings; a whole run is not assumed to be
small enough. Initial root scoring and unfinished leaf aggregation are in the resumable work. The
same runs, draws and backup order on one tree, the current Options running until the decision is
ready. The work quota is set from mean and tail cost, and the added decision latency is read
against the body's reaction time.

The pending root, progress and random-stream state are plain chooser state, or reconstructed
deterministically without drawing twice; when an obsolete pending decision is discarded is
defined. Check: forks partway through a leaf and a run, as well as completed decisions; the cost
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
the source the table is made from (`research/skills/strikes/strike-profiles.mjs`,
`research/skills/recovery/edge-profiles.mjs`). An exact index of the trials (a k-d tree) is the
alternative where the table moves the match; at most 56 trials a profile, it gains little over the
pruned scan. Check: the cost reading; the match.

### A learned value at the leaf

The leaf's one-deep search is replaced by a value fitted to the tree's own values of the states it
searched (its runs past each state, read from bouts), a small model with fixed weights in
`assets/`, read in the core's exact arithmetic. It is fitted on match cases a reading does not
play. Kept where it holds the match and the stand-up falls at the lower cost; the leaf's patterns
stay where a reading shows what the value misses. Check: the cost reading; the match on fresh
cases; the stand-up falls.

## Done when

- A bout with an Option Mind on each side and the recorded Warrior-versus-three-reptiles Crypt
  encounter each step in 8.33 ms or less at the 99th percentile, at 100 runs a decision or more,
  on the cost reading.
- Kept rewrites have paired mean and tail readings, allocation evidence and unmoved fingerprint
  poses; storage changes account for hot-path ownership and last use.
- Each change of the mind holds the match against the tree before it and does not set the
  stand-up target's falls back, standard or fresh.
- The Arena, the crowd fight and the Crypt play in the browser without slow motion.
- What worked goes into [step cost](../reference/step-cost.md) and
  [the code recipe](../recipes/code.md), and this plan is deleted.

## Not in it

- Fewer runs a decision.
- A new search: the chooser's policy, backup and exploration are the tree's.
- Physics: Rapier's share moves only with solver settings, which change play.
