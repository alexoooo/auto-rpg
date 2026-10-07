# Rising: the design, and the order it lands in

This is the design of what a body does once it is down, and the index of the plans that build it.
The [control-foundation phase](2026-10-04-control-foundation.md) governs the next work: recovery
uses its shared physical and motion contracts, while staged rising is one replaceable controller.
Each plan lands green by itself and is deleted as it lands; this file is deleted with the last of
them. Down as a reading of the body, sub-minds with lying still, and the bearing solve split from
the stance have landed; so has the staged riser, to the feet, with the lab's choice of it. It misses the battery's bar (`docs/reference/rising.md#staged`), so the rules wait on a
riser that meets it.

## Why

A body that falls does not get up. Its mind hands it to `lie`, and it lies where it fell
(`docs/reference/rising.md#lying`); driven on by its stance instead, it thrashes at its strength
and asks the ground for a wrench without bound (`#driven`). Each screen then copes alone: the
arena ends the bout and withdraws the assists (`Duel.judge`), the crypt disposes of the body's
mind (`DungeonRun.drop`), the lab does nothing.

## The design

1. **Down is a reading of the body, not a memory of a skill.** How high the centre of mass is
   over the body's lowest point, against the height its mind asks it to hold: its standing height,
   less whatever a stance goal lowers it by (`uprightness`, `src/core/control/ground.ts`). The
   body's spec states the bar (`BodySpec.down`), one module reads it and exports the predicate; the view carries it
   (`BodyView.down`); every fight, page and sub-mind reads that. It is true while the body is down
   and false once it is up again, so it can be the trigger of a rise; and a body that holds itself
   low on purpose is not down.
2. **A mind may hand its body to a sub-mind.** A sub-mind is a mind (`Mind.step` at the muscles)
   that also says when it wants the body (`SubMind.wants`), and is told when it has it and when it
   has it no longer (`begin`, `end`). A host keeps its sub-minds in rank order. Each control step
   the host reads its body (`HostMind.look`), so its view is of this step whoever drives; then the
   first sub-mind that wants the body steps in the host's place, or the host acts
   (`HostMind.act`). The host gives up what it had asked when a sub-mind takes the body
   (`HostMind.release`), and is told when the body is its own again (`HostMind.resume`): what it
   was in the middle of is over, and it goes on from the body as it is (`BodyView.resumed`, on
   which `driveBy` resumes every skill). Which mind has the body is
   one number in the host's state (`hosting`, `src/core/mind/sub-mind.ts`).
