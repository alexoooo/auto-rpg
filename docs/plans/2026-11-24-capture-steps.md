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

- **The idle footing does not cost balance in a fight.** In the Option Mind's (`option`, not
  the Warrior's own `option-truer`; to be read again on his) 144 warrior-drawn
  bouts (394 side-minutes) it placed the feet 20 times, once in about 20 minutes standing, and
  no fall of 768 began within 2 s of a placement (`research/runs/capture/idle-falls.mjs`, a
  worktree with `idleGoal` hooked).
- **Most falls in those bouts take no blow.** 536 of the 768 had no life lost in the 2 s before.
  By what the Mind was doing 0.3 s before: a back step 270, a way up 183, a strike 135, holding
  107; by the stance's phase, standing 383 and stepping 372. The "back step" there is a kick's
  set-down, which the Mind reads as one.
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
   own steps and where they land. *Read*, on the Warrior's own Mind with the push kick (144
   warrior-drawn bouts, `research/runs/capture/falls-by-action-truer.jsonl`): 661 falls in 326
   side-minutes, 329 with no blow in the 2 s before; of those, a kick in the 1.5 s before 178 (its
   set-down last seen in 136), a way up 91, a strike or holding then a brace 55, a back step 5.
   The Option Mind with its kick taken out falls 75 times without a blow in 144 bouts, against 536
   with it (`falls-by-action-no-kick.jsonl`). Traced (`trace-push-set-down.txt`): at the drive's end
   the kicking foot is in the air about 0.46 m ahead and the body goes back at about 0.6 m/s; the
   only foot that can catch it is that one, swung from ahead to behind while the capture point
   runs on, each re-aim landing shorter as the hips sink (0.94 to 0.65 m). The catch to make is
   the one from a foot far forward, the way up's falls next. Then read by the set-down's start
   (`set-down-catch.jsonl`, 101 set-downs): the capture point's distance from the standing foot
   then tells the fall (under 0.2 m 9 of 28 down, over 0.5 m 21 of 25), and the swing a catch
   would need (0.9 m) is past the longest step (0.8 of the leg): the fall is set before the catch
   begins, by the drive's recoil carrying the centre past the standing heel. The kick's answer is
   its own: where it holds the centre over the standing foot (`ahead`, searched). The way up's 91
   are its rises failing (staged-down 50, front-sit-back 26), the way up's own work (bar 2).
2. **One standing rule.** Whether the three footings and the catch can be one rule of the stance,
   and the idle footing's place in it, read by the fingerprint and the falls. *Read*: the idle
   footing is the square carriage's (`width: null`, the feet where they stand) footing at the
   spacing the body is built with (`standingFooting`), placed about the sole that stays after 1 s
   still and stepped only when off by a quarter sole or 0.2 rad; a carriage with a width sets its
   footing about the centre as soon as the body is still and holds it (`footingOf`, `state.stood`);
   `settleStep` puts a walk's last foot the built width across from the other at once. One rule:
   each carriage names its footing (square's the built one), placed about the sole that stays,
   stepped to once still and off by those tolerances; the walk's end then needs no step of its
   own. The idle option and the arbiter's `idleSettle` become the carriage's footing held or not.
3. **Capture steps.** The catch made to stop what the traces show, read by the falls in the
   game's Mind's bouts and on the kick's sparring-feet falls, and a match of the game's Mind
   against itself before the change.
4. **The kick again**: its set-down on the better catch, and s10's aimed leg searched again on it.

## After it

The order, the owner's, 2026-11-24: modelling the foe, then striking a foe who is down, then the
game's Mind's knockouts within 60 s (80.1 % against the bar's 90 %) if they are still short.
Numbers and the testbed's rest stay parked. Each gets its own plan when begun.

### Striking a foe who is down

The owner, 2026-11-24, on a fight with the kick: "i do like that the rate of falls increases,
because it sets us up to work on the ability to hit an opponent that's not upright (the current
stomp doesn't really work but we needed more falls to be able to work on that, and i think the new
kick does get us there)". On its place: "i think we can do that after the modelling. the modelling
will make thinking cheaper which will speed up the rest of the work that follows."

### The knockouts within 60 s, by the skills

The owner, 2026-11-24: "for the pace bar, i think we might need to iterate on the stand-up skills
and maybe other skills to get there, because right now they are spending most of their time
tangled on the ground. in other words, i think it will take more than just hyperparameter tuning,
it wmight require significant skill iteration (which is fine)." So the bar is reached by iterating
the skills, the way up first, not by tuning the Mind's settings. The readings so far agree: of the
536 falls without a blow above, 183 came during a way up, and the way-up cells replayed for the man
read worse on shoved falls (the skill recipe's way-up section).

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
