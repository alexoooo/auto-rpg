# The forked record

**Begun 2026-11-26, by the owner's order.** This plan builds a research tool. It forks saved fight
states once for each Option on offer and keeps what really happened. The predictors fitted from it,
and PUCT, stay in [the measured-mind plan](2026-11-25-measured-mind.md) (its mechanisms 2 to 5 and
steps 3, 6, 7 and 10). This plan changes no fight.

## The goal, in the owner's words

On 2026-11-26: "We will revisit PUCT, it's already in the plan -- we will be adding dozens of
skills and UCT won't scale to that many options. I do agree about removing 'kind'. It wasn't tried
seriously, it was removed both times without me even being told about it. Offline we have the
ability to save and fork and replay the fight state, and it's deterministic -- can we use that
somehow to solve our issues with predictors?" Of whether this is its own plan: "Upgrading all
predictors and changing the search seems like a big change, should this be it's own plan?" Then,
on being told that the predictors and the search are already the measured-mind plan's and only
the forking is new: "Sure, and update the measured mind plan as necessary."

## Why forks

Every predictor today learns from one sample: the future that followed the Option the body chose.
A deterministic fork can go back to the same state and play each other Option instead. That gives
labels for every Option on offer, not just the one chosen:

- **The action prior's target.** Last time, the prior was fitted to where the search's runs went.
  Those shares were close to even (2.441 nats a root, against 2.684 for even shares, `7f7b33aff`).
  They also depend on how the search spends its runs, which is exactly what PUCT changes. A
  forked worth for each Option depends on neither.
- **Each Option's model.** Each model is measured in drills, borrowed, or set by hand. A fork shows
  what the Option really did from a fight's state, next to what its model predicted at that same
  state.
- **The fitted value.** Several nudged forks of one state give the mean of what follows it and
  how much that varies, where today there is one sample.
- **A test bank for searches.** With a forked worth for every Option at a bank of states, a search
  variant is scored by its regret, decision by decision: the best Option's forked worth less the
  forked worth of the Option it chose. That screens variants in minutes. Tournaments still
  confirm the ones that pass.
- **A new skill.** Its Options are forked on the saved states alone, and their rows are added.
  Nothing else is forked again.

## The rules it keeps

1. **It changes no fight.** Nothing a Mind reads in the game moves. The fingerprint moves no case
   on any of its commits.
2. **The game never forks.** Forks run offline and write rows. The game reads only what is fitted
   from those rows, as it reads the fitted value now.
3. **Its cost grows with the Options, never with their square.** A state's forks are its Options
   times its nudges. Adding one Option adds its own forks and nothing more. Each step states its
   counts.
