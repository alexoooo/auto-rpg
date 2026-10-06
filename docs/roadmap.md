# Roadmap

Where the game is going, and what is open. A figure here with no record of its own is from the
plans this replaces, which commit 2e99105f holds under `docs/plans/`; measure it again before
building on it.

## Where the game is going

- **The Arena**: a bout of two bodies to a verdict. A person watches, or takes a side and gives
  it orders.
- **A Ladder** of bouts, to be designed.
- **A Diablo-like Dungeon**: a dark isometric action RPG after Diablo's Cathedral, with loops,
  scored layouts and authored rooms, where a person commands a party and each member's mind carries
  the orders out.
- **Equipment**: swords, a maul, a mace, a whip, and the loadouts to choose them. Edged and pointed
  weapons bring the rulebook's other mechanisms into play; every weapon keeps its ratio to the club.
- **Many morphologies**: every body a sourced spec, families sharing code and not values. The human
  is the reference body, the skeleton is on the core, a reptile is next.
- **Layered AI**: each layer depending only on those below it -- world, body, motor control,
  skills, minds. Above the muscles a mind is a function from its body's senses to its body's
  effectors, with the layers as one way to write it; a person gives orders
  ([architecture](architecture.md#minds)).

All of it on a physically based core, humans first ([architecture](architecture.md)).

## Next phase

[A shared physical foundation for AI and gameplay](plans/2026-10-04-control-foundation.md):
establish the corrected actuator baseline, separate the physical body from its controller,
and prove that different controllers can use the same research and gameplay environment.
Early demonstrations exercise a two-handed bar and a weapon-space strike/block before expanding
the reference controller. Recovery, either-hand attack/defense, independent two-item use and
shared two-handed items are its capability gates; the reference control stack remains optional.
The vendored engine, detached policy interface, replayable environments and
[equipment tracking](reference/motion-tracking.md), measured sticking support and an
[upright foot-transfer task](reference/support-transition.md) are implemented experimentally.
The shared bar uses a [measured captured posture](reference/bar-posture.md) for return; both
Rapier profiles retain 12/12 development successes, with smaller overall maximum return errors.
The [point-space strike fixture](reference/point-strike.md) adds static contacts and return after
misses with either hand or independent clubs, through the same optional motion interface.
The [moving variant](reference/moving-strike.md) adds delayed object sensing, point prediction
and per-effector impact braking against freely swinging physical targets.
Optional [combined-centre objectives](reference/centre-control.md) separate horizontal balance
from root height and let strike trials watch ten seconds beyond measured return.
The [shared-item strike task](reference/shared-strike.md) adds physical second-grip acquisition
and either-hand release. With [released-hand withdrawal](reference/shared-withdrawal.md),
corrected limits and near-stop prediction, static trials pass 36/36 and moving trials 54/54.
Without near-stop prediction, corrected limits pass 32/36 and 48/54; the reference engine passes
28/36 and 42/54. Remaining failures are skeleton returns. All 270 trials remain upright and
replay exactly; these are development screens, not held-out gameplay results.
The [mechanical defense fixture](reference/point-defense.md) compares predicted interception
against the same guard pose. With the [joint-acceleration correction](reference/joint-acceleration.md),
it passes 33/36 predictive development starts versus 0/36 pose starts; three post-block coverage
failures keep sustained defense open. All replay and remain
upright, so initial contact alone is not the missing gate. Shared-item defense and coordinated
attack/guard still require demonstrations.
Loaded support transitions and Warrior recovery have measured gates. Arena Brawler supplies
driven standing fist combat and Scrapper adds supported low attacks and standing return.
Coordinated shared-item defense, separate/two-hand equipment rendering and damage, broader
bodies and the held-out integrated sequence remain open.

The experimental [angular-limit correction](reference/joint-limits.md), `rapier-coordinate`,
makes limit reactions follow their reported coordinates and is now the gameplay default after
the native coordinate-gradient correction and gameplay regressions pass. The task results above use the parent-axis
reference except the shared-strike comparison explicitly labelled above.
An optional [near-stop controller model](reference/joint-stop-tracking.md) improves corrected-profile
shared static strikes from 26/36 to 34/36 and moving strikes from 39/54 to 51/54. It also
regresses the bar screen from 12/12 to 11/12 and predictive defense from 33/36 to 32/36,
including a defense fall. Subsequent hand withdrawal closes that shared-strike screen's five
remaining failures. It remains experimental: preparation, sustained defense and contact-mode
failures still block default adoption.
An optional [contact lift-off primitive](reference/contact-liftoff.md) passes repeated bounded
lift/recontact cycles on both engine profiles, with exact replay and no assistance. It avoids
freezing a lift objective into an existing sticking contact. Pure contact-driven recovery acquisition remains incomplete;
sliding and choices among multiple supports remain unresolved.
The [friction-law comparison](reference/contact-friction.md) identifies patch versus per-point
solver behavior and validates sustained-sliding predictions for each. Explicit per-point engine
profiles are experimental; anatomical contact-mode selection remains open.
The [local impulse predictor](reference/contact-step.md) passes slab sliding/sticking/unloading
checks with exact replay, but fine-step landing remains unvalidated. Coupled contact/stop
support and release pass a grounded-hinge check; integration with bounded actuator objectives
and anatomical forward agreement remain open.
The optional [rigid-body friction metric](reference/contact-projection.md) matches native
sliding direction on a welded load; the articulated projection gives a different saturated
friction law. This distinction does not close the anatomical first-contact prediction gap.
The [posture audit](reference/posture-limit-models.md) accounts for corrected limit directions.
Its three development witnesses remain statically feasible, but their engine holds fail the
displacement gate under their static torque controller. Independent joint feedback now
[holds installed all fours](reference/posture-hold.md) for ten seconds within 2 cm on both
corrected-limit friction profiles. Direct feedback fails half-kneel and squat; recovery still needs demonstrated
entry, balance and transfer between supports.
An [offline native-rollout controller](reference/native-posture-control.md) passes the same
installed half-kneel hold at the default solver count, through the task's external actuator
interface. Its privileged snapshot search and recorded action tape establish physical
feasibility, not a real-time recovery policy or a support-transfer route.
The [independent support-entry task](reference/support-entry.md) now passes acquisition plus
a ten-second hold in 2/4 patch-friction and 3/4 per-point development shove directions.
All eight reach support, but late acquisition and excess drift remain failures. Other bodies,
loads, broader falls and transfer from hands/shins to useful standing control remain open.
The [joint-shape comparison](reference/solver-contract.md#anatomical-joint-shape-compatibility)
retains impulse joints: the pinned multibody engine traps on two-axis ankles and its three-axis
internal limits use incompatible coordinates. A faithful multibody comparison needs more than
new bindings; it remains a separate engine-extension experiment.

The arena exposes an [experimental point fighter](reference/arena-point-control.md): either
hand or alternating attacks, predictive covers, player orders, equipment selection, and an
optional recovery window. Reference rising now has a measured standing handover, followed by
walking and repeatable point preparation/strike/return cycles in the real Duel. The
[development record](reference/recovery-cycle.md) retains a failed club fall direction and a
post-recovery cycle timeout. Passing rises take 25-29 seconds; these fixtures establish neither
general recovery nor combat quality. Point control now defaults to tracked approach and new-contact
return, including backward steps when crowded. [Moving-opponent validation](reference/arena-engagement.md)
passes the documented useful-return, fall and timeout gates on development and fresh mirrored
cases; pressure timeouts remain and no win-rate claim follows. Faster contact-driven recovery
across bodies, simultaneous coordinated attacks, separate/two-hand item rendering and damage,
and a practical real-time whole-body solver remain open. The independent policy interface and
classic fighter remain available for comparison. The
[autonomous Warrior baseline](reference/arena-combat.md) exposes sustained hand pressure with
little damage in Point self-play. The [next combat controller](plans/2026-10-06-arena-combat.md)
exposes Combat, retained Brawler and grounded Scrapper through the same body and muscle
contract. Brawler wins 591/600 held-out Warrior fist cap bouts against Classic, Point and
linear Combat. Scrapper lands low blows with either hand in controlled knockdowns, attempts
recovery and restores standing, with fresh-world replay. Decisive finishing, low-target pose
coverage, defense timing, broader loadouts and repeated league evaluation remain open. The
standing benchmark does not rate the grounded extension. The original grounded configuration
is retained as `scrapper-v1`. Additional spacing passes held-out win-score gates but stalls
self-play; a slower heading ceiling prevents a stand failure and reduces some Classic falls,
but weakens recovering-target attacks. The [profile gates](reference/ground-combat.md#profile-admission)
retain the rejected cases. Competitive promotion, stronger self-play and low-combat robustness
remain open.

## Open items

### The AI

- The structure above the muscles is built ([architecture](architecture.md#minds)): the mind at
  the muscles, sub-minds, a mind made from its config, senses, a person's orders, an assist whose ceiling is the character's balance, a
  bout that saves, loads and forks ([architecture](architecture.md#state)), and an oracle. Not
  built: a learned mind (a recipe names each side's mind by its config, `DuelRecipe.minds`, and
  the classic fighter, an experimental point fighter and an independent joint-feedback mind are available); sight that is blocked (the senses pass
  every body whatever stands between); a library for a body of another shape behind the same
  seam.
- The owner's to choose, each landed at its default:
  - Each character's balance, a per cent of its own weight. Every character has 0 %. At 25 % for
    both sides, 19 of 99 bouts end by a fall where 80 do at none, and the mean bout is 55 s where
    it is 14 s ([reference/assist.md](reference/assist.md)); a different balance for each makes it
    a trait that tells characters apart. The moment that goes with a per cent
    (`Rulebook.balance`, 0.0026 weight-metres) is proposed with it; 25 % spends the effect.
- The controls are to be worked over in play. Until then the pointer does nothing while a person's
  body stands still, and the person walks to turn; the other way is a slow step toward its heading,
  which moves it without being asked.
- The owner's to watch: a bout fought with orders
  (`?play=arena&matchup=workshop-fighter,workshop-rogue&you=left`); bouts with balance against
  none (`?play=arena&matchup=workshop-fighter,workshop-fighter&balance=25`, `&balance=100`,
  `&balance=25,0`); an oracle's bout ([reference/oracle.md](reference/oracle.md), Watching
  one); and a body that lies where it fell: the lab's Stance (`?play=lab&scenario=stance`) with a
  shove of 90 N s, and an arena bout that ends by a fall
  (`?play=arena&matchup=workshop-fighter,workshop-rogue`: the loser lies, the winner stands).
- The oracle's readings ([reference/oracle.md](reference/oracle.md); counts of 18 sides, not
  rates): choosing among seven orders every half second, with the true world to try them in,
  turns 6 of 9 lost bouts into wins while leaving the tactics' own choice in over 90 % of
  decisions. With no balance every one of those wins is a fall, so it is a ceiling on not
  falling, not on fencing; and it is nearly the same ceiling blind, with each fork nudged a few
  centimetres off the true one, so little of it is knowing the other side's exact future. With
  a balance of 25 % the search turns 6 of 9 again, 2 of them by a wound, and makes bouts
  long: 7 of its 18 reach the cap where 1 of the tactics' 9 does. A search that values 2 s on
  finds how not to be hit, and not how to end a bout.
- The oracle's next spaces to search: a horizon long enough to end a bout with balance, a
  response held longer than one period, two decisions looked ahead, and strikes chosen by name,
  since an attack at where the head stood is taken in under 1 % of decisions. Its next
  readings: a rate over several gaps, a blind search with balance, and a wider nudge.
- An arena bout is the same to the bit in Node and in a browser
  ([reference/real-functions.md](reference/real-functions.md)). The lab and the crypt still place
  bodies and aim orders with the engine's `Math` (`src/lab/`, `src/dungeon/`), so a lab scenario
  or a crypt run is not yet held to be the same in every engine; the boundary test's
  `WORLD_BUILDERS` names the modules it holds, and theirs join it when they are moved.
- Thinking that takes longer than a step has no place yet, and nothing in the game needs one
  yet: tactics are under 1 % of a bout, and the crypt's planning is sight, which is made cheap
  where it stands. A rollout in play, a planner or a learned mind's slow part will. Designed, and
  planned with the first of them (`docs/plans/2026-10-02-step-00-design.md@6220a997`, "Thinking
  that takes longer than a step"): a thought is a pure function of a question asked at one step
  and answered at a step the asker names, both plain data, so it may be thought in the step, in a
  worker or on a server and the game is the same to the bit. Its budget is a count in the
  question; what is out (each thought's kind, question and due step) is state, and its answers
  are not. When an answer is late the world waits (the owner's choice): `World.advance` takes no
  step while one due at it is out, and `World.step` thinks whatever has not come. It would live in
  `src/core/think/`, taken in `World.step` between the sensing hooks and the step hooks.
- The tactics (`fighterTactics`) cannot yet attack a moving body.
- A fighter can cover its head against a blow it sees coming (`guard: "cover"`,
  `&guard=cover`), and does not unless asked: the cover is late, and saves no more of the head
  than the pose ([blows](reference/blows.md#covering-searched)). A Warrior that stands meets
  the Warrior's club blow with its club in the pose, and with its head covering. Left: a cover
  that leads the blow and is in place before it; a cover of another part; a dodge; a counter;
  and the Rogue's club, which a two-point hand goal does not bring to its place
  ([blows](reference/blows.md#a-clubs-line)).
- The arena needs tactics of its own, beyond walking at the other body and attacking its head.

### Strikes

- The repertoire is searched (`assets/core/strikes.json`,
  [reference/blows.md](reference/blows.md#searched)): for the Warrior, the Rogue and the skeleton,
  with a fist and with the club, a blow at a head and a blow at an upper trunk, scored by the
  rule a fight wounds by and thrown by its own body alone. Each of the 12 cells has a recipe;
  the skeleton's club blow at a head is the second of its searches by what they net, the
  first having no window the feet can be set to. A target off every window's height is struck
  by a placed blow.
- The owner's to choose, each landed at its default:
  - Where a fighter aims (`FighterMindConfig.aim`): the head, as it does, or the part its hand's
    blow pays most on (`"pays"`). Over two pilots of 32 starting gaps a cell, aiming at what pays
    (the upper trunk, for every body with either thing held) gains 0.018 and 0.015 of the bar's
    margin, d 0.15 and 0.13, and wins fewer bouts, 0.47 of them where 0.50, falling in 0.39
    where 0.35 ([reference/blows.md](reference/blows.md#aim)). The battery of 384 gaps a cell,
    twice, is 8 h on 26 worker threads and has not been run.
  - Whether a bare fist strikes at a head at all. The hand takes the greater share of a blow on
    a head ([reference/wounds.md](reference/wounds.md#shares)), and the best blows a search finds
    there net 0.007 to 0.026 HP: the Warrior's does a head 0.121 HP and its own hand 0.099, more
    than the hand holds. Thrown at an upper trunk the same hands net 0.23 to 0.65 HP.
  - What the searches cost: the 36 took 4 h 5 min on 24 worker threads, and the windows after
    them about 2 h on 8. A cell is searched again whenever its body, its item or the rule
    changes.
- The owner's to watch: each body's blows in the lab (`?play=lab&scenario=blow`, and the Routine,
  `?play=lab&scenario=routine`), and a bout of each matchup, with clubs and bare-handed
  (`&held=empty`).
- A search's target is the ball of one part, hung alone, and a standing body is more than that
  ([reference/blows.md](reference/blows.md#on-a-standing-body)): the head is in a middle blow's
  way, which the Warrior's club blow at a trunk lands on; the skeleton's club blow at a head
  lands its hand on the foe's arm and not its club, and costs the skeleton more than its foe; a
  fist's place at a head is among a standing foe's feet, and the bare Warrior takes 15 s to
  throw at a Warrior's head. A search at a standing body is not built.
- The skeleton's club strikes 13 of its 18 high and middle targets where every other body and
  thing held strikes 17 or 18: its blow at a trunk reaches from 11 to 43 cm under its head, and
  under that its club is placed and passes
  ([reference/blows.md](reference/blows.md#the-battery-searched)).
- A search throws at 120 Hz, and its blow is another blow at a finer step: the fists at a
  trunk net at 480 Hz 0.6 to 0.8 of what they net at 120, and one lands none
  ([reference/blows.md](reference/blows.md#the-searches)). A search scored at two rates is not
  built.
- A blow that meets nothing unbalances the body that threw it. A search scores a blow thrown at
  nothing that leaves its body down under any miss, at 120 Hz; five of the 36 searches' blows
  stand so at 120 Hz and fall at 480 or 1920, four of them their cells' recipes. A search that
  throws at nothing at a finer step too is not built.
- A window is narrow: the fists' are 4 to 14 cm along the heading and 6 to 16 across, the
  clubs' 8 to 24 and 4 to 12
  ([reference/human-and-strikes.md](reference/human-and-strikes.md#windows)). The feet are set
  within 2 cm of their places (`PLACING.near`), and a recipe whose window is narrower than 4 cm
  is not kept.
- A blow of its own that lands can put a body down. With the club one run of nine completes a
  loop of ten targets, and with empty hands eight
  ([reference/blows.md](reference/blows.md#a-loop-of-ten-searched)); in the Routine each human
  falls in 2 runs of 6 of ten loops, setting its feet for a target or closing on one
  ([reference/lab.md](reference/lab.md#routine-gait)).
- Hand goals: a placed blow is a place and a time for the hand's point, met by the arm alone
  ([reference/blows.md](reference/blows.md#placed)). Left: a speed at the place, and the trunk
  and the legs in the blow, and the strike search in that form; a placed blow lands a tenth of a
  recipe's energy. A recipe stays wherever it beats the hand goal.
- A hand goal's path is a straight line of its point, and for a point of a held thing that line
  can run through places no pose of the arm puts it: of 32 placed club blows 8 landed, and the
  skeleton's club, which rests behind its shoulder, never came within half a metre
  ([reference/blows.md](reference/blows.md#the-battery-placed)). A path a pose can follow from end
  to end (through the joints' angles, or by a point between) is not built.
- The low targets: 8 of 54 are struck, and 16 are filled by the body's own leg as it stands at
  its toes. Nothing stoops or kneels to strike.
- A strike thrown while walking, and one at a target that moves, come with hand goals. A feint
  and a counter are not built; the senses carry what a mind would read for them (`BodySense`).
- The search's separate grounds per trial (`--grounds 20,30,40,25`) have not been run on a full
  search.
- Later, in this order, each with its place in the seams
  ([architecture](architecture.md#what-the-seams-are-for)): the face and the vault; an edge and
  a point, with a sword; a shield; armour; an item in two hands; a bow; a crouch and the low
  targets; a kick.

### Blows and wounds

- A blow has no striker and its two surfaces share its energy by their compliance
  ([architecture](architecture.md#rules-and-wounds), [reference/wounds.md](reference/wounds.md)). Not
  built: a tolerance of a part's own (the pool's rule stands, by the owner's answer, and a hand
  is a third as tough as a knuckle while a head is far tougher than a face:
  [reference/wounds.md](reference/wounds.md#tolerances)); the face apart from the rest of the
  head; armour, which is a layer more in the list `energyShares` already takes; an edge and a
  point, whose prices are in the rulebook and which no item states.
- The owner's to choose, each landed at its default:
  - What the bodies hold now that a hit point is 100 J of blunt blow (`owner-damage-unit`).
    Today their hit points are as they were, so each holds 28 % fewer joules: of 45 bouts with
    clubs, 43 have the winner and the second they had and two long ones are ended by a wound,
    and 14 end by a wound where 12 did. Hit points raised to hold the joules (Warrior 8.3,
    Rogue 5.5) is every bout as it was ([reference/wounds.md](reference/wounds.md#unit)).
  - Whether a blunt blow takes a part off. Today it does, half a part's hit points past empty.
    With clubs, 12 of 45 bouts end by a part coming off; where none does, each of the 12 ends
    by a fatal wound at the same second
    ([reference/bouts.md](reference/bouts.md#a-hit-point-is-100-j)). Three bare left hands in
    those 45 bouts are emptied by a club and come off.
  - What two bodies that walk into each other cost. Today any touch that closes is a blow,
    however slight. With clubs nothing is lost that way; bare-handed, with the repertoire
    before the searched one, 0.14 of the 0.20 HP a bout's blows took was from blows with
    neither a hand nor an item in them (with the searched one a thrown blow's forearm is in
    such blows too, and they take 0.56 of 0.78 HP:
    [reference/bouts.md](reference/bouts.md#searched-blows)), and in the crypt
    every such blow has one side already on the floor and costs the living 0.05 to 0.11 HP over
    four runs. A floor of 1 J would drop 95 % of bare-handed blows and 23 % of their hit
    points, and half a per cent of the clubs'; a body out of the fight taken out of the watch
    would drop the crypt's.
  - The stiffness of the parts no paper was read for (`contact-stiffness-gaps`: the arms, the
    shank and the foot, the middle and lower trunk, each given its neighbour's). A factor of two
    in one moves a share by 0.06 to 0.17 ([reference/wounds.md](reference/wounds.md#sensitivity)).
- The owner's to watch: a bare-handed bout
  (`?play=arena&matchup=workshop-rogue,workshop-rogue&held=empty`) beside one with clubs
  (`?play=arena&matchup=workshop-fighter,workshop-rogue`).
- Fists decide little: of 45 bare-handed bouts 34 end by a fall, 8 by a death and 3 at the
  120 s cap, and a bout's blows take 0.78 of the sides' 10 to 12 HP
  ([reference/bouts.md](reference/bouts.md#searched-blows)).
- A part with no hit points left moves as it did: a hand emptied by its own blows strikes on.
  A fall wounds nobody: the ground is no side of a blow.
- The Warrior with an empty right hand, on the right side of a bout, falls at 2.9 s before any
  touch: it turns a quarter turn from its heading as it sets off. On the left, and on either
  side with the club, it walks.
- The crypt makes its watch again at each body it builds, and a watch made again has forgotten
  which bodies were touching: a touch that is still closing lands once more.
- Two parts of one body that meet another's part in one step are two blows, each priced from its
  own contact as if it met the part alone: a bare Rogue's fist and forearm landing together
  on a ball 6 cm under its head's height read 8.8 J and 2.8 J (`tests/lab-targets.test.mjs`).

### Body and motor control

- Walking: the fastest walk held every way, as a fight plays each body, is 0.5 m/s for the Warrior
  and 0.4 for the Rogue and the skeleton (`assets/core/stance-envelope.json`). Fast walks run at 0.82-0.94 of the pace asked,
  where a person's preferred walk is near 1.4 m/s. The next step is a controller that holds the
  pelvis against the moment the soles miss, or one whole-body solve. The assist supplies the
  moment the soles miss, as a cheat with a ceiling (`docs/reference/assist.md`).
- Rising after a fall is built to the feet and integrated with continuing Arena bouts as well
  as the lab's Character section ("Down"). A fallen body rolls onto its front, comes onto knees
  and hands, kneels up, steps to a
  half kneel and lunges onto both feet, where its stance has it. On the battery of falls the
  Warrior rises from seven falls of eight with nothing in its hands (112 of 127 shoves, 110 up at
  the end of 40 s) and from more than three of four with the club (94 of 121, 97 up), every way
  of lying at half or more; the Rogue from 6 of 32 falls and the skeleton from 1
  ([reference/rising.md](reference/rising.md#staged)); this battery uses the parent-axis
  reference engine. The Arena defaults to continuing after falls: Classic attempts its staged
  rise, while Point and Combat verify standing support before handing control back. The Crypt
  still uses the reference `lie` behavior. Open, each with its readings in the record
  ([reference/rising.md](reference/rising.md#where-the-rise-stops)):
  - the kneel-up goes down forward in two of the nine forward topples read: the body rocks onto
    its knees, the shins lifting, as the hips straighten over the line of the knees;

  - the Rogue's arms do not raise its chest, so fallen forward it is given up at `fours`, and
    with no `fours` its trunk stays down: it wants a recipe of its own;
  - the skeleton is not turned over by the humans' roll, and from its front goes down in the
    half kneel;
  - held still, the Warrior's body allows every waypoint but four lift-offs: sitting back (the
    knee's stop), the hands leaving a half kneel, the front foot alone (balance), the knees
    leaving a kneel on the toes (the ankle, and a foot with no toe joint); every squat holds, and
    the bear's rows hold to a straight-legged fold
    ([reference/postures.md](reference/postures.md#the-verdict-by-route)). The candidates for the
    body, a toe joint, the ankle's range bearing weight, the knee folded on the calf, are each to
    be read in a source first;
  - on the game's solver iterations (`SOLVER`) a body held stiffly on its own stops does not
    stay: the standing body held at 5000 N m falls, and four times the iterations keep it within
    3 cm ([reference/postures.md](reference/postures.md#the-games-solver)). A riser's loaded
    postures are read again there, with the step's cost;
  - a recipe found by search and a learned riser, each a row of the same battery;
  - the fights take rising up once the battery's bar is met: the design and the rules' plan
    are `docs/plans/2026-10-01-rising-00-design.md` and `2026-10-01-rising-05-rules.md`.
- A limp body does not always come to rest: a light segment at a joint's limit on the ground
  goes on moving, a skeleton's hand at 0.2 m/s to the end of a 15 s watch
  ([reference/rising.md](reference/rising.md#lying)). It is what a body lying after a fall and a
  crypt body out of the fight look like. The solver puts energy in: a skeleton shoved onto its
  front and let go limp crawls at 25 cm a second, its potential energy rising 9 J in half a
  second with nothing pushing it while a raised leg rocks on its limit, and 1 fall in 15 is
  still moving 15 s on ([reference/play.md](reference/play.md#levels)). The crypt holds the dead
  once nobody is near, which stops it there. What in the solver gives the energy is not read,
  nor whether a slack joint's passive damping, a sourced number that would change every bout,
  is the cure.
- Running (a flight phase), a dash or lunge, a roll, a crouch, and turning on the spot: a standing
  body under orders does not turn to the pointer, and a half turn made while walking still drops
  the humans now and then ([reference/orders.md](reference/orders.md)). A lower
  stance also needs the hip to hinge; in the lab's Stance a lower centre of mass stands only about
  1 cm lower, and walking from there falls.
- A two-handed grip: a hand holds its own item and nothing holds one item with both.
- A walk turned half round from standing at the envelope's 2 rad/s, in a fight, now and then runs
  away sideways once it is turned and falls with no blow on it, the crypt's hero on two layouts of
  72 and the skeleton on three of 48 (`tests/crypt-core.test.mjs`' layout); the stance battery's
  same turn holds. The cause is read: the pelvis falls behind the heading past the hips' turn; a
  heading bounded by the hips' turn against the pelvis's facing step by step keeps the battery's
  turns and fells the crypt's skeleton more
  ([human and strikes](reference/human-and-strikes.md#turning)). The Routine walks and turns at
  0.3 m/s and 1 rad/s, under the envelope, and is not read at the envelope's.
- Set and not swept, each said so in its record: where a placed foot lands beside its place
  (`PLACING.near`), how near a fighter attacks (`ATTACK_METRES`), the band a fighter holds at the
  edge of a foe's reach (`EDGE`), the shaping of an arm's path (`IK_POSTURE_PULL`, `IK_TURN`)
  ([human and strikes](reference/human-and-strikes.md)); the stance's height and its fall bar
  (`STANCE_LOWER`, `FALLEN`, [stance tuning](reference/stance-tuning.md#stance-height)).
- Set on readings from an engine that is gone, to read again on this one: how long a body stands
  before it throws (`STAND`: the Warrior reads 6 mm/s at 1.5 s where it read 5,
  [human and strikes](reference/human-and-strikes.md#stand-time)); how far ahead a walker on a
  track faces (`AIM_AHEAD`) and the lab's seek budget ([lab](reference/lab.md)).
- Records no script reads again, to measure afresh when their subject changes: the servo's hold
  ([servo and muscle](reference/servo-and-muscle.md)), the servo's time constant on the routine and
  Rapier's per-step disturbance by rate ([body and engine](reference/body-and-engine.md)), the
  wrench lever and the bounded swing's routine table
  ([stance tuning](reference/stance-tuning.md#wrench-lever)), and the models' volumes
  ([human strike reference](reference/human-strike-reference.md), section 8).
- Shoves: the least impulse held from any way is 55 N s on the Warrior and 35 on the Rogue.
  Bounding the swing costs 15 held shoves on the Warrior and 11 on the Rogue
  ([stance tuning](reference/stance-tuning.md#bounded-swing)). No sourced human reference exists
  for shove impulses or for reversal time.
- The stance does not model the thighs touching.
- The reach solver runs to its cap out of reach. A hand sent to a place is solved three times a
  step (`solveReach`); a solve says its passes and motor control counts them (`ReachMeter`). Of
  the 144 solves a bout of the Warrior against the Rogue asked, kept as a bed
  (`tests/fixtures/reach-solves.json`, `node research/reach-bed.mjs`), 43 still take all 200
  passes, and in that bout the eight dearest steps, which ask them, take 8.7 to 10.4 ms where the
  median is 1.2 ([reference/step-cost.md](reference/step-cost.md#the-reach-solver-at-its-cap)).
  42 of them are of a place out of reach, 6.6 mm to 0.49 m beyond the hand: the solve has no
  still point, since the posture's pull is taken along directions that hold the place only where
  the place is reached. What it answers is whichever pass was the last, and the hand's rate and
  acceleration are differences of three such answers. Six rules of its step were tried and none
  ends them at an answer a second solve leaves alone; two of them read 0 solves at the cap and
  were not cures ([reference/step-cost.md](reference/step-cost.md#the-reach-solvers-remedies-tried)).
  It wants a solve whose answer out of reach is defined (the nearest pose, then the posture
  among those), judged on the bed: it ends by stillness, a second solve from its answer moves
  nothing, and a step's three answers vary smoothly.
- A hand goal has no orientation or speed yet, and the trunk takes no goal.
- Attributes: a size range (x0.9-1.18), a weight range (x0.85-1.25), and arm speed as a muscle's
  fibre share.
- Contact materials: every contact has one friction, 0.5.
- `contactMass` reads a blow with the joints free; whether a joint's give belongs in it is open.
- A blow lasts while the solver pushes on it (`watchBlows`, `lasts: "pushed"`), so one the solver
  lets go of for a single step lands again; a touch read with `lasts: "contact"`
  (`src/core/touches.ts`) lands again only once the two have parted. Whether a blow should is a
  change of rule, which moves every bout, and comes with its table.
- Gameplay uses `rapier-coordinate` for the measured-angle joint-limit gradient
  ([record](reference/joint-limits.md)). Parent-axis `rapier` remains a reference engine.
  Recovery hand transfer is gated on actual retained support; repeated falls and the full
  corrected-profile controller migration remain to improve. The vendored binding exposes directional motor bounds and
  whole-step accumulated impulses. Directional muscle actuation is an explicit world configuration;
  gameplay retains the symmetric reference pending contact and recovery correction. Delivered
  torque and both bounds are readable and replayable. Default migration and control retuning
  remain part of the control-foundation phase.

### The Arena

- Loadouts: every body carries one club.
- The Ladder.

### The Crypt

- Authored set pieces for Generated depths: rooms drawn as text (a pillared hall, a pier, four
  chambers) and stamped into a generated room, kept only where every corridor into the room is
  still a way through. A draft is `docs/plans/2026-09-23-depths-06-set-pieces.md@144961d4`.
- The skeleton's intent (see [architecture](architecture.md#standing-decisions)): the ribcage and
  pelvis fatal and the skull not, weak joints, blunt blows worth more against bone. Today its
  wounds are the human's and the head is vital.
- The skeleton's placeholders (a typical man's 79 kg, men's strength tables, the Warrior's 6 hit
  points, `skeleton-placeholders` in `SOURCES`) await the owner's numbers.
- The skeleton's reference pose presses `GUARD`'s elbows into their stops; its envelope is a
  0.2 m/s walk, and its feet slide 5.7 cm in guard.
- The party carries only clubs; a ranged weapon (the Rogue's bow) would need projectiles on the
  core.
- The crypt's frame rate on the owner's machine is unmeasured.
- The crypt's triangle budget waits on its frame rate, measured on a range of hardware: the owner
  sets it from what holds the frame rate there, and names no number before that. A generated
  crypt places up to 415,986 triangles ([art/crypt.md](art/crypt.md#triangles)), and its test
  holds it to what it places today.
- Saving a run. A bout saves and loads (`Duel.save`, [architecture](architecture.md#state)); a
  run does not, since its bodies are built as they wake.
- The run plans for its fighters with the map and hands each its orders; its bodies sense the
  clock alone. A crypt on senses, and a hero that walks one way and faces another, are not built.
- Set, and to measure on the core ([reference/play.md](reference/play.md)): how long a hero
  facing the cursor stands being hit from behind, with `SET_UPON` and `AIM_COSINE` and without.
- How many bodies a step carries ([reference/step-cost.md](reference/step-cost.md#bodies-in-a-step)):
  a body under control costs 0.36 to 0.46 ms of a step's 8.33, so about 21 are real time in Node
  with nothing drawn. The owner's choices: only the near ones have control, there is no cap on
  them, and the dead are fixed where they lie once nobody is near. One rule for a body's level
  does all three (`levelsOf`, [reference/play.md](reference/play.md#levels)): the crypt holds an
  enemy that waits with the party far off, and the dead once their fall is over and nobody walks
  near. With more near than a machine carries the game plays slower; what raises the count is
  what a body costs. The owner's to shape: how the dead disappear in time, which would be a
  fight disposing of a body it has held for long.
- What a body costs: 0.46 ms a step standing alone and about 0.44 in a bout, of which the solver
  is 0.25 to 0.28; a body's control works in arrays made once, and a step allocates about 55 KiB
  a body standing, 124 in a bout, and the collector takes 0.3 % of it or less
  ([reference/step-cost.md](reference/step-cost.md#control-written-into-arrays-made-once)). Two
  levers are left, neither planned: the ground's wrench started from the last step's working set
  (3.5 iterations a call today, each from nothing), which is another bout; and control on
  other threads, which would multiply bodies by cores and is a design of its own. Rapier's own
  step is not planned. Every figure is Node's: the step is not read on a page.
- What is left over 1 ms of a crypt run's own planning is an enemy's body built in the step as
  the party comes near, 2.8 to 4.2 ms three or four times a run
  ([reference/step-cost.md](reference/step-cost.md#sight-read-through-an-index)); its sight,
  read through an index, has a 99th per cent of 0.2 to 0.3 ms. The scenery's memory on the page
  (`sampleCorners`, `src/dungeon/scenery-visibility.ts`) still reads sight sample by sample and
  is not measured.
- The crypt's step ([reference/play.md](reference/play.md#bodies-in-the-step)): a body out of
  the fight lies limp and still costs the solver 0.28 ms a step. Fixed where it lies once it is
  still, it would cost 0.02 ms and could not be pushed aside; an engine that let it rest would
  take none until something touched it. Put to sleep through Rapier's own rigid bodies, four limp
  skeletons cost under 0.01 ms each and a ball dropped on one wakes it alone; of eight, three
  woke of themselves and a segment read 49 m/s, which is not understood
  ([reference/step-cost.md](reference/step-cost.md#a-limp-body-put-to-sleep)).
- Hearing a run costs 8 to 11 % of its step
  ([reference/play.md](reference/play.md#hearing-in-the-step)), nearly all of it asking the
  engine what is near every segment, every step. Rapier's collision events tell of a contact as
  it starts and ends, and a watch on them would read only what began. That is another rule for
  when two are in contact than the solver's contact point, so the touches of
  [reference/look.md](reference/look.md#sound) are counted again under it before it replaces
  the asking.
- The generator keeps 0.65 m clear about every place a body stands (`LEVEL.clearance`), written
  for a body that is gone; a walker's path keeps 0.35 m (`FOOTPRINT_METRES`), less than the
  0.38 m the Warrior's elbows stand out in the pose its spec writes. Both are the owner's to
  confirm, as every value of [reference/play.md](reference/play.md) is.

### Art and look

- The skeleton's look in play is the owner's to judge. Its drawn fist ends about 7 cm short of the
  hand's collider.
- An optional skeleton costume (a loincloth and belt, bracers, one shoulder plate), only if the
  owner wants it after seeing the bones in play. Each piece is rigid, rides a part like the bones,
  collides with nothing, and is checked for clearance over a driven sweep.
- A pixel look for the dungeon, behind a switch: render at a fraction of the canvas and upscale
  without filtering, for the owner to judge against the concept images. A draft is
  `docs/plans/2026-09-24-dungeon-look-06-pixel-look.md@144961d4`.
- A raking-light check that `tangentBasis: "babylon-lh"` in `surface()` orients OpenGL normal maps
  correctly.
- Every value of the look and the sound is kept as found until the owner confirms it
  ([reference/look.md](reference/look.md)). Of them, the dungeon's stand open until the owner
  judges them in play: torch density, and which floor and wall textures ship.
- The arena goes silent at its verdict and the crypt at its run's end, and each drops the cues
  it has not played yet: the blow that decides a bout, what it took off, and the fall that ends
  a bout or a run are not heard. A fall is heard in the lab, and in the crypt while somebody of
  the party still stands.
- In the arena both sides' blows are one pair's (`left:right`), and of a pair's touches within
  60 ms the loudest alone plays (`CueInbox`): two blows exchanged at once sound as one.
- The crypt's listener is made again when a body is built, and remembers no touch under way: a
  segment pressing something at that step, and still closing on it, sounds once more
  (`hearRun`, `src/dungeon/hearing.ts`).
- A body's air (`MIX.swish`, the `swish` formula), which of the two that meet decides a touch's
  voice, and how loud a footfall is beside a blow (`MIX.impact`) are set and not heard: the
  owner's to judge in play.
- A cue is as loud as it gets at 60 J (`CUE.joules`, `src/audio/cues.ts`), a hard fall's landing,
  and a club blow that lands is past it: the searched club blows land 48 to 137 J on their
  targets, and 2 of the 8 touches of one body on another in three bouts are over 60 J
  ([reference/look.md](reference/look.md#touches-measured)). A range that went to the hardest
  blow would make every footfall quieter beside it. The owner's to choose by ear.
- A hand that holds something sounds as what it holds, whichever of the two met
  (`substanceOf`, `src/audio/cues.ts`). A touch names the shapes the solver pushed on
  (`Touch.pairs`), as a blow reads them, and a sound does not read them yet. What a thing is
  made of is a name beside its surface's stiffness (`BodySpec.substance`, `SegmentSpec.surface`):
  whether the softer of two is the one of less stiffness, and a voice follows from that, is open.
- A step that stays within the engine's contact margin is not heard: of 24 recoveries from a
  shove, 14 footfalls ([reference/look.md](reference/look.md#sound)). A touch that began again
  when the solver pushed anew would hear them, and gives a walk more touches than strides.
- The reptile needs art; it starts as procedural shells.
- The unused templates inside `public/assets/forge/forge-kit.glb` could be removed by
  re-exporting from Blender.

### New bodies

- The reptile: a quadruped of about 8 kg that bites, with 1 hit point, several to a dungeon room,
  selectable in the arena, built entirely on the core. Once it exists: the Warrior and the Rogue
  against it, blows to end a fight, one-shots and severs.

### Engines

- Box3D, Jolt or another engine: a bench adapter in `src/physics-bench/engines/` first, then
  `src/core/engine/<name>.ts` and `CORE_ENGINE=<name> npm test`.
