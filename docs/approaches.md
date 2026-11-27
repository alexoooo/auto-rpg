# Approaches

What each approach to travel, standing up, weapon strikes, guarding and minds has done and has
not, and why. Each entry names the mechanism, what it could not do, the cause and the commits
that show it (`git show <commit>` reads the story). An entry changes only when new evidence
contradicts it, cited the same way. How a skill is made and judged is
[the skill recipe](recipes/skill.md); this holds what was found on the way.

Confidence: *repeated* (shown three or more times), *shown* (once or twice, plainly), *suspected*
(the cause inferred, not isolated).

## Travel

Works: **the clip cycle (`cycle-run`) under one learned actor, at running pace.** On flat feet it
held 4.64 m/s (`1e4dd787`); on toes the restored actor reaches 4 m/s from rest on the forward order
and holds 4.73 (`10097fac`). **The torque stance's walk** stands, catches shoves by capture-point
steps and walks to about 1.7 m/s straight (`af46f126`, `62c7a814`).

- **The clip cycle cannot start from a stand, travel below its slowest clip (2.75 m/s), turn on the
  spot or stop quickly.** It replays joint angles by phase with no balance-driven foot placement;
  below its slowest clip it is chaotic, a 3e-5 rad change of lean turning a stop into a fall.
  Slower clips (CMU 16_15, 16_21), a foot landing turned, a capture-point handover at the stop and
  searched braking met 2 of 8 starts and no short place, falling on 21 of 24 (`0c959c5a`); slow
  orders fell before (`70b08c6a`); a jog clip scored lower (`bf9cbbc0`); harder braking never
  stopped a 4 m/s run within 2 s (`4813e84b`, `840a8ac0`, `4582c7c2`). A stop from the run loses
  its time in three places: below the slowest clip the run holds near 2.5 m/s for about a second,
  each braking stance is followed by a flight that does not brake, and the stance's walk takes the
  body only at a landing under its own top pace (handed one above 2 m/s it falls) and then needs
  0.5 to 0.9 s to stand (`840a8ac0`). These phases need a
  controller that places feet by balance. Untested candidates: a learned actor trained on starts
  from rest with the swing foot's landing in its action; a capture-point stepper built to
  accelerate to the cycle's pace. *Repeated.*
- **A run lost to a body change is restored by retraining its actor, not by searching the cycle's
  settings.** Three sessions searched the settings after toes moved the ankle stop from 0.36 to
  0.8 rad, the stop the flat-foot settings leaned on (`13c30286`, `d0b0b724`, `9c26d2f1`,
  `f1da4e97`); the one-actor retrain restored 4.73 m/s (`7db04797`, `10097fac`). *Repeated.*
- **The torque stance holds a constant-height pendulum: no vault, no push-off**; its ankle does 4 to
  7 % of the positive work against a person's 54 % (`c364198c`). It cannot become a run by tuning:
  17 stride settings each moved it about 0.03 m/s (`5d764177`); push-off was tried three times
  (`3feca57b`, `a097ddb8`, `feedaf18`). Its turns hold a routed walk near 0.7 m/s (`b61f11d6`).
  *Repeated.*
- **SIMBICON and spring-mass hop runs did not fly on these bodies**: every push-off structure fell
  within a second, the ankle stop bounding lift (`8dc29686`, `02530940`). Shown on flat feet;
  unread on toes. *Shown.*
- **Timing a gait faster than its controller places feet falls** (Haste: `f1014a27`, `65e674be`,
  `b21d6687`). *Repeated.*
- **The stance's walk takes about a second from a stand before the body travels**: half a second
  with both feet down while the weight goes 10 cm onto one foot (the shift waits for the capture
  point over the bearing sole), a first step in place, the centre 0.00 m gone at 1.0 s ordered
  away, 0.06 m ordered forward, and 1.2 m/s only from 1.5 s. It cannot step out of a blow it has
  not foreseen by a second. Given 1 m/s by no muscle of its own the body is caught at once and
  stands half a metre off in half a second; given 1.5 m/s it falls in 4 trials of 21
  (`fd8ec9d56`). *Shown.*
- **A walk braked for the edge of its reach stops outside it and steps again**: navigation asked
  the speed rule to stop at the place's distance less its reach. The braced walk stops about 5 cm
  out, and each braced step swings the centre 0.1 to 0.24 m across first, so a 0.3 m braced walk
  never came within 5 cm in 3 s. Braked for the place (`30fc95f23`) it arrives at 1.76 s; the run
  0.15 s sooner; staggered alike. The game's Mind braking so read 0.439 (0.392 to 0.490) against
  itself braking for the edge on draws 3 to 8 and 0.507 (0.451 to 0.563) on 9 to 14. A back step
  falls within 1.5 s about as often under either (5 of 51 against 4 of 53 over 6 mirrors). What
  else leant on the old braking is not known. *Shown.*
- **A gait is in the game only when the game chooses it**: an installed run went unchosen until the
  Braced walk's price and the lowering wrapper were fixed (`b61f11d6`). The Dungeon's and the
  Lab's gait choice shows it. *Shown.*
- **The stance's catch holds a shove while no skill holds the legs; a catch let take over a pose
  cost the game's kick its value**: shoves of 0.8 to 2.0 m/s given the Warrior's Mind standing
  still in its bouts felled 151 of 926 with nothing under way, 146 of 198 during the kick and 70
  of 114 during the stomp, since a skill's supported pose takes no step. A pose on both feet let
  go once its capture point ran away past them felled 84 of 270 during the kick, but the bouts'
  falls held (2.04 a minute against 2.03) and the Mind with it scored 0.472 (0.406 to 0.531)
  against itself without a kick, where it had scored 0.613; let go on one foot too, the kick's
  drive was let go and its leg pressed down (`4db78ac2f`). *Shown.*
- **A longer catch holds more shoves and spares none of the bouts' falls**: 78 % of the catch's
  landings are cut short of their aim, half at its longest step and half by the leg's reach from
  hips it plans 0.1 m lower than the stance holds them. Hips asked down while a catch runs changed
  nothing; the longest catch 1.4 of the leg, not 1.2, felled 25.9 % of shoves against 29.5 % and
  the bouts' falls held (2.08 a minute against 2.03). The bouts' falls after a blow follow light
  blows taken during the own kick, not shoves (`0dfed461f`). *Shown.*
- **Where standing feet go stays two rules**: the idle footing (the square carriage's, about the
  sole that stays, after a second still) and a carriage's footing about the centre at once. One
  rule for both moved the back step's evaluation from 1 fall in 24 to 3 to 9 (`855e15b25`,
  `c060d7472`). The idle footing does not cost balance: in 768 falls none began within 2 s of a
  placement. *Shown.*

## Standing up

Works: **toes that bend (the slab in `toes.ts`, ankle dorsiflexion to 0.8 rad) and the sit-back**:
from hands and knees the Warrior stood 32 of 32, median 3.3 s; without toes, none (`13684ff1`).
**Ground Options priced by measured profiles** in the Option Mind; the planned climb. The learned
rise (an actor steering step-up's settings) stood 62 of 64 on the target of its day (`68e9ea71`);
it was deleted without a reading (`a107a3ee`), not ruled out.

- **A rise of timed poses cannot be made fast by changing its times**: its stages wait on balance,
  so shorter stages fall more and a gain on one set of falls is lost on the next (`7f3ebcdb`,
  `14ccd6d1`, `1a4cfa67`, `e8d6c775`). *Repeated.*
- **Every route stalls moving the weight from hands and knees onto feet under the centre of mass;
  without toes no controller here makes it** (`63b74deb`, `13684ff1`, `9e7d7603`). *Repeated.*
- **More strength does not shorten a rise**: the joints run well under their strength (`317fbf13`,
  `94a3f567`, `e8d6c775`). Grit is not a torque surge. *Repeated.*
- **An assist helps only a feedback controller; a lift that does the rising is a wire** (`4ebb4d8d`,
  `4316eaa2`). *Shown.*
- **A stage machine advancing on contacts stands none of the target's falls** (`415480c6`,
  `9d1571a6`, `a19748a0`). *Repeated.*
- **An open-loop rise searched on one fall fails falls 1 to 2 degrees away** (`58f10e91`).
  *Repeated.*
- **A rise from the back by poses alone stands none**: only a bearing phase carrying the centre of
  mass over the feet rises from there (`58f10e91`, `2f7404b8`). *Shown.*
- **Rapier cannot carry a light hinged toe under body weight**, at 120 or 480 Hz (`15e820ce`,
  `c6c3eb6f`, `76bc29c0`). A different toe changes the slab. *Shown.*
- **The Rogue cannot press her chest up**: elbow extension 23 to 27 N m against the Warrior's 57;
  ten stage changes stood no more (`bff75d1b`). Her rise needs stronger arms or a route that does
  not push up on them. *Shown.*
- **A one-step contact predictor agreed with the engine on a slab and did not make a hold**: built
  as a diagnostic of stand-up's contact mismatch (a held point at a flat hand's middle leaves free
  what the ground prevents), it predicted the next step's contact and joint-stop impulses through
  the body's coupled mass, applying nothing (`7c1a2cf9e`, `fb88770c7`, `afabc97c7`, `82912bc53`).
  On its fixtures, Node core stand, `rapier-coordinate-coulomb`, the next step's velocity came
  within 0.007 m/s and 0.042 rad/s of the engine's at 120 Hz, landing included; at 1920 Hz a
  landing missed by 0.17 m/s and 0.40 rad/s. An inverse control built on it, on the Warrior's
  all-fours witness at 120 Hz, rejected no step yet drifted 90 mm in a second, its first step off
  by 0.14 m/s and 2.0 rad/s, and with it every weighting tried collapsed within 10 s; independent
  velocity feedback held all fours (2026-10-05 analysis, recovery support). The game never ran
  it: it moved to research (`316db64d2`, its equipment and constrained mass after it,
  `fc5d1e492`) and was deleted by the owner's word. A solve's
  convergence is not the engine's agreement. *Shown.*

## Weapon strikes

Works: **the bonk**: a graded score holding the form, the footing and facing set before the windup,
then CMA over several places at both rates: 29 of 30 held out (`9ef3f183`, `fbd33453`). The buckler
ward (below).