3. **What a mind is made of is its own config, plain data.** Each kind of mind declares its
   config type; `MindConfig` is their union, tagged by `kind`; a sub-mind slot holds a nested
   config (`SubMindConfig`, also tagged), not a name, so a sub-mind is configured where it is
   chosen. A fight passes a config through and never looks inside (`DuelRecipe.minds`), and holds
   what comes back by what every kind gives (`Minded`: the body, and the mind's memory); the
   switch that makes a mind of a config has a `never` default, so a kind without a maker does not
   compile. The union starts with one kind, the fighter the game has, and its config with one
   field, its sub-minds.
4. **Lying still is the first sub-mind.** `{ kind: "lie" }` wants the body while it is down and
   asks its muscles for nothing. With it in the fighter's default config the flail is gone from
   every screen, the stance is no longer asked for a ground it cannot have, and it is the control
   row of every table that scores a riser.
5. **A body bears on the ground through limbs, on patches.** The whole-body solve is a module
   that knows no foot (`src/core/control/bearing.ts`: limbs, each a chain of freedoms with a
   task at a point of its last segment, bearing on a patch or moving free), and the standing plan
   is its first user (`stance.ts`: where the centre of mass goes, when to step, the heel's roll).
   A patch is a sole or a point (`Patch`, `contact-wrench.ts`), and a limb may hang from
   somewhere other than the root (`Limb.stem`).
6. **A rise is one riser, and the first is staged.** `{ kind: "staged-rise" }` is a sub-mind that
   wants the body from the moment it is down until it stands. It lies slack until still, reads how
   it lies, and plays a recipe that is data: the limbs the body may bear on, and stages, each
   either a pose its muscles are driven to or a bearing (which limbs bear, where the centre of
   mass goes over them, how the trunk is turned) solved by the bearing solve. Each stage starts
   from the body as measured; a stage that runs out of time lets go and the rise begins again. A
   hand bears where its capsule touches, a shin from its knee to where its foot props it.
7. **Every riser is scored on one battery of falls** (`research/core-rise-trials.mjs`): shoves
   from sixteen ways, falls out of arena bouts, each model, each loadout; the rate risen within
   the watch and the time taken. A searched riser (the same player, a recipe found by search) and
   a learned one (a policy at the muscles) are later rows of the same table and later members of
   `SubMindConfig`.
8. **A fall takes nobody out.** Once a riser passes the battery, a body is out of its fight when
   its pool ends and not before; it may be struck while it is down. A particular context may have
   a rule of its own that overrides this, and each fight has one place such a rule goes (plan 05).

## The owner's choices, as answered on 2026-10-01

1. **May a body be struck while it is down?** Yes. Nothing is ruled: a fighter that knocks its
   foe down may walk up and strike it as it tries to rise.
2. **Is a body that stays down counted out?** No: falling does not take a body out, unless a
   particular context has some other rule that overrides this. No such rule exists today; a bout
   with a body that cannot rise runs to its cap and is judged on the bars.

## How it extends

The set is written so that what comes next is added beside it and not through it.

| Added later | Where it goes | What it leaves alone |
|---|---|---|
| **Archery**: a bow, an arrow in flight | A bow is what a hand holds, and shooting is a skill's work: the intent already says "attack this point with whatever the hand holds" (`Attack`), and a skill beside the strike joins the skills (`createSkills`). An arrow's hit is a blow under the rulebook. How a fighter with a bow conducts itself is its tactics, a field of `FighterMindConfig` once there are two to choose between. | Sub-minds, the riser's player, who is out. A skill joins the one list the skills resume (`Skills.resume`), so a body knocked down in the middle of a draw goes on from where it is as one mid-strike does. The battery gains a loadout's row; a hand that cannot bear with a bow in it gets a recipe that does not bear on it. |
| **A reflex**: a dodge, a brace | A `SubMindConfig` kind, its case in `subMind`, a place in a mind's `subs`. What it reacts to must be sensed: `Senses` carries bodies today, not arrows. | `hosting`, the other sub-minds. |
| **A reflex of part of a body**: the arms flinch, the legs walk on | `SubMind` gains what it claims; `hosting` lets the host act and the sub-mind write its own channels after it, as a push does (the stance already carries freedoms held at a torque, `heldFreedoms`). | Every sub-mind that claims the whole body, which is all of them here. |
| **A posture low on purpose**: a crouch, a kneel, a roll | The skill asks its height (`Intent.lower`, the stance goal's), and `down` is read against the height asked. | `lie` and the riser: they read `view.down`. |
| **Another riser** | Searched: a `Recipe` found by search; `StagedRiseConfig` gains which recipe. Learned: a `SubMindConfig` kind. | The battery scores it as a row (`--mind`); nothing else knows. |
| **Another body**: four legs, a tail, one arm | A `Recipe`: its limbs and its stages are data, checked against the spec (`stageFaults`). Standing on more than two feet is the stance's own work first (`footStatesOf` reads a left foot and a right). | The player, the bearing solve (limbs and patches are not a human's), `uprightness`. |
| **Another kind of mind**: learned at the muscles | A `MindConfig` kind, its case in `createMind`, a member of `Minded`. | The fights: they hold a `Minded` and read its body and its memory. |
| **A context's rule that takes a body out**: a count, a ring's edge, a pit | A line in the fight's one function that says why a side is out (`Duel.out`, a crypt actor's `alive`), and its ending a member of that fight's endings. | Minds and risers: they know no rule. |
| **A rule about a body that is down**: spare it | `BodySense` carries `down`, as old as the rest of what is sensed, and the tactics read it. | The rules of who is out. |

One cost is known and not paid here: the readings a fight takes of a body (`view.down`, the
head, the centre of mass) are made by the command layers, so a kind of mind that has none must
first have those readings split from them.

## What exists today, and what changes

| Today | After |
|---|---|
| the crypt disposes of a fallen body's mind (`DungeonRun.drop`) | `drop` is for a body whose pool has ended; a fall is the mind's own business |
| a fall ends a bout and takes a crypt body out | a body rises; it is out when its pool ends |

## The plans

| # | Plan | Lands | Needs | Eye gate |
|---|---|---|---|---|
| 05 | [rules](2026-10-01-rising-05-rules.md) | the riser in the default config; a fall no longer takes a body out | a riser that meets the battery's bar | the owner watches a bout with a fall in it, and a crypt fight |

The staged riser is under its bar: it stands the Warrior with nothing in its hands from three
falls of four, and not the club, the Rogue or the skeleton (`docs/reference/rising.md#staged`,
`#where-the-rise-stops`). So bodies
go on lying still in a fight, and 05 does not land until a riser meets the bar. The eye gate
left of the riser: the owner watches lab bodies try to get up (the lab's Stance, "Down" set to
"Rises", shoved from the front, the back and a side, each human).

## Prototype readings

Node stand (`tests/harness/core-stand.mjs`), Rapier, 120 Hz, unarmed, no assist. The body, held
stiff, is toppled forward by an impulse of 1.2 N s a kilogram at the upper trunk, left limp 1.5 s,
then every freedom is driven toward a stage's angles at full activation (a speed of the error over
0.2 s, at most 3 rad/s) through `embody`, with no balance of any kind.

