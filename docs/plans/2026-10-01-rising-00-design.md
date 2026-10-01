# Rising: the design, and the order it lands in

This is the design of what a body does once it is down, and the index of the five plans that build
it, 01 to 05. Each plan lands green by itself and is deleted as it lands; this file is deleted with
the last of them.

## Why

A body that falls does not get up, and what it does instead is wrong on every screen. `fallen` is
a flag (`LegsMemory.fallen`, `src/core/skills/locomotion.ts`) that nothing in the core acts on: the
skills go on handing the stance a standing goal, the stance goes on asking the soles for a wrench
no lying body's soles can give (over 1e50 N within 3 s, `docs/roadmap.md`), and the legs thrash at
their strength. Each screen then copes alone: the arena ends the bout and withdraws the assists
(`Duel.judge`), the crypt disposes of the body's mind (`DungeonRun.drop`), the lab does nothing.

## The design

1. **Down is a reading of the body, not a memory of a skill.** How high the centre of mass is
   over the body's lowest point, against that height in the reference pose (`uprightness`,
   `src/core/control/ground.ts`). One module owns the bar (`FALLEN`) and exports the predicate;
   the view carries it (`BodyView.down`); every fight and page reads that. It is true while the
   body is down and false once it is up again, so it can be the trigger of a rise.
2. **A mind may hand its body to a sub-mind.** A sub-mind is a mind (`Mind.step` at the muscles)
   that also says when it wants the body (`SubMind.wants`), and is told when it has it and when it
   has it no longer (`begin`, `end`). A host keeps its sub-minds in rank order; each control step
   the first that wants the body steps in the host's place (`hosting`,
   `src/core/mind/sub-mind.ts`). The host goes on reading its body (`HostMind.look`), so its view
   is of this step whoever drives, and it is told when the body is its own again
   (`HostMind.resume`): what it was in the middle of is over, and it goes on from the body as it
   is. The hand-over is of the whole body; which mind has it is one number in the host's state.
3. **What a mind is made of is its own config, plain data.** Each kind of mind declares its
   config type; `MindConfig` is their union, tagged by `kind`; a sub-mind slot holds a nested
   config (`SubMindConfig`, also tagged), not a name, so a sub-mind is configured where it is
   chosen. A fight passes a config through and never looks inside (`DuelRecipe.minds`); the
   switch that makes a mind of a config has a `never` default, so a kind without a maker does not
   compile. The union starts with one kind, the fighter the game has, and its config with one
   field, its sub-minds.
4. **Lying still is the first sub-mind.** `{ kind: "lie" }` wants the body while it is down and
   asks its muscles for nothing. With it in the fighter's default config the flail is gone from
   every screen, the stance is no longer asked for a ground it cannot have, and it is the control
   row of every table that scores a riser.