- **A blow driven by tracking a declared path carries a tenth of a swing's energy**: placed blows,
  blade actions at 0.8 m/s, the bonk's course at 2 to 7 J (`456313f3`, `80e47c7c`, `30a776e0`).
  *Repeated.*
- **An open-loop swing works only from the start it was searched from**: 1.5 cm of foot took one
  bonk from 96 to 63 J (`9ef3f183`); a blow searched at one rate misses at the other (`a6e778e2`).
  *Repeated.*
- **An open-loop blow strikes where the target stood when it committed**: moving targets need a
  steer inside the stroke (`ac95c74d`, `79b2631c`); walking in, the bonk mostly meets the head with
  the shaft before the swell (`7ed3c982`). *Shown.*
- **The bonk's time is its footwork's steps, not its footing.** From the action's start to contact
  at a 1 m gap takes 1.9 s, 1.36 s of it the two steps that set the feet, each a weight shift and
  a swing. A foot arriving from a walk is never within the 2 cm a placed foot needs
  (`PLACING.near`), so both feet step wherever the footing is. A search of the footing alone found
  none faster, and placing within 8 cm cut the footwork from 2.0 to 1.6 s without landing more;
  the swing without its footing lands 1 of 16 (`c460c637`, `f61dd813`). A faster bonk takes fewer
  or quicker steps. *Shown.*
- **A swung sword cut fails on its edge's orientation, not on speed**: with the wrist turning the
  edge onto its path through the stroke, the grip lays the blade square to the hand
  (`13ad8999`, `8b2fee9e`, `9ca0a63d`). The game strikes with the sword by the thrust alone. The
  thrust is suspected of failing on the same grip. *Suspected.*

## Unarmed strikes

Works: **A strike made apart from the legs** is the first strike the owner accepted in a fight
(`straight-punch/moving`, 2026-11-16: "this is the first time we've made real progress on any
strike skill"). Its own record, begun as the installed strike's with the legs let go
(`e6ac1afc2`); a learned steer of its stroke (`c6f963ccb`), trained on blows thrown while the
walk goes on, its episodes from the moment it is ready (`f2b22de19`); its window set where the
fighters stand (`2c10a7fbe`); the walk asked into the blow through its Option's site, no gait's
code changed (`deeper`, `e29d81e7d`); a narrower window for the weight (`8f55482d5`). Against the
installed punch in the same 48 bouts: 202 landed to 7, a median 1.05 hp. The landed count is as
much the Mind's as the stroke's: the same networks landed half as often before the Mind valued
the life it takes over the life it loses (`aee4b6342`). *Shown.*

- **A tracking controller cannot throw a blow at a person's speed**: a tracker following a
  declared course runs behind it by its response time, and at a blow's speed that lag is the
  stroke. Effector paths, whole-body and greedy solves, an arm-tracking layer and a point-driven
  fist reached 4 to 6 m/s against 6.8 (`13439495`, `62420987`, `127eb165`, `7d9ee206`,
  `a340fbac`, `87d13005`). *Repeated.*
- **A controller tuned to one strength or speed cannot use more of either**: its activations
  overdrive or mistime the larger muscle. Grit as a strength surge and Haste as faster muscles add
  nothing to a controller that was not searched or trained across the attribute's range
  (`94a3f567`, `b21d6687`, `e8d6c775`, `1f6b963b`). *Repeated.*
- **A light body cannot meet a mass-scaled strike bar by more speed**: the Skeleton's fist meets
  0.09 to 0.22 kg whatever its speed (`0c3b4599`, `168a82e6`, `2793a30c`, `ed11435a`).
  *Repeated.*
- **The learned punch's window (0.89 to 1.01 m) is not where fighters stand** (about 0.6 m, the
  foe's guard over the mark); training on fight moments failed twice (`d664e869`, `d11e7e9d`,
  `843a8f8b`). *Suspected.*
- **A profile the Mind fights by rests on twenty times sparring's starts**: on `sparring`'s 480 the
  draw decided whether two Warriors fought at aggression 2 (91 % of a bout silent on one draw, 37 %
  on its twin), and either large draw alone moved a reading at one range by half; `sparring-drawn`
  and `sparring-judge` together fought in 46 of 48 bouts (`54dc338cc`). *Shown.*
- **A strike's setting read on twelve bouts moves by a third between neighbouring settings** and
  replays of one record (6.28 and 7.32 landed a bout-minute); the best of several read on one set
  of bouts fell on fresh gaps (`moving`'s band 0.15: 10.95 on the choosing bouts, 5.97 on fresh
  ones, `8f55482d5`). A checkpoint read by another's profiles at 12.11 landed a bout-minute read
  6.96 with its own (`8f55482d5`). *Shown.*

**The kick, a strike on one foot**: the front push kick at the middle, the owner's choice as the
kick likeliest to fell (2026-11-23: "dynamic and strong, not like today's slow and awkward
stomp"); on sparring-feet it fells the foe after 26 % of its starts. The weight shifted onto
the standing foot, the leg folded up to the mark's height and driven out level at it (the push
kick, `kick/push`) or on a searched schedule (`kick/kick`), the foot set down by the stance's own
step and the body recentred by its own standing (`src/skills/strikes/kick/`). The figures that
follow, to the findings, are the schedule's kick. The game's Mind with it beat
the same Mind without it in 0.590 of 288 warrior-drawn bouts (`7b2e9dc9f`). Its table cell, on
the Strike drill's `middle` rung: 0.776 hp a second empty-handed against the punch's 1.563, 2 of
32 on the mark at 15 m/s, 4 fallen (`776e9c06e`). Dynamic, the owner's first bar: on that rung
the record lands 1.03 s from the order at a median 9.1 m/s (`5b6b53f2f`), against the punch's
0.22 s, the stomp's 2.60 s at a body lying, and a person's front kick at a target, 1.08 to
1.14 s and 8.6 to 9.6 m/s for trained men (sub-elite and elite)
([the reference](reference/human-strike-reference.md#3c-front-kick)): a person's pace,
though it lands on the mark in few trials. What it found:

- **A skill on one foot reads its feet every step.** The kick read its soles' outline once, when it
  was made; after any walk its centre was never over the stale sole, so every kick the Mind walked
  in for stalled at its transfer's deadline. Read every step, and searched again, the Mind with
  the kick went from winning 0.024 of its bouts against the Mind without it to 0.590
  (`0b6886eac`, `5b6b53f2f`). *Shown.*
- **A strike that holds the legs gives them back to the stance when it is knocked.** A blow during
  the weight shift carried the centre off both feet while the kick held them planted; 103 of 217
  sparring falls began there. Released to the stance's own standing, which steps, none did
  (`6a339ee8f`). *Shown.*
- **A schedule's channels are not aimed**, so a schedule that drives the hip and knee early decides
  where the foot goes: the kick meets the target's thighs from below (0.65 to 0.9 m against the
  mark's 1.19 m) before its aimed chamber has begun. With those pushes held at none the aim owns
  the leg and lands on the mark more often (14 of 32 at 480 Hz), but falls in half its trials,
  in the set-down (`89f39640b`). *Shown.*
- **Its set-down falls are the stance's catch failing**: the drive turns the pelvis about 40°, and
  as the leg comes back the standing foot leaves the ground and the body runs backward. For that
  kick a set-down timed by its way, one left to the stance's catch, and a re-chamber before it
  each fell as often or more on the drill (`6a339ee8f`, `89f39640b`); for the push kick in
  fights the stance's catch is the better set-down (below). *Shown.*
- **A man's kick profile changes every Mind that prices a man**, since a foe is modelled by every
  strike measured on its body (`foeModel`); measured, they made the Mind with the kick win less
  (0.543), so they are kept out of the asset (`020532cf9`). *Shown.*
- **The table's value pays a foot that meets the thighs**, so a search on it finds a leg that sweeps
  up. The owner, looking at it in the Arena: "the leg sweeps up mostly (not really straight
  toward the opponent)". In the Warrior's own bouts the foot rose above his own head in 42 % of
  kicks and came no nearer the foe's middle than 0.55 m (`research/runs/kick-look/`). The aimed
  drive made a push kick, chambered until the foot is up and then driven out level
  (`466c57285`), and searched on the table's value, still landed on the mark in none of 32
  trials. Searched with only blows on the mark counting (`--on-mark`, `effcac59c`), it lands
  in 11 of 32 at 120 and at 480 Hz against the old kick's 2 and 0; it falls more (10 and 15
  against 4 and 6), and its foot goes over the kicker's head in 13 % of kicks. The Warrior held it
  (`kick/push`) until the front kick (`kick/front`, the kicker-falls plan); the old kick is the
  variation `kick/kick` (`ecf5182ef`). The owner, looking at it: "the kick looks better now".
  Its table cells read worse in every loadout, 0.19 to 0.30 hp a
  second against 0.40 to 0.78, landing on the mark in 7 to 13 of 32 where the old kick landed in
  2: the old kick's value was traded off the mark. In the game's Mind it costs nothing measured:
  with it the Mind beat the Mind without a kick in 0.613 of 288 warrior-drawn bouts (the old
  kick 0.590), and scored 0.455 (0.396 to 0.510) against the Mind with the old kick
  (`research/runs/kick/match/`). *Shown.*
- **The kicker's own loss is the foe's trades, not its own kick**: over 93 kicks the kicker lost
  38.8 HP to the foe's 91.0, most of it the foe's foot on its trunk while both kicked; its own
  foot meeting a body costs it almost nothing, as the fist's (`research/runs/kick-look/`).
  *Shown.*
- **The push kick's falls are set before its set-down's catch; holding its centre ahead cuts them
  without a gain**: at the set-down's start the capture point is past the standing heel, by more
  than the longest catch reaches, where the kicker goes down (`research/runs/capture/`). The
  centre held 0.1 m ahead of the standing sole (`ahead`) left the kicker down after 44 of 94
  kicks in fights against 68 of 103, but the drill's search placed it at 0.02 m for no gain
  (0.254 against 0.251), and in 288 warrior-drawn bouts the Mind with it scored 0.469 (0.420 to
  0.517) against the Mind without; the records hold 0 (`research/runs/kick/`). *Shown.*
