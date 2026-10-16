# Roadmap

Where the project is going, and what is open. A figure here with no record of its own is from a
plan or study since deleted; the commit named beside it holds it. Measure it again before
building on it.

## Where the project is going

Physically simulated bodies as a platform for AI control experiments, built into a game (the
owner's direction, 2026-10-08). Each layer depends only on those below it -- world, body, motor
control, skills, minds -- and a mind may use as much or as little of the stack as it needs
([architecture](architecture.md#minds)).

- **Skills and tactics.** A body has an array of skills; tactics, a meta-controller over them,
  choose among the skills it has as the fight goes. Both come in many flavours. A skill may be
  specific to a body, its attributes or its loadout, but the more general and robust it is the
  better: a body that is resized or made stronger is measured again, not searched again.
- **Competencies first**, proved one by one without assistance: standing, guarding, punching,
  walking, standing up, kicking and running.
- **Items next**, each with its own weight and shape:
  - weapons: a club, a sword, and so on;
  - shields: a buckler, a strapped shield;
  - two-handed items: a staff, a maul;
  - ranged weapons: a bow, a thrown weapon;
  - armour: boots, body, gloves, helm.

  Every weapon keeps its ratio to the club; edged and pointed ones bring the rulebook's other
  mechanisms into play.
- **Assistance as attributes.** Every movement can be done without it. Four assists are planned:
  - stability, an invisible flotation device (`Assist`, built);
  - movement, such as run speed;
  - standing up;
  - attack and defence, a "divine wind" that gives a blow or a guard a boost.

  Each is metered against a ceiling the character's attributes set.
- **Attributes**: body size, weight, strength, muscle speed and the assists' ceilings, so that characters
  differ and skills are tested across them.
- **Later, other ideas** on the same bodies, such as an end-to-end learned controller on the
  muscles. The hand-built skills and the competency suite are its baseline and its benchmark
  (the detached policy interface and replayable environments exist:
  [control foundation](reference/control-foundation.md)).
- **The game around them**:
  - the Arena, a bout of two bodies to a verdict, which a person watches or takes a side in;
  - a Ladder of bouts, to be designed;
  - a Diablo-like Dungeon, where a person commands a party and each member's mind carries the
    orders out.

  Many morphologies, every body a sourced spec: the human is the reference body; the skeleton and
  an authored reptile quadruped are on the core.

## Next phase

The robust-skills plan is closed. What it built: the competency suite on the shared task runner,
run across a grid of bodies, physiques, loadouts and two physics rates, on which today's skills
are read ([competencies](reference/competencies.md): of the owner's thresholds, only the stand's
is met everywhere, and the staged rise does not rise at 480 Hz); physiques (`Physique`,
`src/core/human/physique.ts`: size, weight, strength and speed); the whole-body spike
([whole-body spike](reference/whole-body-spike.md)); and the continuous skill seam. Discrete actions now use lifecycle, resource ownership and
contact-ledger contracts (`src/core/skills/action.ts`). What it did not: the explosive punch. Today's body has a
straight blow over the punch's bar on every cell (`research/punch-ceiling.mjs`), and no controller
tried lands one (`research/greedy-punch.mjs`, [punch layer](analysis/2026-10-08-punch-layer.md)).

The SIMBICON walk and run plan is closed. It built a locomotion class that vaults over its
stance leg and balances by where it puts the swing foot, beside the capture-point walks (the
walking item below). Forward it walks to 1.30 m/s and runs on by a person's run cycle, to about
3.1 m/s for the Warrior, flying between steps; how fast a body runs is its mind's choice of risk,
since a few trials fall at every running pace, and with the club most of them do for the Rogue. The gaits and
Locomotion plan that followed made its walk and its run Move's Walk and Run gaits (`GAITS`),
chosen by a rule list a player edits, and the Lab's Run the Locomotion scenario: five courses at
a pace up to the most the walk holds, in gusts, with each body and what it holds, the bed every
gait is measured on (`research/locomotion-run.mjs`).

Beside it, a mind is a tree of parts (tactics, a skill per kind of action, sub-minds) that a
player sees and changes in the Arena, the Lab and the Crypt; a mind can hold several blows and
choose among them, and the punch's research blows that run in real time are experimental parts
([Minds](architecture.md#minds)).

After it, each with its own plan, in the order each needs the one before:

- **Competencies:**
  - guard, on the shared layer;
  - stepping and turning;
  - walking at a person's pace;
  - a dynamic rise, carrying momentum from one support to the next;
  - kicking;
  - running.
- **Tactics** use shared decisions about targets, approach, actions and defence. The presets
  compose those behaviours over named executors; game orders constrain target identity without
  bypassing action selection. Competitive comparison remains open.
- **Retiring what the new skills replace**, each with its records:
  - the strike repertoire;
  - the staged rise;
  - the opening preset (Scrapper).
- **Items**, as columns of the grid, each a new skill only where one measurably needs it. In
  this order:
  1. armour (mass and shape);
  2. the sword;
  3. the shield (the guard placing other points);
  4. an item in two hands;
  5. ranged weapons, which need projectiles on the core.
- **Assist kinds** beside stability, each read as a skill's performance against its level.

## Where the control work stands

- **Fighters.** One configurable fighter runs every humanoid preset through shared action
  selection, ownership, feedback and the body/muscle contract. Puncher uses edge spacing and
  straight punches; Scrapper uses path actions and low support. The old preset standings,
  including Scrapper's 0.98 bare-handed and 0.10 club win rates against Classic, belong to the
  revision in [the recorded comparison](reference/controller-presets.md), not the current
  controllers. They have not been reranked.
- **The punch.** The planted punch reaches 4.3 to 5.3 m/s and 4 to 10 N s on the fist's hull.
  A person's is 8 m/s ([punch calibration](reference/punch-calibration.md)), and no paired-limb
  family reaches trained-adult force ([trained force](reference/trained-attack-force.md)). The
  body itself has a straight blow over the competency's 6.8 m/s at every cell searched, on
  today's muscles: 7.1 to 12 m/s for both fighters' rear hands, and 7.4 m/s for the Warrior's lead
  hand, landing 0.49 s after the order. None of these controllers lands one: a layer on today's
  stance, the whole-body solve on a timed path, or the same solve asked for all it can give each
  step. What is missing is a controller that sequences the blow
  ([punch](analysis/2026-10-08-punch-layer.md)).
- **Kicks.** Either-foot [front kicks](reference/front-kicks.md) share the punch's tracker and
  cycle. Higher targets and competitive kick selection are open.
- **Rising.** Every humanoid stands up once down (Stand up with `step-up`: Classic's, and the options fighter's get up), in
  the Arena's presets and in the Crypt, where a fall no longer ends a fight:
  - On the owner's 64-fall target (Node stand, Rapier, 120 Hz, Balance 0, Grit 0, 30 s cap,
    `node research/rising-bed.mjs --target --techniques step-up`), step-up stands the Warrior from
    11 of 16 falls empty-handed and 14 of 16 with the club, medians 13.3 and 14.9 s; the Rogue from
    9 and 6 of 16, median 26.3 s and the cap: 40 of 64, against the 45 it stood on the legs before
    the run's (`627ecc3a`: 16, 14, 10 and 5). Its stages are searched again on today's legs. The
    run's strength is what the rise loses: with the legs' torques at their measured peaks and the
    run's speed kept, the same settings stand 46 of 64, but the gait battery falls in 249 of its
    300 trials. On 52 shoves that fell the skeleton (of 96), step-up stands 9; its roll from its
    back to its front is what fails. The known issues of the stand-up and of fast locomotion,
    and the order to take them in, are in `docs/plans/2026-10-16-locomotion-and-stand-up.md`. The
    rest of this entry was read on the old legs. "Rise, then steady" stands 6, 8, 0 and 1 of the same
    falls, medians 29.5 s and over; on the skeleton's shoves, none.
  - None stands within 6 s, and the 4 s median target is not met. The time is the route's, not
    the muscles': brace about 0.7 s, settle 0.7, roll 2.7, rise 9, steady 1.4, then the target's
    verification. Searched at twice the Warrior's strength, or 1.5 times the Rogue's, the route
    stood as often and no faster, so the plan's surge assist (Grit) is not built: a joint-torque
    help cannot shorten a route whose stages wait on balance.
  - The Rogue's search stands 10 of its 16 training falls (first attempts, a 24 s cap) and 15 of
    the target's 32; most of its failures reach the last stage, `even`, out of the lunge onto
    both feet. Get away, Fight on the ground and the other techniques stay experimental; the mirror
    and escape patches held in `research/checkpoints/2026-10-13-ground.zip` are not applied.
  - Eye gates: standing up in the Lab, in Arena bouts and in the Crypt; whether the rise looks
    human. The plan this landed from is `docs/plans/2026-10-13-stand-up.md@ef94828a`.
  - **Fast, robust unassisted recovery remains unsolved.** The optimized compliant-sole recipe
    produced one 15.5583 s development success and failed the robustness objective. The results in
    the rest of this item are on the old legs and the old screen's saved falls. The screen is
    pinned again on today's (`stand-up-acceptance-v2`): step-up completes 11 of its 16 saved falls,
    the fastest in 14.8 s, and external actuation is rejected. Changes to its evaluator, baseline,
    cases or criteria require the owner's agreement. Actual-physics search and feedback reach 6.975 s on that saved fall with unchanged muscles
    and zero balance assistance. Measured muscle-response feedback transfers one demonstration
    to three additional fresh starts in 7.075-7.775 s, but ten other selected starts fail. A recorded
    muscle prefix followed by that feedback completes a different saved side fall in 8.6333 s;
    further physical search shortens that side fall to 6.4167 s with ordinary-host continuation.
    Side-fall measured feedback produces verified 5.9 s and 5.775 s fresh development recoveries
    on opposite sides. A library selected from observed posture and motion completes seven of ten
    trained empty-handed side-fall recipes, two within six seconds. Body-specific muscle-driven
    settling and physical search reach Warrior/club recovery in 6.0333 s. The library completes
    three of sixteen frozen cases, none within six seconds. It does not depend on an exact saved-state hash.
    Four nearby Warrior/club perturbations still fail
    ([settling search](analysis/2026-10-11-stand-up-planning.md#settling-aware-physical-search-2026-10-12)).
    All successes include standing/walking verification;
    the four-second median, broad coverage and gameplay integration remain unfinished
    ([opposite-side feedback](analysis/2026-10-11-stand-up-planning.md#opposite-side-guidance-and-feedback-2026-10-12)).
- **The posture hold.** On the hands' hulls, independent joint feedback
  [holds no installed pose](reference/posture-hold.md) within 2 cm for 10 s. An
  [offline native-rollout controller](reference/native-posture-control.md) holds the half-kneel,
  which shows the pose is feasible.
- **Support entry.** The [support-entry task](reference/support-entry.md) acquires support in 2
  of 4 and 3 of 4 development shoves.
- **The task fixtures.** Point-space strikes, moving strikes, the shared item, defence and the
  bar exist, and all replay exactly. They are development screens, not held-out gameplay results:
  - [point strike](reference/point-strike.md);
  - [moving strike](reference/moving-strike.md);
  - [shared strike](reference/shared-strike.md) and
    [withdrawal](reference/shared-withdrawal.md): 36/36 static and 54/54 moving;
  - [defence](reference/point-defense.md): 33/36 predictive;
  - [bar](reference/bar-posture.md).
- **The whole-body solve.** `wholeBodyTracking` (`src/core/control/whole-body.ts`) is a bounded
  torque solve with contacts and joint stops. It is experimental and is not the game's default.
  It stands to 0.2 N s/kg and punches at 4.2 to 4.4 m/s, at five or six times today's cost a step
  ([whole-body spike](reference/whole-body-spike.md)).
- **Engine profiles.** Gameplay uses `rapier-coordinate`, the measured-angle limit gradient
  ([joint limits](reference/joint-limits.md)); parent-axis `rapier` is the reference engine.
  Directional muscle bounds are an explicit world configuration, and gameplay keeps the
  symmetric reference until recovery is corrected.
- **Unresolved contact questions**, each kept in its record:
  - [joint-stop prediction](reference/joint-stop-tracking.md);
  - [lift-off](reference/contact-liftoff.md);
  - [friction law](reference/contact-friction.md);
  - [the local impulse predictor](reference/contact-step.md);
  - [the multibody joint shapes](reference/solver-contract.md#anatomical-joint-shape-compatibility).

## Open items

### The AI

- Built above the muscles ([architecture](architecture.md#minds)):
  - the mind at the muscles, sub-minds, a mind made from its config, senses, a person's orders;
  - an assist whose ceiling is the character's balance;
  - a bout that saves, loads and forks ([architecture](architecture.md#state));
  - an oracle.

  Not built: a learned mind; sight that is blocked (the senses pass every body whatever stands
  between); a library for a body of another shape behind the same seam.
- **The owner's to choose: each character's balance**, a per cent of its own weight. Every
  character has 0 %, the default it landed at. At 25 % for both sides, 19 of 99 bouts end by a
  fall where 80 do at none, and the mean bout is 55 s where it is 14 s
  ([assist](reference/assist.md)). The moment that goes with a per cent (`Rulebook.balance`,
  0.0026 weight-metres) is proposed with it; 25 % spends the effect.
- **The controls are to be worked over in play.** Until then the pointer does nothing while a
  person's body stands still, and the person walks to turn.
- **The owner's to watch:**
  - a bout fought with orders (`?play=arena&matchup=workshop-fighter,workshop-rogue&you=left`);
  - bouts with balance against none (`&balance=25`, `&balance=100`, `&balance=25,0`);
  - an oracle's bout ([oracle](reference/oracle.md), Watching one).
- **The oracle's readings** ([oracle](reference/oracle.md)). Choosing among seven orders every
  half second, with the true world, turns 6 of 9 lost bouts into wins. With no balance every one
  of those wins is a fall, so it is a ceiling on not falling, not on fencing. Its next spaces:
  - a longer horizon;
  - a response held longer than one period;
  - two decisions looked ahead;
  - strikes chosen by name.
- **The same bout in every engine.** An arena bout is the same to the bit in Node and in a
  browser ([real functions](reference/real-functions.md)). The lab and the crypt still place
  bodies and aim orders with the engine's `Math`; the boundary test's `WORLD_BUILDERS` names the
  modules it holds.
- **Thinking that takes longer than a step** is designed and not built
  (`docs/plans/2026-10-02-step-00-design.md@6220a997`, "Thinking that takes longer than a step").
  A thought is a pure function of a question asked at one step and answered at a step the asker
  names. When an answer is late the world waits (the owner's choice). It is built with its first
  client: a rollout in play, a planner, or a learned mind's slow part.
- **Shared action tactics are built.** Named actions, executor readiness, identity targets,
  approach, conditional selection and terminal feedback share one pipeline. Their competitive
  quality and finishing power remain to be judged in play.
- **Covering is late.** A fighter can cover its head against a blow it sees coming
  (`guard: "cover"`). The cover saves no more of the head than the pose
  ([blows](reference/blows.md#covering-searched)). Not built:
  - a cover that leads the blow;
  - a cover of another part;
  - a dodge;
  - a counter.

### Strikes

- **The strike repertoire.** It is searched for the Warrior, the Rogue and the skeleton, fist and
  club, high and middle (`assets/core/strikes.json`, [blows](reference/blows.md#searched)), and
  Classic throws it. It is to be retired when the new skills meet the suite.
- **The owner's to choose, each landed at its default:**
  - **Where a fighter aims** (an action's region aim): the head, or the part a blow pays most
    on. Aiming at what pays gains 0.015 to 0.018 of the bar's margin over two pilots and wins
    fewer bouts ([blows](reference/blows.md#aim)).
  - **Whether a bare fist strikes at a head at all.** The hand takes the greater share of a blow
    on a head ([wounds](reference/wounds.md#shares)). Thrown at an upper trunk, the same hands net
    0.23 to 0.65 HP.
- **The additions and their seams** ([architecture](architecture.md#what-the-seams-are-for)):
  the face and the vault; an edge and a point, with a sword; a shield; armour; an item in two
  hands; a bow. The next phase's items order replaces the order this list had.

### Blows and wounds

- **The blow rule.** A blow has no striker, and its two surfaces share its energy by their
  compliance ([wounds](reference/wounds.md)). Not built:
  - a tolerance of a part's own (the pool's rule stands, by the owner's answer);
  - the face apart from the rest of the head;
  - armour, a layer more in `energyShares`;
  - an edge and a point on equipment.
- **The owner's to choose, each landed at its default:**
  - **What the bodies hold now that a hit point is 100 J of blunt blow** (`owner-damage-unit`).
    Their hit points are as they were, so each holds 28 % fewer joules
    ([wounds](reference/wounds.md#unit)).
  - **Whether a blunt blow takes a part off.** Today it does, half a part's hit points past
    empty ([bouts](reference/bouts.md#a-hit-point-is-100-j)).
  - **What two bodies that walk into each other cost.** Today any touch that closes is a blow,
    however slight ([bouts](reference/bouts.md#searched-blows)). A floor of 1 J would drop 95 % of
    bare-handed blows and 23 % of their hit points.
  - **The stiffness of the parts no paper was read for** (`contact-stiffness-gaps`). A factor of
    two in one moves a share by 0.06 to 0.17 ([wounds](reference/wounds.md#sensitivity)).
- **Decided, to apply once a rise meets its bar** (the owner, 2026-10-01): a body that is down
  may be struck, and a fall takes nobody out unless a context has its own rule for it. The arena
  continues after falls; in the crypt a fallen body still lies where it fell (`lie`)
  (`docs/plans/2026-10-01-rising-05-rules.md@7f3ebcdb`).
- **A part with no hit points left moves as it did**: a hand emptied by its own blows strikes on.
  A fall wounds nobody.
- **The crypt forgets touches.** It makes its watch again at each body it builds, and a watch made
  again has forgotten which bodies were touching.
- **Two parts meeting at once are two blows.** Two parts of one body that meet another's part in
  one step are each priced from their own contact (`tests/lab-targets.test.mjs`).
- **A blow lasts while the solver pushes on it** (`watchBlows`, `lasts: "pushed"`). Whether a blow
  should instead last until the two have parted is a change of rule, which moves every bout.

### Body and motor control

- **Walking.** The fastest walk held every way is 0.5 m/s for the Warrior and 0.4 for the Rogue
  and the skeleton (`assets/core/stance-envelope.json`), where a person's preferred walk is near
  1.4 m/s (`PERSON_PACE`, `src/core/human/gait.ts`). A dash, a roll, a crouch and turning on the
  spot are not built ([orders](reference/orders.md)).
  - **The stride** (experimental) plans its own steps on the capture point and holds 0.7 m/s
    every way for the Warrior, and 0.5 for the Rogue and the skeleton
    (`assets/core/stride-envelope.json`). On the Lab's lines (`research/locomotion-run.mjs`,
    Node, Rapier, 120 Hz, 20 N gusts) the Warrior holds 1.2 m/s asked forward, 0.95 along the
    line, and 0.7 the other ways; the Rogue 1 forward (0.75 along). Its defaults are the best of a
    search over its settings (`research/locomotion-search.mjs`); against the stance's own step
    they fell 364 times against 425 in 640 paired runs on the lines, and 41 against 62 in 120 on
    the turns.
  - **The stance's own walk is no faster.** Asked 1.2 m/s forward it goes 0.80 along; the other
    ways it holds 0.5.
  - **What caps the walk is where the body bears.** Through each swing the realised centre of
    pressure stays about 3 cm ahead of the bearing sole's middle whatever the stance asks, a
    braking that costs about the fifth of the pace the walk falls short of; asking the pivot
    further back moves the place asked, not the one realised. Stripping one limit at a time (the
    bed's `--probe`), twice the strength lifts the forward walk's speed about 16 %, and an assist
    with it 1.4 m/s; the yaw given alone, lighter legs, stronger ankles, 240 Hz and more friction
    hold no more. What lifted the pace is the swing's share of the step: a longer swing and a
    shorter double support. The joints reach every pose the walk asks; the ankle gives 4 to 7 %
    of the stride's positive work, where a person's gives about half (`research/gait-audit.mjs`).
  - **Tried and not kept:**
    - a shoe's sole (`withSoles`): it falls less under gusts, but the stride holds less;
    - a sole that rolls from heel to toe (`--probe '{"rocker": 0.3}'`): the solver touches one
      flat piece of it at a time, and every rocker walked slower than the box;
    - the trunk cancelling the swing's yaw: not built, since the yaw given free held less;
    - a person's cadence forward (`paced`), landing on contact (`lands`) and lengthening a short
      swing (`lengthen`), each a setting left off;
    - the plan yielding to what the soles miss;
    - soles narrowed to where the ankle holds the whole weight (the Rogue falls at 0.5 m/s);
    - the pelvis turning with the stride, either way;
    - the yaw weighed less in the share;
    - a straighter knee;
    - the push-off as a torque (`launch`, `lead`) and a swing from its launch (`momentum`): settings
      left off. A swing's missed moment weighed at its own lever (`lever` 0.3) falls less and
      walks no faster, so it is left off too;
    - a search's best settings (a 0.31 s swing, `lengthen` and `lever` on): on the forward line
      under gusts (10 seeds, 20 s) the Warrior holds 1.2 m/s asked and reaches 1.01, against the
      defaults' 1.0 asked and 0.88 reached, and the Rogue 1.0 asked and 0.79 reached, against 0.7
      and 0.64. But the Warrior falls walking back with the club at 0.7 m/s, so its envelope every
      way is 0.5 against 0.7, and the game asks every walk at that figure;
    - a second figure of the envelope, the fastest walk straight ahead that turns no slower than
      the walk every way. Straight ahead the stride reaches what it is asked to 1 m/s and stays
      up to 1.4, but at 1 m/s it turns half as fast, and nothing slows a walk for a bend. The
      stance's walk gained the same figure, 0.7 m/s, and its faster approach felled the Rogue in
      the smoke bout;
    - a tendon in series with the ankle's plantar flexors (`MuscleSpec.tendonPositive`), as stiff
      as a person's Achilles tendon: the Warrior's stride falls 3 times in 10 at 1 m/s and every
      time at 1.2, and twice and four times as stiff do not help, which points at the stance's
      torque control rather than the tendon; a stride searched with it is not tried. On the spot
      it keeps the run up 8 times in 8, against 3 rigid. The mechanism is in the core; no body
      has one.
  - **The run** (experimental, `run.ts`) flies between steps, its feet placed as a hopping
    machine places them and the capture point asked where a steady run's is as each foot lands,
    its arms swinging against each other. On the spot it stays up; forward it holds 10 s at about
    1 m/s whatever pace is asked (a search over its settings reached 0.9 m/s held, 0.76 for the
    Rogue, by giving up the flight). Each step the pelvis yaws some 0.8 rad: the swing's yaw is
    more than the bearing sole's twist gives at the ground's friction (0.5), and the bearing hip
    turns to its stop. A foot landed behind its neutral point, to speed up, falls within about
    2 s. A run at 2 m/s needs the swing's yaw cancelled, or more twist at the sole.
  - **The SIMBICON walk** (`simbicon.ts`, the walk every fighter travels by) drives the legs
    itself, with no stance goal. Told it may not run, it walks forward to 1.31 m/s. Its envelope
    (`assets/core/simbicon-envelope.json`: Node stand, Rapier, 120 Hz, calm and in four seeds of
    5 N gusts, with each thing held) is every way 1.4 m/s for the Warrior, 1 for the Rogue and 0.7
    for the skeleton, and forward 1.5, 1.2 and 1.5. It is measured from 0.3, since slower a step's
    pendulum carries the body on past the pace asked or short of it. Each way changes the walk
    asked at its own rates: forward 1.16 m/s² faster and 0.47 slower, the side and back ways 0.5.
    - **Its run** tracks a person's run cycle past 1.31 m/s (`runCycle`, `cycle-run.ts`), three
      clips' (2.75, 3.94 and 4.38 m/s), its pace held no more than `ahead` past the body's own,
      its settings searched on the three bodies bare-handed in the guard, calm and in gusts, at
      haste 100 and 150 % (`research/run-cycle-search.mjs`). Asked 4 or 5 m/s, each body settles
      at its own pace: 3.38 m/s for the Warrior, 3.15 for the Rogue and 3.47 for the skeleton
      ([run's body](reference/run-body.md#the-run-on-it)). Its envelope
      (`assets/core/simbicon-run-envelope.json`, each walk set off 10 s and resting 10 s after)
      holds forward by the rule only to 1.2 for the Warrior and the skeleton and 1.4 for the
      Rogue, since a few trials at every pace fall. Forward at 3 m/s the Warrior held 7 of its 10
      trials, the Rogue 9 and the skeleton 10; at 4, 7, 5 and 8. So whether a body runs is its mind's choice of risk: the envelope keeps
      each way's trials (`StanceEnvelope.tried`), the gait takes any pace that held a fifth of
      them (`REACH`), an order to run or a destination the fastest that held 0.6 (`RUN`,
      `ordered.ts`), and the options fighter closing on a place 0.8 (`SPACE.share`, `walk.ts`).
      In an Arena bout opened at 12 m (`research/bout.mjs`, 8 s), two skeletons close at up to
      2.1 and 1.25 m/s and two Rogues at 1.9 and 2.0, and two Warriors run from 5.25 s, stop from
      about 1.3 m/s and close; all stay up, the Warriors empty-handed and with the club.
    - **The club is what throws the run.** Scored on gust seeds the search never saw (5 to 8; Node
      stand, Rapier, 120 Hz, asked 1.4 to 5, three stops and two turns, balance 0 %), the trials
      that fell, of 50 each:

      | Body | Empty-handed | With the club |
      |---|---|---|
      | Warrior | 0 | 6 |
      | Rogue | 5 | 25 |
      | skeleton | 1 | 8 |

      The Rogue with the club falls in every trial asked 3.5 m/s or more: it gains speed past what
      it holds empty-handed, and at about 3.9 m/s its legs give way and its trunk goes over
      backwards. The Warrior falls in its turns with the club. **Open:** a run that does not ask a
      body past what its legs hold.
    - **A stop soon after the run begins.** A run gives way only from its second landing
      (`RUN_SWITCH.landings`); late in a swing the thigh leans no farther than the straight leg
      reaches the ground, and a landing asked farther bends the stance knee. Asked 1.4 to 3.5 m/s
      and to stop at 2.5 to 8 s (Node stand, Rapier, 120 Hz, calm, balance 0 %), empty and with the
      club, 3 of 96 trials fall, none of a stop asked by 6 s: the Rogue with the club asked 3.5,
      and the skeleton 9 to 10 s after stopping from 1.8 and 2.4. In an Arena bout opened at 8 m
      the Warrior asked 1.4 runs, stops and stays up, but changes gait 3.3 s after the Rogue comes
      near (`tests/move.test.mjs`, a `todo` against 3 s). **Open:** braking faster than the
      planners' 0.3 m/s². A stop from 3.5 m/s takes 7.6 s and 15 m, at the walk's `slowdown`
      (0.47 m/s²); at 0.7 the stop takes 5.5 s and 14 of the 96 fall, the skeleton 10, since its
      guard walk does not take a quicker slowing.
    - **With balance** the gait asks the assist to right the pelvis (`gaitAssist`,
      [assist](reference/assist.md#a-gaits-assist)): on that battery at 25 % the runs that fall go
      from 19 of 150 to 2, the turns from 20 of 60 to 2 and the stops from 18 of 90 to 1. The
      Warrior runs faster for it (3.59 m/s against 3.38), the Rogue and the skeleton slower (2.83
      against 3.15, 3.09 against 3.47). **Open:** what it costs the Rogue's and the skeleton's pace.
    - **Tried and not kept** (that battery): a search with the club in hand (`--holds empty,club`,
      13 generations) found nothing past its start; a run that begins only while the body goes
      across its heading slower than 0.15 or 0.25 m/s, which never runs for the Warrior and the
      Rogue; the club's arm kept in the guard as the other swings (Warrior 4 run falls of 20
      against 6, Rogue no better); a jog clip (CMU 141_34, 2.13 m/s) as the slowest of three clips,
      which scored lower; the run braked at its own rates (`brake`, 1.17 m/s²), which fell 26 of 45
      stops against 16 at the walk's 0.47; and guard arms in the walk after a run.
    - **Departures from the paper:** the late swing lands by the inverted pendulum (Coros 2010)
      in place of the paper's feedback on distance; there is no gravity term through the stance
      leg; gains are a settling time and shares of strength, not N m/rad.
    - **Open:** in about a fifth of steps the pelvis and lumbar alternate from step to step
      (about 2 mrad), traced to the stance hip's spin term; without it the chatter goes and the
      1 m/s walk falls. The skeleton falls on the square and the diamond, its sides and back the
      weakest of the three: 21 of its 80 runs there at Max. Its run turns no faster than
      0.25 rad/s.
    - **Tried and not kept** (the Lab's three tracks, three bodies, seeds 1 to 6, Node stand,
      Rapier, 120 Hz, on the wider gait before it was narrowed):
      - the stance leg's servo on the side way (`vfSide` 2): it speeds the Warrior's and the
        Rogue's square and throws the skeleton's (0.51 to 0.39 of the pace, 19 falls against
        10), capped or not;
      - the landing's trim to the side, which oscillates; forward it brings a slow walk from 1.4
        to 1 of the pace asked, and is a wash on the tracks;
      - the stance ankle's share set per way, and its inversion against the side error
        (`cvAnkleSide`): under 0.01 of the pace on the tracks;
      - more or less lead on the side walk (`leadSide`, `leadOut`): more brings its pace made
        from 0.75 to about 1 of asked, and falls at paces it holds now; less makes it slower;
      - a cadence quickened with the pace (the first state shortened as the walk asked rises):
        worse for every body;
      - a side way searched on the square: its envelope certified side walks the skeleton could
        not hold there.
    - **Later variants of a gait**, each one a character unlocks:
      - **Haste, "more fast":** a faster muscle, not a push. Its knob is Hill's unloaded speed of
        shortening (`ForceVelocityCurve.unloadedSpeed`), which `Physique.speed` already scales;
        strength, mass and gravity stay as they are, so a hasted body cannot float or look
        fast-forwarded. A forward force on the root is rejected: it is an assist, and reads as
        sliding.
        - Built as the attribute (`AttributeSpec.haste`, `jointSpeed`; `&haste=` in the Lab and
          the Arena; [assist](reference/assist.md#haste)). The gait's timing could go with it
          (`SimbiconSettings.hasted`: the gait's times, its run cycle's, and its envelope's speeds
          as the haste to a power, `scaledGait`, `quickened`); measured, the power is 0, since a
          quickened gait steps faster than gravity lets the body fall onto its feet. At 150 % with
          the run as it is, searched at 100 and 150 % together, the Warrior holds 3.67 m/s asked
          5 against 3.38 and the skeleton 3.49 against 3.47; the Rogue goes past 3.5 and falls.
          With balance 25 % as well, nothing of that battery falls but 15 of 300 trials, and the
          three hold 3.68, 2.99 and 3.21. **Open:** a pace past about 3.7 m/s, which no body holds
          at either haste: past it the cycle's stride makes no more speed.
        - **Decided by the owner:** Haste is the legs' muscles alone (the hip's, knee's and
          ankle's exertions in `jointSpeed`), a per cent of the human baseline, 100 % by default,
          in `AttributeSpec` as `balance` is, with an `owner-haste` source; strength or the upper
          body join it only where they help locomotion. The Lab and the Arena take `&haste=` beside
          `&balance=`, and a figure on a hasted body names each side's haste. Its range and each
          character's value are the owner's.
      - **Motion capture, "more smooth":** human joint trajectories by phase as the gait's
        targets, with SIMBICON's landing, balance feedback and stance hip on top (Lee, Kim and Lee
        2010, "Data-driven biped control"). The physics drives the body throughout.
        - **The data:** the CMU Graphics Lab database (mocap.cs.cmu.edu), which places no
          restriction on use; cgspeed's BVH conversion (github.com/Shriinivas/cmubvh) adds none.
          Subjects 111, 113, 141 and 143 each walk forward, back and to the side and run in one
          session; 132 walks slow (45 to 50), fast (17 to 22) and back (13); 83 sidesteps; 127
          runs sidesteps (13, 14); 16, 69, 104 and 127 turn. The list is cgspeed's, to be checked
          against CMU's index. Raw clips stay outside the repo as untrusted data; only derived
          tables are committed.
        - **The import:** `research/mocap-import.mjs` reads a clip into what a SIMBICON walk asks
          of the legs, step by step. Five clips read: forward 141_25, 1.08 m/s at 1.84 steps a
          second; 132_17, 1.83 m/s at 2.03; back 141_31, 0.97 m/s at 1.97; side 141_33, 0.58 m/s
          at 1.6 to 1.9; the run 141_34, 2.05 m/s at 2.42. The side and back walks already match a
          person's speeds; forward a person goes faster by longer steps.
        - **Built for the run:** the run tracks three run clips' cycles (16_35 at 2.75 m/s, 16_45 at
          3.94, 102_05 at 4.38; `assets/core/run-cycle.json`, `research/run-cycle.mjs`), its phase running from
          landing to landing, blended by the pace and scaled by Froude (`runCycle`, `cycle-run.ts`).
        - **Left:** the walk's ways: an asset of angles by phase per way and speed, read as the
          joints' limits read them (`jointAngles`); a `SOURCES` entry per clip; a check that the
          reference posed on each body keeps the soles off the floor in swing and on it in stance;
          a tracking walk; and a comparison on the bed and in the Lab, after which the owner
          chooses the default.
  - **Move** (`move.ts`) walks by the first gait whose rule matches (`MOVE`): braced, in the
    stance's guard, while it stands or a standing foe is within 5 m; otherwise by the SIMBICON
    walk free to run, which runs where the pace asked is past its walk's. A rule lets go of its
    gait half a metre past its distance. The Scrapper gets about by the stride. Classic and the
    options fighter get about by it; an Arena bout opens at 4 m, so it fights braced from its
    first step. The options fighter closes on a place as fast as held 0.8 of its gait's trials and
    it stops from before it (`walker`); Classic's tactics close at the walk. The Crypt's and the Lab's orders
    give a destination, and a person in the Arena runs with Shift (`Orders.run`): each is asked
    the fastest pace forward that held 0.6 of its trials (`orderedIntent`), the Crypt's slowed for its route's corners
    (`CORNER`, `src/dungeon/run.ts`). The walk and the run are one machine and change at once; a
    gait that drives the legs is asked to stand before it changes to another.
  - **The stride does not help a fight**, so a fight is in the stance's walk. In the
    empty-hand league (Node, Rapier, 120 Hz, 66 bouts a striding entrant, at the stride's
    earlier settings: a 0.3 s swing after 0.08 s on both feet), each preset on the stride rates
    under itself on the stance's walk:

    | Preset | Stance's walk | Stride |
    |---|---|---|
    | Puncher | 1546 | 1412 |
    | Scrapper | 1204 | 1126 |
    | Classic | 400 | 312 |

    The Puncher on the stride falls 1.74 times a bout against 0.11; its straight punch drives as
    soon as its foe is in the band, mid-step. Waiting for both feet as the drive begins
    (`landed`) brings that to 1.45; waiting 0.1 s on both feet (`settle`) cures the falls but
    loses every bout to today's Puncher, and no `EDGE` helps.
  - **The owner's to watch and choose:** the five Locomotion courses at Max (`?play=lab`,
    scenario Locomotion), Back and forth at a long distance to see the run, and the Crypt's long
    walks; Move's rules and gaits in the mind editor; whether the skeleton's sides and back are
    worth a search or a change to the body; and whether the bodies take the ankle's tendon.
- **A half turn at the next rate past the envelope's still now and then runs away sideways and
  falls**, one to three of 56 in four cells: after the turn the walk's plan outruns the pace asked
  ([human and strikes](reference/human-and-strikes.md#turning)).
- **Rising's own failures** ([rising](reference/rising.md#where-the-rise-stops)):
  - the kneel-up goes down forward in two of nine forward topples;
  - the Rogue's arms don't raise its chest;
  - the skeleton isn't turned over by the humans' roll;
  - held still, the Warrior allows every waypoint but four lift-offs
    ([postures](reference/postures.md#the-verdict-by-route));
  - on the game's solver iterations a body held stiffly on its own stops doesn't stay
    ([postures](reference/postures.md#the-games-solver)).
- **A limp body does not always come to rest.** A skeleton shoved onto its front and let go
  limp crawls at 25 cm a second ([rising](reference/rising.md#lying),
  [play](reference/play.md#levels)). What in the solver gives the energy is not read.
- **The reach solver runs to its cap out of reach.** It wants a solve whose answer out of reach
  is defined, judged on the bed (`tests/fixtures/reach-solves.json`,
  [step cost](reference/step-cost.md#the-reach-solver-at-its-cap)).
- **Set and not swept**, each said so in its record ([human and strikes](reference/human-and-strikes.md),
  [stance tuning](reference/stance-tuning.md#stance-height)):
  - `PLACING.near`, `ATTACK_METRES`, `EDGE`;
  - `IK_POSTURE_PULL`, `IK_TURN`;
  - `STANCE_LOWER`, a human's `down.fallen`.

  Set on readings from an engine that is gone: `STAND`, `AIM_AHEAD` and the lab's seek budget.
- **Records no script reads again**, to measure afresh when their subject changes:
  - [servo and muscle](reference/servo-and-muscle.md);
  - [body and engine](reference/body-and-engine.md);
  - [stance tuning](reference/stance-tuning.md#wrench-lever).
- **Shoves.** The least impulse held from any direction is 55 N s on the Warrior and 35 on the
  Rogue ([stance tuning](reference/stance-tuning.md#bounded-swing)). No sourced human reference
  exists for shove impulses.
- **The stance doesn't model the thighs touching.**
- **The hip's and the trunk's speed** borrow a two-point extrapolation of hip extension (6.5
  rad/s unloaded) that the elbow's own rule would put near 20 (`BORROWED`,
  `src/core/human/speed.ts`). Changing it is a body change felt in every walk, rise and kick, with
  its before/after tables. It pays only with a controller that drives the hip and trunk near
  their unloaded speed.
- **Contact materials**: a foot's contacts take 0.8, the run's (`FOOT_FRICTION`,
  [the run's body](reference/run-body.md)), and every other contact 0.5. What the rise wants of a
  foot's friction, and a compliant layer under the soles and the open palms, are not measured.
  `contactMass` reads a blow with the joints free.

### The Arena

- Loadouts: a body carries one club or nothing.
- The Ladder.

### The Crypt

- **Party reversals and crowd motion.** The party can fall before returning to a held enemy;
  local steering lacks the locomotion controller's braking response and excludes fallen bodies.
  The [problem and proposal](analysis/2026-10-13-crowd-reversal.md) record the failing regression
  and a physical movement contract to investigate. Movement remains unfixed; its regression
  runs as a non-blocking TODO while the owner defers party-motion work.
- **Authored set pieces** for generated depths
  (`docs/plans/2026-09-23-depths-06-set-pieces.md@144961d4`).
- **The skeleton's intent** ([architecture](architecture.md#standing-decisions)): the ribcage and
  pelvis fatal and the skull not, weak joints, blunt blows worth more against bone. Today its
  wounds are the human's.
- **The skeleton's placeholders** (`skeleton-placeholders` in `SOURCES`) await the owner's
  numbers. Its reference pose presses `GUARD`'s elbows into their stops.
- **Equipment.** The party carries only clubs; the Rogue's bow needs projectiles on the core.
- **Performance.**
  - The crypt's frame rate on the owner's machine is unmeasured.
  - Its triangle budget waits on that frame rate ([crypt art](art/crypt.md#triangles)).
- **Saving a run.** A bout saves and loads (`Duel.save`); a run does not.
- **Senses.** A crypt on senses, and a hero that walks one way and faces another, are not built.
- **Set, to measure on the core** ([play](reference/play.md)): `SET_UPON`, `AIM_COSINE`,
  `LEVEL.clearance`, `FOOTPRINT_METRES`. The owner confirms every value there.
- **Cost of a step** ([step cost](reference/step-cost.md)):
  - A body under control costs 0.36 to 0.46 ms of a step's 8.33, so about 21 are real time in
    Node.
  - The owner's choices: only the near ones have control, there is no cap on them, and the dead
    are fixed where they lie once nobody is near (`levelsOf`).
  - How the dead disappear in time is the owner's to shape.
  - Hearing a run costs 8 to 11 % of its step ([play](reference/play.md#hearing-in-the-step)).
  - A limp body put to sleep through Rapier woke by itself in three of eight cases, not
    understood ([step cost](reference/step-cost.md#a-limp-body-put-to-sleep)).

### Art and look

- **The skeleton's look in play** is the owner's to judge. An optional skeleton costume comes only
  if the owner wants it after seeing the bones in play.
- **A pixel look for the dungeon**, behind a switch
  (`docs/plans/2026-09-24-dungeon-look-06-pixel-look.md@144961d4`).
- **A raking-light check** that `tangentBasis: "babylon-lh"` orients OpenGL normal maps correctly.
- **The look's and the sound's values** are kept as found until the owner confirms them
  ([look](reference/look.md)): torch density, which floor and wall textures ship, `MIX.swish`,
  `MIX.impact`, `CUE.joules`.
- **The sound's gaps:**
  - The arena and the crypt drop unplayed cues at their end.
  - Two blows exchanged at once sound as one (`CueInbox`).
  - A step that stays within the contact margin is not heard
    ([look](reference/look.md#sound)).
- **The reptile needs art.** The forge kit's unused templates could be removed by re-exporting.

### New bodies

- **The reptile** is an 8 kg, 1 HP quadruped on the core, selectable in the arena
  ([reptile](reference/reptile.md)). Open:
  - broader contact-material coverage and tissue yielding beyond the bounded tooth layer;
  - broader recovery;
  - practical combat against the humans;
  - sustained injury wins across a broader set of opponents.

### Engines

- **Another engine** (Box3D, Jolt or another): a bench adapter in `src/physics-bench/engines/`
  first, then `src/core/engine/<name>.ts` and `CORE_ENGINE=<name> npm run test:all`.
