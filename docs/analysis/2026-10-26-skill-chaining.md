# Skills that chain: exits, defaults and a short look-ahead

The question: how does the options fighter choose a skill whose worth lies in what it makes
possible? Three cases:
- a step back that gives a jab room;
- a cross or a hook chosen by how the jab before it landed;
- a rise that stops on one knee when a foe is close.

The aim is one mechanism for all of them, not one for each, at a cost a decision can afford. It
must leave the testbed open: the options fighter is the strong reference, not the only way a
fighter can think.

The proposed answer, in two layers. It waits on the owner, because it changes the AI's layering
and types.

**The shared library: additive, and nobody has to use it.**
- **A skill exposes its exit**, the region where it can hand over: a strike's stroke's end, a rise
  part's posture, a step's range. A caller may take over there. The whole skill, with its own
  return, stays available.
- **Each resource's default accepts any state**, moving or in contact, and brings it to its safe
  state: a hand to the guard, the trunk upright, the legs standing.
- **A profile records a skill's payoff, its duration and its exit**, as data any mind can read.
  The exit is in the terms entry conditions read: range, and which hand is out, how the hips are
  turned, how fast the body moves.
- **A goal is a number, or a name the library resolves each step**, such as "out of their reach"
  or "the jab's best range".
- **The ground graph's edges are priced** by their profiles, in the ground layer, for any chooser.

**The reference fighter: the options fighter's own choices.**
- **The chooser looks ahead a set number of skills.** A skill is worth its own payoff plus the best
  follow-up whose entry admits its predicted exit, summed as one rate.
- **Depth is a setting.** At depth 1 the chooser is today's one-step worth; the proposal runs it
  at 2.
- **The chooser is a part role**, so an experiment brings its own by configuration, as the swap
  test already proves for other roles.

It reshapes the [Options](../plans/2026-10-24-options.md) plan's steps 3 and 4 and the
[types](../diagrams/fighter-mind-types.html). Step 2 (footwork and the intent) is unaffected
except that its goals may be names. The decision is needed before step 3 starts.

## Room to depart

| Fixed: every mind meets it | Free: a mind's own |
|---|---|
| **The Mind's boundary**: its senses and its own body in; muscle commands and granted grip requests out (`Mind.step`, the [architecture](../architecture.md)) | everything inside the Mind: skills or none, any chooser, any learning |
| **The Commander's boundary**: its team's view in, orders out | how a Commander decides |
| **Orders in the world's terms**: go, face, attack a foe, a region; skill choices only as an optional extra (`choices?`), read by a mind that has those skills | whether a mind uses the skill library, profiles or goal names |
| **The drills as a common measure** of a skill, whoever built it | how a skill moves |

A mind may use the whole stack, part of it or none. An end-to-end learned controller on the
muscles meets only the first row.

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

Handing over there gives three things:
- the follow-up is chosen while the body is still inside its entry condition;
- the return is measured once, as the default, not inside every strike;
- the arm can be left out, as a frame or a grab.

A caller that takes over at the exit sees `Ended` at the handover, so no separate release event is
needed. A caller that does not gets the whole strike, return included, as now.

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
decisions ahead. Together they would give the ceiling of depth 2 over depth 1.

### What a decision costs

The look-ahead is a tree, but entry conditions prune it. After a jab, the jab's hand is out and
the hips are turned, so only a cross, a hook, a frame, a step or nothing is ready. An estimate at
depth 2:

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
| **3. Exits, defaults and a chooser with a depth setting** (proposed) | one mechanism for stepping, combinations, the rise and recovery; depth 1 keeps today's choices; other choosers use the same library | profiles need exits; defaults must accept motion and contact; at depth 1 a skill handed over at its exit is underpriced, so a chooser that takes over there must price the follow-up |
| **4. Deeper search, branching on the foe's reply, or a learned value** | the most capable | dearer; nothing yet shows it pays; each is an entrant or a chooser part of its own |

## The proposed design

### The shared library

| Change | Additive because |
|---|---|
| A skill exposes its exit; a caller may take over there | the whole skill, its return included, stays available |
| Defaults accept any state, moving or in contact | a default that copes with more breaks no caller |
| A profile records the exit beside the payoff, over the entry condition's variables | a reader may ignore it |
| A goal is a number or a name the library resolves each step | numbers stay valid |
| The ground graph's edges are priced, in the ground layer | a mind that routes by the unpriced graph keeps it |

### The reference chooser

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

- **Depth is a setting**, 2 in the reference. The chooser runs when a skill ends or on an event,
  and chooses for the resources freed. Hands outside the line are given cover by worth, as now.
- **The chooser is a part role** (`chooser`), as `technique`, `gait` or `aim` are. Today's choice
  (`meta: "valued" | "ranked"`, `src/core/mind/options/kind.ts`) is a closed setting. Valued at
  depth 1 and ranked become its first parts. A bandit, a learned or a searching chooser is
  another part, brought by configuration.
- **The foe at an exit** is predicted at its present velocity, so a still foe lets the range open
  and a pressing one does not.
- **Whole skills and their parts stay side by side**, and the drills read each: the whole punch
  beside the punch to its stroke's end, step-up whole beside step-up split at the fours and a
  knee. The reference fighter is configured with whichever reads better. The other stays in the
  library for any mind.

What follows from it, with no case of its own:

| Case | How |
|---|---|
| Step back, then jab | the step's exit makes the jab worth more than a jammed one |
| Step in, then jab | the same line forward; the reference fighter drops its "close and" options |
| One-two, a hook off the jab, a frame | the jab hands over at its stroke; the follow-up is chosen there, by its result |
| Recovery after a blow | the default's return, counted in the line's time |
| The rise | postures are exits; the chooser reads the priced ground graph |
| Spacing | `position()` terms at depth 0 |
| A player's settings | what the chooser reads: the deck, `Weights`, the depth |

Left out of the reference until a question needs them, and open to any experiment as a chooser
part or an entrant:
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
- **Each step of option 3** is read by `npm run match` against the version before. The depth
  setting makes depth 1 against depth 2 one match.
- **The drills** read each whole skill beside its parts.

## If accepted

- **The Options plan:**
  - steps 3 and 4 take the shared library's changes and the reference chooser, in that order;
  - the chooser becomes a part role, with depth a setting;
  - the reference fighter drops its "close and" options;
  - the ground graph's edges are priced, with the rise rework.
- **The Drills plan, step 6:** a profile records the exit beside the payoff, over the entry
  condition's variables.
- **The types chart:**
  - `Profile` gains an exit;
  - `Skill` exposes its exit;
  - `Goal` takes a number or a name;
  - the `Chooser` is a part role whose reference is `best()`.
- **This analysis is deleted.**

The order of work:
1. A hand-written profile with an exit: the punch's payoff by range.
2. Skills expose their exits; the defaults accept motion and contact.
3. The chooser as a part role: today's valued and ranked choices as its first parts, moving no
   fingerprint.
4. `best()` with its depth setting; the reference at depth 2.
5. Goals as names beside numbers.
6. The ground graph priced.
7. Measured profiles in place of hand-written ones.