- **The push kick's falls are its own drive's, and its hard brake is its value**: in fights a kick
  that misses falls as often as one that lands (13 of 13 against 63 of 81); the standing foot
  leaves the ground late in the drive as the leg is braked onto its goal. Braked at 100 rad/s²
  against the record's 365, the kicker was down after 57 % of kicks against 68 % but its foot came
  no nearer the foe's middle than 0.52 m against 0.43, and in 288 warrior-drawn bouts it scored
  0.347 (0.299 to 0.399) against the record (`a5fff57da`). A schedule's pushes on the standing
  leg never acted while the stance stood on it, the stance driving its own legs over a push
  (`src/control/motor.ts`), and are gone from the kick's schedule and its search. *Shown.*
- **The low kick takes more from a body lying than the stomp and gives it back in falls**: the
  owner on the low attack, "it doesn't have to be a stomp, it can be like kicking a football or
  anything". The stomp lands 2.7 s from the order and a foe laid down who fights back is mostly
  up by then (`sparring-laid`: landed 0.148, 0.004 hp a second of its cycle). The kick's
  executor with the push kick's record, its height band lowered to a lying trunk and the rest
  searched on `stomping-twin`, is the stomp's variation `stomp/kick` (`4f8a6dbf1`): on the same
  trials 0.082 hp a second, 1.00 s to contact at 38 J, landed 0.158, fell 0.315 against 0.277.
  In the game's Mind's bouts a downed foe lost 1.11 hp a minute against 0.67, but the kicker went
  down more, and the Mind holding it scored 0.517 (0.472 to 0.563) against the Mind with the
  stomp and knocked out within 60 s in 22.6 % (15.7 to 31.5) of its mirror bouts against 34.8 %;
  the Warrior does not hold it. Searched again at a foe that fights back (48 of `sparring-laid`'s
  trials), the schedule read flat for twenty generations (`research/runs/low/`). *Shown.*
- **The drill's falls are not the fights', and the set-down is the stance's own catch**: the owner,
  "reducing falls of the kicker should be the main priority now they basically work". On the
  drill's middle rung every push kick throws the pelvis back as the hip drives (its forward
  vector 0.56 high) and puts the standing hip on its extension stop; leaning the trunk forward
  in the drive cut its falls from 10 of 32 to 2 (lean 0.45), but in fights it changed nothing:
  3.94 downs a mirror bout against 3.88, and 0.477 against the game's Mind. In fights 97 % of
  the game's Mind's kicks meet the foe, from 0.8 m centre to centre, and the kicker was down
  after 77.6 % of those that drove (304 of 392); the falls come in the set-down, a third after a
  blow. The set-down stepped the foot back to where it stood, wherever the body was going;
  aimed at the capture point instead it read flat (308 of 400), and a re-chamber under the pose
  before it fell in 24 and 32 of 32 drill trials. Left to the stance's own standing, which
  steps to catch the body as the recentre does, the kicker was down after 65.7 % (286 of 435),
  the Mind knocked out within 60 s in 38.9 % (32.6 to 45.5) of its mirror bouts at 3.64 downs a
  bout against 34.7 % and 3.88, and scored 0.483 (0.434 to 0.531) against the Mind before it.
  The set-down is that (`research/runs/falls/`). *Shown.*

## Guarding

Works: **the buckler ward**, holding the face between the foe's weapon hand and the body and led
through the sense delay: the Warrior and the Rogue meet about 98 % of club and 80 % of sword blows;
the Skeleton falls on 11 to 12 of 50 (`e563ce37`).

- **A cover that waits to see the blow arrives late**: the threat shows 0.14 to 0.16 s before
  impact and the hand needs about 0.3 s (`00dd461a`). A guard is placed before the blow shows.
  *Repeated.*
- **A punch misses a body that has left, and a step begun on seeing it is too late**: the
  Warrior's moving punch reaches to 1.0 m centre to centre (the defender that far 0.225 s after
  the fire, 1 of 128 took 0.5 hp; nearer, 341 of 841), and lands 0.225 s after it fires where a
  body sees 0.15 s late. A defender walking away on seeing the punch takes what one standing
  does (20 of 40 against 23 of 41); one walking in takes it double; one that only walks or keeps
  away keeps its life by not being in the fight (in punching range 4 to 11 % of the time). A
  body given 0.5 m/s away at once takes 16 % of the Mind's punches where one standing takes
  38 % (`fd8ec9d56`). The step that does it, the back step (`back-step`), is in the game's Mind,
  its bars the owner's, read on gaps no setting was chosen on:
  - **In its drill, ordered** (`npm run evaluate -- back-step option-drill --protocol mind-held`,
    beside `mind-held-standing`, the same 48 fights standing in the carriage): of the Mind's
    punches it takes 16.8 % (14.6 to 19.6) against standing's 18.0 % (16.7 to 19.5), where the
    bar asked half; 4.05 HP lost a fight against 6.02; down in 2 of 48; back in reach after 64 %
    of the punches it left against standing's 67 % (of 33). The sway itself takes 9.8 % while it
    goes back and 15.5 % as it comes in; the drill's order then steps it in and follows for
    1.6 s more, 20 to 21 %, and 71 of the 127 taken land there. Against the drilled attacker 0 of
    42 against 23 of 40 (`drilled-held`). Not met against the Mind, accepted as read by the owner.
  - **Chosen by the Mind** (`npm run match -- option --previous option --ablate
    options.steps-back=null --protocol warrior-drawn`): the Warrior with it wins 0.601 (0.545 to
    0.656) of 288 bouts against one without, 1.33 HP a minute less lost (0.75 to 1.89).
  - **The mirror** (`npm run evaluate -- scorecard --previous option --ablate
    options.steps-back=null --protocol warrior-drawn`): two with it stand silent 15.8 % of a bout
    against 5.8 % without, paired 10.0 points (8.2 to 11.7) over 216 gaps, every bout a knockout,
    where the bar asked at most 8. The owner accepted it as read at 9.9, the same bouts counted
    over time on the 144 held out (time pooled, the mean of each bout's share here).
  - **Watched** by the owner, 2026-11-19: "i watched it in the browser, honestly it looks pretty
    good. i compared empty handed warrior without staggered/step-back (which is what we started
    with) vs with both -- and the two skills fight significantly better."
  - **Swayed by its capture point**: a sway that asked the centre 0.1 m past the rear sole, for
    the stance to clamp, threw a body already going back past what its catching steps held (one
    traced, no blow taken: the capture point 0.09, 0.17, then 0.5 m out, the man at 2.07 m/s and
    down). Asked where its capture point comes over the rear sole's middle instead, it falls in 1
    of 48 drill fights against 10 (`mind-held`), takes 0.295 of the punches against 0.317, loses
    5.39 HP a fight against 4.42, the bodies standing longer; the scorecard's knockouts within
    60 s 0.667 (0.601 to 0.726) against 0.597.
  *Shown.*
- **More blocks are not more wins**: a hand at cover is a hand not countering (`8b3c65b8`,
  `1500f2da`). A guard is judged on life kept and taken. *Repeated.*
- **A threat reader is measured against the blow's truth before a guard is tuned on it**: the
  golem's stroke reader read "idle" on 82 % of asks after weeks of parry tuning (`ef839a1e`).
  *Repeated.*
- **Two guards told apart by a held face were one skill**: the cover guard and the shield guard
  differed only in warding with a face where a hand held one. From `5baf9e257` (2026-11-14) a
  buckler holder carried both; their Options were one Option under two names, so the game's Mind
  priced them alike (the Covers tied in 19 of 19 rankings in four Arena bouts) and took the first
  registered, the cover guard, on every step, as the drill's ranked chooser did, and the buckler's
  face warded nothing. The man's cover lost 0.845 HP a trial at buckler,club and 1.293 at
  buckler,sword, against 0.117 and 0.271 before. Refusing the cover guard a held face
  (`90dc6d6bc`) gave 0.376 and 0.464, within noise of 2026-11-13 on every buckler cell, and the
  man's bonk at buckler,club back from 0.019 to 0.112 HP a second. Now one guard covers with what
  each hand holds and wards with a face where an item declares one, the same on every loadout.
  *Shown.*

## Minds

- **A mind cannot fight better than its skills deliver**: with blows that do not land or wound, no
  chooser, reward or league fixes the fight (`747e9f47`: the punch landed 0 of 16 in fights).
  *Repeated.*
- **An objective that charges contact without paying damage teaches stand-off** (`a9c7a28c`,
  `c8e7e39a`, `e5196c3c`). *Repeated.*
- **An objective that prices waiting at nought and a trade by its mean net stands a mirror to the
  bell**: where every trade loses on average, as with a foe modelled by every strike measured on
  its body, five of nine pairings threw nothing in 60 s (`c5c1df0fe`). A draw costing as much as
  a loss late, and each side of a trade read at the bell apart, had all nine fight; the Skeleton
  mirror threw 9 blows where it had thrown 29 (`ef2c002c9`). In a 120 s Arena bout that is one
  exchange mid-bout: between two bodies alike a trade is even at best, so honest prices alone
  leave waiting as good as closing. Valuing the life taken twice the life lost (aggression 2) had
  two Warriors fight from the first seconds, 142 blows where 13 had been (`aee4b6342`). *Shown.*
- **A stand-off at an aggression that should fight is a price leaning against closing, not a
  want of aggression**: two Warriors at aggression 2 stood a step out of reach for 91 % of a bout
  (2 of 24 knockouts), the life a second in the foe's reach priced at 2.3 times what the fight
  took and a punch's dealt at 1.3 (`06e5bec91`, `b188c2d3f`). Aggression 4 made them fight (37 %,
  20 of 24) with the error still in. Three price repairs, each read on two draws of the profiles,
  had them fight at 2 (31 and 40 % silent, 46 of 48 knockouts) with the two errors 1.2 and 1.5
  (`54dc338cc`): a foe's measured strikes read as one profile, their trials pooled, not the most
  of each one's noisy reading; a hold priced with the body still, as holding leaves it, where the
  closing speed it had when it chose to stop was carried through the whole horizon; and profiles
  on twenty times sparring's starts. *Shown.*