4. **Labels go stale; they are not redone.** A forked worth is the worth of "this Option, then the
   Mind plays as it does", so it belongs to the Minds that played the forks. Each row names them,
   as a measured asset does (`Origin`). Nothing is forked again because the Mind changed. That
   happens only when someone chooses to (the measured-mind plan's rule 4).
5. **Every Option at a state gets the same nudges.** Without a nudge a fork plays one exact future,
   which no Mind can know. So each fork is nudged, and the Options at one state are compared
   under the same set of nudges. Any small push moves outcomes one way, so only comparisons made
   under the same nudges are read.
6. **The measured-mind plan's procedure binds each step where it applies**: its look at prices
   before any run, its report, and its fresh reader told to refute the step.

## Steps

Scope throughout: the empty-handed Warrior's mirror. Then, from step 5, him offered every Option
that fits him, because that is where the number of Options is large.

1. **A fork that takes a given Option.** The research fork (`rollout`, `research/rollouts.mjs`)
   gains a branch that is an Option. At the fork's first search, the side's Mind takes the named
   Option, then decides as it always does; held (`hold`), it is taken again while it runs on, to its exit. An Option is named by its key: its place in the Mind's
   Options and its target, as the warm start keys them (`warmStart`,
   `src/minds/option/choosers/tree-search.ts`). This is done with a load hook, the way
   `research/minds/move-prior-hook.mjs` reads the search, so the game's code does not change.
   If a hook cannot reach it, the seam goes behind the chooser's contract, unset in play.
   *Checked*: at every decision of one bout, the trunk's own choice with no nudge ends in the
   trunk's poses, to the bit. At the same decisions, a different Option moves the bout. The
   fingerprint moves nothing.
2. **The bank, and its price.** The states are decision states from the bouts of the
   measured-mind record (its step 3), the Warrior's mirror, played again on the code that played
   them. The record keeps no saves, and its bouts play again only on that code and those assets;
   where they have moved, the record's matchup is played anew on the code in hand
   (`npm run measure`'s `--again`). The states are sampled at a fixed stride. Each is kept as a
   save (`Duel.save`) with its recipe and its step, so the bank stands when the Mind changes
   after it. Nothing that moves the Warrior's mirror lands while the bank is played or forked. Each state is forked once for each Option
   on offer, times the nudges (`nudgesOf`), for a horizon of a few seconds, with the Mind playing
   on both sides. Before the rest is run, its price is said from its first chunk: forks a state,
   worker-seconds a fork with today's Mind inside it, and states a night on this machine's
   workers.
3. **What a row holds.** For each Option and nudge:
   - its forked worth: the life dealt and taken over the horizon, weighed as the Mind's objective
     weighs them, with the end priced by the fitted value where the body has one;
   - what the Option did: how long it ran before it ended or the Mind let it go, whether it
     landed, what it dealt and took, the body's posture and range at its end, and where the foe
     went.

   Beside these is what the Option's model predicted at the same state, which the search's root
   already holds. The rows are in the format of the measured-mind record (its step 3), so every
   fit there can read them.
4. **How sure a label is**, read before any fit uses it. The spread of a forked worth across
   nudges, against the gaps between the Options at the same state. And whether the best Option
   from half the nudges is the best from the other half. The nudge count and the horizon are
   chosen from this. If the spread swamps the gaps at a nudge count that can be afforded, that is
   said, and the label is not used to rank Options at that count.
5. **First readings, with nothing fitted.**
   - The game's Mind against the forks: at each state, how its root prices rank the Options
     against their forked worths, and the regret of its choice, in life.
   - Each Option's model against the forks: predicted against forked seconds, dealt, taken and
     landing, by kind of Option, with the largest errors named. This is the order for the
     measured-mind plan's step 10.
   - The forked target against the old one: the entropy of a softmax of the forked worths,
     against the run shares' 2.441 nats. This shows whether the new target says more.

   Read on the Warrior's own Options, then on every Option that fits him.
6. **The regret bank as a command.** It takes a Mind config and a bank, and builds that Mind at
   each banked state. The Mind that played the bank keeps the memory its save holds; any other
   config starts cold. Each Mind searches once at each state. The command prints the mean regret
   with its spread, and the thinking. *Checked*: the Mind that played the bank, read both warm and
   cold, shows what a cold start costs a reading. Then one pair of configs is read both by
   regret and by a match, which shows whether regret ranks Minds as bouts do.
7. **A skill added, shown once.** One Option that fits the Warrior but is not offered to him is
   forked on the bank alone and its rows are added. Nothing else is forked again. Its cost is
   stated as one Option's share of a state's forks.

## What is known before it starts

- **Forks match the trunk.** With no nudge, all 108 forks of a bout ended in the true fork's
  poses. Nudged at 0.5 N s, none did, and 2 s on the furthest centre stood a median of 1.1 to
  5.4 cm off the true fork's, across three pairings (`37e50e258`).
- **What a fork cost in October.** 5,558 forks of 2 s took 232 s on 14 workers, about 0.6
  worker-seconds a fork. Blind, with 4 nudges, 18,536 took 677 s (`ffb6a3f5e`). Those Minds were
  older and cheaper. The Option Mind's decisions are a bout's slowest steps
  ([the step's cost](../reference/step-cost.md)), so step 2 measures the price again.
- **The Mind searches every 0.1 s**, so a 60 s bout has about 600 decision states a side. The bank
  samples them; it does not keep them all.
- **The Mind can let go of a running Option** at its next decision (`letGo`,
  `src/minds/option/choosers/chooser.ts`). So a forked worth is the worth of starting the Option
  now and then playing on. That is the choice the search's root makes.
- **The record reads its decisions through the same hook** (`option-fork-hook.mjs`), given
  nothing to force. A step that changes the hook keeps that path the game's: the option fork's
  check and the record's bout 0 played again show it.
- **What a Mind remembers is in the bout's save.** The fingerprint with `--relay 127` checks it.
  A Mind built cold at a saved state differs from one that played up to it (step 6).

## Where it stands

**Steps 1 to 4 have landed.** Step 4's answer is that, at the nudge counts this machine affords,
a forked worth does not rank the Options at a state. By step 4's own rule for that case, it is not used
to do so.

- **The fork** (step 1): `rollout` takes an `option` by the load hook
  `research/option-fork-hook.mjs`. On the warrior protocol's bout 0, all 687 forks given the
  Mind's own choice ended on the trunk's trace to the bit. With `hold`, the Mind takes the Option
  again at each decision it runs on to while it yields, so it runs to its exit as a search's line
  runs it. An open Option is not held, since a search prices it as an instant. Without `hold`,
  the Mind cancels at its next rethink, 0.1 s on, what it would not have chosen. That happened to
  73 % of forced Options in 16 states, and 219 of 468 forks there were identical to another of the
  same state and nudge. So the bank's forks hold.
- **The bank and its price** (step 2): `research/minds/bank.mjs` played 87 of the measuring
  protocol's 144 bouts of option-lean's mirror at `62c688f5f`, before the machine stopped. It
  kept every 80th decision with an Option to take as a save: 989 states, in
  `.cache/bank/`. Saving before every step made a bout cost 660 worker-seconds, against 145
  without. A bank played again should save only where the Mind can decide.
  `research/minds/fork-bank.mjs` forks a state once for each Option on offer under the same
  nudges. A state has about 8 Options, so 31 forks under 4 nudges. A held fork 2 s on costs 1.06
  worker-seconds, so a state under 8 nudges costs 66, and 100 states took 20 minutes on 4 workers.
  All forks were taken, and every fork of every state started on the bank's poses.
- **The rows** (step 3): a line a state in the bank's `forks.jsonl`, with each fork's key,
  nudge, how long the Option ran, the lives and the side's readings every 0.5 s. All 100 forked
  states join to their root in the record at the bank's commit, where the root priced 98 % of the
  Options forked. `research/minds/forked-worth.mjs` prices a fork as the Mind prices a line.
- **How sure a label is** (step 4, `research/minds/fork-sureness.mjs`, on 100 states held, 8
  nudges of 0.5 N s, 2 s on). Each Option is picked by 4 nudges and judged by the other 4 at 2 s.
  - Picked at 2 s, the median gain over a random Option is 0.008 life, with 10th to 90th
    percentiles of -0.26 to 0.54. It does better in 67 % of states.
  - Picked earlier, the gain is less still: 0.004 at 0.5 s and 0.001 at 1 s.
  - At 2 s a fork's worth spreads 0.33 life across nudges. The distinct Options' means spread
    0.087, the best to the next 0.075, and the Options are 5 % of a fork's variance.
  - Read early, a worth is mostly the fitted value's reading of where the fork then stands (the
    Mind's horizon is 20 s). At 0.5 s it agreed with itself at 59 to 62 % of states but predicted
    nothing of 2 s. A fresh reader found this, refuting the first conclusion drawn from 0.5 s.
  - To bring the spread down to the gaps would take some tens of nudges an Option, about five
    times these forks' price, and the gaps are themselves small. In this mirror, which of the
    Options on offer is taken matters little next to how the next 2 s fall out.

What this leaves of the steps after:
- Step 5's reading of each Option's model against the forks pools many states, so it does not need
  a state's ranking. It can be read on the forks already played.
- Step 5's ranking of the Mind's choices, and its forked target for the action prior, need a
  ranking, so they are not read at this count. The measured-mind plan's step 6 fits on the targets
  it has.
- Step 6's regret bank would score a search by these same rankings, so it waits on a way to make
  them sure.

Next, in the order the measured-mind plan gives: its step 4. Fork step 5's pooled reading needs no
new forks.

## What done is

Each step has landed with its checks and a fresh reader's refutation answered. The fork, the bank
and the regret command are documented where their code is. Then this plan is deleted, what it
found moves into [the approaches](../approaches.md#minds), and the commands into `AGENTS.md`'s
list.
