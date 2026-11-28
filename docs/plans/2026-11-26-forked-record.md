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

- **Each Option's model.** Each model is measured in drills, borrowed, or set by hand. A fork shows
  what the Option really did from a fight's state, measured to its exit, next to what its model
  predicted at that same state. Nothing in that label is estimated, and what an Option does is
  mostly which Option it is, not chance (step 4).
- **The action prior's target.** Last time, the prior was fitted to where the search's runs went.
  Those shares were close to even (2.441 nats a root, against 2.684 for even shares, `7f7b33aff`).
  They also depend on how the search spends its runs, which is exactly what PUCT changes. The
  forks give the prior no target of its own: what one Option does to the next 2 s does not rank
  a state's Options (step 4). The prior gains from them through the models they correct.
- **The fitted value.** Several nudged forks of one state give the mean of what follows it and
  how much that varies, where today there is one sample.
- **A test bank for searches.** With a worth for every Option at a bank of states, a search
  variant is scored by its regret, decision by decision: the best Option's worth less the worth
  of the Option it chose. That screens variants in minutes. Tournaments still confirm the ones
  that pass. It needs a worth that ranks a state's Options, which the forks do not give at a
  count this machine affords (step 4).
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
4. **Labels go stale; they are not redone.** A label is what the Option did with the Minds around
   it deciding as they do (the foe's, and its own for the limbs the Option leaves free), so it
   belongs to the Minds that played the forks. Each row names them,
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
   on offer, times the nudges (`nudgesOf`), each until its Option exits (step 3), with the Mind
   playing on both sides. Before the rest is run, its price is said from its first chunk: forks a state,
   worker-seconds a fork with today's Mind inside it, and states a night on this machine's
   workers.
3. **What a row holds: what the Option did, measured to its end.** Each fork holds its Option
   (step 1) while it yields and plays until its run ends: over, out of its entry, no longer on
   offer, or let go by the Mind at its exit (there it is the Mind's, as in the game: a strike kept
   on strikes again). At that step it reads what the Option's model gives (`Terms`,
   `src/minds/option/contract/terms.ts`), in the model's units:
   - how long it ran, s, and how it ended;
   - the life it dealt and the life it took over its run, the blow coming at its start included.
     What the body dealt meanwhile includes its free limbs' blows (a hold's legs stand while the
     Mind punches), so it is the Option's own, and read, only for a strike;
   - whether it landed, for a strike (it dealt some life);
   - where it left the body (`Leaves`): where it stands and faces, its bearing around the foe,
     its posture and its velocity over the ground, as the Mind's own reading of the situation at
     that step reads them, and what the foe was doing then.

   Nothing in a label is estimated: no fitted value and no model is read into it. An open Option,
   which runs as long as it is held, is held a set time, and its model is asked over that time
   (`Ask.until`). A run still going at a cap of a few seconds is kept as cut at the cap and never
   read as an exit. Beside each label is what the Option's model predicted at the decision it was
   taken at, as that decision's search asked it. The rows are in the format of the measured-mind record (its
   step 3), so every fit there can read them.
4. **How sure a label is**, read before any fit uses it, for each quantity step 3 reads: how much
   of its variance across a state's forks lies between the Options rather than across the
   nudges, and how far its mean over some nudges is from its mean over others, against the gaps
   a fit has to learn (between the Options at a state, and between a model's prediction and the
   mean). Also the share of runs cut at the cap. The nudge count and the cap are chosen from this:
   the least that reads those gaps through the spread. A quantity whose spread swamps them at a
   count that can be afforded is said, and is not fitted at that count.
5. **First readings, with nothing fitted.** Each Option's model against the forks: predicted
   against measured seconds, dealt, taken, landing and where it leaves the body, by kind of
   Option, with the largest errors named. This is the order for the measured-mind plan's step 10.
   Read on the Warrior's own Options, then on every Option that fits him.
6. **The regret bank as a command.** It waits on a worth that ranks a state's Options (step 4's
   reading of the first forks). Then it takes a Mind config and a bank, and builds that Mind at
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
  `src/minds/option/choosers/chooser.ts`). So a fork that measures an Option holds it to its exit,
  as a search's line runs it (step 1's `hold`).
- **The record reads its decisions through the same hook** (`option-fork-hook.mjs`), given
  nothing to force. A step that changes the hook keeps that path the game's: the option fork's
  check and the record's bout 0 played again show it.
- **What a Mind remembers is in the bout's save.** The fingerprint with `--relay 127` checks it.
  A Mind built cold at a saved state differs from one that played up to it (step 6).

## Where it stands

**Steps 1 to 4 have landed, and step 5's first reading.** A fork measures what each Option did
to its end, nothing estimated, beside what its model said at the decision. At 8 nudges those
labels tell most models' errors from the nudges, and the models are wrong for most Options, some
by a lot. The first try labelled a fork by its forked worth: the life dealt and taken over 2 s,
weighed by the Mind's objective, with the rest of the Mind's 20 s horizon read from the fitted
value. Most of that label was the fitted value's own estimate, and it did not rank a state's
Options; nor did the life measured alone. So no label ranks a state's Options.