- **A profile's reading at a start no trial began like is borrowed from trials unlike it**: the
  pressure at 1.0 to 1.19 m apart, four tenths of a Warrior's seconds in reach, is read from the
  drill's approach trials, begun there closing at 0.6 to 1.1 m/s, which deal three to four times
  a start at 0.9 m; a fighting mind is offered its punch there 1 % of the time, so that band is
  priced 2.5 to 15 times what it takes and 0.7 to 0.9 m, where the foe throws 1.3 to 2.1 blows a
  second, below it (`54dc338cc`). Ten times the starts on another draw moves a reading at one
  range by half (the moving punch's right hand at 0.70 m, 7.4 and 14.5 % a second); more of the
  nearest trials (20, 30) and reading the foe over every place in its window moved neither error.
  *Shown.*
- **An Option priced honestly among Options priced over is taken as a wait**: the back step,
  priced near what it gives (0.028 of life a sway against 0.025), beside walks, punches and a
  second in reach priced 1.2 to 1.8 times what they lose, took a third of a Warrior mirror's time
  and left it 69 to 72 % silent against 27 % without it, 5 to 11 knockouts in 24 against 24
  (`57b89f611`, `dac468d58`). An Option that says it leaves the body where it began, where it does
  not, is run again and again as a cheap place to stand (`57b89f611`). *Shown.*
- **A profile measured at drawn starts misprices the moments a mind chooses**: the back step's
  sways chosen by the Mind fell 4.4 % of the time, those ordered at alike starts (stagger, width,
  speed, the foe's phase, its own punch under way) 1.5 %; held out by gap, a profile pooling both
  read the chosen sways' falls at 2.7 % against 4.5 % and their life at 1.46 times, one of the
  chosen alone 5.1 % and 1.03 (`dac468d58`). Such a profile moves with the mind's prices and is
  read again when they change. *Shown.*
- **A strike's profile read where its blow begins prices it; the Mind's choosing on that reading
  overprices it**: the man's moving punch, the profile remade from sparring (2026-11-19's rows),
  read at the starts of 1,789 punches begun in fights reads 1.03 of what they dealt (1.01 on
  sparring's own), the profile made 2026-11-17 1.34. Read where the Mind asks the blow it is the
  profile's reading; but a strike choice is priced about 1.5 times what it gives, and what it gives
  rises at about 0.4 of its price over five price bands: the Mind chooses where the nearest trials
  read high, part of which is their noise. Remade, the profiles still read 1.40 in play and the
  mirror stood off (0 of 216 knocked out within 60 s); measured in fights instead, a profile
  measures the Mind as much as the punch (0.212 hit points a punch at 100 runs, 0.159 at 50), not
  built. *Shown* (the plan of 2026-11-19, step 5).
- **A state's value fitted to what followed reads who is ahead, not which leaf of a search is
  better**: trees fitted to what each side dealt and took over 3, 8 and 20 s from 644,338 played
  Warrior mirror states read it held out at R² 0.073, 0.076 and 0.129 where the tree's tail
  correlates 0.03 to 0.05 at a level five times over; but across one search's leaves the fit spreads
  0.026 to 0.038 (sd) against the path's price 0.048 and the tail 0.461, and the Option class chosen
  beside the state adds nothing (R² 0.108 either way at 20 s, the classes 0.004 to 0.006 apart at a
  state, a state's noise 0.50). As the leaf in place of the tail it halves the step and the mirror
  ends 64.8 to 75.9 % of its bouts within 60 s at aggression 2 to 5 against the tail's 93 %. A copy
  of the tail cheaper than it misses the tail's best leaf (59 to 63 % against the one-try rate's
  71 %): that leaf is worth what repeating the best Option leads to, which only running the models
  again reads. *Shown* (the plan of 2026-11-19, step 8).
- **The tree's ranking of a search's root lines is not information about what follows**: in 480
  Warrior mirror bouts where one search in ten took a root line drawn at random (29,797 such),
  what followed (less a state value fitted on other bouts) against the drawn line's worth less the
  top line's, the part beyond its first step's price (sd 1.12), reads a slope of 0.0000 ± 0.0026 over
  20 s and -0.0001 ± 0.0012 over 3 s; its first step's price 0.020 ± 0.012. The tail's weight against
  the path's price moves how much the mirror fights (half the weight 91.7 % within 60 s, a tenth 75.9
  %) and not how well (half the weight 0.492 against the whole). *Shown* (the plan of 2026-11-19,
  step 8).
- **A strike's reading, unselected, gives about 0.4 of itself; pricing it so changes how often
  the mirror strikes, not how well**: 12,239 strikes drawn at random among those offered and run
  gave, read as the scorecard reads a choice, 0.0044 of a life and 0.39 of their written form's
  reading (R² 0.051 held out by bout; the reading as it is -0.186), and the form's own terms refitted
  on them read more (0.059), with the seconds since the foe's last strike and its own more again
  (0.079). The sparring trials' mean is five times what fight blows give (the man's moving punch 0.085
  of a life a trial): trusted toward it, strikes are priced higher and the mirror fights more (95.8 %
  within 60 s) at 0.483 against today's; read as half the reading and a tenth of the trials' mean,
  priced 0.93 of what they give (today 1.49) at 0.500. Drawn, a strike's cost is priced as it
  falls (the body's loss over it 0.029 of a life, its model's taken 0.031); what it gives moves with
  the foe's timing and its cost little (the lead 2 given - lost -0.003 within half a second of the
  foe's strike, +0.060 and +0.084 at 1 to 2 and 2 to 4 s; lost 0.031 against 0.028 and 0.024). *Shown*
  (the plan of 2026-11-19, steps 9 and 10).
- **The tree already takes the best its Options offer at every state the data resolves**: in the
  Warrior mirror, a root line drawn at random against the search's own choice at like states where
  that class was offered (range band × the foe's phase × the seconds since its last strike × the body's
  own state), what followed in the lead (2 dealt - taken) over 3 s: every class within noise (a strike
  +0.003 ± 0.016, a walk to a window +0.002 ± 0.003, a guard +0.002 ± 0.007, 29,797 drawn in 480
  bouts); of 92 cells × classes, none better at z 3 and two at z 2, what chance gives; 14,321 strikes
  drawn in 240 bouts against the search's own where a strike was offered, -0.001 ± 0.005. Strength
  against this Mind is not to be had by choosing otherwise among these Options; a chosen strike that
  gives more than a drawn one does so by its state. *Shown* (the plan of 2026-11-19, step 10).
- **A foe's pressure measured in bouts prices what bouts give; the rate from its strikes did
  not**: priced by its best strike's dealt over its cycle, a Warrior's second in reach with the
  foe throwing nothing was 17 to 20 times what it lost at 0.2 s and 0.8 with a punch committed.
  Read from bouts' moments by range and what the Mind read the foe doing, held out by bout, it is
  0.89 to 1.10 at every horizon, and the Warrior mirror went from 20 to 12 % silent, 24
  knockouts in 24 (`179fa76b9`). The table must be labelled by the reading that reads it: labelled
  by the foe's attempts (wind-up to recovery) where the Mind reads a blow coming, a hold was priced
  77 to 225 times over. *Shown.*
- **An Option's profile holds the steps of the foe it was measured against**: the back step's
  sways, sparred against a Warrior without it, end the two nearer from 1.25 to 1.5 m apart (that
  foe walks in 0.25 m while the subject sways; one with the back step 0.09), so the Mind read the
  back step as bringing the foe in for nothing, and two Minds with it each waited for the other
  (27 to 31 % silent against 10 to 18 %). The foe's closing speed at the start does not tell the
  two foes apart (a foe standing came 0.08 m, one closing 0.09 to 0.16, each band's spread
  0.2 m); its own body's change alone lost against the foe that comes (21 wins to 27), and the
  two sparrings pooled stood the mirror off as before (28 %) (`470e9b2f6`).
  What the foe does meanwhile is the foe's Mind's, not the Option's. *Shown.*
- **A sway priced by the foe's phase it ends with pays, and the mirror waits for it**: a placed
  state took the foe's phase from the decision, so a sway begun at a striking foe was priced to
  its line's end as if the foe struck on. Each sway's trial now records the share of them ending
  at a foe striking, and the Option's outcomes leave the phase they end with (`Leaves.phase`; of
  157 sways begun at a striking foe, 145 ended with it clear). The Warrior with the back step
  went from 0.549 (0.472 to 0.632) to 0.618 (0.542 to 0.694) against one without, and the mirror
  with it in both from 7.6 (5.2 to 9.9) to 9.8 points more silent than without; 142 of 144 bouts
  moved (`4130ed516`). Priced truly, the Mind sways where it pays, which wins bouts and is waited
  out in the mirror: the same change met one bar and left the other. *Shown.*
- **A line's end is worth what neither a tail nor a measured leaf gives**: in the tree chooser,
  a punch reads as leaving the bodies where they stood, so a line's tail runs it about fifteen
  times (too good), and the body is valued holding in reach after a try that leaves (too bad); the
  two cancel, and mending either alone stood the mirror off (first punch at 55 s, most bouts
  drained) (`df6bd5180`). A leaf read from bouts' moments, the life each side lost in the seconds
  left, held out 0.91 to 1.14, but past about 3 s it is flat over range (34 to 38 % of a life in
  20 s from 0.8 to 2 m), and a search reading it found a wait as cheap as a closing: the mirror
  with the back step 72 to 79 % silent, read nearest-first, over a span, or sharp to 3 s and
  pooled past (`e4225d62a`, `470e9b2f6`). It is the old Minds' value, which a search that changes
  their policy is off. *Shown.*
