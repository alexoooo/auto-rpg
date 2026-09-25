# Session 08: the control stack

## Goal

One stack that every shipped mind is built on: perception, skills and decision. It replaces the four
executors. It is proved by porting the duelist onto it and matching the original.

## Perception

- **One module owns every reading of the view:**
  - the opponent's stroke phase;
  - time to contact of each of their business ends;
  - reach, their guard line, their balance state;
  - openings.

  Minds read beliefs from here, and nothing reads the raw view to re-derive one.
- **Every reading is truth-checked in the harness.** The simulator knows the true stroke phase,
  the true time to contact and the true fall line, so each reading reports its accuracy against the
  truth on the league protocol's pairs. A reading below its accuracy floor fails a test.
  `strokeReader` at 82 % "idle" is the failure this prevents.
- `tests/harness/reading-variation.mjs` becomes a gate: a reading that never varies on the league's
  pairs is a failing test, unless it names why it is constant.
- **Supervised learning is allowed here first.** The labels come from the simulator at no cost,
  so a learned predictor (for example, "does their tip reach me in the next 0.3 s") trains on dense,
  correct targets. That is the opposite of the bout-result signal every past campaign started from.

## What is shared and what is the family's

Perception primitives, the body card bench, the skill *framework* (channel ownership, composition,
benches) and compute accounting are shared. **Skills and decisions belong to a family.** The golem
and the skeleton may share a `stroke` if one serves both, and the human may need its own. A future
quadruped writes skills its gait needs. Sharing is taken where it measures as good as a family's
own, and never forced. A skill lists the capabilities it needs, so the framework refuses it on a
body that lacks them.

## Skills

Parametrised, composable, and each owning channels (legs, trunk, each arm, the natural striker). Two
skills cannot own one channel at once. The first set, written for the golem and the skeleton:

| skill | parameters | its bench measures |
|---|---|---|
| `guard` | the line, the stand-off of the business end, stiffness | energy reaching the body from a scripted stroke |
| `stroke` | target, arc, speed, edge lead | arrival time, edge lead at contact, stray |
| `thrust` | target, speed | point-first share, arrival time |
| `footwork` | range, bearing, stance | range error, time to reach it, balance margin |
| `shove` | direction, commitment | impulse delivered, own balance margin |
| `brace` | the expected push | fall line kept |
| `rise` | direction | time to standing |
| `finish` | the downed target | damage landed before the rise |

- **`guard` is a first-class skill** and not a fallback, because the held blade delivers half the
  damage.
- **The human's flat blade is `stroke`'s bug** (edge lead 0.28), and it is fixed once for every mind
  here.
- A skill's parameters are continuous, which is v4's lesson. A skill is not a bundle that freezes a
  decision a mind should make, which is v3's lesson.
- Skill benches run on every family and at the ends of every attribute's range, so a skill that
  breaks at x1.25 fails a test.

## The body card

Before a bout, each built body runs a few simulated seconds on a headless bench. The result is its
**body card**: actual stroke times, top tip speed, reach, turn rate, the fall-line range and
recovery time. The mind reads the card, not the attribute multipliers. It is taken from the built
body, the same rule session 09 of physical contact set for `massKg` and the rest.

## The decision interface

`decide(view, beliefs, orders, card, budget)` is anytime: it returns its best answer within the
compute it is given. The budget is counted in reproducible work units, per the accounting in
`docs/analysis/2026-09-22-attributes-and-mind-schools.md`. Shared servos and skills run outside it.
Decisions run at 10 to 30 Hz depending on budget. Skills run every substep.

## Proof

**The duelist, ported.** Its state machine is rewritten as a decision layer over the skills. It
must match the frozen duelist within noise in the league at n = 384, on body release 2. It is
allowed to be better only where a skill fixed something (the human's edge), and those cells are
named. Porting an existing mind is the regression check; nobody's judgement is needed to see
whether it matches.

## Depends on

Session 07, so that skills are tuned on the bodies that remain.
