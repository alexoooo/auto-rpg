# Approaches

What each approach to a goal can and cannot do, and why. Read a goal's section before choosing
how to reach it ([the skill recipe](recipes/skill.md#the-approach)). Each entry names the mechanism, the constraint, its
cause and the commits that show it (`git show <commit>` reads the story). An entry changes only
when new evidence contradicts it, cited the same way; a cleanup never removes one.

Confidence: *repeated* (shown three or more times), *shown* (once or twice, plainly), *suspected*
(the cause inferred, not isolated).

## Every skill

- **A change to the body, its muscles, contacts, the engine, the rate or the command delay voids
  every schedule, record, trained actor and profile on that body.** Toes took the run from 4.5 to
  0.7 m/s and step-up from 56 to 0 of 64 (`d22b1c7a`, `735962c8`, `9e7d7603`); the run's legs took
  step-up from 47 to 14 of 64 (`5e9208e9`); the Rogue's elbows, doubled for her stand-up, took her
  punch to 0 of 30 (`de9d8496`). *Repeated.*
- **Readings and training count only on the game's engine, rate and command delay.** Stand-up was
  tuned on parent-axis `rapier` for a month while the game ran `rapier-coordinate`; on the game's
  engine 153 of 160 became 67 of 80 (`66a46676`, `4acb557d`). *Shown.*
- **A controller tuned to one strength or speed cannot use more of either**: its activations
  overdrive or mistime the larger muscle. Grit as a strength surge and Haste as faster muscles add
  nothing to a controller that was not searched or trained across the attribute's range
  (`94a3f567`, `b21d6687`, `e8d6c775`, `1f6b963b`). *Repeated.*
- **Learning that worked: one PPO actor correcting a native controller that already succeeds on
  some cases, trained 20 to 50 M decisions.** The run (`1e4dd787`, 4.64 m/s), the punch
  (`35b6998e`, 8 of 60 to 92 %), the club drive (`4a2354fe`, 91 %). The same trainer on a seed that
  succeeds on none stays flat: the sword thrust three times (`7cd65504`, `39588333`, `d70fdeeb`),
  the Rogue's club (`e0bbce4a`), the Skeleton's punch (`8ed9abf4`). Another skill's or body's
  network starts behind scratch (`d6154220`, `e0bbce4a`); per-phase actors in short blocks met none
  of seven gates (`7db04797`). [The training recipe](recipes/training.md) holds the steps.
  *Repeated.*
- **Most failed training runs were environment defects, not learning**: actions applied a decision
  late (`5e20a7f2`), inputs clipped by a narrower normalisation (`d7a61762`, `ca7203c0`), a reader
  starting after the action (`7db22ea2`). Parity and timing are checked before a run. *Repeated.*
- **A whole-fight learned policy (PPO, NEAT, evolution, cloning) never passed a bar against a
  designed mind**; learning won only on single skills (`58afe766`, `c83e592d`). Shown on the earlier
  golem physics; untested on Rapier. *Repeated.*

## Judging a skill or a mind

- **A fixed pass-or-fail number set without a baseline throws away gains and gets moved to fit**:
  travel blocks were rejected one after another at none of seven gates (`7db04797`); the stomp's
  bar went from 6.4 to 3.0 m/s within an hour of landing none (`bcd4f589`, `1d958355`); the club's
  bar moved five times, among them `41766c12`. A skill is read by its value against the version
  before ([the skill recipe](recipes/skill.md#what-a-change-is-kept-on)). *Repeated.*
- **A strike cell is low where the Mind refuses its cases before it is low where the blow
  misses.** The drill orders each blow at the high and the middle mark with each hand, a blow not
  begun counts 0, and an Option takes only its own regions with the hands that can throw it. Every
  blow but the bonk is offered at the middle mark alone, so half of each of its readings is
  refused, and three quarters or more where one hand holds an item: the Warrior's punch is refused on 32
  of 32 high cases still and 64 of 64 walking, and lands 23 of 32 and 47 of 64 at the middle
  (`9dd4c338`). Read a cell's outcomes by mark and hand (`--by`) before working on the blow.
  *Shown.*
- **A strike bar that reads speed or touch alone accepts nudges, chops and bent-arm pushes**: a
  blow's worth is the mass behind the fist (`54a592aa`, `127eb165`, `ed11435a`). Since `3d6b1a01`
  `landed` counts any completed touch with the striking face, in the drill and the training reward,
  so a strike reading from before it is not compared with one after. *Repeated.*
- **A strike scored on energy alone yields a motion the owner rejects** (the club jab, the flailing
  swing, `a6e778e2`, `abfa50e3`). The score holds the form from the first search, and the form
  allows the mechanism that makes the speed (`5b1d36c6`). *Repeated.*
- **A rating that a health lead at the time cap can win measures not falling and static blocking,
  not fighting**: the embodied policy, the arena path fighters (591 of 600 at the cap), the
  10-hour tournament (65 %), Vanguard, the Option Mind twin match (88 of 120 drained, `57874d73`).
  Fight quality reads wounds dealt and is watched. *Repeated.*
- **Mirror and self-play pools rank a mind by its own shape**: the league-trained mind first in
  mirrors, 13th of 14 on the game's pairs (`87b74cb6`). A mind is read against the bodies and minds
  the game draws. *Repeated.*
- **Bout wins and Elo do not measure a strike**: tuned so, a search tunes spacing while the blow
  stays a nudge (Puncher, Vanguard's 80 to 100 variants). *Shown.*
- **More blocks are not more wins**: a hand at cover is a hand not countering (`8b3c65b8`,
  `1500f2da`). A guard is judged on life kept and taken. *Repeated.*
- **A threat reader is measured against the blow's truth before a guard is tuned on it**: the
  golem's stroke reader read "idle" on 82 % of asks after weeks of parry tuning (`ef839a1e`).
  *Repeated.*

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
- **A gait is in the game only when the game chooses it**: an installed run went unchosen until the
  Braced walk's price and the lowering wrapper were fixed (`b61f11d6`). Read the Dungeon's or the
  Lab's gait choice. *Shown.*

## Standing up

Works: **toes that bend (the slab in `toes.ts`, ankle dorsiflexion to 0.8 rad) and the sit-back**:
from hands and knees the Warrior stood 32 of 32, median 3.3 s; without toes, none (`13684ff1`).
**Ground Options priced by measured profiles** in the Option Mind; the planned climb. The learned
rise (an actor steering step-up's settings) stood 62 of 64 on the target of its day (`68e9ea71`);
it was deleted without a reading (`a107a3ee`), not ruled out.

- **A rise of timed poses cannot be made fast by changing its times**: its stages wait on balance,
  so shorter stages fall more and a gain on one set of falls is lost on the next (`7f3ebcdb`,
  `14ccd6d1`, `1a4cfa67`, `e8d6c775`). Change the route or the controller. *Repeated.*
- **Every route stalls moving the weight from hands and knees onto feet under the centre of mass;
  without toes no controller here makes it** (`63b74deb`, `13684ff1`, `9e7d7603`). *Repeated.*
- **More strength does not shorten a rise**: the joints run well under their strength (`317fbf13`,
  `94a3f567`, `e8d6c775`). Grit is not a torque surge. *Repeated.*
- **An assist helps only a feedback controller; a lift that does the rising is a wire** (`4ebb4d8d`,
  `4316eaa2`). *Shown.*
- **A stage machine advancing on contacts stands none of the target's falls** (`415480c6`,
  `9d1571a6`, `a19748a0`). *Repeated.*
- **An open-loop rise searched on one fall fails falls 1 to 2 degrees away** (`58f10e91`). Any
  searched rise is read on the whole target and on fresh falls. *Repeated.*
- **A rise from the back by poses alone stands none**: only a bearing phase carrying the centre of
  mass over the feet rises from there (`58f10e91`, `2f7404b8`). *Shown.*
- **Rapier cannot carry a light hinged toe under body weight**, at 120 or 480 Hz (`15e820ce`,
  `c6c3eb6f`, `76bc29c0`). A different toe changes the slab. *Shown.*
- **The Rogue cannot press her chest up**: elbow extension 23 to 27 N m against the Warrior's 57;
  ten stage changes stood no more (`bff75d1b`). Her rise needs stronger arms or a route that does
  not push up on them. *Shown.*

## Unarmed strikes

Works: **a timed push schedule searched by CMA-ES as the seed, steered by a residual PPO actor that
adds to its pushes and asks the stance**: 8 of 60 held-out places landed by the schedule, 92 %
steered (`35b6998e`). The stomp: a chamber, a braced stroke and a square-up step (`41c828d4`).

- **A tracking controller cannot throw a blow at a person's speed**: effector paths, whole-body and
  greedy solves, an arm-tracking layer and a point-driven fist reached 4 to 6 m/s against 6.8; the
  tracker lags by its response time and a blow happens inside that lag (`13439495`, `62420987`,
  `127eb165`, `7d9ee206`, `a340fbac`, `87d13005`). *Repeated.*
- **An open-loop push schedule lands only within about 2 cm of its searched distance**: it is a
  seed, never a skill to ship across places (`166c1e54`). *Repeated.*
- **A push on a leg bearing the body moves nothing**: a striker's legs are asked through the stance
  (`0b5af8eb`, `7d9ee206`). *Shown.*
- **A light body cannot meet a mass-scaled strike bar by more speed**: the Skeleton's fist meets
  0.09 to 0.22 kg whatever its speed (`0c3b4599`, `168a82e6`, `2793a30c`, `ed11435a`). It needs a
  different act or a different bar. *Repeated.*
- **The learned punch's window (0.89 to 1.01 m) is not where fighters stand** (about 0.6 m, the
  foe's guard over the mark); training on fight moments failed twice (`d664e869`, `d11e7e9d`,
  `843a8f8b`). Footwork and openings come before another punch run. *Suspected.*

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
- **The sword's cut fails on its edge's orientation and the thrust on the grip's geometry, not on
  speed**: the grip lays the blade square to the hand (`13ad8999`, `8b2fee9e`, `9ca0a63d`). The
  grip, the wrist's range or an alignment term in the score comes before another search.
  *Suspected.*

## Guarding

Works: **the buckler ward**, holding the face between the foe's weapon hand and the body and led
through the sense delay: the Warrior and the Rogue meet about 98 % of club and 80 % of sword blows;
the Skeleton falls on 11 to 12 of 50 (`e563ce37`).

- **A cover that waits to see the blow arrives late**: the threat shows 0.14 to 0.16 s before
  impact and the hand needs about 0.3 s (`00dd461a`). A guard is placed before the blow shows.
  *Repeated.*

## Minds

- **A mind cannot fight better than its skills deliver**: with blows that do not land or wound, no
  chooser, reward or league fixes the fight (`747e9f47`: the punch landed 0 of 16 in fights). Read
  a skill's land rate and energy on its fight rung before working on the chooser. *Repeated.*
- **An objective that charges contact without paying damage teaches stand-off** (`a9c7a28c`,
  `c8e7e39a`, `e5196c3c`). *Repeated.*
- **The tree chooser at 100 runs costs about twice the step budget**; fewer runs fit it and stand up
  from fewer falls (`7f562d22`). *Shown.*
