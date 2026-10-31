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
  goal, an entry condition, the resources it holds, an exit and a profile
  ([Option Mind](plans/2026-10-27-option-mind.md#the-shape-of-a-skill)). A skill is proved on drills,
  ladders of rungs the owner watches and accepts, and its profile is measured there ([Drills](plans/2026-10-24-drills.md)).
  Tactics choose skills by their entry conditions and profiles, never motion. The more general
  and robust, the better: a body that is resized or made stronger is measured again, not searched
  again.
- **The fight is a black box**: at most two minutes, each side losing 1/60 of its life a second
  after the first; nothing else ends or judges a bout. Each side's life and the clock are a
  scoreboard every mind senses. Each skill's or mind's developer picks any sub-goals inside its own
  layer; none enters the verdict.
- **Real time**: the game plays with no slowdown, so a mind decides within its step from what it
  already holds (profiles, values, a trained policy). Searching ahead is offline research
  ([oracle](reference/oracle.md)), not a mind's during a fight.
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
  ([control foundation](reference/control-foundation.md)); the bare entrant
  (`src/entrants/bare/`) is its route.
- **The game**: the Arena, a bout to a verdict that a person watches or takes a side in; a Ladder
  of bouts, to be designed; the Crypt, a party commanded by a person or an AI against AI enemies.
  A web app.
- **Bodies**: many morphologies, each a sourced spec. The human is the reference; the skeleton and
  a reptile quadruped are on the core.

## Order

The plans in flight, and what comes next across them. Each plan names its own dependencies.

| Plan | What it builds |
|---|---|
| [Option Mind](plans/2026-10-27-option-mind.md) | The reference mind on the toed Warrior, deciding by one policy over options, each a skill applied to a target priced by its profile, selected as a set by their resources (built: the baseline evaluation, one trainer for any part, worth in life, measured profiles, the value of a position, exits and letting go, the rise as options with no supervisor, the stomp at a fallen foe, the chooser looking one option past a walk, footwork to places from the skills' windows and the foe's pressure; the design read whole, the fights 0.68 against 0.64). Left: footwork, the guard and the intent in the legs goal and the orders (step 13, in part); the legs bearing on hands and knees, a technique holding only the limbs it moves (14); a place aside the foe from its striking arc (15); a foe's reach by its limbs and what it holds (16) |
| [Option Skeleton](plans/2026-10-30-option-skeleton.md) | The empty-handed Skeleton preset beating every Arena entrant more than 90% of the time: its rise on toes, its strikes measured, a mixed panel, then the whole field and reserved conditions; a preset of the toolkit's Option Mind. The 11/16 development panel belongs to `c5ce647b` ([record](reference/option-skeleton-combat.md)) |
| [Punch](plans/2026-10-28-punch.md) | The first skill trained on Option Mind: the punch at a person's level walking or not, at fight range, at moving targets, on the Rogue at its scaled bar and at the head; the one-two; in fights |
| [Buckler and club](plans/2026-10-29-buckler-and-club.md) | The Warrior's held skills on Option Mind up the Ratings ladder (built: the drills holding the loadout, a club's bar at the untrained blow less one SD, the buckler warding the weapon, the rise holding both standing 15 of 16 falls, Option Mind even with the Duellist and ahead of Vanguard holding both). Left: the club blow ([Club and sword](plans/2026-10-31-club-and-sword.md)); the Cover drill's buckler rows against a weapon and rung 2 (protocols to write); a lead over the Duellist; the owner's acceptance of each rung |
| [Club and sword](plans/2026-10-31-club-and-sword.md) | The toed Warrior's club blow, sword cut and sword thrust at a person's level, as the punch: one bar for a held blow, 64.8 J met with the item's face, edge or point; a whole-body held blow searched to the bar, then steered and up the ladder |
| [Drills](plans/2026-10-24-drills.md) | Skills proved on watched drill ladders, each rung's opponent a mind's configuration (the drill opponent a toolkit mind, its scripts the evaluation's; built: Strike's rung 1 at a pad on a rail, the trial's overlays and the previous version beside it, the Stand drill). Left: Footwork's rungs; Cover's rung 2, which waits on a counter skill |
| [Recovery](plans/2026-10-23-recovery.md) | The game's bodies standing up on toes, the rise a chain of fast skills judged on its time to standing end to end: the fast edge from hands and knees on Option Mind's rise (built, the sit-back; good enough for now, the owner), then that rise and toes as the game's Stand up, the Rogue with the club among them, on the owner's 64-fall target |
| [Commander](plans/2026-10-29-commander.md) | A general Commander in Option Mind's shape, the Option Commander: team options claiming members, priced by the Crypt's score, its chooser configured over set selection shared with Option Mind; the score the hero's life at the exit less a price on time, read by the evaluation with the game unchanged, the price from the level's route; the player's side one unit (built: the score, `crypt-clear`'s `alone` protocol; set selection shared, `selectSet`; what the team reads, the exit, routes, foes' life and members' prospects) |
| [A garbage-free step](plans/2026-10-30-garbage-free-step.md) | The steady state close to garbage-free: every game mind under one allocation ceiling, lowered as each site's allocation goes (built: step 1, the per-mind ceiling and the opening selector). Left: the contacts' read, the contact-mass solve, the toolkit's tail, each mind's own |

1. **Now: Option Mind's design**, before any training run: its steps 13 to 16 in order
   ([Option Mind](plans/2026-10-27-option-mind.md#steps)), footwork, the guard and the intent,
   the legs bearing on hands and knees, a place aside from the foe's arc, a foe's reach by its
   limbs. Each step is checked on the drills it touches; the fights are read once, when the last
   lands.
2. **Then training**, on the completed design, each paired by the baseline evaluation: the
   [Punch](plans/2026-10-28-punch.md) in order (walking or not, at its bar everywhere, the
   one-two, fights); then a learned gait,
   the Stand drill's rungs watched before it, and the other skills
   ([Body and motor control](#body-and-motor-control)); the club blow and the sword's
   ([Club and sword](plans/2026-10-31-club-and-sword.md)) and the buckler cover
   ([Buckler and club](plans/2026-10-29-buckler-and-club.md), steps 4 to 6).
3. **Beside them:** [Club and sword](plans/2026-10-31-club-and-sword.md)'s held blow and its search
   to the bar (its steps 1 and 2; the owner, 2026-10-31). The Skeleton's campaign. The owner watches the Strike drill's rung 1 (Drills
   step 2), which Punch step 2b reads; Footwork's rungs 0 to 4 (Drills step 4) after Option Mind
   step 13.
   The rest of Recovery step 3: every humanoid is on toes and rises by Option Mind's rise (the
   owner, 2026-10-30); the Rogue with the club standing on toes, and step-up removed.
   The [Commander](plans/2026-10-29-commander.md) in order: the Option Commander (step 4) plays
   the Crypt with Option Mind as its hero.
4. **When each one's condition holds:** the Ratings items under [Framework](#framework).

## Waiting on the owner

**Choices**, each landed at its default:

- Haste's range and each character's value ([assist](reference/assist.md#haste)).
- Whether the skeleton's sides and back are worth a search ([locomotion](reference/locomotion.md)).
- The Crypt's set values: `SET_UPON`, `AIM_COSINE`, `LEVEL.clearance`, `FOOTPRINT_METRES`
  ([play](reference/play.md)); how the dead disappear in time.
- The stand-up target's falls: a shove the body holds is given again the same way, up to three
  ([rising](reference/rising.md#the-owners-target)); the skeleton read beside the target, not
  held to it ([Recovery](plans/2026-10-23-recovery.md)).
- An optional skeleton costume, after seeing the bones in play.

**To watch:**

- The Duellist on both levels; accepted, it becomes the reference
  ([sword-and-buckler](reference/sword-and-buckler.md)).
- A bout fought with orders (`?play=arena&matchup=workshop-fighter,workshop-rogue&you=left`), and one
  played turn by turn (Pause on choice, leading a side) and played again from its tape.
- The faster walk, 1.5 to 1.7 m/s forward, in Arena bouts and the Crypt.
- The five Locomotion courses at Max (`?play=lab`), Back and forth at a long distance for the run,
  the Crypt's long walks, the Warrior's run, and Move's rules and gaits in the mind editor.
- Standing up in the Lab, in Arena bouts and in the Crypt, and whether the rise looks human.
- Option Mind's toed Warrior (`?play=arena&matchup=workshop-fighter,workshop-fighter&control=option,duellist`):
  walking, punching and fighting; its run held to 0.7 m/s forward on toes
  ([on the game bodies](reference/toes.md#on-the-game-bodies)).
- Every humanoid on toes, rising by the sit-back: the Duellist, Vanguard and the Crypt's party
  going down and getting up in the Arena and the Crypt.
- The verdict ([play](reference/play.md#the-bout)): a bout in the Arena, life draining from the
  first minute, ended by two minutes, a fall ending nothing; records read under the old verdict
  are read again before any comparison.
- The reaction time, 0.15 s ([play](reference/play.md#reaction-time)): a bout under it
  (`?play=arena&matchup=workshop-fighter,workshop-fighter&control=option,duellist`) beside one
  at 0 (`&senseDelay=0`); one that plays wrong changes the one number.
- The skeleton's look in play, on its 15 kg body fitted to its bones and its robot-like motors
  (`?play=arena&matchup=crypt-skeleton,workshop-fighter&gap=4`,
  [body](art/skeleton.md#the-body-fitted-to-the-bones), [motors](art/skeleton.md#motors-not-muscles)):
  it goes down more often after contact, and folds onto its thighs crouched past 0.43 m.
- The empty-handed Skeleton's Option Mind preset (`?play=arena&matchup=crypt-skeleton,crypt-skeleton&control=option-skeleton,duellist`): its low kick, approach and cover; no straight punch until one is tuned for its body, and it rises by the game's Stand up on toes ([reading](reference/option-skeleton-combat.md)).
- The Option Reptile against a Warrior and a Reptile
  (`?play=arena&matchup=reptile,workshop-fighter&control=option-reptile,option`,
  `?play=arena&matchup=reptile,reptile&control=option-reptile,crawl`), and the Walker reaching its
  place in the Lab (`?play=lab&scenario=reach`).
- The person's commands: in the Crypt H holds, X stops, Q/E turn, Caps Lock walks, a right click
  faces or follows; in the Arena a click on the floor goes there. The party walking braced within 8.5 m of a companion.
  The level-clearer (`?play=dungeon&party=clearer`) and the mob.
- Bodies walking round the fallen, foe or friend, and a team passing over a foe lain down 30 s.

## Open, by layer

### Framework

- Headless runs build a Babylon scene (`buildBout`, `buildCrypt`): physics owning the transforms
  and no scene in Node comes with a client that needs it, keeping exact arithmetic and the engine
  contract. The trainer's time is the world's step's, 85 % of it, Rapier's wasm 23 %
  ([the trainer's speed](reference/learned-punch.md#the-trainers-speed)); the scene's share in it
  is not read apart.
- The world builders apart from what draws them, then in `src/worlds/`: the bout's (`src/arena/duel.ts`,
  `team.ts`, `room.ts`, `levels.ts`, the end rules) is headless, but a Crypt run builds its look
  with its world (`buildDungeonWorld`, `src/dungeon/world.ts`) and steers the person's commands by
  the camera (`commands.ts`, `camera.ts`), and the Lab's scenarios reach the page's render and
  controls (`src/lab/scenarios.ts`, `attack-scenario.ts`). Moved before that split, `src/worlds/`
  would import the screens; until then the boundary test holds the builders by what they reach.
- Mind data packed per kind (`docs/plans/2026-10-21-mind-data.md@6dd9420a`), when a second skill
  ships data: one network does today, and the punch's retraining replaces it.
- One notion of a task: an evaluation plays a core task (`src/core/tasks/`), the Lab shows it, and
  the Ratings screen opens it ([Drills](plans/2026-10-24-drills.md)).
- The Ratings reel plays bout cases only: a fall's or a technique case's trial (the Rise drill's)
  is shown as not opened, so its reel cannot be watched.
- Participant contracts, each extended with its first client: every accepted grip request and
  external input on the tape; exact physical replay apart from live continuation for a
  nondeterministic policy; a slower policy's cadence, held actions and work allowance.
- A new body family or item brings its own tasks; a shared name does not show an algorithm works
  on another family.
- Parts swap by configuration ([Adding an entrant](architecture.md#adding-an-entrant)); what is left:
  - the orders vocabulary is closed: a planner that wants a new kind of order edits `Orders`,
    `isOrders`, `Command` and the Commanders; it opens with the intent's skill choices
    ([Option Mind](plans/2026-10-27-option-mind.md), step 13);
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
- Ratings, each when its condition holds (the design is `docs/plans/2026-10-21-ratings.md@ffdaaeea`):
  - items, characters and attributes rated by design (`loadouts`, `characters`, `attributes`), when
    a question about an item, a character or an attribute is asked;
  - the Ratings screen showing a skill's battery beside its ablations, when a skill's ablation is
    next read;
  - a sparse league (`sparse { opponents, seed }` beside `all`, `versus` and `pairs`), only when
    the owner asks;
  - live runs on the Ratings screen (a case worker, a browser pool, a run panel; each worker calls
    `loadData`), once the screen is in use and a live run would save a trip to the command line;
  - decisions: a `point` world kind that plays a bout to a step and each response for a horizon,
    a chooser scored by regret, when a tactics question needs one; its value unit is life
    (`worth`, `src/core/option/value.ts`), and it waits on how a chooser ranks responses.

### Body and motor control

All targets are read on the Node stand, Rapier, 120 Hz, Balance and Haste declared; a candidate is
screened small (one body, one loadout, one group of falls) before its full target.

- **The braced walk.** Shoved at 20 N s at a third of its orders with the club, the Rogue falls in
  5 and 2 of 200, the Warrior 1 and 2 ([ankle hold](reference/stance-tuning.md#ankle-hold)), and
  empty-handed the Rogue in 8 of 200 ([heel-off](reference/stance-tuning.md#heel-off)); it walks
  1.5 to 1.7 m/s forward and 0.7 every other way, and turns none at 1 m/s or faster
  ([the stance's walk](reference/locomotion.md#the-stances-walk)). Open: the crowd's reversal
  wakes the enemy at 7 of seeds 1 to 60.
- **The stance on a lying body.** Asked a stand while the body lies with no ground action holding
  it, the stance's plan takes what the ground missed (`plan.missed`, `advancePlan`) unbounded and
  runs to NaN in seconds, which the action command refuses as a throw; no mind asks it now
  (Option Mind's brace holds the body by the ground's brace).
- **The body layer's probes** ([architecture](architecture.md#skills)) found what the stance does
  not carry out and does not report: legs asked to bear on one foot while the centre of mass is
  not over it fall, the other leg left to the posture (an action shifts the weight first, as the
  kick does); and a heading asked beside a walk swings the pelvis 0.5 rad either way, so the stance
  walk reports it undone instead. The carriage's probe comes with the first carriage of a width.
- **A learned gait**, trained by the general trainer on the walk's cases over the stance or over the
  legs' muscles, toward a faster or steadier walk or run than the hand-built one: it joins the
  legs' set by name, and the chooser takes it where its profile is better. Read by the probes and
  the baseline evaluation's walk paired with the gait it would replace, at 120 and 480 Hz,
  falling under shoves no more often; the owner watches it in the Lab and a bout.
- **Running.** The Warrior sustains at least 4.5 m/s forward, toward the owner's 5 m/s; Haste +100
  adds at least 1 m/s; at most 19 falls in the 300-trial gait battery and 18 in its 150 club
  trials; forward with the club at least 4 m/s for the Warrior, 2 for the Rogue and 1.2 for the
  skeleton (`assets/core/simbicon-run-envelope.json@20ea40e6`); stops and turns exercised; sideways
  and back stay stepping walks at their own pace; the owner accepts the look. Today's gaits and
  what was tried are in [locomotion](reference/locomotion.md). Open there: a run that does not ask
  a body past what its legs hold (the club throws the Rogue's run), braking faster, a pace past
  about 3.7 m/s, the skeleton's sides and back, the walk's motion-capture ways. The game's run
  turns at no rate in every trial at 1 m/s or faster, and brakes late, so the speed rule plans
  its stops at 0.2 m/s²; the Rogue falls turning into the run
  toward a goal to its side, and is thrown by a run ordered in a bout's first 2 s
  ([the walk and run](reference/locomotion.md#the-walk-and-run)).
- **Recovery** ([Recovery](plans/2026-10-23-recovery.md)). The owner's 64-fall target
  (`npm run evaluate -- rising-target`, [the owner's target](reference/rising.md#the-owners-target)):
  at least 15 of 16 verified recoveries within 6 s in every group, 61 of 64 overall, every
  cardinal direction in every group, a failure-inclusive median at most 4 s, unassisted. Step-up,
  the game's, stands 56 and 53 of 64 at `cbdf389a`, none within 6 s; the staged route, priced by its
  edges' profiles ([routes priced](reference/rising.md#routes-priced)), 52 and 53, short on the
  Rogue with the club (9 and 10 of 16 against 11 and 12). The fast edge from hands and knees on
  toes, `sit-back` ([the sit-back](reference/rising.md#the-sit-back)), stands the Warrior 32 of 32
  from rest in a median of 3.87 s, 32 of 32 with the club. On it Option Mind's rise on the toed
  Warrior stands 24 of 32 baseline falls, 1 within 6 s, a median of 14.0 s
  ([Recovery](plans/2026-10-23-recovery.md#where-it-starts): the chain's time and the hand-over
  to the steady stand between it and the target). The owner watched it in the Lab's Stand-up
  (Option Mind, toes) on 2026-10-29: it looks good, and good enough for now. The Rise drill's reel waits on a page that plays a technique case
  ([Framework](#framework)).
- **Strikes.** A straight punch that lands at a person's level in fights. The Warrior's learned
  punch lands 83 % of 640 held-out trials still or walking in, at 120 and 480 Hz alike, short of
  the 90 % asked, and an earlier network 3 of 56 fight moments; the Rogue has none at
  its bar, and the high mark is refused ([learned punch](reference/learned-punch.md),
  [Punch](plans/2026-10-28-punch.md)). Read on the Strike drill's rungs
  ([Drills](plans/2026-10-24-drills.md)), then in fights by the paired report.
  Kicks: higher targets and kick selection ([front kicks](reference/front-kicks.md)). Blade cuts
  and thrusts, a club blow, kicks and low support (a legs-and-trunk commitment that lends the
  trunk to a low strike) come into Option Mind's shape after the punch, each tuned for each body
  that uses it, a configuration of the general trainer where it is learned and drilled as the
  Strike drill drills the punch.
- **Holds and equipment.** Shield orientation, weapon lines and coupled two-hand control through
  the same control path, with no controller per loadout; equipped recovery; armour, two-handed
  items and bows, with projectiles in the core. Open before a weapon in both hands: whether the
  step's solve and the effector tracker move two arms closing on one held item (a closed chain;
  `bodyEffectors` builds serial chains with no shared channel, and the solve's inverse dynamics
  ignore the grip's constraint), with a game fighter granted grips (no fighter has an equipment
  port; grips are fixed at build), answered on the shared strike's cells
  ([shared-item strikes](reference/shared-strike.md)) against the Lab's controller; the legs
  goal's claim gains a grip term only with a reader.
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
  other contact's 0.5; every contact is rigid.
- **Body numbers.** The hip's and trunk's speed borrow an extrapolation (`BORROWED`,
  `src/core/human/speed.ts`); changing it is a body change with its before/after tables. Shoves
  held, 55 and 35 N s, have no human reference
  ([stance tuning](reference/stance-tuning.md#bounded-swing)). Set and not swept: `PLACING.near`,
  `ATTACK_METRES`, `EDGE`, `IK_POSTURE_PULL`, `IK_TURN`, `STANCE_LOWER`, a human's `down.fallen`;
  set on an engine that is gone: `AIM_AHEAD`, the lab's seek budget. Gameplay keeps the
  symmetric muscle bounds until recovery is corrected ([joint limits](reference/joint-limits.md)).
  A tendon in series with the ankle's plantar flexors is in the core and on no body; on the stride
  it fell more ([locomotion](reference/locomotion.md)).

### Blows and wounds

- Not built: a tolerance of a part's own (the pool's rule stands, by the owner's answer); the face
  apart from the head; armour, a layer more in `energyShares`; an edge and a point on equipment
  ([wounds](reference/wounds.md)).
- The fist's threshold against a head: at 36.8 J (`Rulebook.fist`) and a 62 % share the exchange
  stops paying at 59 J, and a boxer's blow costs the hand
  ([what a blow is worth](reference/learned-punch.md#what-a-blow-is-worth)); read again before a
  punch is trained on the head ([Punch](plans/2026-10-28-punch.md), step 2d).
- The head behind the guard: the guard covers the face, and the open lane over it is the top of
  the head, which a straight punch cannot meet square; a punch at the head goes around or over the
  guard, or waits for it to open (Punch, step 2d).
- Decided (the owner, 2026-10-01; `docs/plans/2026-10-01-rising-05-rules.md@7f3ebcdb`): a fall
  takes nobody out unless a context has its own rule for it, applied in the Arena by the owner's
  verdict ([play](reference/play.md#the-bout)); a body that is down may be struck, to
  apply once a rise meets its bar.
- Known and kept for now: a part with no hit points left moves as it did; the Crypt forgets
  touches when it makes its watch again; two parts meeting at once are two blows; a blow lasts
  while the solver pushes on it, and lasting until the two part would move every bout.

### The AI

Minds, tactics and command ([Minds](architecture.md#minds)).

- Vanguard's punch throws the 15 kg Skeleton off balance on a left-hand miss: its stance moves
  0.4 m, and thrown first from a fresh stance it falls
  ([record](reference/vanguard.md#standing-miss-return)).
- Vanguard's Rogue and Skeleton never strike a still foe: they stop 0.79 m from it
  (`tests/mind-contract.test.mjs`, the ordered strike, which skips them).
- **Vanguard**, an experimental contender, has no plan: no campaign judged by fight wins
  qualified it against the field ([record](reference/vanguard.md)). The entrant stays as it is,
  an opponent outside Option Mind that the baseline evaluation fights
  ([the baseline](reference/baseline.md)); its tactics are not ported.
- Not built: a learned mind (the bare entrant, `src/entrants/bare/`, is its route, trained
  after Option Mind's design); sight that is blocked (the senses pass every body
  whatever stands between); a library for a body of another shape behind the same seam.
- **Warrior recovery after two rapid Lab shoves remains slow and visually unaccepted**: seed 4, 90 N s twice, the gameplay engine; the reproduction in `tests/idle-settle.test.mjs` uses the Lab's full stand check. The stale recovery action and extra automatic shove are fixed; idle placement yields to disturbances ([record](reference/human-and-strikes.md#disturbances)); smooth rising remains open.
- **The foe's phase reads `rising` in bursts** (`PERCEPTS.phase`): only while the fallen body's
  centre of mass climbs faster than 0.2 m/s. On Option Mind's matches (the Warrior, empty hands,
  against six foes, 36 bouts; Node, the bout world, Rapier, 120 Hz, each side's view of the
  other), all 22 falls read `down` from their first step and 19 of 21 rises read `rising`, about
  0.9 s after the pelvis's lowest point, but only 6 % of the steps from that point to standing
  did. Of 1,321 commits, 88 % read `striking` (about 11 steps into the commit), with 0.4 % of
  clear steps read `striking`. On the Strike drill's still and fight rungs no body fell. Read
  again when a profile has a cell at a rising foe ([the profile](plans/2026-10-27-option-mind.md#the-profile)).
- **Nothing in the rules costs effort**: a mind trained on the verdict alone may find that
  striking without pause pays. Watched once whole minds train; a rule (fatigue) only if it does.
- **Tactics**, for any fighter, choosing skills by their entry conditions and profiles
  ([the profile](plans/2026-10-27-option-mind.md#the-profile)), each asked of a concrete
  failure, one decision at a time, and read by the paired report:
  - the behaviour tactics' estimates (`ActionEstimate`) become the strikes' profiles once they are
    drilled;
  - targets after a guard: when to change surface, action or approach;
  - spacing and commitment: approach, clinch breaking, circling, follow-up timing; spacing is one
    legs skill, `move(goal)` toward a named range ([Option Mind](plans/2026-10-27-option-mind.md), step 13);
  - an option's worth is its profile: attack value, incoming cost, travel time, falls and
    recovery, with no hidden opponent state;
  - ground choices: getting up, moving away, fighting from the ground or waiting, on the same
    falls;
  - selection: valued, ranked and behaviour-list selection, interruption; a reflex is a cue the
    chooser watches, not a layer
    ([Option Mind](plans/2026-10-27-option-mind.md#one-policy-selecting-a-set));
  - orders: obedience against self-preservation, read with orders given; follow orders values
    an order without its walk (`Orders.walk`).
- **The place beside a lying body flips between its sides**: a kick's window is read from where
  the kicking sole stands now (`kick.ts`), which a stride moves about 0.1 m, so the nearer side's
  feet-clear test (`besideLying`, `src/core/intent/action-window.ts`) passes and fails step to step
  and the walk turns back for the far side. Option Mind stomps a lying Warrior 1.2 m off its feet at
  9.2 s at `fe82cf01` and not in 20 s at `d597bd5b`; reading the window from the squared stance
  instead lands 8 of the stomping rung's 12 against 10.
- Covering is late: a cover that leads the blow, a cover of another part, a dodge and a counter
  are not built ([blows](reference/blows.md#covering-searched)); each comes as a skill in the shape
  with its Cover drill.
- Ground positioning's foot-clearance probes (`sensedFootClearance`, `clearFootTranslation`,
  `src/core/navigation/sensed-bounds.ts`) rebuild every foe collider's world points on each call,
  several times a decision; building them once a decision is unmeasured ([step cost](reference/step-cost.md)).
- The oracle, offline research only: its next spaces are a longer horizon, a response held
  longer, two decisions ahead and strikes by name ([oracle](reference/oracle.md)); what it finds
  reaches a mind as profiles and a position's value.
- A player's choices are the trade-offs a Mind's config exposes, offered once their effect is
  understood, with presets that round-trip through the editor, the link and a save.
- The controls are to be worked over in play: the pointer does nothing while a person's body
  stands still.
- Retiring what the new skills replace, each with its records, once they do: the staged rise.
- Team bouts in the Arena, N against N.

### The game

- **The Arena:** the Ladder; wider walking courses, fighting strength and equipped recovery.
- **The Crypt:**
  - how many die under the Duellist's sword over `crypt-clear` is unread. A Crypt fight ends by a
    mind that kills, not by a rule (the owner, 2026-10-24); more die with a faster rise (Recovery),
    and blows on a body that is down, decided to apply once the rise meets its bar
    ([Blows and wounds](#blows-and-wounds));
  - the stance walk runs away sideways after a half turn, read before the walk steered the way its
    route goes ([the stance's walk](reference/locomotion.md#the-stances-walk));
  - the level-clearer's policy numbers (`POLICY`, `src/core/command/clearer.ts`) are first guesses;
  - authored set pieces (`docs/plans/2026-09-23-depths-06-set-pieces.md@144961d4`);
  - the skeleton's intent: ribcage and pelvis fatal, weak joints, blunt blows worth more against
    bone ([architecture](architecture.md#standing-decisions)); today its wounds are the human's;
  - the party carries only short swords; the Rogue's bow needs projectiles;
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
  [bites](reference/reptile-bites.md)): its legs completing the toolkit's legs goal over its four
  bearing ends ([skills](architecture.md#skills)); richer surface response, broader
  recovery, combat against the humans, injury wins across more opponents.
- **Another engine** (Box3D, Jolt or another): a bench adapter in `src/physics-bench/engines/`
  first, then `src/core/engine/<name>.ts` and `CORE_ENGINE=<name> npm test`.

### Findings

- **What the measurements find short:** the open hand bears on its palm's hull where the rise,
  the bar, the posture hold and the support entry were tuned on the capsule; the run's legs cost
  the rise; `docs/reference/native-posture-control.json` names an
  anatomy the body no longer has.
- **Defects found, cause unknown:** a club at 10 m/s under the lab dummy's ball ends a step
  inside it unread. A limp body's slack hand can be kept turning by the solver
  ([lying](reference/rising.md#lying)).
- **Research code no game path reads** retires with its experiment: `predictPointContacts` has
  no game reader, and goes with the local impulse predictor's question.
- **Records no script reads again**, measured afresh when their subject changes:
  [servo and muscle](reference/servo-and-muscle.md), [body and engine](reference/body-and-engine.md),
  [stance tuning](reference/stance-tuning.md#wrench-lever).
