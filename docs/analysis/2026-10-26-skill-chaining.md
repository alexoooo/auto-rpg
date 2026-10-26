# Skills that chain: exits, defaults and a short look-ahead

The question: how does the options fighter choose a skill whose worth lies in what it makes
possible? Three cases:
- a step back that gives a jab room;
- a cross or a hook chosen by how the jab before it landed;
- a rise that stops on one knee when a foe is close.

The aim is one mechanism for all of them, not one for each, at a cost a decision can afford.

The proposed answer, waiting on the owner because it changes the AI's layering and types:

- **A skill ends at its exit**, the region where it hands over: a strike at its stroke's end, a
  rise's part at the posture it reaches, a step at its range. Nothing returns home by itself.
- **Each resource's default accepts any state**, moving or in contact, and brings it to its safe
  state: a hand to the guard, the trunk upright, the legs standing. A return to guard is what
  runs when nothing better is chosen.
- **A goal is a name the situation resolves each step**, such as "out of their reach" or "the
  jab's best range", or a plain number.
- **A profile predicts a skill's payoff, its duration and its exit**, the exit in the terms entry
  conditions read: range, and which hand is out, how the hips are turned, how fast the body moves.
- **The chooser looks two skills ahead.** A skill is worth its own payoff plus the best follow-up
  whose entry condition admits its predicted exit, summed as one rate.

It reshapes the [Options](../plans/2026-10-24-options.md) plan's steps 3 and 4 and the
[types](../diagrams/fighter-mind-types.html). Step 2 (footwork and the intent) is unaffected
except that its goals become names. The decision is needed before step 3 starts.

## Findings

### Why a step back is never chosen

- **The strike's model ignores range** (`strike`, `src/core/mind/options/strike.ts`). It prices a
  blow at its hand's energy (`blowEnergy`, `value.ts`, a fixed closing speed) times the action's
  landing record (`record`). A jammed punch is priced as a full one.
- **An option's worth is its own run alone** (`worth`, `value.ts`). A step that deals nothing
  loses to any strike that deals something.
- **"Close and <action>"** (`strike` with `closes`, built for each standing action in
  `src/core/mind/options/mind.ts`) is already a hand-made two-part chain, a walk then a blow,
  priced together:
  - when no limb is ready it walks to the executor's window (`approachActionWindow`,
    `src/core/mind/action-window.ts`), which moves either way;
  - it never steps back, because a jammed punch answers ready, and its walking time counts only
    closing distance (`max(0, apart − mine) / pace`).
  - It also breaks the plan's rule that a skill never walks to its range: one option drives the
    legs and a hand.

### Where a strike ends

A strike runs chamber, swing, return (`src/core/skills/strike-cycle.ts`). It finishes once the hand
is near its home, slow, for `hold` s, or fails at `returnLimit`. The stroke's end is detected
already: `motion.complete` raises `STRIKE_EVENT.thrown` as the swing turns to the return.

Ending a strike there gives three things:
- the follow-up is chosen while the body is still inside its entry condition;
- the return is measured once, as the default, not inside every strike;
- the arm can be left out, as a frame or a grab.

`Ended` then fires at the handover, so no separate release event is needed.

### The ground layer already chains

The rise is a graph of options (`src/core/mind/ground/`):
- the nodes are postures (`Position`);
- the edges are techniques with declared `edges`, an entry (`admits`) and an ending (`reached`,
  held `REACHED_SECONDS`);
- the chooser searches a route over them (`graph.ts`).

The edges are not priced: the search knows only which techniques failed too often from a posture.
Step-up's stages (`RISE`, `src/core/mind/rise/stages.ts`) are inside one technique, so the graph
cannot stop at the fours or a knee.

### What looking ahead is worth: the oracle

The [oracle](../reference/oracle.md) is the measured ceiling of a one-step search. It tries seven
coarse orders for 0.5 s in forks of the true world and values them 2 s on. Its findings that
bear on this question:

- **It turns 6 of 9 lost sides, almost all by not falling.** `attack` is taken in 1 of 794
  decisions, so its gains come from how it stands, not from fencing.
- **Little of the gain is knowing the exact future.** Blind forks do almost as well, so an
  approximate model can keep most of it.
- **The true world is an instrument, never a mind's model.** A step of a bout costs 1.4 ms, so a
  2 s fork is about a third of a second.

Not yet measured, and named in the roadmap as the oracle's next steps: strikes by name, and two
decisions ahead. Together they would give the ceiling of the proposed chooser over today's.

### What a decision costs

The two-skill search is a tree, but entry conditions prune it. After a jab, the jab's hand is out
and the hips are turned, so only a cross, a hook, a frame, a step or nothing is ready. An
estimate:

| | Count |
|---|---|
| First choices (skill and goal) | about 30 |
| Follow-ups after a strike's exit | 2 to 5 |
| Follow-ups after a footwork exit, where most skills are ready | about 10, behind about 6 footwork choices |
| Profile reads per decision | about 100 to 150 |

The meta-controller decides on events and every 0.2 s (`DECIDING`,
`src/core/mind/options/meta.ts`), not every step.

A follow-up table indexed by range, built once per decision, was considered and rejected. It
loses the exit's motion, which is what limits the follow-ups: just after a jab it would offer a
jab.