- **A pressure measured in bouts holds the blow coming; priced beside it, the blow counted twice**:
  its moments read the foe's phase, a blow under way's landing among them, and every Option but
  the back step (its trials' own taken) added the blow's life (`Predictions.danger`) on top. In
  the Warrior mirror, in reach at a foe striking, a walk, a hold at reach's edge and a punch were
  priced 7 to 8% of a life taken against about 3% given, the back step 3.9% against 2.0%; a sway
  read 4 points better than the rest where it was 1. With the measured pressure holding it
  (`ExchangePredictor.danger`) they read 0.7 to 0.9 of what they get, and the old pricing scored 0.503
  (0.451 to 0.556) against the new on `warrior-drawn`. A cover is priced as a hold there; it was
  chosen 5 times in 45,000 decisions. *Shown.*
- **The Option Mind's prices ran over what a fight gives**: in Warrior mirror bouts it expected
  2.4 times the life it lost in reach and 3.0 times what its punches dealt (`aee4b6342`, on one
  draw, its reader counting damage, not life). *Shown.*
- **The tail's best line prices the danger near right by range and a strike's blows about half
  again over**: the scorecard over 72 mirror bouts, each choice's price read against what followed
  over the window it was priced for (11,437 choices): taken 0.89 of what was lost (0.80 to 1.19 from
  0.5 to 2 m), a strike priced to deal 1.47 times what it gave (1.22 to 1.35 in reach, 2.2 at 1 m,
  9 at 1.25 m: the written form prices blows that do not land at the reach's edge), a stomp at a
  downed foe 12 times (17 choices). Each choice is read for the share of its window it held, a
  Mind choosing again within a fraction of a second. *Shown.*
- **The tree chooser at 100 runs costs about twice the step budget**; fewer runs fit it and stand up
  from fewer falls (`7f562d22`). Of a bout of the tail's best line, deciding is 38.7% and the search
  31.1%, its leaf 97% of that: predictions 49% of the search, making the states a model leaves 17%,
  the price 14%, the tree's own choosing and backing up 1.5%. So a change to how the tree chooses
  is judged on strength, not speed. With the fitted leaf the leaf's trees were a third of a bout
  until they were walked from typed arrays (7dace5cec), 9.3% after. *Shown.*
- **A whole-fight learned policy (PPO, NEAT, evolution, cloning) never passed a bar against a
  designed mind**; learning won only on single skills (`58afe766`, `c83e592d`). Shown on the earlier
  golem physics; untested on Rapier. *Repeated.*
- **A rating that a health lead at the time cap can win measures not falling and static blocking,
  not fighting**: the embodied policy, the arena path fighters (591 of 600 at the cap), the
  10-hour tournament (65 %), Vanguard, the Option Mind twin match (88 of 120 drained, `57874d73`).
  Fight quality reads wounds dealt and is watched. *Repeated.*
- **Mirror and self-play pools rank a mind by its own shape**: the league-trained mind first in
  mirrors, 13th of 14 on the game's pairs (`87b74cb6`). A mind is read against the bodies and minds
  the game draws. *Repeated.*
- **An act read by a written form, its weights fitted to its trials, plays better than its
  nearest trials**: each outcome a quadratic in range and straight in the start's velocity, by
  least squares (`formReading`). Held out it erred as the ten nearest or less on every Warrior
  profile; against the nearest trials 0.559 (0.503 to 0.615) on `warrior-drawn`, a bout 26%
  faster; the game's since (`bc643f6d7`, `ba17ae71c`). The same answers kept by a start rounded to
  a cell, a coarse table, ran 12% faster and lost, 0.451 (`5a85cb5f1`): removed, no Mind taking
  it. *Shown.*
- **Initiative, a blow now worth more than one later, fights as the game's Mind and does not
  unlock the back step**: life dealt counting less by a rate a second the later in a line it
  comes and more sooner, scaled to count as itself over the horizon on the mean; life taken as
  itself (`ffc71efcc`). Unscaled, life dealt fading at 0.2 a second made every trade
  worth less than waiting: two Warriors waited out every bout. At 0.1 against the game's Mind,
  the Warrior empty-handed: the match 0.531 (0.451 to 0.615) on `warrior` and 0.451 (0.396 to
  0.510) held out on `warrior-drawn`; on the scorecard's 72 bouts, standing silent 4.3% against
  5.4% (paired -1.1 points, -3.4 to 1.3) and 0.40 falls a bout against 0.19 (paired 0.21, -0.03
  to 0.49), every bout a knockout. With the back step on both sides it met neither of its bars:
  0.517 (0.434 to 0.597) won, and standing silent 16.2% against 8.1% (`c6c3d95fb`). At 0.03, 0.2
  and 0.3 neither: the mirror with the back step on both sides against without, 72 gaps, 12.0,
  12.8 and 11.8 points more silent (the least, 9.0 to 14.5) where unset is 14.5 (11.2 to 17.7).
  Removed, no Mind taking it, then restored on the owner's word (2026-11-20), unset, the leaf fitted
  to what followed weighed by it too. *Shown.*
- **A Mind that can sway back chases its foe**: two Warriors with the back step stand silent 20.2%
  of a bout against 7.2% without it (216 gaps, paired 13.0 points, 11.1 to 14.9, at `9b0fcc618`),
  nearly all of it 1 to 2 m apart, walking in on a foe that sways back from it. About 3.7 of those
  points were a written form reading a start within its trials' span: a start closing or parting
  faster than any trial priced as if no faster, and weighed by where it stood in the window and
  how the bodies stood (`e1d6b1d7d`); read as asked, 16.6% against 7.3%, 9.3 points (7.6 to
  11.0; `76f63b6ec`), the scorecard's Mind as before. None of these moved
  it past its spread on 72 of the gaps: Initiative from 0.03 to 0.3 (above); the measured pressure
  read at a foe down or rising (13.7 points) or past the range it measured (15.0), both priced
  nothing before; and the falls, more with it (0.68 a bout against 0.35), carry about 1.8 of the
  points. *Shown.*
- **The search's runs buy no strength between 50 and 300, and 25 begins to cost it**: the game's
  Mind at 300 runs against itself at 100, about 0.473 (0.435 to 0.511) over 576 bouts held out; at
  50 against 100, about 0.507 (0.472 to 0.542), its deciding step's 99th percentile 1.8 times
  less: the game plays 50 (`RUNS`). At 25 against 100, about 0.464 (0.425 to 0.502), its 99th a
  third less again, its mirror standing silent 18.8% (16.0% at 50): about three and a half points
  for the speed, left to the owner. *Shown.*
- **A prior from each Option's one step does not make the search stronger**: PUCT below the root
  (each Option's prior its one step's worth at the state, a softmax in units of their spread;
  AlphaZero's bound), the root as it was, at 50 runs: about 0.515 (0.479 to 0.550) over 576 bouts
  held out against the game's Mind, its mirror knocking out within 60 s in 93.1%. *Shown.*
- **A prior fitted to where searches' runs went does not make the mean's search stronger**: PUCT
  below the root guided by the move prior (Prior "Fitted to runs", 7f7b33aff; boosted trees over a
  state's lines, 2.482 nats a root held out against the price's 2.629), on the fitted mean at
  initiative 0.3 at 50 runs: 0.496 against the tail's best line over 576 bouts held out, below the
  same Mind without it (0.646), and head to head against that Mind 0.313 to 0.405 at exploration 1
  to 8. An even prior reads the same, and on the best line PUCT and UCT tie (0.503): the loss is
  PUCT spending a thin state's runs unevenly under the mean backup. A search costs three times
  as much. *Shown, then removed: the priors and the prior asset are gone from the game, the fit
  still read by research/minds/move-prior.mjs.*
- **A state worth the mean of its lines, its leaf fitted to what followed, a blow now worth more,
  beats a state worth its best line on the tail**: the tree chooser's fitted leaf, each state worth
  its leaf once and each line by its runs (`best` 0), at aggression 4 and initiative 0.3, at 50
  runs: 0.646 (0.606 to 0.686) over 576 bouts held out against the tail leaf's best line, its
  mirror knocking out within 60 s in 81.0% (91.2%). By the owner's word, the empty-handed man's
  default since e5eacbb22 (`DEFAULT_BODIES` by `bodyOf`), the body it was measured on. Every
  other body but the rat keeps the Mind before it (`option-tail`): off the empty-handed man its
  fitted models stand aside (`fittedOn`), and the mean backup with initiative 0.3 on the tail's
  leaf knocked out in 0.0% on the Warrior. The rat (steadiness 25 %) plays `option-presses`,
  each state worth its best line at aggression 5 and initiative 0.3: against the empty-handed
  Warrior in the tournament's `gaps` it took 0.395 (0.323 to 0.470) of his life by 60 s, at least
  1 HP in 40 of 48 bouts, its pressure tables measured on its own bouts (38 of 48 on
  `option`'s), against `option`'s 0.238 and 29 of 48 and `option-tail`'s 0.119 and 8. Without
  initiative it read 19 of 44; at initiative 0.6, 32 of 46; at aggression 4, 36 of 46. *Shown.*
- **A line priced against the foe's replies as well as the foe standing is as strong and quicker
  to a knockout**: each root line worth the mean of a tree search's price with the foe standing and
  with the foe running each reply over the line's first step (`repliedSearch`), a foe of the
  body's build replying as the body's own lines move it, reversed. One reply, the foe closing:
  0.513 over 1,152 bouts against the Mind above, 88.4% of mirrors knocked out within 60 s (81.0%),
  its step's 99th percentile 17.89 ms (17.38). Two: 0.498 over 576, 90.7%, 20.63 ms. Four: 0.513
  over 576, 93.5%, 20.68 ms. (Before the trees were walked from typed arrays, 7dace5cec: 23.01,
  32.56 and 44.26 against 17.45.) By the owner's word, one reply is the empty-handed man's default
  since f53f66070 (`option-reply`); the Mind above stays pickable (`option`). Each reply's search
  cut to a share of the own search's runs, so more replies cost what one does, waits: four at a
  quarter, about 0.444 (0.403 to 0.485) against one reply over 576, 47.2% within 60 s; two at a
  third, about 0.460 (0.419 to 0.501), 62.5% (removed, 3717fb776). Each Mind's own bouts give its
  step's 99.9th percentile as noise (89 and 129 ms for two and four); timed at the same roots
  instead (7,418 decisions of the default's mirror, each search in turn), a decision's search at
  the median, 99th and 99.9th percentiles: none 3.3, 7.3 and 11.8 ms; one 6.7, 15.5 and 20.9;
  two 9.3, 17.0 and 23.3; four 14.6, 29.4 and 45.7. *Shown.*
- **More runs under the mean drift a state's worth from its leaf toward an even pick of its next
  Options, and play worse**: the Mind above at 100 runs against itself at 50, 0.368 (0.309 to
  0.431) on 288, as the tail's best line was at 100 (0.451). The chosen line is about two Options
  deep at 25, 50 and 100 runs (1.98, 2.05, 2.06): the tree is wide, and more runs go to its
  breadth. A root Option's worth less its leaves' falls with its runs (-0.11 at 2 to 3 runs, -0.38
  at 32 or more, at 100), more than the 0.05 the root's Options differ by: below the root each
  Option is tried once first, so a well-run state's mean nears an even pick of what follows it.
  None of these recovered it: the mean counting each line past its first run (0.330 at 50 runs,
  0.417 at 100, against the Mind above), the leaf weighed as 3 or 6 runs (0.392, 0.319 at 100),
  the best line's weight 0.5 (0.319, 0.285). The first two were removed in the settings' tidy-up
  (2026-11-22). Untried: the leaf's optimism read directly, a state's leaf against what its bouts
  brought, by its depth. *Shown.*
- **Truer own-body models do not make the Mind play better**: a walk starting at its speed along
  its way, and a sway leaving the body where its own steps took it (not where its trials ended,
  the trial foe walking in), cut walks' median placement error from 0.066 m (standing) to 0.053 and
  the back step's bias from -0.241 to -0.058. That Mind read 0.434 (0.378 to 0.490) against the
  Mind above on 288. The walk's start alone kept the body to the back step at 8,973 roots and ran
  57 of 144 mirrors to 60 s. A leaf fitted to that Mind's own 432 bouts played it at 0.372 on 288;
  one fitted to the Mind above's rows of the same bouts read 0.440, so the leaf learned from the
  weaker play. The objective tuned again on the truer models (aggression 2 or 5, initiative 0 to
  0.6) reached 0.488 at best. Why: each old error stood in for the foe walking in, which a line's
  states leave out (the foe stands where it is). The old back step expected the range to close
  0.24 to 0.33 m where it held, and the walk's whole-speed start charged a stance gait's lag going
  away. Made true, nothing carries the foe's approach, and `along`, forgetting a body going away,
  priced a braced walk 0.50 s ahead of the run there, where walked it was not ahead
  (`research/runs/movement-fault/`). On draws 9 to 14 against the Mind above, the truer models
  read 0.396 and with the foe carried 0.5 s (`carry`) 0.479 (0.417 to 0.538); carry gave the Mind
  above itself none (0.524), and 1 s read 0.444. A start going on away for the gait's lag
  (`signed`) read 0.458 alone, `along` 0.465 (`1c7e0a2df`). Signed, own sways and carry 0.5
  together read 0.451 on draws 9 to 14 and 0.497 on 3 to 8: level with the Mind above, not
  better. With walks braking for the place (`30fc95f23`) they read 0.542 (0.483 to 0.601) on 3 to
  8 and 0.462 (0.406 to 0.517) on 9 to 14, about 0.50 pooled. Level, correct models win the tie:
  they were the empty-handed man's Mind (`option-truer`), and are in the one that is (`option-lean`,
  below). Its bar 2 is 80.1 % of bouts knocked out
  within 60 s against the Mind above's 88.4 %, 1.20 downs a bout against 0.75, and standing
  silence 12.5 % against 14.2 %. At the same roots its step times the same (5.8 against 5.7 ms
  median) and allocates the same; in its own bouts it allocates about twice as much a step, from
  the states it plays into. Untried: a second round fitted from a Mind level with the game's.
  The Mind above stays pickable (`option-reply`); the leaf was removed in the settings' tidy-up
  (2026-11-22). Its extra downs, read over 40 mirrors each (`research/runs/movement-fault/falls/`):
  it falls 1.22 a bout against 0.97 (16 against 15 with a blow in the 1.5 s before, 23 against
  16 with none; those are not read to a cause). Over all blows taken standing the two fall
  alike, 36 of 512 against 34 of 523, but a blow mid back step fells it more: 10 of 84 down
  within 2 s against 2 of 51, the stance's catch stepping a second or more as the body runs back
  to 2.3 m/s. The blow's size does not tell (7 % of the smallest, 10 % of the largest); the speed
  it leaves does (0.50 m/s against 0.26 for those that stood). It is the stance's limit under a
  push (Travel, above), met more often: this Mind is struck mid back step 122 times against 69. The rows are kept in
  `research/runs/foe-placement/` and `research/runs/fitted-value/corrected/`. *Shown.*
- **Two sides deciding a fifth of a period apart lean a mirror to one**: over 7,425 saved match
  bouts the right side won 0.542 (z 7.2), and the same Mind on both sides 0.541. The chooser's
  rethink phase (`Deciding.phase`) had the right decide 0.618 of a 0.2 s period after the left
  (12 to 15 steps). Swapping the phases leaned it to the left (0.465), and both at one phase read
  0.507 and 0.486; enlisting the right first did not move it (0.573). Since 3bdd5b168 every body's
  periods start at one time, the mind's step offset alone keeping two bodies on neighbouring
  steps: the right 0.479 on 288. The duel's mean step rose from 1.77 to 2.17 ms, the crowd's fell
  from 30.5 to 21.3, and a page drops no frame it did not before. Why a stagger leans, and to which
  side, is not known. *Shown.*
- **An open Option's model asked once a state saves no time worth reading**: a held leaf asks the
  same answer about nine times (436 asks on 56 pairs a search), yet kept per state it read a
  99th-percentile step of 16.59 ms between the unchanged code's 17.51 and 16.66 in one quiet
  session. *Shown.*
- **A kept branch has little to keep**: searches come every 0.2 s, mid-Option; of the previous
  tree's runs, 8.5% and 20.6% (two mirror bouts) lie under states the new tree's same Option
  reaches near, before those are priced again for the new path. Not built. *Counted.*
- **A search that starts from its last decision's worths wins by fighting less**: each Option's
  worth at the last root kept as as many runs, fading by half each 0.5 s (a warm start), won
  0.635 (0.580 to 0.691) held out at the same runs, but silent 16.2% of a bout against 9.4%: an
  Option worth more at the last root stays chosen. Unset (`c1cdbe73d`), then removed, no Mind
  taking it, then restored on the owner's word (2026-11-20), pickable and unset. *Shown.*
- **A line's end written as three numbers plays as the tail and the hold at 40% of their time**:
  each side trading life at a rate falling straight with how far apart the two stand, its shape from bout rows and one scale by bouts won: 0.503 at half the
  rows' rate, 0.417 at it, 0.434 at a quarter; 20.1 ms a deciding step against 49.6; with the back
  step in both minds 13% standing silent against 5% without, the most any kind moved that. It
  reads no walk to a site. A half-life on life traded later, both sides alike, won nothing held
  out (0.483) (`d87df83c2`, `eb2876fb1`). With the blow held once, 8.1% against 6.3% on 216 gaps, paired 1.8
  points (0.2 to 3.4), and 3.6 at 1,000 runs: crediting by distance alone, it pays any cheap way
  to stand near, and a deeper search finds more of them (`cdbe93aba`). Credited instead from when
  a strike can begin, it pays standing far off with a walk to a window ahead, and both stand off:
  17.6% against 11.3%; by both together 12.0% against 7.1% (`008eb67d9`, `fc29f4f3d`). A leaf
  from those bouts by range and a strike on offer is flat past 3 s as before (`42a69f3b9`).
  *Shown.*
- **A line's end read from the next exchange plays even, and pays the back step, but quiets the
  mirror**: each side trading at the rate of the best try begun from where the line ends, by its
  own model, a walk to a site counted with the best try where it arrives, at that rate as priced: 0.497 (0.441 to 0.552) against the game's Mind on `warrior-drawn`; the Warrior
  with the back step against one without won 0.550 (0.501 to 0.597) over 432 bouts, 0.44 HP a
  minute less lost (-0.07 to 0.94); but the mirror standing silent 8.6% without it (6.4% with the
  game's tail) and 18.7% with it, paired 10.1 points (8.1 to 12.0). *Shown.*
- **The next exchange counted once pays the back step most and quiets the mirror most**: its life
  dealt and taken, a walk counted with it, nothing after, open Options none, at the scale best against the tail on `warrior` (0.451 at 1, 0.507 at 3, 0.451 at 6): held out on
  `warrior-drawn` 0.490 (0.431 to 0.542). The Warrior with the back step against one without
  0.63 HP a minute less lost (0.20 to 1.07), won 0.558 (0.514 to 0.604) over 432 bouts; the
  mirror standing silent 9.8% without it and 21.6% with it, paired 11.8 points (9.9 to 13.7).
  Where the back step pays (the exchange's rate, once: won 0.550 and 0.558), the mirror with it in
  both is 10 to 12 points quieter than without; where it pays nothing (by distance, 0.521), 1.8.
  Both exchange ends leave the mirror without it quieter than the tail (8.6% and 9.8% against
  6.4%). These three line's ends, none the game's, are removed; the tail is the search's one leaf.
  *Shown.*
- **A leaf of each Option's own tries, none leaving, decides three times faster and fights less**:
  each run Option at a leaf priced by its own model's terms alone, its tries to the horizon each
  ending where it began (no states made after, no held leaf where a try leaves), held Options as
  the tail holds them, no walk to a site at a leaf. Its deciding steps about three times cheaper
  (99th percentile 8.3 ms against 26.7, six mirror cases, one worker). Against the game's Mind on
  `warrior-drawn` at the same 100 runs: 0.490 (0.434 to 0.542) over 288 bouts and 0.476 (0.424 to
  0.528) over 288 on gaps never played (draws 9 to 14), about 0.483 (0.446 to 0.520) pooled, not
  told from even; at 300 runs 0.503 (0.448 to 0.559). But its mirror on `warrior-drawn` ended in
  a knockout within 60 s in 85.6% (80.3 to 89.7) of 216 bouts against the tail's 93.1%, standing
  silent 18.9% against 15.8%; and the walker, a valued chooser looking one Option ahead, stopped
  short of its place on a plain hold, a leaf no longer walking on to it. The leaf's time is the
  tail's `line` (held Options priced to the horizon and walks to sites, 22 of its 30 points of a
  bout) more than its tries run again (8). Dropped on the knockout bar. With the walks to sites
  kept at a leaf (a whole leaf reads every pair, a walk run on to its arrived leaf, as the tail
  does): the 99th-percentile step 16.3 ms against the tail's 30.3, the median 1.47 against 1.35;
  its mirror knocked out within 60 s in 78.2% (72.3 to 83.2) of 216 bouts against the tail's 91.7%
  on the same code, standing silent 24.1% against 15.6%. It fought less again, not more. What is
  left cut, the state each try leaves and the held leaf there, is the tail's own. At the same
  states the staying leaf picks the tail's best 91% of the time (2,413 decisions, four bouts);
  where they part it walks on where the tail strikes and steps back where the tail closes: the
  tail repeats at a leaf only an Option whose try stays. The tail with only its held leaf cut (a
  leaving try priced as it stands): the 99th-percentile step 8.1 ms against 30.2, knocked out
  within 60 s 95.4% against 91.7%, and weaker, 0.434 (0.397 to 0.472) over 576 held out. The
  tail's time is in its held leaf, and so is a part of its strength. *Shown.*
- **A value of a state fitted by hand-chosen terms does not stand in for the tail**: fitted to the
  life each side lost from a search's root to the bout's end, it is the two lives and the time
  left (R² 0.62 held out, every term of range or posture under 0.05 of a life); fitted to the
  tail's own worth at the tree's leaves, it orders two leaves of one search as the tail does 55%
  of the time (R² 0.12 held out), and 64% with each Option's one-step model at the leaf among its
  terms. The tail's worth is mostly its best Option's one-try rate: that alone, unfitted, orders 77%
  of pairs as the tail and picks its best leaf in 85% of searches. *Shown.*
- **A bar read on bouts won needs its spread**: the back step's Warrior against one without won
  79 to 65 on the game's Mind, 0.549 with 0.472 to 0.632 over bouts, and 0.521 (0.472 to 0.567)
  over 432 under the written line's end: neither a win (`fc29f4f3d`). *Shown.*
- **The foe's steps, measured or carried on, add nothing**: the foe's own steps by range and what
  the body does, from bout rows, left the walk's time and the back step's exit to them: standing
  silence 20% with the back step as without them; its velocity carried on had the walker 0.9 m
  past its window and the mirror fell apart (`46d7b4e09`, `c9b5e7b39`). Removed, no Mind taking
  either. Carried on its velocity over a line's first step in a search's states (`carry`, up to
  2 s), 0.5 s read 0.592 against the game's Mind, below the foe standing's 0.646, and 0.465 head
  to head, on own-body models whose errors already carried the foe's approach. The field was
  removed in the settings' tidy-up (2026-11-22) and is back (`1c7e0a2df`): on the truer models it
  repairs most of their loss (above). *Shown.*
- **A body measured on none fights by another's trials at ranges by stature**: a profile records
  its body's stature; with none on its own body, the nearest body's in stature is read scaled and
  its price says coarse (`acrossBodies`). Held out, the woman's punches answered 1,157 of the
  man's 1,310 starts by stature against 786 unscaled, near his own trials' error. Every other
  body's pooled and read as a written form beat the nearest body in 11 of 18 sets, 9 of 12 where
  the others had hundreds of trials, and lost where they had about 60, as the man's do
  (`5f394cae0`, `b7d2fb56a`). *Shown.*
- **The struck body is numbers on a strike's trials**: a profile is found by the striker's body,
  skill and limb, never by the body struck; each trial records the body it struck (its stature,
  mass, Steadiness and Haste, `struckNumbers`), and a reading takes the trials struck at the
  measured body nearest in stature and mass (`profileAgainst`, spans 0.1 m and 10 kg), saying so
  (`ProfileReading.source`). The strikes went from 51 profiles to 17 and the empty-handed mirror
  played 24 of 24 to the bit (`540ddff7b`). The nearest body can be far: the reptile (0.325 m,
  8 kg) reads as the skeleton (1.62 m, 15 kg). *Shown.*
- **What a struck body loses read as the nearest measured body is not settled.** A struck body's
  trials are taken away and priced from the rest, against what its own trials give
  (`research/skills/strikes/struck-held-out.mjs <striker's body>`, nothing played). Pooled over
  every profile it read landed 0.313 against 0.170 (`08c342acd`, `e5fee3269`), which showed
  nothing of borrowing: over half those trials were the woman's and the skeleton's punch, a
  skill developed on the man alone, and the man's moving punch mixed two drills (its trials at
  the man record a stance, those at the woman and the skeleton none). A profile is there for
  every body its drill ran on, developed there or not. Read one striker at a time, a held-out
  body from another drill left out: the man's drive punch, bonk and stomp, 168 trials, landed
  0.236 as the nearest against 0.178 as its own (0.058 ± 0.037 worse), dealt 0.0070 against
  0.0054 (0.0016 ± 0.0017); the rat's bite, 115 trials, landed 0.227 against 0.155
  (0.072 ± 0.032), dealt 0.027 against 0.004 (0.023 ± 0.006). The rest pooled as a written
  form, the struck body's numbers among its terms, read worse than the nearest on landed in
  both (0.312, 0.302). Three bodies were ever struck, all human-shaped, and Steadiness and Haste
  are 0 on every trial. That the nearest body's trials price worse than a body's own:
  *Suspected.*
- **What a body holds is numbers on a trial, and a reading merged across loadouts moved a body
  that had its own**: an item's mass and its reach past the hand are read from its spec (the
  short sword 0.75 kg and 0.62 m, the club 1.16 kg and 0.70 m, the buckler 0.90 kg and 0.23 m;
  `Start.held`, `bodyNumbers`), their spans (1 kg, 0.1 m) set on no reading. No loadout finds a
  profile: the edges went from 83 profiles to 17 (`93f128cab`). A foe's limb is read throwing a
  strike only where it holds as its trials' limb held (`limbHoldsAsMeasured`). That commit's
  claim that the empty-handed cases played to the bit rested on the fingerprint alone and was
  wrong: the empty-handed mirror (24 gaps 2.65 to 5.41 m, 120 s) moved in 5 of 24 bouts, the
  winners the same, a body reading every loadout's falls where its own began from no such
  position (the flatten, from the front, the right side and the crouch). The fingerprint's
  empty-handed cases end before a fall's price matters. A loadout's own trials read where it had
  any put the mirror back to 24 of 24 (`168168a0f`); the cleanup then read what is held one way,
  as numbers among the trials' (`6d4d692ec`), so the written form fits every loadout's falls at
  once and the edges' readings moved again: in the fingerprint the 13 cases where a body holds
  an item and, empty-handed, `option-back-step`'s man against woman, not read by bouts since. A
  Warrior holding a sword then priced its foe by the rate from measured strikes, not by hand,
  and the walker's bout at a sword allocated 789 KiB a step against the ceiling's 570, the
  nearest search's distances boxed as numbers; written to arrays, 382. *Shown.*
- **The pressure is found by its two bodies' numbers, and is still a table a pairing**: a table
  records the striker and the struck as stature, mass and what each holds (`PressureBody`), and
  is read by a pairing within a span of both (`pressureTable`, `pairingApart`; `19d6a6d39`), the
  empty-handed mirror 24 of 24 to the bit. A pairing near no table is priced by its strikes'
  rate. Three tables since the rat's work: a man on a man, a man on a rat, a rat on a man.
  *Shown.*
- **Two foes cost a little less than the sum of each, and the Option Mind prices them so**: a man
  in an open Crypt room lost 0.79 (0.65 to 0.96) of what two men took from him alone, summed, and
  the Mind's expectation of each foe fell with two as the loss did, within about 15%; skeletons
  summed plainly, but it expected about 20 times what they took (`16d74daf4`, its script
  `research/minds/two-on-one.mjs` since deleted). *Shown.*
- **Not built**: the ground as numbers (room behind, slope, the nearest wall: nothing reads it);
  one model a skill across bodies in the game (the nearest body's trials scaled is). What a body
  holds is numbers on a profile's trials (`Start.held`) and no part of what finds one, but no
  trial yet crosses a loadout with a skill measured without it: a body holding a sword reads its
  punches' and its stomp's empty-handed trials, coarse; a pressure table is read only by bodies
  holding as its own held (`holdsAlike`, `pressure-table.ts`). The skeletons' overprice two on
  one is likely their pricing by rate: the measured pressure has no table of a skeleton, so it
  is priced by the most its strikes could deal at reach (`ProfileExchange.ratePressure`); not
  isolated. The kinds were fitted by bouts on the Warrior empty-handed
  alone, the stature reading went into the game on held-out trials with no bouts, and the
  written form into it with no look in a browser. *Suspected* where a cause is named.
- **The game's Mind's play does not move with how it models its foe; its search's runs move it**:
  in 288 warrior-drawn bouts a match against itself it scored 0.498 with no reply searched, 0.474
  with the foe held still in the states searched, 0.493 pricing the foe's pressure by its strikes'
  rate, 0.469 and 0.477 deciding 30 and 20 times a second against 60, and 0.491 with a clear foe's
  first half second priced by a learned onset at the root (`42690292f` and its plan's readings),
  each within noise; at 10 runs, not 50, it lost 0.299. A foe's strike onset is predictable from
  what a body sees of it (within 0.5 s: AUC 0.94 held out by bout, 0.87 from distance alone), and
  the fitted leaf already reads the same quantities. Deciding 10 times a second with no reply
  searched (`option-lean`) thinks 135 ms a simulated second against 251 and plays as well. On
  the scorecard it knocks out within 60 s in 45.1 % of its mirror bouts against 38.6 %
  (`b207cee32`); it is the empty-handed man's Mind.
- **The rate alone saves a sixth of the thinking, and 10 Hz loses**: `option-lean` with no kick,
  at `9d1de3287`, its rate the only change. The search comes every 0.2 s (`RETHINK`) and at once
  on a change it watches at any rate; the rate is how soon a change is noticed, on top of the
  senses' 0.15 s, so the 60 Hz checks between searches are cheap. Thinking, both bodies, in eight
  Warrior mirror bouts each, interleaved on the performance cores: 216 ms a simulated second at
  60 Hz, 207 at 40, 172 at 30, 168 at 20, 179 at 10 (30 and 20 flattered: their mirrors ran
  longer, and a long bout thinks less a second); the 99.9th percentile step 12 ms at 60 Hz, 20 ms
  at 10. Against 60 Hz over the 288 bouts of `warrior-drawn`: 40 Hz 0.495 (0.438 to 0.552), 30 Hz
  0.507 (0.451 to 0.566), 20 Hz 0.495 (0.434 to 0.559), 10 Hz 0.344 (0.295 to 0.392), 60 Hz then
  knocking out within 60 s in 48.6 % of bouts against 24.0 %. Why 10 Hz loses is not read. *Shown.*
- **Seeing sooner is worth a little, about as much for each 50 ms**: the same Mind at 60 Hz with
  no kick, one side's character at a shorter reaction time (`AttributeSpec.reaction`) than the
  other's 0.15 s, over the 288 bouts of `warrior-drawn`. At 0.1 s (`c8c400ed4`): 0.545 (0.493
  to 0.597), knocking out within 60 s in 33.7 % of bouts against 29.9 %, taking 72.2 % of the
  other's life by 60 s against 69.1 %. At 0.05 s (`dc6b412d5`): 0.583 (0.524 to 0.642), 41.3 %
  against 28.5 %, 74.5 % against 67.9 %. The quicker side's own skills and profiles were tuned
  and measured at 0.15 s (its readings say they are stale), so this is what seeing sooner gives a
  body that does not yet use it. Noticing up to 100 ms later (10 Hz, above) costs far more than
  this gains; why is not read. *Counted.*
- **The search period is the strongest of the timings: every 0.05 s wins 0.807 for 40 % more
  thinking**: the same Mind at 60 Hz with no kick, one side's tree chooser searching every so
  often against the other's 0.2 s, over the 288 bouts of `warrior-drawn`, played while the
  period was the chooser's setting and a timed search waited for a look (at 60 Hz up to a step
  late; `OptionMindConfig.rethink` since `0a5b7fdd7`, on time). Score, then knockouts within 60 s and the other's life taken by 60 s, each
  against the 0.2 s side's: 0.05 s 0.807 (0.757 to 0.852), 48.6 % against 9.4 %, 77.5 % against
  49.5 %; 0.1 s 0.642 (0.587 to 0.698), 37.8 % against 18.8 %, 73.7 % against 58.1 % (both at
  `0e79d9e37`); 0.15 s 0.554 (0.500 to 0.611), 38.5 % against 22.6 %, 72.1 % against 62.9 %;
  0.25 s 0.389 (0.337 to 0.448), 27.1 % against 39.2 %, 64.8 % against 72.6 % (both at
  `09c2b151d`). Thinking, both bodies, the mean of eight Warrior mirror bouts each, interleaved
  on the performance cores: 296 ms a simulated second at 0.05 s, 242 at 0.1, 211 at 0.15, 211 at
  0.2, 186 at 0.25; the 99th percentile step 10 ms at 0.05 s, 7 to 8 ms at the rest. Down to
  0.15 s a search comes mostly at once on a change it watches, so the period costs little; below
  it the timed searches tell. *Counted.*
- **Seeing at 0.1 s, deciding at 20 Hz and searching every 0.15 s beats today's timings for the
  same thinking**: the same Mind with no kick on both sides, one side's character at a reaction
  time of 0.1 s, its Mind at 20 Hz searching every 0.15 s, against 0.15 s, 60 Hz and 0.2 s, over
  the 288 bouts of `warrior-drawn` at `d90569a87`: 0.615 (0.563 to 0.667), margin 0.099 (0.050
  to 0.146), knocking out within 60 s in 42.7 % of bouts against 28.5 %, taking 75.2 % of the
  other's life by 60 s against 65.1 %. Each as a Warrior mirror, eight bouts, interleaved on the
  performance cores: thinking, both bodies, 219 ms a simulated second against 218 (the means of
  bouts 232 against 221), the 99th percentile step 7 ms at each; the mirrors at the new timings
  ran 381 s against 310, three of eight drained against none. The 20 Hz rate did not show the
  saving its own reading did here. Played while a timed search waited for a look: at 20 Hz each
  came up to 0.05 s late. *Counted.*
- **Searching every 0.1 s, 20 Hz still plays 60 Hz even and 10 Hz still loses, the clocks apart**:
  the same Mind with no kick, both sides searching every 0.1 s (`OptionMindConfig.rethink`) at
  `0a5b7fdd7`, a timed search on time whatever the rate, over the 288 bouts of
  `warrior-drawn` against 60 Hz: 20 Hz 0.472 (0.420 to 0.528), knocking out within 60 s in 27.1 %
  of bouts against 28.5 %; 10 Hz 0.378 (0.326 to 0.434), 22.6 % against 41.7 %. Thinking, both
  bodies, the mean of eight Warrior mirror bouts each, interleaved on the performance cores: 270 ms
  a simulated second at 60 Hz, 229 at 20 (the mirrors 492 s and 498 s long), 250 at 10 (268 s:
  short bouts think more a second). So with the search period on time, noticing a watched change
  within 0.05 s is as good as within 0.017 s and a sixth cheaper, and within 0.1 s is not.
  *Counted.*
- **The rat neither gains nor loses by the timings: 20 Hz and every 0.1 s hold on it**: the rat's
  default Mind (`option-presses`) at four timings against the empty-handed Warrior's
  (`option-lean`, 10 Hz, every 0.2 s), over the 288 bouts of the tournament's `gaps-drawn` each,
  at `a364f4c7c`. Score, then the man's life taken by 60 s and knockouts within 60 s: 60 Hz every
  0.2 s, today's, 0.149 (0.108 to 0.191), 0.355, 4.9 %; 20 Hz every 0.1 s 0.149 (0.111 to
  0.188), 0.315, 2.8 %; 60 Hz every 0.1 s 0.167 (0.125 to 0.212), 0.354, 6.9 %; 20 Hz every 0.2 s
  0.149 (0.108 to 0.194), 0.328, 4.9 %. The rat took a sixth of the man's bar by 60 s in 234,
  223, 222 and 221 of the 288 bouts, and was killed within 60 s in 134, 127, 116 and 129. Against
  today's, bout by bout at the same gap and side, the life taken by 60 s differs by -0.040
  (-0.075 to 0.006) at 20 Hz every 0.1 s, -0.001 at 60 Hz every 0.1 s and -0.027 at 20 Hz every
  0.2 s. The tournament's `gaps`, 48 bouts each, had read these timings from 0.125 to 0.292.
  *Counted.*
- **The settings every body shares beat the Warrior's old default, 0.653, for a third more
  thinking**: the empty-handed Warrior's default (`option-lean`) on the shared settings
  (`option-shared`, `f3743dea2`: 20 Hz, every 0.1 s, his own backup, aggression and initiative)
  against it as it was (10 Hz, every 0.2 s), over the 288 bouts of `warrior-drawn`: 0.653 (0.597
  to 0.705), margin 0.134 (0.086 to 0.183), knocking out within 60 s in 25.7 % of bouts against
  13.9 %, taking 64.9 % of the other's life by 60 s against 52.8 %. Thinking, both bodies, eight
  Warrior mirror bouts each, interleaved on the performance cores: 242 ms a simulated second
  against 179, over the five and six bouts whose physics read the machine's usual 62 ms a second
  (the rest read 109 to 150, the machine busy). The rat's default, on the same shared settings,
  against him over the 288 bouts of the tournament's `gaps-drawn`: 0.208 (0.163 to 0.253), the
  man's life taken by 60 s 0.355, against 0.149 and 0.355 before both changed. *Counted.*
- **The fitted value refitted to `option-lean`'s own play reads it truer and fights better.** The
  measuring command (`npm run measure -- option-lean/man/empty,empty`, `91054ef50`) played his
  mirror's 144 bouts of the tournament's `measuring` draws in 18.6 min on 18 workers (145
  worker-seconds a bout), 164,537 decision states, 305 MB of record. Fitted on 130,731, read on
  the 29 bouts held out, R² of dealt, taken and 2 dealt less taken: 0.144, 0.139, 0.047 at 3 s;
  0.193, 0.195, 0.049 at 8 s; 0.234, 0.219, 0.060 at 20 s. The fit it replaced (1044 bouts of the
  old `option`, 623,767 states) read the same states 0.125, 0.108, 0.040; 0.132, 0.119, 0.032; and
  -0.011, 0.010, -0.022 at 20 s, where it read nothing of how this Mind's bouts go on. In play,
  `option-lean` against `option-tail` (which reads no fitted value) over the 288 bouts of
  `warrior-drawn`: 0.606 (0.552 to 0.660) on the new fit against 0.566 (0.514 to 0.622) on the old,
  margin 0.142 against 0.108, knocking out within 60 s in 51.7 % of bouts against 45.1 %, taking
  0.828 of the other's life by 60 s against 0.787. Two matches against one opponent, not one
  paired: every figure moved the same way, each by less than its interval. It is the game's.
  *Counted.*
- **`option-lean`'s decisions in a page**: its decision lands in the one step it is made in: with the
  minds on worker threads as a page runs them, a step's 99th percentile is 36 ms (`option-truer`
  202 ms), its dearest steps a multiple of its 12 steps a decision apart, and deciding is 38 % of
  a bout's CPU against the physics' 22 %, the profiles' nearest lookup the largest part
  (`research/runs/lean-time/`). *Shown.*
- **A bar's two halves are one command's protocols.** The back step's bar 1 was written met for two
  days against a standing defender read by a research script on another set-up (33.6 %); the
  evaluation's own standing defender read 20.4 % there, so the bar had never been met. Its baseline
  is now the evaluation's protocol beside the skill's (`mind-held-standing`), a Mind without a
  skill named by a setting's path (`--ablate options.steps-back=null`). *Shown.*
- **A drill's own orders may make its figure.** In the back step's drill the sway took 9.8 % of the
  punches thrown while it went back, against standing's 19.7 %; the drill's Commander then held the
  order 1.6 s more, stepping it in and following, and 71 of the 127 punches taken landed there.
  *Shown.*
- **A value fitted to bouts** (`assets/minds/fitted-value.json`, `FittedValue`, fitted by
  `research/minds/fitted-value.mjs`): R² held out does not order leaves by play (a leaf of a Mind
  with truer own-body models read higher at 8 and 20 s and played worse, 0.372 against 0.434); a
  leaf learns from the play of the Mind whose rows it fits (that Mind's 432 bouts fitted a weaker
  leaf than the game's Mind's rows of the same bouts, 0.440; one round of fitting to a Mind's own
  play bought nothing); its R² is spent on who is ahead (0.026 to 0.038 across one search's leaves
  against the tail's 0.461). What made it play was the mean backup and initiative. *Shown.*
- **Not yet read**: the search spread over steps and the branch kept (each rests on a kept worth
  standing for a situation since moved, as the warm start's does); a value read from bouts is the
  Minds' that fought them, and how a table stays true as the Mind reading it changes is not
  answered; what the chosen moments hold that a start does not (the foe's action and its
  progress, the seconds since the body last decided).
