# Capture steps

**Begun 2026-11-24, by the owner's order**, relayed through the reviewing session, after the
kick ([the skill recipe](../recipes/skill.md#3-a-native-controller-that-succeeds-on-some-cases)).

## The goal, in the owner's words

On the order, 2026-11-24: "Finish the kick first, then do capture steps". On the idle footing,
the change that brings the feet back in after standing up: "at one point we added a change to
bring the feet back after standing up (the characters would end standing with their legs wide),
and I'm not sure it was done in a clean and general way -- I hope it's not contributing to lack
of balance." On the order after it: "Ok that makes sense".

So capture steps are steps that catch a body where its balance is going, read by the falls they
spare in the game's bouts. They come with one standing rule for where a standing body's feet go,
in the simplest and most general form the stance can hold.

## What is known before it starts

- **The idle footing does not cost balance in a fight.** In the game's Mind's 144 warrior-drawn
  bouts (394 side-minutes) it placed the feet 20 times, once in about 20 minutes standing, and
  no fall of 768 began within 2 s of a placement (`research/runs/capture/idle-falls.mjs`, a
  worktree with `idleGoal` hooked).
- **Most falls in those bouts take no blow.** 536 of the 768 had no life lost in the 2 s before.
  By what the Mind was doing 0.3 s before: a back step 270, a way up 183, a strike 135, holding
  107; by the stance's phase, standing 383 and stepping 372.
- **The kick's falls are the stance's catch failing.** On sparring-feet its set-down is the
  largest share of the kicker's falls (82 of 131 in 392 trials): the drive turns the pelvis about
  40°, and as the leg comes back the standing foot leaves the ground and the body runs backward,
  the stance's own catch steps not stopping it. Its aimed-leg search (s10, kept in
  `research/runs/kick/drill/`) lands on the mark more often and falls in half its trials, in the
  set-down: a better catch is read on it again.
- **Three places pick where standing feet go**: a walk's end back to rest width
  (`settleStep`, `src/control/stance/gait.ts`), a carriage's footing (`footingOf`) and the idle
  footing (`idleGoal`, `src/skills/locomotion/shared/locomotion.ts`, with its `idleFooting` option
  and the arbiter's `idleSettle` flag). The stance's own catch steps are `ownStep` in `gait.ts`.

## Steps

1. **Where the falls begin.** Trace the falls without a blow by the doing that precedes them, the
   back step first, as the kick's were traced: the stance's capture point against its feet, its
   own steps and where they land.
2. **One standing rule.** Whether the three footings and the catch can be one rule of the stance,
   and the idle footing's place in it, read by the fingerprint and the falls.
3. **Capture steps.** The catch made to stop what the traces show, read by the falls in the
   game's Mind's bouts and on the kick's sparring-feet falls, and a match of the game's Mind
   against itself before the change.
4. **The kick again**: its set-down on the better catch, and s10's aimed leg searched again on it.

## After it

The order, the owner's, 2026-11-24: then modelling the foe, then the game's Mind's knockouts
within 60 s (80.1 % against the bar's 90 %) if they are still short. Numbers and the testbed's rest
stay parked. Each gets its own plan when begun.

### Modelling the foe

The owner, 2026-11-23: "i do want opponent modelling, but also from what i understand, what we
already have it pretty slow. how could we approach this in a way that's scalable?" On the order:
"after the kick is fine". The approach put to the owner:

- Predict the foe from what a Mind can see: its motion over the next second, and whether it
  strikes. Learn it from recorded bouts with the boosted-trees machinery, not from the foe's
  options, which a Mind cannot see by design (`sensedSpec` drops skills).
- First, read how well it predicts against carrying the foe on its velocity (the tree chooser's
  "Foe keeps moving", `carry`) as the baseline.
- Then use it inside the one search, as the foe's expected motion (the cost of carry) or as one
  sampled response per run (the search's budget unchanged), so the cost does not grow with the
  model's richness.
