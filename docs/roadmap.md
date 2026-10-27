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

- **Skills, proficiency and use.** A body has an array of skills, each in one shape: a name and
  goal, an entry condition, the resources it holds and a profile
  ([Options](plans/2026-10-24-options.md)). A skill is proved on drills, ladders of rungs the owner
  watches and accepts, and its profile is measured there ([Drills](plans/2026-10-24-drills.md)).
  Tactics choose skills by their entry conditions and profiles, never motion. The more general
  and robust, the better: a body that is resized or made stronger is measured again, not searched
  again.
- **The fight is a black box**: at most two minutes, each side losing 1/60 of its life a second
  after the first; nothing else ends or judges a bout. Each skill's or mind's developer picks any
  sub-goals inside its own layer; none enters the verdict.
- **Competencies first**, proved one drill ladder at a time without assistance: footwork,
  striking, guarding, standing, standing up, kicking and running.
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
  A web app.
- **Bodies**: many morphologies, each a sourced spec. The human is the reference; the skeleton and
  a reptile quadruped are on the core.

## Order

The plans in flight, and what comes next across them. Each plan names its own dependencies.

| Plan | What it builds |
|---|---|
| [Options](plans/2026-10-24-options.md) | Every skill in one shape (name and goal, entry condition, resources, profile); an intent of one skill choice per resource, run at once; the options fighter choosing them |
| [Drills](plans/2026-10-24-drills.md) | Skills proved on watched drill ladders; profiles that tactics read; the owner's two-minute verdict |
| [Punch](plans/2026-10-24-punch.md) | Robust straight punches that land at human level, learned offline on the Strike drill and fight moments |
| [Ratings](plans/2026-10-21-ratings.md) | Items, characters and attributes by design; skill batteries beside their ablations; a sparse league and live runs |
| [Mind data](plans/2026-10-21-mind-data.md) | Mind data packed per kind |
| [Recovery](plans/2026-10-23-recovery.md) | The rise as a graph of posture skills, on the owner's 64-fall target |