### Elsewhere

- **Legged robots look ahead briefly, on a simplified body, and plan again constantly** (MPC: Di
  Carlo et al. 2018). The deep look-ahead is in motion and balance, not tactics.
- **Skills are composed where one's exit lies in the next one's entry:**
  - funnels (Burridge, Rizzi and Koditschek 1999);
  - funnel libraries for planning in real time (Majumdar and Tedrake 2017);
  - symbols learned from options' entry and exit sets (Konidaris, Kaelbling and Lozano-Pérez
    2018).
- **DeepMind's table-tennis robot** (D'Ambrosio et al. 2024) picks skills by measured descriptors
  and adapts to the opponent within a match, with no deep search.
- **Fighting games** let a move's recovery be cut into chosen follow-ups within a window
  ("cancels"), often after confirming the hit.
- **A value of the position a choice ends in** replaces a deeper search (AlphaZero). Here that is
  `position()` at depth 0, added once the features are known.

## Options

| Option | Gains | Costs |
|---|---|---|
| **1. Keep today's chooser**: one-step worth, "close and" options, strikes end at the guard | nothing to build | no step back; no follow-up chosen by the result; a combined walk-and-strike option for every strike |
| **2. Entry limits from the profile**: a strike's window excludes where it is jammed, so "close and" walks back | small; uses what exists | a hard cut where a jammed blow is sometimes right; no branching; the combined options stay |
| **3. Exits, defaults and a two-skill chooser** (proposed) | one mechanism for stepping, combinations, the rise and recovery; the combined options go | profiles need exits; defaults must accept motion and contact; without chain pricing a strike ending at its stroke is underpriced and gets thrown back to back |
| **4. Deeper search, branching on the foe's reply, or a learned value** | the most capable | dearer; nothing yet shows it pays |

## The proposed design

```ts
// The best line from `now`, `depth` skills ahead. The chooser takes its first skill.
function best(now: Situation, depth: number): { gain: number; time: number } {
  if (depth === 0) return { gain: position(now), time: 0 };   // 0 until position terms exist
  let top = { gain: 0, time: 0 };                             // the defaults: nothing new
  for (const skill of ready(now)) for (const goal of goalsOf(skill, now)) {
    const e = profile(skill).expect(now, goal);              // payoff, duration, exit
    const rest = best(e.exit, depth - 1);                    // only skills whose entry admits the exit
    const line = { gain: e.gain + rest.gain, time: e.time + rest.time };
    if (rate(line) > rate(top)) top = line;                  // gain / (time + HORIZON), as `worth`
  }
  return top;
}
```

- **Depth is 2.** The chooser runs when a skill ends (its exit) or on an event, and chooses for
  the resources freed. Hands outside the line are given cover by worth, as now.
- **The foe at an exit** is predicted at its present velocity, so a still foe lets the range open
  and a pressing one does not.
- **A chain skill stays where its drill beats its parts thrown in turn**, as the plan already says:
  the whole punch beside the punch to its stroke's end, and step-up whole beside step-up split at
  the fours and a knee.

What follows from it, with no case of its own:

| Case | How |
|---|---|
| Step back, then jab | the step's exit makes the jab worth more than a jammed one |
| Step in, then jab | the same line forward; the combined "close and" options go |
| One-two, a hook off the jab, a frame | the jab ends at its stroke; the follow-up is chosen there, by its result |
| Recovery after a blow | the default's return, counted in the line's time |
| The rise | postures are exits; priced edges replace the unpriced route search |
| Spacing | `position()` terms at depth 0 |
| A player's settings | what the chooser reads: the deck and `Weights` |

Left out until a question needs them:
- exploration or a mixed choice (Thompson sampling on `record`, regret matching);
- profiles that depend on the foe and adapt within a bout;
- branching on the foe's reply;
- a learned value;
- MPC for balance and the rise.

## How it is decided

- **The ceiling:** the oracle with strikes by name, two decisions ahead, against one decision.
  - If depth 2 gains little over depth 1, option 2 is enough.
  - If it gains clearly, option 3 is built.
  - It is priced before it runs (the [cost](../reference/oracle.md#cost) table: the clairvoyant
    table took 232 s on 14 workers).
- **Each step of option 3** is read by `npm run match` against the version before.
- **The drills** settle each chain skill against its parts.

## If accepted

- **The Options plan:**
  - steps 3 and 4 take the four ideas and `best()`;
  - the strikes end at their stroke's end;
  - the guard default accepts an arm in motion and frees it from contact;
  - the "close and" options are retired;
  - the ground layer's edges are priced, with the rise rework.
- **The Drills plan, step 6:** a profile records the exit beside the payoff, over the entry
  condition's variables.
- **The types chart:**
  - `Profile` gains an exit;
  - `Skill` ends at its exit;
  - `Goal` becomes names;
  - the `Chooser` is `best()`.
- **This analysis is deleted.**

The order of work:
1. A hand-written profile with an exit: the punch's payoff by range.
2. Strikes end at `thrown`; the defaults accept motion and contact.
3. `best()` at depth 2, replacing today's one-step worth and the "close and" options.
4. Goals as names.
5. The ground layer on the same chooser.
6. Measured profiles in place of hand-written ones.
