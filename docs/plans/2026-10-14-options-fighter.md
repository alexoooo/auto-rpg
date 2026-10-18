# The options fighter

A fighter whose fighting is decided top-down: one meta-controller reads the situation and chooses
what the body is doing (an option), the option carries it out through the skills, and reflexes
act under it. Stages 1 to 4 have landed: the situation, the option contract, the ranked and
valued meta-controllers, the whole option set, the reflex layer with cover, hand-built models for
every option, and the offers kept for the Arena's readout. `docs/architecture.md` describes it
(the options fighter, `src/core/mind/options/`); it is every humanoid's own mind. What is left is
to make it good, then to give it a player's config.

## 5. Make it good

This is the stage whose question is a measurement.

- Bouts against the game's fighters: `node research/empty-hand-league.mjs --entrants options
  --against classic,puncher,scrapper`, 384 bouts a pair or more, on fresh seeds and from both
  sides. The owner watches bouts in the Arena.
- Landed: the one-two (`src/core/skills/combination.ts`), two straight drives as one action, and
  the single punch thrown as a combination of one drive, each poised before it drives.
- Expected gaps, each an option, a model or a reflex: breaking a clinch, escaping after blocked
  blows, circling, holding aim through a blow.
- Each improvement lands on its own with its league reading before and after.
- The league measures a fighter on today's motor control, which the whole-body controller plan
  (`2026-10-17-general-controller.md`) is changing: the run and the stand-up (its stages 3 and 4)
  move the models' falls and pace, and its stage 5 moves the strikes. Gaps in what the fighter
  decides land now; tuning its weights and models to a league reading waits for those stages.
- Done when the options fighter leads the league and the owner's eye agrees.

## 6. The config

- From the finished fighter, list the decisions that are real trade-offs; candidates: the reward
  weights (obedience, caution, aggression), which options it has, its blows, its preferred
  distance, rising against rolling away against fighting from the ground, its reflexes.
- Each option, model, reflex and meta-controller declares its own fields as a `Part`; the editor
  draws the tree generically, with player labels, choices from lists, and body parts picked from
  the body. A test refuses a field that takes typed text.
- Presets rewritten in the new shape.
- The `fighter` kind's presets stay, as baselines the league measures against, until they stop
  being useful as such.

## Not in this plan

Learned models, lookahead, the decision rate or thinking time as an attribute (counted in
simulated budget, never wall-clock), the quadruped, party control, and the stand-up evaluator
(`research/stand-up-acceptance.mjs`), which nothing here touches.
