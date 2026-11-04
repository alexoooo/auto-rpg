# Option Mind's tree search

## Why

The valued chooser (`VALUED_CHOOSER`, `src/core/option/chooser.ts`) searches the Options' models
two deep, then ends each line at a leaf made of hand-picked patterns: an open Option held to the
horizon, an Option that leaves the body where it began run again, and a walk to a site followed by
either. Each failure of the search has been met by another pattern, and three remain open:

- **Chains longer than the depth.** A body lying where only flatten is on offer reaches standing
  three Options deep (flatten, a staged way up, the last way up), past the depth and the leaf, and
  braces.
- **No preference for sooner.** A strike now ties the same strike after a second of following
  orders: the measured stomp leaves the body outside its window, so the leaf cannot run it again,
  and both lines count one stomp. The measured stomp profiles wait on this.
- **A guess repeated.** An unmeasured strike's prior (`PRIOR`, `src/core/option/value.ts`), run
  again over the rest of the horizon at every site the leaf reaches, is worth more than a whole
  life bar; the Rogue chases its stalled stomps.

A Monte Carlo tree search over the same models deepens where few Options are on offer (on the
ground, 2 to 4) and stays shallow where many are (standing, a walk to each site), prefers a strike
sooner because a strike sooner leaves time for more, and needs no pattern but holding at its leaf.
It searches only the models the mind holds, within its step, as the valued chooser does.

## How it works

- **A chooser part** (`TREE_CHOOSER`, kind `tree`, in `CHOOSERS`): the one policy (`selectSet`)
  over the mind's Options, as the valued chooser is, its appraisal the tree's value of each
  (Option, target) on offer at the state decided at. The models, `placed`, the objective, the
  horizon, obedience, the margin and the holding of other foes' prices are the valued chooser's.
- **The tree.** A decision node is a state (`Situation`), its children the (Option, target) pairs
  on offer there (`pairsAt`); a chance node is an Option's model there, its children the states its
  outcomes leave (`Outcome`, `placed`, made once a state and key, as `child` makes them). A run
  descends by UCT at decision nodes and draws an outcome by its chance at chance nodes, adds one
  node, then ends at the leaf; it is cut where an open Option is taken or the horizon is passed,
  its last Option counted by the share of its time within the horizon, as a line is now.
- **A run's worth is its path priced whole** (`Objective.worth`, `Path`: the life dealt and taken,
  the orders, the seconds, the end), since the objective is not a sum over steps; each node on the
  path keeps the mean of the worths through it and its count.
- **The leaf** is the valued chooser's at first, so the two can be compared alike; then holding
  only (an open Option to the horizon), once the tree finds what the patterns gave.
- **Determinism**: a fixed count of runs a decision (`runs`), never a time budget; draws from one
  stream (`randomStream`) kept in the chooser's state, so a bout forks and replays to the bit; the
  core's exact arithmetic.
- **Exploration** scaled to the worths a node has seen (the spread of its children's means), so
  one constant serves bouts whose worths differ by orders of magnitude; set for the match result
  and said so in one line.
- **What a readout shows** (`OfferTerms`, `moves`, `letGo`) is read as now from the root's
  children: each pair's mean worth and its model's terms.

## Steps

Each lands green on its own: `npm run check`, `npm test`, and the fingerprint with its moved cases
named. The plan's measuring takes an hour at most, priced from each run's first trials.

### 1. The readings

A research script reads the match's bouts as the lie scan did: each side's longest time down and
its total, by body and loadout, and the Options on offer while it lies (`research/lying.mjs`). The
decision's cost is read by `research/step-time.mjs` with a mind's decisions timed apart from the
solver. Both read the valued chooser first, kept as its rows.

### 2. The tree chooser

`TREE_CHOOSER` with the valued chooser's leaf; config `runs`, `horizon`, `obedience`, `margin`,
`objective`, `exploration`, each with its fault. Check: the Mind contract (fork and resume mid-bout
give the same bout); a decision made twice from one state chooses alike; on a fixture lying on its
back with a staged way up, the tree's value of the way up exceeds bracing's, where the valued
chooser's is 0.

### 3. Its runs and exploration

Screened small (the Warrior empty-handed against bare), then the match: the count of runs set by
the decision's cost against the step (8.33 ms at 120 Hz, every body's minds together in a bout),
the exploration by a few values around the scaled default. Check: `npm run match` of the tree
against the valued chooser, both as Option Mind; the lying readings; the cost. Each bout the tree
loses is read for whether its choice came from a predicted state its prediction got wrong: the
body's real view read where another posture or place was predicted (a strike's kept site,
`Stood`), or the foe far from where every prediction holds it.

### 4. Holding only at the leaf

The run-again and walk-to-site patterns leave the tree's leaf. Kept where the match and the lying
readings show no loss against step 3's tree; else the pattern that the loss names stays, with the
reading that shows why.

### 5. The default

Option Mind's default chooser becomes the tree where step 3 or 4 wins the match against the valued
chooser. The measured stomp profiles are read again under it (the stomping rung for
`option/stomp`, the match), and adopted where they gain. The valued chooser stays for the configs
that name it (the Walker's, at depth 1).

## Done when

- Option Mind's default chooser is the tree, chosen by a match it wins against the valued
  chooser, or the plan ends with the reading that shows why not.
- No body lies braced with a way up on offer in the match's bouts beyond what failed tries account
  for; a strike sooner is worth more than the same strike later.
- A decision fits its step on the bout and the crowd fight, and bouts replay to the bit.
- The roadmap's open items on delay and on the flatten-only lie are closed or named with their
  reading.

## Not in it

Each is its own plan, begun when its sign shows:

- **A predicted view, then a predicted foe.** A predicted state reads the body's real view (a
  strike's site there is the one kept from when the body last stood, `Stood`,
  `src/core/option/strike.ts`), and every prediction holds the foe where it is. Its sign: the
  bouts the tree loses (step 3) recur on choices made from states so mispredicted.
- **A learned value at the leaf**, fitted to the tree's own values of the states it searched. Its
  sign: holding only at the leaf loses (step 4), or the decision's cost caps the runs below what
  reaches a strike from the ground.
- A tree kept from one decision to the next.