5. **A body bears on the ground through limbs, on patches.** The stance's whole-body solve
   (`carry` and `bear`, `src/core/control/stance-dynamics.ts`) is written for two feet. It is
   split into the solve (`src/core/control/bearing.ts`: limbs, each a chain of freedoms with a
   task at a point of its last segment, bearing on a patch or moving free) and the standing plan
   that uses it (`stance.ts`: where the centre of mass goes, when to step, the heel's roll). The
   split changes no number: the arena's trace digest and the fingerprint are the gate.
6. **A rise is one riser, and the first is staged.** `{ kind: "staged-rise" }` is a sub-mind that
   wants the body from the moment it is down until it stands. It lies slack until still, reads how
   it lies, and plays stages that are data: a stage is either a pose its muscles are driven to, or
   a bearing (which limbs bear, on which patches, where the centre of mass goes over them, how the
   trunk is turned) solved by the bearing solve. Each stage starts from the body as measured; a
   stage that runs out of time lets go and the rise begins again. A hand or a knee bears on a
   point, a sole on its rectangle.
7. **Every riser is scored on one battery of falls** (`research/core-rise-trials.mjs`): shoves
   from sixteen ways, falls out of arena bouts, each model, armed and not; the rate risen within
   the watch and the time taken. A searched riser (the same player, recipes found by search) and a
   learned one (a policy at the muscles) are later rows of the same table and later members of
   `SubMindConfig`.
8. **The rules follow last.** Once a riser passes the battery, a fall no longer takes a body out
   of a fight: plan 05, which waits on the owner's two choices below.

## What exists today, and what changes

| Today | After |
|---|---|
| `SkillReport.fallen`, sticky, set inside the legs' goal | `BodyView.down`, read each step from the body (`uprightness`) |
| a fallen body's stance is asked to stand, without bound | the body's mind hands it to a sub-mind; the stance is asked nothing |
| the crypt disposes of a fallen body's mind (`DungeonRun.drop`) | `drop` is for a body whose pool has ended; a fall is the mind's own business |
| `createBody` then `driveBy`, in three screens | `createMind(built, world, config, wiring)` in the fights; the lab's actor, whose tactics are a scenario's, takes its sub-minds from a config (`subMindsOf`) |
| no mind is named by a recipe | `DuelRecipe.minds`, a `MindConfig` a side |
| `stance-dynamics.ts`: two legs, two soles | `bearing.ts`: limbs and patches; the stance is its first user |
| a fall ends a bout and takes a crypt body out | a body rises; it is out when its pool ends, or (the owner's choice) counted out |

## The plans

| # | Plan | Lands | Needs | Eye gate |
|---|---|---|---|---|
| 01 | [down](2026-10-01-rising-01-down.md) | `uprightness`, `BodyView.down` in place of `fallen`; the fall battery and today's row | | |
| 02 | [sub-minds](2026-10-01-rising-02-sub-minds.md) | `SubMind`, `hosting`, `MindConfig`, `createMind`, `lie`; fallen bodies lie still | 01 | the owner shoves a lab body over, and watches a bout end by a fall |
| 03 | [bearing](2026-10-01-rising-03-bearing.md) | `bearing.ts` split out of the stance, no number changed | | |
| 04 | [riser](2026-10-01-rising-04-riser.md) | point patches, the staged riser, its row on the battery, the lab's choice of riser | 02, 03 | the owner watches lab bodies get up |
| 05 | [rules](2026-10-01-rising-05-rules.md) | the riser in the default config; a fall no longer takes a body out | 04, and the owner's choices | the owner watches a bout with a fall in it, and a crypt fight |

03 touches only the stance and can land at any time. 04 is the open-ended one: its structure is
fixed here, its stages' numbers are found on the battery. If 04's gate is missed, 01 to 03 stand
as they are: bodies lie still, and 05 does not land.

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

## The owner's choices

Plan 05 waits on these; 01 to 04 do not.

1. **May a body be struck while it is down?**
   - *Struck*: nothing new is ruled. A fighter that knocks its foe down walks up and clubs it as it
     tries to rise; a fall is dangerous, and most bouts will still turn on one.
   - *Spared*: a fighter holds its blow and stands off until the foe is up (the senses say who is
     down). A fall costs seconds, not the bout.
2. **Is a body that stays down counted out?**
   - *Counted*: down for a count running (10 s is the proposal), it is out, as a fall is today. A
     bout with a body that cannot rise ends at the count.
   - *Not counted*: only an ended pool takes a body out; such a bout runs to its cap (120 s) and
     is judged on the bars.

## Not in this set

- A searched or a learned riser; a dodge or any reflex that needs more than the senses carry
  (they carry bodies, not projectiles).
- A hand-over of part of a body (a sub-mind taking the arms while the host keeps the legs).
- A second kind of mind. `createMind` returns what the fighter's maker returns (`Fighter`); what a
  fight may read of a mind of any kind is settled when a second kind exists.
- The lab's own options (`ActorOptions.allows`, `LAB_MINDS`) and the experiments' overrides (the
  servo's time constant, a stance tuning, a repertoire) stay where they are: none is a fight's
  choice today.
- A parameter of an arena link that names a mind: `DuelRecipe.minds` is an experiment's and a
  table's. The lab's address gains one key, what its body does when down (plan 04).
- A crouch for the stance, and what a limp or held body costs a step.
