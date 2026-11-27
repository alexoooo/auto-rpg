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
   Option, then decides as it always does. An Option is named by its key: its place in the Mind's
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

**Step 1 has landed.** `rollout` takes an `option`, by the load hook
`research/option-fork-hook.mjs`, which rewrites the selection (`selectSet`) where the side's Mind
takes its first priced choice. The rollout workers register the hook, so a pooled fork may name an
Option too. A fork refuses an Option the Mind could not take there: its claims taken, not priced
at this decision, or a target the keep rules out (`Deciding.keep`). The row says whether it was
taken. `research/option-fork-check.mjs` read the warrior protocol's bout 0 (2.65 m, the game's
Mind on both sides, left won by draining at 60.88 s). It forked every one of the 687 decisions with
an Option to take, at 2 s, with no nudge. All 687 forks given the Mind's own choice ended on the
trunk's trace and poses to the bit. Of the 687 given the worst Option on offer, all were taken and
684 ended elsewhere. The next best is often a twin of the Mind's own: the same run by another
navigator. On a 5 s bout, 7 of 12 such forks ended on the trunk's poses. 1,374 forks took 2,821 s
on one thread, 2.05 s a fork, beside the measured-mind plan's step 2 on the same machine, so not a
price. No game file changed, so the fingerprint cannot move and was not played.

Next: step 2, once the measured-mind plan's step 3 has landed and before its step 4. The order of
the two plans on one machine is in [its "Where it stands"](2026-11-25-measured-mind.md#where-it-stands).

## What done is

Each step has landed with its checks and a fresh reader's refutation answered. The fork, the bank
and the regret command are documented where their code is. Then this plan is deleted, what it
found moves into [the approaches](../approaches.md#minds), and the commands into `AGENTS.md`'s
list.
