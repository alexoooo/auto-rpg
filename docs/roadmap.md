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
- **Attributes**: body size, weight, strength and the assists' ceilings, so that characters
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

[Robust skills](plans/2026-10-08-skills-platform.md) has five chunks:

1. **A competency suite on the shared task runner**, run across a grid of bodies, physiques,
   loadouts and two physics rates. Today's skills are read on it
   ([competencies](reference/competencies.md)): of the proposed thresholds, only the stand's is
   met everywhere, and the staged rise does not rise at 480 Hz.
2. **Physiques**: size, weight and strength.
3. **A spike** that settles one whole-body layer under a stance and a punch.
4. **A skill contract** that tactics choose by.
5. **An explosive punch** thrown at full reach.

After it, each with its own plan, in the order each needs the one before:

- **Competencies:**
  - guard, on the shared layer;
  - stepping and turning;
  - walking at a person's pace;
  - a dynamic rise, carrying momentum from one support to the next;
  - kicking;
  - running.
- **Tactics** over the skill contract, compared with Classic.
- **Retiring what the new skills replace**, each with its records:
  - the strike repertoire;
  - the staged rise;
  - the path fighter's presets.
- **Items**, as columns of the grid, each a new skill only where one measurably needs it. In
  this order:
  1. armour (mass and shape);
  2. the sword;
  3. the shield (the guard placing other points);
  4. an item in two hands;
  5. ranged weapons, which need projectiles on the core.
- **Assist kinds** beside stability, each read as a skill's performance against its level.

## Where the control work stands

- **Fighters.** Four presets of the path fighter run through the same body and muscle contract:
  Combat, Brawler, the grounded Scrapper and Kicker. Against Classic on two Warriors, each wins
  bare-handed (0.98 to 1.00) and loses with clubs (0.10 to 0.24), every win on the clock
  ([presets](reference/controller-presets.md)).
- **The punch.** The planted punch reaches 4.3 to 5.3 m/s and 4 to 10 N s on the fist's hull.
  A person's is 8 m/s ([punch calibration](reference/punch-calibration.md)), and no paired-limb
  family reaches trained-adult force ([trained force](reference/trained-attack-force.md)). The
  body itself brings the hand to 8.6 m/s at full reach from the guard
  (`docs/analysis/2026-10-08-punch-and-rise-speed.md@7f3ebcdb`).
- **Kicks.** Either-foot [front kicks](reference/front-kicks.md) share the punch's tracker and
  cycle. Higher targets and competitive kick selection are open.
- **Rising.** Rising is built to the feet and continues Arena bouts:
  - Classic tries its staged rise. The path fighter verifies standing support before handing back
    ([recovery cycle](reference/recovery-cycle.md)).
  - On the hands' hulls, the Warrior rises from 11 of 16 falls empty-handed and 9 of 14 with the
    club; the Rogue from 2 of 32. The capsule hands rose from 13, 13 and 6 on the same shoves
    ([rising](reference/rising.md#staged)).
  - Passing rises take 22 to 29 s. Most of it is pose stages of set time, which can lose a
    quarter and no more.
  - The Crypt still uses `lie`.
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
  The next phase's spike measures it.
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
- **Tactics are thin.** The recipe tactics (`recipeTactics`) can't attack a moving body. The arena
  needs tactics of its own beyond walking at the other body and attacking its head.
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
  - **Where a fighter aims** (`RecipeFighterConfig.aim`): the head, or the part a blow pays most
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
  1.4 m/s. Running, a dash, a roll, a crouch and turning on the spot are not built
  ([orders](reference/orders.md)).
- **A half turn at the envelope's 2 rad/s, in a fight, now and then runs away sideways and
  falls.** The pelvis falls behind the heading past the hips' turn
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
- **Contact materials**: every contact has one friction, 0.5. `contactMass` reads a blow with the
  joints free.

### The Arena

- Loadouts: a body carries one club or nothing.
- The Ladder.

### The Crypt

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
  - sustained compression and tissue yielding;
  - broader recovery;
  - practical combat against the humans;
  - blows that end a fight.

### Engines

- **Another engine** (Box3D, Jolt or another): a bench adapter in `src/physics-bench/engines/`
  first, then `src/core/engine/<name>.ts` and `CORE_ENGINE=<name> npm test`.