| | centre of mass, m | pelvis, m | head, m |
|---|---|---|---|
| Warrior standing | 1.01 | 1.09 | 1.52 |
| lying, limp | 0.14 | 0.16 | 0.12 |
| knees drawn under (hips 2.0, knees 2.4 rad) | 0.26 | 0.37 | 0.18 |
| arms straightened ahead | 0.33 | 0.41 | 0.45 |
| hips opened to 0.9 rad, the arms still propping | 0.33 | 0.40 | 0.42 |
| the arms taken away, to sit upright on the heels | 0.19 | 0.24 | 0.09 |
| Rogue standing | 0.91 | 1.00 | 1.37 |
| lying, limp | 0.12 | 0.15 | 0.09 |
| knees drawn under | 0.23 | 0.34 | 0.08 |
| arms straightened ahead | 0.25 | 0.37 | 0.19 |

- **The legs lift the pelvis off the ground on poses alone**, both humans. That is the first
  stages.
- **Poses alone go no further.** With the weight ahead of the shins, taking the arms away lays the
  body flat again (the Rogue's goes down as its hips open): from here on something must put the
  centre of mass over what bears, which is the bearing solve's work (design 5).
- **The arms do not press the chest up.** Asked to straighten under a prone Warrior, the shoulders
  stop 1.1 rad short and the head stays at 0.07 m. The route goes through the knees, with the arms
  straightened unloaded and used as props.
- **On its back the same poses raise nothing** (pelvis 0.12 to 0.16 m): a body on its back or its
  side rolls to its front first, and that stage is untried.

## Not in this set

- A searched or a learned riser; a dodge or any other reflex; a hand-over of part of a body;
  a second kind of mind; any context's rule that takes a body out. Each has its place in How it
  extends.
- The lab's own options (`ActorOptions.allows`, `LAB_MINDS`) and the experiments' overrides (the
  servo's time constant, a stance tuning, a repertoire) stay where they are: none is a fight's
  choice today.
- A parameter of an arena link that names a mind: `DuelRecipe.minds` is an experiment's and a
  table's. The lab's address has one key for what its body does when down (`down`).
- A crouch for the stance, and what a limp or held body costs a step.
