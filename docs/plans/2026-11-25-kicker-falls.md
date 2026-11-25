# The kicker's falls

**Begun 2026-11-25, by the owner's order**, relayed through the reviewing session, ahead of more
work on the low attack ([the skill recipe](../recipes/skill.md), the kick's findings: the low
kick is pickable under Stomp and the Warrior does not hold it).

## The goal, in the owner's words

On 2026-11-24: "Re the excessive falls after kicking, I do want that addressed, but only after
modelling and better low attack (stomp)". On 2026-11-25: "re the kicks, yeah reducing falls of the
kicker should be the main priority now they basically work".

So the kicker stays up after a kick, the push kick's and the low kick's alike (both are the kick's
executor, `src/skills/strikes/shared/kick.ts`), without losing what the kick lands, and the game's
Mind's knockouts within 60 s come back toward what they were before the kick.

## What is known before it starts

- **The kick costs the game's Mind bar 2 by its falls**: on the scorecard (warrior-drawn) the
  game's Mind knocks out within 60 s in 34.8 % (26.7 to 43.9) of its mirror bouts with 4.17 downs
  a bout, against 80.8 % and 0.96 for the same Mind without the kick (`research/runs/low/`);
  `option-lean`, the game's Mind since `fcb0b9401`, reads 34.7 % and 3.88.
- **The push kick's kicker is down after about two kicks in three**, a kick that misses as often
  as one that lands; the standing foot leaves the ground late in the drive as the leg is braked
  onto its goal. A softer brake (100 rad/s² against 365) fell after 57 % of kicks against 68 % but
  reached less and lost the match 0.347 (`a5fff57da`). The centre held 0.1 m ahead of the standing
  sole fell after 44 of 94 against 68 of 103 and lost 0.469 (the skill recipe's kick findings).
- **The low kick falls in 31.5 % of its trials at a foe laid down** (27.7 % for the stomp) and in
  41 % at one lying still; tuning its schedule at a foe that fights back read flat
  (`research/runs/low/`).
- **No catch spares these falls**: at the set-down's start the capture point is already past the
  standing heel by more than the longest catch reaches (the approaches' Travel).
- **Untried before it**: the stance on the standing leg bracing for the jolt of the braked leg, so
  the standing foot stays down through the brake. The whole-body solve already carries the drive's
  pushes, so the stance braces as far as its strength lets it; a faster pose (0.05 s) stalls the
  transfer, a slower one (0.3 s) fell in 21 of 32.

## Where it stands

- **Step 1, where the standing foot leaves the ground: read.** On the drill's middle rung every
  push kick throws the pelvis back as the hip drives and puts the standing hip on its extension
  stop, kicks that end down and kicks that stay up alike. Leaning forward in the drive cut the
  drill's falls from 10 of 32 to 2, and changed nothing in fights: the drill's falls are not the
  fights'. In fights 97 % of the game's Mind's kicks meet the foe, from 0.8 m centre to centre,
  and the kicker was down after 77.6 % of those that drove, in the set-down, a third after a blow
  (`research/runs/falls/`).
- **Step 2, the set-down: landed.** The set-down's step back to where the foot stood is gone; the
  stance's own standing catches the body, as in the recentre: down after 65.7 % of kicks, the
  scorecard's knockouts within 60 s 38.9 % against 34.7 %, level in the match. A step aimed at the
  capture point read flat; a re-chamber under the pose before the step fell more.
- **Next**: the falls left, read by the same probe (`bout-kicks.mjs`), each kick's kicker
  against whether the foe's blow came first, the trades the kick's findings name; then the low
  kick's falls on the same set-down; then a match and the scorecard for each change.

## After it

The owner's order: the low attack in the game's Mind (the low kick's own profile, so the Mind
prices it by measurement, and whether, its falls fewer, it takes bar 2 back), then the game's
Mind's knockouts within 60 s by the skills, the way up first (the owner, 2026-11-24: "it will take
more than just hyperparameter tuning, it wmight require significant skill iteration (which is
fine)"). The testbed's rest stays parked; the numbers plan is folded into
[the measured Mind](2026-11-25-measured-mind.md). Each gets its own plan when begun.

A decision still lands in the one step it is made in (the approaches' Minds,
`research/runs/lean-time/`): spreading it over the steps until the next one is the lever, not yet
asked for.