- **The fork** (step 1): `rollout` takes an `option` by the load hook
  `research/option-fork-hook.mjs`. On the warrior protocol's bout 0, all 687 forks given the
  Mind's own choice ended on the trunk's trace to the bit. With `hold`, the Mind takes the Option
  again at each decision it runs on to while it yields. Without it, the Mind cancels at its next
  rethink, 0.1 s on, what it would not have chosen: 73 % of forced Options in 16 states.
- **The bank** (step 2): `research/minds/bank.mjs` played 87 of the measuring protocol's 144
  bouts of option-lean's mirror at `62c688f5f`, keeping every 80th decision with an Option to
  take as a save: 989 states, in `.cache/bank/`. Its saves are deleted since, as the
  measured-mind plan's step 15 deletes those of a bank a later game change left behind; its rows
  are kept. Saving before every step made a bout cost 660 worker-seconds, against 145 without; a
  bank played again should save only where the Mind can decide.
- **The measured run** (step 3, `rollout`'s `measure`, `MEASURE` 3; `research/minds/fork-bank.mjs`
  into the bank's `runs.jsonl`). The Option is held while it yields, an open one 1 s, and at its
  exit is the Mind's; the fork stops where its run ends, or at 6 s. A fork costs 0.69
  worker-seconds; a state has about 8 Options, so 43 worker-seconds under 8 nudges, and 100 states
  took 18 minutes on 4 workers. 638 of 5,872 runs were cut at 6 s or the verdict. On three states,
  all 26 forks with the model asked and the ending read end on the same poses as without. Two
  fresh readers' findings are answered: a strike held through its release struck again; the end
  rules' drain was read as life taken (the life is now the bars'); why an Option ended was read
  after the Mind had re-aimed it; and the readers dropped Options that were not twins, averaged
  bearings as numbers, and left out every Option with one run cut.
- **How sure a label is** (step 4, `research/minds/run-sureness.mjs`, 100 states, 8 nudges of
  0.5 N s). At a state, the noise of an Option's mean over the nudges against the spread of the
  Options' means (median over states; about 1 where Options do not differ): its seconds 0.08,
  place 0.17 to 0.26, range 0.24, heading 0.28, bearing 0.35, velocity 0.35 to 0.37, life taken
  0.59 (a single fork's life is 17 % which Option it was). The 90th percentiles are near 1: at
  about a tenth of the states the Options are alike in a quantity. Strikes are few: six states
  have two or more on offer. The model is wrong by more than twice its mean's noise, and more
  than the least error worth telling, for 90 % of the Options in seconds, 77 % in bearing, 76 %
  of strikes in life dealt, 70 and 65 % in place, 55 to 58 % in velocity, 56 % in life taken,
  42 % in heading and 5 % in standing. So the labels are read at 8 nudges.
- **Each Option's model against what it did** (step 5's first reading,
  `research/minds/run-models.mjs`), the surest errors:
  - Rolls are priced at 5.0 s by the Mind's hand-set guess for a way up
    (`src/minds/option/predictions/by-hand.ts`) and run 2.6 s.
  - A punch is modelled at 1.1 s and runs 0.27 s; a kick 2.8 to 2.9 s against 1.1 to 1.4 s. The
    model counts the recovery after the release (`strike.ts`, the blow's seconds and its
    recovery), which the Option does not run: it ends just after its release. At eight states the
    forced strike ended at once, mostly where the Mind's own choice was that strike in its
    release, which the model prices as a fresh blow. A punch's life taken is modelled 3 times
    what it takes (1.7 times a second), what it deals 1.9 times.
  - Walks arrive: "no site to walk to" is a strike's window reached with the limb ready, or the
    edge of the foe's reach passed. To a punch's window they run about the seconds modelled; to a
    kick's or a stomp's window 0.3 to 0.6 of them. They end moving where they are modelled still,
    and their bearing at the end is off by a median 2 rad.
  - The cover is modelled open for 1 s and ends of itself in 0.05 to 0.1 s, and its model takes
    what the hold's does: no credit for the blow it covers.
  - The back step runs 1.57 s against 1.24.

  These go first in the measured-mind plan's step 10.

What this leaves: step 5 on every Option that fits the Warrior; the fits of the Options' models on
these labels are the measured-mind plan's (its step 10). Nothing ranks a state's Options, so the
action prior gets no forked target (the measured-mind plan's step 6 fits on the targets it has)
and step 6's regret bank waits. Step 7 needs no ranking and goes anywhere after step 3.

Next, in the order the measured-mind plan gives: its step 4. It moves the Warrior's mirror, so the
bank at `62c688f5f` is read as it stands and not forked again on the code after it.

## What done is

Each step has landed with its checks and a fresh reader's refutation answered. The fork, the bank
and the regret command are documented where their code is. Then this plan is deleted, what it
found moves into [the approaches](../approaches.md#minds), and the commands into `AGENTS.md`'s
list.
