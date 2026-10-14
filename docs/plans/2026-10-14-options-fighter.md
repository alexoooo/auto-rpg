# The options fighter

A fighter whose fighting is decided top-down, as a person decides it: one meta-controller reads the
situation and chooses what the body is doing (an **option**), the option carries it out through the
skills, and reflexes act under it. It is built as a new kind of mind beside the `fighter` kind, made
good in the Arena first, and only then given a player's config, pulled out of what it turned out to
be made of.

## Why

The `fighter` kind does not decide; its pieces claim the body. Behaviours (`actionTactics`) take
channels in rank order, each on its own test, and sub-minds (`hosting`) take the whole body when
each says it wants it. Nothing holds an intention across them: a body can roll away from a foe it
was beating, or stand up into a blow. The config was laid out before the fighter was good: six of
its nineteen behaviours and sub-minds (evade, flee, close-in, keep-distance, get-away,
ground-fight) are in no preset, and what a developed fighter had (the clinch break, the escape after
blocked blows, aim held through a blow) had no place in the generic list and was lost.

## Terms

- **Skill**: muscle memory. A gait, the guard's posture, an executor's motion, a rise technique,
  the support fold. Unchanged by this plan.
- **Option**: what the body is doing now, run over time: when it can start, what it asks of the
  skills each step, when it ends and whether it may be interrupted, and the body it needs. An
  option may choose among options of its own (a combination). An action executor is the bottom
  option: its `readiness`, `needs`, phases and endings are this contract already.
- **Option model**: what running an option from here is expected to bring: how long, damage dealt,
  damage taken, progress on orders, and whether it ends standing. An option may have several.
- **Meta-controller**: chooses among the options available, on a fixed interval and on events.
  **Ranked** gives each a fixed value; **valued** weighs each option's predicted terms.
- **Reflex**: a response with no weighing, within reaction time, on a few limbs, for a short time:
  covering a blow, flinching, bracing a fall. The balance reflexes (the catch step) stay inside the
  stance, whose feet they move.

## Where it lives

- A controller of its own in `CONTROLLERS` (`src/core/mind/controllers.ts`), kind `options` as a
  working name, its code under `src/core/mind/options/`. It is every humanoid's own mind, in the
  Arena and the Crypt (the owner's choice, 2026-10-14).
- It reuses what a fighter is built from: the skill set (`skillSet`), the executors and their
  actions, the gaits, the guard, the support fold, the threat reader, the ground techniques, and
  the down sub-minds (stand-up, get-away, ground-fight, lie).
- The meta-controller is the host (`HostMind`). The host looks before any sub-mind is asked
  (`hosting`), so a choice made in `look` is read in the same step: a down option's sub-mind wants
  the body when it is available and chosen, and its `holds` is the option's "not now".
- Its memory is one `state` object; a bout under it forks (`tests/arena-fork.test.mjs`). Its
  arithmetic is the core's (`src/core/math/real.ts`).

## Stages

Each stage lands in small commits, gated by `npm run check`, `npm test`, and `npm run build` where
the Arena's picker changes. New tests are fast (under about 10 s) or go in `tests/slow.json`.

### 1. One decision, three options

- **The situation**, read once per decision: the body (standing, down and how, in a clinch, what
  its actions are doing), the focus and the other foes (distance, down, striking), the threat, and
  the orders.
- **The option contract**, and three options:
  - **Strike** (action, limb, region): walks to the blow's window and throws it, one option where
    today approach and attack are two behaviours.
  - **Set distance** (how far, facing): advance, retreat or hold.
  - **Recover**: the stand-up sub-mind, by its techniques.
- **The ranked meta-controller**: decides every 0.2 s and when an option ends, the body goes down
  or gets up, a threat appears or the orders change; the running option keeps a small bonus.
  Orders are obeyed as today, first, until stage 4.
- Cover runs under every standing option as today's `cover` behaviour does, until stage 3.
- Registered with a preset in the Arena's picker.
- Tests: the meta-controller on built situations, no physics (chooses, keeps, gives way); a short
  Arena bout of it against Classic that wounds both sides with no assist.
- `docs/architecture.md` gains the options mind.

### 2. The whole option set

- **Hold at the edge** (band, patience), **Strike a low foe** (the support fold), **Evade** (step
  out of the line), **Roll away** (get-away), **Fight from the ground** (ground-fight), **Lie
  still** (a body with no rise).
- Close-in, keep-distance, break-clinch and flee are Set distance with a goal.
- Walls and fallen bodies are constraints on every walk an option asks for, not options.
- Down options wrap the sub-minds; what each tested in `wants` becomes its availability.
- Tests: down choices on built situations (a foe close: roll away or get up, by value).

### 3. Reflexes

- **The reflex contract**: a trigger read from the senses, the limbs it may take, a short patch on
  the command, and a longest duration. Reflexes run every control step, not at the decision rate.
- Cover moves in as the first. A reflex takes free limbs; one that takes a limb a strike holds ends
  that strike as interrupted, which the skill set learns to do.
- Tests: a reflex's trigger and hand-back on built situations.

### 4. Values

- **Reward terms**: damage dealt, damage taken (growing faster than the hit, so a jab costs little
  and a heavy blow a lot), progress on orders (toward a destination or along a heading, and damage
  to an ordered foe), and falling. Their weights are plain config with defaults.
- **Hand-built models** for every option: how long, and each term. Damage dealt from the ledger's
  landed share of an action times its blow's measured energy; damage taken from the threat, the
  foe's reach (`rangeOf`) and the rules' shares and pool (`energyShares`, `createPool`), read
  through the rules' own exports; progress from the pace and the time; falling as measured of each
  option.
- **Models are parts**: an option lists its models by kind, and the meta-controller's config picks
  which it reads, so a learned or another hand-built model is added beside, later.
- **The valued meta-controller**: the highest weighted total, the running option's bonus kept.
  Orders stop being a rank. The ranked kind stays, for comparison.
- **Its reasons**: each decision's offers and their terms are kept in state, for the Arena's status
  display.
- Test: walking to a destination, a weak threat is walked through, a strong one evaded, and the
  walk resumed.

### 5. Make it good

This is the stage whose question is a measurement.

- Bouts against the game's fighters: `node research/empty-hand-league.mjs --entrants options
  --against classic,puncher,scrapper`, 384 bouts a pair or more, on fresh seeds and from both
  sides. The owner watches bouts in the Arena.
- Expected gaps, each an option, a model or a reflex: breaking a clinch, escaping after blocked
  blows, circling, holding aim through a blow.
- Each improvement lands on its own with its league reading before and after.
- Done when the options fighter leads the league and the owner's eye agrees.

### 6. The config

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
(`stand-up-acceptance-v1`), which nothing here touches.