1. **Now:** Punch step 4, a punch that lands across the still rung and the fight moments: steps
   1 (the bar), 2 (a straight punch at the bar from the guard, on [the punch's
   body](reference/punch-body.md), in one cell) and 3 (fight moments, the `fight` rung) have landed.
   The Warrior's learned punch lands 91 % of held-out still places at 120 and 480 Hz and none of
   the fight moments ([square to the striking shoulder](analysis/2026-10-08-punch-layer.md#square-to-the-striking-shoulder));
   next its near edge and the fight moments (the guard, a foe coming on or stepping back), then
   the bar scaled to the body and the Rogue's punch. Then
   Drills step 2 (the moving target, overlays and side by side), which Punch step 5 needs, and
   Footwork's first rungs, with Options step 2 (the legs' skills and the intent) before Footwork.
2. **Now, beside the punch:** Recovery, the rise as a graph of posture skills: steps 1 to 7
   landed (the budget, the witnesses, the steady's climb, step-up's route in parts, hand-overs in
   motion, a drill for each edge, routes priced); step 8 found no fast edge; step 9 landed short
   (the Rogue with the club 9 of 16); step 10 waits: the graph stands the Rogue with the club
   fewer falls than step-up, and the game keeps step-up. And
   Mind data step 2 (the packed format, lossless), then step 3 (precision per kind).
3. **When each one's condition holds:**
   - Ratings step 10 (a skill's battery beside its ablations on the Ratings screen) when a skill's
     ablation is next read; step 9 when a question about an item, a character or an attribute is asked; step 11 (the
     sparse league) only when the owner asks; step 14 (run live) once the Ratings screen is in use
     and a live run would save a trip to the command line;
   - Mind data step 4 (Research rise's response tables) when the owner asks.

## Waiting on the owner

**Choices**, each landed at its default:

- Haste's range and each character's value ([assist](reference/assist.md#haste)).
- Whether the skeleton's sides and back are worth a search or a change to the body; whether the
  bodies take the ankle's tendon ([locomotion](reference/locomotion.md)).
- The Crypt's set values: `SET_UPON`, `AIM_COSINE`, `LEVEL.clearance`, `FOOTPRINT_METRES`
  ([play](reference/play.md)); how the dead disappear in time.
- The stand-up target's falls: a shove the body holds is given again the same way, up to three
  ([rising](reference/rising.md#the-owners-target)); the skeleton read beside the target, not
  held to it ([Recovery](plans/2026-10-23-recovery.md)).
- An optional skeleton costume, after seeing the bones in play.
- Skills that chain: the shared skills expose their exits and their defaults accept any state;
  one registry of percepts feeds reflexes, events, entry conditions and profiles; the reference
  chooser becomes a part role that looks ahead a set number of skills; a reaction time, seen
  first in play ([skill chaining](analysis/2026-10-26-skill-chaining.md));
  decided before the [Options](plans/2026-10-24-options.md) plan's step 3.

**To watch:**

- The Strike drill's still rung: each strike's strip and reel
  (`?play=ratings&evaluation=strike`), the failures first; acceptance is the owner's. The
  Puncher's and the Duellist's were watched and not accepted: too close, awkward, not landing
  ([Punch](plans/2026-10-24-punch.md)).
- The Warrior's learned punch on the still rung
  (`?play=ratings&evaluation=strike&pool=7f867ed6&subject=learned-puncher&version=ac43944db7f4ef32`):
  7 of the 8 thrown land at the bar; after the blow the rear hand's body turns on past the target
  and the lead hand's ends in a deep crouch.
- The Strike drill's fight rung, a strike in place of its mind's own in a bout
  (`?play=ratings&evaluation=strike&pool=0a8f1708`):
  no strike lands at the bar; most meet the foe's guard.
- The Duellist on both levels; accepted, it becomes the reference
  ([sword-and-buckler](reference/sword-and-buckler.md)).
- A bout fought with orders (`?play=arena&matchup=workshop-fighter,workshop-rogue&you=left`).
- The faster walk, 1.5 to 1.7 m/s forward, in Arena bouts and the Crypt.
- The five Locomotion courses at Max (`?play=lab`), Back and forth at a long distance for the run,
  the Crypt's long walks, the Warrior's run, and Move's rules and gaits in the mind editor.
- Standing up in the Lab, in Arena bouts and in the Crypt, and whether the rise looks human.
- The skeleton's look in play.
- The person's commands: in the Crypt H holds, X stops, Q/E turn, Caps Lock walks, a right click
  faces or follows; in the Arena a click on the floor goes there. The party walking braced within 8.5 m of a companion.
  The level-clearer (`?play=dungeon&party=clearer`) and the mob.
- Bodies walking round the fallen, foe or friend, and a team passing over a foe lain down 30 s.

## Open, by layer

### Framework

- Headless runs build a Babylon scene (`buildBout`, `buildCrypt`): physics owning the transforms
  and no scene in Node comes with a client that needs it, keeping exact arithmetic and the engine
  contract.
- One notion of a task: an evaluation plays a core task (`src/core/tasks/`), the Lab shows it, and
  the Ratings screen opens it ([Drills](plans/2026-10-24-drills.md), step 1).
- The Ratings reel plays bout cases only: a fall's or a technique case's trial (the Rise drill's)
  is shown as not opened, so its reel cannot be watched.
- Participant contracts, each extended with its first client: every accepted grip request and
  external input on the tape; exact physical replay apart from live continuation for a
  nondeterministic policy; a slower policy's cadence, held actions and work allowance.
- Thinking that takes longer than a step is designed and not built
  (`docs/plans/2026-10-02-step-00-design.md@6220a997`): a pure function of a question asked at one
  step and answered at a step the asker names; a late answer makes the world wait. It comes with
  its first client.
- A new body family or item brings its own tasks; a shared name does not show an algorithm works
  on another family.
- Parts swap by configuration ([Adding a Mind](architecture.md#adding-a-mind)); what is left:
  - the orders vocabulary is closed: a planner that wants a new kind of order edits `Orders`,
    `isOrders`, `Command` and the Commanders; it opens with the intent's skill choices
    ([Options](plans/2026-10-24-options.md), step 2);
  - a planner's memory forks only through the skills it drives (`driveBy`): one that keeps it
    elsewhere does not fork;
  - nothing holds a navigator to its report's statuses: the straight stub never says `stalled`,
    which a Commander reads;
  - `crypt-clear` takes a party Commander as its subject; an enemy Commander is evaluated only by
    a new protocol;
  - a part's settings are choices, numbers, toggles or text: a list setting is edited as JSON text;
  - the research shortfall meter (`research/bout.mjs`) reads a command-layer body's stance, which
    a policy body has not;
  - the rising bed's pre-fall pose and the Lab's start placements are the stock guard posture
    (`guardPosture`), not the mind's guard.

### Body and motor control

All targets are read on the Node stand, Rapier, 120 Hz, Balance and Haste declared; a candidate is
screened small (one body, one loadout, one group of falls) before its full target.

- **The braced walk.** Shoved at 20 N s at a third of its orders with the club, the Rogue falls in
  5 and 2 of 200, the Warrior 1 and 2 ([ankle hold](reference/stance-tuning.md#ankle-hold)), and
  empty-handed the Rogue in 8 of 200 ([heel-off](reference/stance-tuning.md#heel-off)); it walks
  1.5 to 1.7 m/s forward and 0.7 every other way, and turns none at 1 m/s or faster
  ([the stance's walk](reference/locomotion.md#the-stances-walk)). Open: the crowd's reversal
  wakes the enemy at 7 of seeds 1 to 60.
- **Running.** The Warrior sustains at least 4.5 m/s forward, toward the owner's 5 m/s; Haste +100
  adds at least 1 m/s; at most 19 falls in the 300-trial gait battery and 18 in its 150 club
  trials, the forward club envelope at or above SIMBICON's; stops and turns exercised; sideways
  and back stay stepping walks at their own pace; the owner accepts the look. Today's gaits and
  what was tried are in [locomotion](reference/locomotion.md). Open there: a run that does not ask
  a body past what its legs hold (the club throws the Rogue's run), braking faster, a pace past
  about 3.7 m/s, the skeleton's sides and back, the walk's motion-capture ways. The game's run
  turns at no rate in every trial at 1 m/s or faster, and brakes late, so the speed rule plans
  its stops at 0.2 m/s²; the Rogue falls turning into the run
  toward a goal to its side, and is thrown by a run ordered in a bout's first 2 s
  ([the walk and run](reference/locomotion.md#the-walk-and-run)). The learned run states no
  envelope, so the speed rule asks it nothing and it stands under orders; on the lab's circle it
  falls 6.5 s into its run.
- **Recovery** ([Recovery](plans/2026-10-23-recovery.md), [now](#order)). The owner's 64-fall target (`npm run evaluate -- rising-target`,
  [recovery target](reference/rising.md)): at least 15 of 16 verified recoveries within 6 s in
  every group, 61 of 64 overall, every cardinal direction in every group, a failure-inclusive
  median at most 4 s, unassisted. Step-up, the baseline, stands 51 of 64 and none within 6 s at
  `8e3df885`; where its time goes is [the budget](reference/rising.md#the-budget) (step 1,
  landed) and [where the rise stops](reference/rising.md#where-the-rise-stops). Step 2 found
  closed-loop rises from the back and from hands and knees, on the feet in 1.5 s and verified in
  4.9 and 3.7 s ([a fast route](reference/rising.md#a-fast-route)). Step 3 (landed): Stand up's
  steady climbs from a crouch quiet on both flat feet in a median of 1.46 s
  ([a planned climb](reference/rising.md#a-planned-climb)); no rise hands over in one yet, so the
  fast edges (step 8) must end there. Step 4 (landed): step-up's route is five edges that stand
  the target as step-up does, within a placebo's spread ([the staged route](reference/rising.md#the-staged-route)).
  Step 5 (landed): their entries read the raw position and the body's motion, and they hand over
  without bracing, within the same spread, the Warrior empty-handed at its edge. Step 6 (landed):
  the Rise drill gives each edge's profile placed and in motion
  ([the Rise drill](reference/rising.md#the-rise-drill)); every edge is done from its own posture
  placed but the Rogue's kneel-up (0 of 6, for step 9). Its reel waits on a page that plays a
  technique case (open item, Framework); the Lab's Stand-up scenario plays the staged route. Step 7 (landed): Stand up prices routes by the edges'
  profiles ([routes priced](reference/rising.md#routes-priced)); the fresh falls are a case set of
  the target. Step 8 found no fast edge ([tried and not kept](reference/rising.md#tried-and-not-kept)):
  from hands and knees the bearing solve holds a pike on the toes, the hands bearing, and does not
  balance on the feet alone; a fast rise waits on a controller that brings the weight onto flat feet.
  Step 9 (landed short): the tuck's arms out stand the Rogue empty-handed 13 of 16, with the club 9
  ([the pose stages](reference/rising.md#the-pose-stages)). Step 10 waits: the staged route stands
  52 and 53 of 64 on the target against step-up's 56 and 53, the Rogue with the club 9 and 10 of 16
  against 11 and 12; no fall of either stands within 6 s.
  A policy acting on observations also runs the sixteen-fall screen
  (`research/stand-up-acceptance.mjs`), which does not establish the target.
- **Strikes.** A driven strike that sequences arm, trunk and ground reaction, returns under control
  and works in a fight. The body has a straight blow over the competency's 6.8 m/s at every cell
  searched; a learned punch lands it on the still rung, not yet in fights ([punch](analysis/2026-10-08-punch-layer.md),
  [punch calibration](reference/punch-calibration.md)). Read on the Strike drills
  ([Drills](plans/2026-10-24-drills.md), steps 1 to 3), then in fights by the paired report.
  Kicks: higher targets and kick selection ([front kicks](reference/front-kicks.md)).
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
- **The reach solver runs to its cap on a cover the joints' ranges keep out of reach**: two points of
  a held item asked inside the arm's stretch, 47 % of them in a crypt run; beyond the stretch it
  ends ([step cost](reference/step-cost.md#the-reach-solver-at-its-cap)).
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
- Decided (the owner, 2026-10-01; `docs/plans/2026-10-01-rising-05-rules.md@7f3ebcdb`): a fall
  takes nobody out unless a context has its own rule for it, applied in the Arena by the owner's
  verdict ([Drills](plans/2026-10-24-drills.md), step 7); a body that is down may be struck, to
  apply once a rise meets its bar.
- Known and kept for now: a part with no hit points left moves as it did; the Crypt forgets
  touches when it makes its watch again; two parts meeting at once are two blows; a blow lasts
  while the solver pushes on it, and lasting until the two part would move every bout.

### The AI

Minds, tactics and command ([Minds](architecture.md#minds)).

- **Vanguard**, an experimental contender, has no plan: no campaign judged by fight wins
  qualified it against the field ([record](reference/vanguard.md)). The entrant stays; its
  tactics move onto entry conditions and profiles ([Drills](plans/2026-10-24-drills.md), step 6).
- Not built: a learned mind; sight that is blocked (the senses pass every body whatever stands
  between); a library for a body of another shape behind the same seam.
- **Tactics**, for any fighter, choosing skills by their entry conditions and profiles
  ([Drills](plans/2026-10-24-drills.md), step 6), each asked of a concrete failure, one decision at
  a time, and read by the paired report:
  - targets after a guard: when to change surface, action or approach;
  - spacing and commitment: approach, clinch breaking, circling, follow-up timing; spacing is the
    legs' skills (`keep-range`, `step-in`, `step-out`, `circle`;
    [Options](plans/2026-10-24-options.md), step 2);
  - an option's worth is its profile: attack value, incoming cost, travel time, falls and
    recovery, with no hidden opponent state;
  - ground choices: getting up, moving away, fighting from the ground or waiting, on the same
    falls;
  - selection and reflexes: valued, ranked and behaviour-list selection, interruption, reflex
    ownership;
  - orders: obedience against self-preservation, read with orders given; follow orders values
    an order without its walk (`Orders.walk`).
- Covering is late: a cover that leads the blow, a cover of another part, a dodge and a counter
  are not built ([blows](reference/blows.md#covering-searched)); each comes as a skill in the shape
  with its Cover drill.
- Ground positioning's foot-clearance probes (`sensedFootClearance`, `clearFootTranslation`,
  `src/core/mind/sensed-bounds.ts`) rebuild every foe collider's world points on each call,
  several times a decision; building them once a decision is unmeasured ([step cost](reference/step-cost.md)).
- The oracle's next spaces: a longer horizon, a response held longer, two decisions ahead, strikes
  by name ([oracle](reference/oracle.md)).
- A player's choices are the trade-offs a Mind's config exposes, offered once their effect is
  understood, with presets that round-trip through the editor, the link and a save.
- The controls are to be worked over in play: the pointer does nothing while a person's body
  stands still.
- Retiring what the new skills replace, each with its records: the strike repertoire, the staged
  rise, the Scrapper preset.
- Team bouts in the Arena, N against N.

### The game

- **The Arena:** the Ladder; wider walking courses, fighting strength and equipped recovery.
- **The Crypt:**
  - few die: the Duellist kills 6 of 128 foes over `crypt-clear`'s 8 runs and clears 2, at
    `93ea707d` ([in a fight](reference/blows.md#in-a-fight)). Fighting longer does not kill more,
    and a wider strike slack kills more in the Crypt but loses in the Arena
    ([tried and not kept](reference/blows.md#tried-and-not-kept)): attacking, a fighter starts a
    strike every 5 to 7 s, and half of them end at the preparation deadline as it sets its feet, a
    step's weight shift at a time, after a target that has moved. More die with a strike that
    needs fewer steps, a faster rise (Recovery), and blows on a body that is down, decided to apply
    once the rise meets its bar ([Blows and wounds](#blows-and-wounds)). A Crypt fight ends by a mind that kills, not by a rule (the owner, 2026-10-24);
  - the stance walk runs away sideways after a half turn, read before the walk steered the way its
    route goes ([the stance's walk](reference/locomotion.md#the-stances-walk));
  - the level-clearer's policy numbers (`POLICY`, `src/core/command/clearer.ts`) are first guesses;
  - authored set pieces (`docs/plans/2026-09-23-depths-06-set-pieces.md@144961d4`);
  - the skeleton's intent: ribcage and pelvis fatal, weak joints, blunt blows worth more against
    bone ([architecture](architecture.md#standing-decisions)); today its wounds are the human's;
  - the party carries only clubs; the Rogue's bow needs projectiles;
  - the frame rate on the owner's machine is unmeasured, and the triangle budget waits on it
    ([crypt art](art/crypt.md#triangles));
  - saving a run; a crypt on senses; a hero that walks one way and faces another;
  - a limp body put to sleep through Rapier woke by itself in three of eight cases, not
    understood ([step cost](reference/step-cost.md#a-limp-body-put-to-sleep)).
- **Input:** the Lab's locomotion courses drive by velocities, not goals.
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
- **Defects found, cause unknown:** a club at 10 m/s under the lab dummy's ball ends a step
  inside it unread. A limp body's slack hand can be kept turning by the solver
  ([lying](reference/rising.md#lying)).
- **Research code no game path reads** retires with its experiment: `predictPointContacts` has
  no game reader, and goes with the local impulse predictor's question.
- **Records no script reads again**, measured afresh when their subject changes:
  [servo and muscle](reference/servo-and-muscle.md), [body and engine](reference/body-and-engine.md),
  [stance tuning](reference/stance-tuning.md#wrench-lever).
