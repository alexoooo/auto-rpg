# Roadmap

Where the project is going, the order of the work in flight, what waits on the owner, and what is
open, by layer. What is built is in the [architecture](architecture.md); findings and figures are
in their records under `reference/`, read again before anything is compared against them.

## Where the project is going

A general, clean and simple testbed for AI-controlled bodies, built into a game: physically
simulated bodies, driven by muscles, fight in an Arena and a generated Crypt. The project moves
forward by advancing every layer (the framework, motor control, the skills, tactics and the
command of teams), and any implementation may advance a layer; which one is a default follows
from its readings. Each layer depends only on those below it, and a mind uses as much of the stack
as it needs ([architecture](architecture.md#the-layers)).

- **Skills and tactics.** A body has an array of skills, and tactics choose among them as the
  fight goes. Both come in many flavours; the more general and robust, the better: a body that is
  resized or made stronger is measured again, not searched again.
- **Competencies first**, proved one by one without assistance: standing, guarding, punching,
  walking, standing up, kicking and running.
- **Items next**, each with its own weight and shape: weapons, shields, two-handed items, ranged
  weapons and armour. Every weapon keeps its ratio to the club; edged and pointed ones bring the
  rulebook's other mechanisms into play.
- **Assistance as attributes.** Every movement can be done without it. Stability is built
  (`Assist`); movement, standing up and attack and defence (a "divine wind") are planned. Each is
  metered against a ceiling the character's attributes set.
- **Attributes**: size, weight, strength, muscle speed and the assists' ceilings, so that
  characters differ and skills are tested across them.
- **Later**, other ideas on the same bodies, such as an end-to-end learned controller on the
  muscles, with the hand-built skills as its baseline
  ([control foundation](reference/control-foundation.md)).
- **The game**: the Arena, a bout to a verdict that a person watches or takes a side in; a Ladder
  of bouts, to be designed; the Crypt, a party commanded by a person or an AI against AI enemies.
  A web app: any browser, with mouse and keyboard or by touch.
- **Bodies**: many morphologies, each a sourced spec. The human is the reference; the skeleton and
  a reptile quadruped are on the core.

## Order

The plans in flight, and what comes next across them. Each plan names its own dependencies.

| Plan | What it builds |
|---|---|
| [Ratings](plans/2026-10-21-ratings.md) | One format for every evaluation, kept records, the paired report, the Ratings screen |
| [Mind data](plans/2026-10-21-mind-data.md) | Mind data loaded per use, then packed |
| [Movement and command](plans/2026-10-21-movement-and-command.md) | One movement pipeline; Commanders over teams |
| [Component registration](plans/2026-10-21-component-registration.md) | Implementations added by their own files and one line |

1. **Now, in parallel:** Movement B0 to B2; Ratings steps 7 and 8; component registration's
   stage 1 (locomotion); and
   the open work below, each change read by the paired report, kept with `--write`.
2. **When each one's condition holds:**
   - Ratings step 6 (the cap) once recorded reports' bar series decide it;
   - Movement B3 (crowd motion) and B4 (AI Commanders), once B1 has landed;
   - Ratings steps 10 (skills' batteries) and 13 (falls) as ordinary work; step 9 when a question
     about an item, a character or an attribute is asked; step 12 (case identity by code) when
     the first built-in mind or skill has a folder of its own, or entrants are most of the field;
     step 11 (the sparse league) only when the owner asks, after step 12; step 14 (run live) once
     the Ratings screen is in use and a live run would save a trip to the command line;
   - Mind data step 2 (packed format), then 3 (precision per kind), when the next action that
     carries data arrives; step 4 when the owner asks;
   - component registration's stages 2 to 4 at any time, stage 5 (the Commander) with Movement B0.

## Waiting on the owner

**Choices**, each landed at its default:

- Each character's balance, a per cent of its weight; every character has 0 %. At 25 % for both
  sides, 19 of 99 bouts end by a fall where 80 do at none ([assist](reference/assist.md)).
- Haste's range and each character's value ([assist](reference/assist.md#haste)).
- Where a fighter aims: the head, or the part a blow pays most on
  ([blows](reference/blows.md#aim)); and whether a bare fist strikes at a head at all
  ([wounds](reference/wounds.md#shares)).
- What the bodies hold now that a hit point is 100 J of blunt blow
  ([wounds](reference/wounds.md#unit)); whether a blunt blow takes a part off; what two bodies
  that walk into each other cost ([bouts](reference/bouts.md#searched-blows)); the stiffness of
  the parts no paper was read for ([wounds](reference/wounds.md#sensitivity)).
- The skeleton's placeholder numbers (`skeleton-placeholders` in `SOURCES`); whether its sides
  and back are worth a search or a change to the body; whether the bodies take the ankle's tendon
  ([locomotion](reference/locomotion.md)).
- The Crypt's set values: `SET_UPON`, `AIM_COSINE`, `LEVEL.clearance`, `FOOTPRINT_METRES`
  ([play](reference/play.md)); how the dead disappear in time.
- The look's and the sound's values: torch density, which floor and wall textures ship,
  `MIX.swish`, `MIX.impact`, `CUE.joules` ([look](reference/look.md)); an optional skeleton
  costume, after seeing the bones in play.

**To watch:**

- The Duellist on both levels; accepted, it becomes the reference
  ([sword-and-buckler](reference/sword-and-buckler.md)).
- A bout fought with orders (`?play=arena&matchup=workshop-fighter,workshop-rogue&you=left`);
  bouts with balance against none (`&balance=25`, `&balance=100`, `&balance=25,0`); an oracle's
  bout ([oracle](reference/oracle.md)).
- The five Locomotion courses at Max (`?play=lab`), Back and forth at a long distance for the run,
  the Crypt's long walks, the Warrior's run, and Move's rules and gaits in the mind editor.
- Standing up in the Lab, in Arena bouts and in the Crypt, and whether the rise looks human.
- The skeleton's look in play.
- Movement's Part A (holding W, clicking to go) and the mouse controls, as they land.

## Open, by layer

### Framework

- Component registration ([its plan](plans/2026-10-21-component-registration.md)), and one notion
  of a task: an evaluation plays a core task (`src/core/tasks/`), the Lab shows it, and the
  Ratings screen opens it ([Ratings](plans/2026-10-21-ratings.md)).
- Participant contracts, each extended with its first client: every accepted grip request and
  external input on the tape; exact physical replay apart from live continuation for a
  nondeterministic policy; a slower policy's cadence, held actions and work allowance.
- Thinking that takes longer than a step is designed and not built
  (`docs/plans/2026-10-02-step-00-design.md@6220a997`): a pure function of a question asked at one
  step and answered at a step the asker names; a late answer makes the world wait. It comes with
  its first client.
- The same bout in every engine holds for an Arena bout ([real functions](reference/real-functions.md));
  the Lab and the Crypt still place bodies and aim orders with the engine's `Math`.
- A component declares the structure it needs through `fits`; a new body family or item brings
  its own tasks, and a shared name does not show an algorithm works on another family.

### Body and motor control

All targets are read on the Node stand, Rapier, 120 Hz, Balance and Haste declared; a candidate is
screened small (one body, one loadout, one group of falls) before its full target.

- **Running.** The Warrior sustains at least 4.5 m/s forward, toward the owner's 5 m/s; Haste +100
  adds at least 1 m/s; at most 19 falls in the 300-trial gait battery and 18 in its 150 club
  trials, the forward club envelope at or above SIMBICON's; stops and turns exercised; sideways
  and back stay stepping walks at their own pace; the owner accepts the look. Today's gaits and
  what was tried are in [locomotion](reference/locomotion.md). Open there: a run that does not ask
  a body past what its legs hold (the club throws the Rogue's run), braking faster, a pace past
  about 3.7 m/s, the skeleton's sides and back, the walk's motion-capture ways. The game's run
  turns at no rate in every trial at 1 m/s or faster, and brakes late, so the speed rule plans
  its stops at 0.15 m/s² and every place goal comes in slow; the Rogue falls turning into the run
  toward a goal to its side, and is thrown by a run ordered in a bout's first 2 s
  ([the walk and run](reference/locomotion.md#the-walk-and-run)). The learned run states no
  envelope, so the speed rule asks it nothing and it stands under orders.
- **Recovery.** The owner's 64-fall target (`research/rising-bed.mjs --target`,
  [recovery target](reference/rising.md)): at least 15 of 16 verified recoveries within 6 s in
  every group, 61 of 64 overall, every cardinal direction in every group, a failure-inclusive
  median at most 4 s, unassisted. Step-up, the baseline, stands 40 of 64 and none within 6 s
  ([step-up on the target](reference/rising.md#step-up-on-the-owners-target)); where it stops is
  in [rising](reference/rising.md#where-the-rise-stops). A policy acting on observations also runs
  the sixteen-fall screen (`research/stand-up-acceptance.mjs`), which does not establish the
  target.
- **Strikes.** A driven strike that sequences arm, trunk and ground reaction, returns under control
  and works in a fight. The body has a straight blow over the competency's 6.8 m/s at every cell
  searched, and no controller lands one ([punch](analysis/2026-10-08-punch-layer.md),
  [punch calibration](reference/punch-calibration.md)). Read on its task, then with only the
  executor changed by the paired report and its ablation. Kicks: higher targets and kick
  selection ([front kicks](reference/front-kicks.md)).
- **Holds and equipment.** Shield orientation, weapon lines and coupled two-hand control through
  the same control path, with no controller per loadout; equipped recovery; armour, two-handed
  items and bows, with projectiles in the core.
- **Assists.** Grit, a torque assist, is defined (limits, accounting, interaction with the muscles)
  before it is used; its objective is a median below 4 s under its declared configuration, apart
  from the unassisted target. A controller trained with an assist is read without it before an
  unassisted claim; lowering the assist over training is one way there. Movement and
  attack-and-defence assists are not built.
- **Posture and support.** No installed pose is held within 2 cm for 10 s by joint feedback
  ([posture hold](reference/posture-hold.md)); support entry acquires support in 2 and 3 of 4
  shoves ([support entry](reference/support-entry.md)). The whole-body solve is experimental, at
  five or six times a step's cost ([whole-body spike](reference/whole-body-spike.md)), against an
  objective of 0.5 ms per body per step ([step cost](reference/step-cost.md)).
- **The reach solver runs to its cap out of reach**: it wants a solve whose answer out of reach is
  defined ([step cost](reference/step-cost.md#the-reach-solver-at-its-cap)).
- **Contact and solver questions**, each in its record:
  [joint-stop prediction](reference/joint-stop-tracking.md),
  [lift-off](reference/contact-liftoff.md), [friction](reference/contact-friction.md),
  [the local impulse predictor](reference/contact-step.md),
  [multibody joint shapes](reference/solver-contract.md#anatomical-joint-shape-compatibility).
  A limp skeleton on its front crawls at 25 cm a second ([rising](reference/rising.md#lying)).
  Legs meet as rigid capsules at a blow's force in a crossover or a fall
  ([the run's body](reference/run-body.md#the-thighs-room)). A foot's friction is 0.8 and every
  other contact's 0.5; a compliant layer under the soles and palms is not measured.
- **Body numbers.** The hip's and trunk's speed borrow an extrapolation (`BORROWED`,
  `src/core/human/speed.ts`); changing it is a body change with its before/after tables. Shoves
  held, 55 and 35 N s, have no human reference
  ([stance tuning](reference/stance-tuning.md#bounded-swing)). Set and not swept: `PLACING.near`,
  `ATTACK_METRES`, `EDGE`, `IK_POSTURE_PULL`, `IK_TURN`, `STANCE_LOWER`, a human's `down.fallen`;
  set on an engine that is gone: `STAND`, `AIM_AHEAD`, the lab's seek budget. Gameplay keeps the
  symmetric muscle bounds until recovery is corrected ([joint limits](reference/joint-limits.md)).

### Blows and wounds

- Not built: a tolerance of a part's own (the pool's rule stands, by the owner's answer); the face
  apart from the head; armour, a layer more in `energyShares`; an edge and a point on equipment
  ([wounds](reference/wounds.md)).
- Decided, to apply once a rise meets its bar (the owner, 2026-10-01): a body that is down may be
  struck, and a fall takes nobody out unless a context has its own rule for it
  (`docs/plans/2026-10-01-rising-05-rules.md@7f3ebcdb`).
- Known and kept for now: a part with no hit points left moves as it did; the Crypt forgets
  touches when it makes its watch again; two parts meeting at once are two blows; a blow lasts
  while the solver pushes on it, and lasting until the two part would move every bout.

### The AI

Minds, tactics and command ([Minds](architecture.md#minds)).

- **Vanguard**, an experimental contender: more than 80% wins against every existing opponent,
  empty-handed first, then equipped, on held-out cases. Its calibrated default still fails fresh
  unarmed qualification ([its plan](plans/2026-10-21-vanguard.md)).
- Not built: a learned mind; sight that is blocked (the senses pass every body whatever stands
  between); a library for a body of another shape behind the same seam.
- **Tactics**, for any fighter, each asked of a concrete failure, one decision at a time, and read
  by the paired report:
  - targets after a guard: when to change surface, action or approach;
  - spacing and commitment: approach, clinch breaking, circling, follow-up timing; after
    Movement's A2, spacing is a goal, not a velocity;
  - an option's worth: attack value, incoming cost, travel time, falls and recovery, calibrated
    to the components run, with no hidden opponent state;
  - ground choices: getting up, moving away, fighting from the ground or waiting, on the same
    falls;
  - selection and reflexes: valued, ranked and behaviour-list selection, interruption, reflex
    ownership;
  - orders: obedience against self-preservation, read with orders given; follow orders values
    an order without its walk (`Orders.walk`); the options fighter given a held direction slows
    from 1.3 to about 0.4 m/s within 2 s, where the Duellist holds 1.1.
- Covering is late: a cover that leads the blow, a cover of another part, a dodge and a counter
  are not built ([blows](reference/blows.md#covering-searched)).
- The oracle's next spaces: a longer horizon, a response held longer, two decisions ahead, strikes
  by name ([oracle](reference/oracle.md)).
- A player's choices are the trade-offs a Mind's config exposes, offered once their effect is
  understood, with presets that round-trip through the editor, the link and a save.
- The controls are to be worked over in play: the pointer does nothing while a person's body
  stands still.
- Retiring what the new skills replace, each with its records: the strike repertoire, the staged
  rise, the Scrapper preset.
- Team bouts in the Arena, N against N, come after Movement and command.

### The game

- **The Arena:** the Ladder; wider walking courses, fighting strength and equipped recovery.
- **The Crypt:**
  - crowd motion and party reversals (Movement B3, `docs/analysis/2026-10-13-crowd-reversal.md@f103f3a9`);
  - authored set pieces (`docs/plans/2026-09-23-depths-06-set-pieces.md@144961d4`);
  - the skeleton's intent: ribcage and pelvis fatal, weak joints, blunt blows worth more against
    bone ([architecture](architecture.md#standing-decisions)); today its wounds are the human's;
  - the party carries only clubs; the Rogue's bow needs projectiles;
  - the frame rate on the owner's machine is unmeasured, and the triangle budget waits on it
    ([crypt art](art/crypt.md#triangles));
  - saving a run; a crypt on senses; a hero that walks one way and faces another;
  - a limp body put to sleep through Rapier woke by itself in three of eight cases, not
    understood ([step cost](reference/step-cost.md#a-limp-body-put-to-sleep)).
- **Input:** every command by mouse and keyboard and by touch on any touchscreen (Movement B2).
  The Crypt's keys have no walk: its Shift adds to the selection. The Lab's locomotion courses
  drive by velocities, not goals.
- **Art and sound:** a pixel look for the Crypt, behind a switch
  (`docs/plans/2026-09-24-dungeon-look-06-pixel-look.md@144961d4`); a raking-light check that
  `tangentBasis: "babylon-lh"` orients normal maps; the reptile's art; the sound's gaps (unplayed
  cues dropped at the end, two blows at once heard as one, a step within the contact margin
  unheard; [look](reference/look.md#sound)).
- **New bodies:** the reptile ([reptile](reference/reptile.md),
  [bites](reference/reptile-bites.md)): richer surface response, broader recovery, combat against
  the humans, injury wins across more opponents.
- **Another engine** (Box3D, Jolt or another): a bench adapter in `src/physics-bench/engines/`
  first, then `src/core/engine/<name>.ts` and `CORE_ENGINE=<name> npm test`.

### Findings

- **What the measurements find short:** the bare fist's striking
  surface is about 9 cm short of the capsule its recipes were tuned on; the open hand bears on its
  palm's hull where the rise, the bar, the posture hold and the support entry were tuned on the
  capsule; the run's legs cost the rise; `docs/reference/native-posture-control.json` names an
  anatomy the body no longer has.
- **Defects found, cause unknown:** a held body's fixed segment turns by about 7.5e-9 a step (the
  Crypt); a felled Warrior's club arm under `lie` never comes to rest; a club at 10 m/s under the
  lab dummy's ball ends a step inside it unread.
- **Found and not yet looked into:** `gapTo` (`src/core/engine/rapier.ts`) counts disabled
  colliders; `research/ground-combat.mjs` reads a foe as rising only by the support recovery's
  name.
- **Research code no game path reads** retires with its experiment: the stand-up
  qualification, detached-dynamics, tracking-policy, contact-model, foot-design and beam scripts,
  `punch-stability.mjs`, `reptile-motion.mjs`; `predictPointContacts` has no game reader.
- **Records no script reads again**, measured afresh when their subject changes:
  [servo and muscle](reference/servo-and-muscle.md), [body and engine](reference/body-and-engine.md),
  [stance tuning](reference/stance-tuning.md#wrench-lever).
