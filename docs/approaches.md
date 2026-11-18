# Approaches

What each approach to travel, standing up, weapon strikes, guarding and minds has done and has
not, and why. Each entry names the mechanism, what it could not do, the cause and the commits
that show it (`git show <commit>` reads the story). An entry changes only when new evidence
contradicts it, cited the same way. What holds for every skill, for judging one and for unarmed
strikes is in [the skill recipe](recipes/skill.md), at the step it informs.

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
- **A gait is in the game only when the game chooses it**: an installed run went unchosen until the
  Braced walk's price and the lowering wrapper were fixed (`b61f11d6`). The Dungeon's and the
  Lab's gait choice shows it. *Shown.*

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
  38 % (`fd8ec9d56`). The step that does it is [a plan](plans/2026-11-16-back-step.md), parked:
  it wins against a Warrior without it (`179fa76b9`) and stands a mirror off. *Shown.*
- **More blocks are not more wins**: a hand at cover is a hand not countering (`8b3c65b8`,
  `1500f2da`). A guard is judged on life kept and taken. *Repeated.*
- **A threat reader is measured against the blow's truth before a guard is tuned on it**: the
  golem's stroke reader read "idle" on 82 % of asks after weeks of parry tuning (`ef839a1e`).
  *Repeated.*

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
  (`OthersModel.holdsBlow`) they read 0.7 to 0.9 of what they get, and the old pricing scored 0.503
  (0.451 to 0.556) against the new on `warrior-drawn`. A cover is priced as a hold there; it was
  chosen 5 times in 45,000 decisions. *Shown.*
- **The Option Mind's prices ran over what a fight gives**: in Warrior mirror bouts it expected
  2.4 times the life it lost in reach and 3.0 times what its punches dealt (`aee4b6342`, on one
  draw, its reader counting damage, not life). *Shown.*
- **The tree chooser at 100 runs costs about twice the step budget**; fewer runs fit it and stand up
  from fewer falls (`7f562d22`). *Shown.*
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
  a cell (`coarseTable`) ran 12% faster and lost, 0.451 (`5a85cb5f1`). *Shown.*
- **A search that starts from its last decision's worths wins by fighting less**: each Option's
  worth at the last root kept as as many runs, fading by half each 0.5 s (`TreeConfig.keeps`), won
  0.635 (0.580 to 0.691) held out at the same runs, but silent 16.2% of a bout against 9.4%: an
  Option worth more at the last root stays chosen. Unset (`c1cdbe73d`). *Shown.*
- **A line's end written as three numbers plays as the tail and the hold at 40% of their time**:
  each side trading life at a rate falling straight with how far apart the two stand
  (`SearchConfig.end`), its shape from bout rows and one scale by bouts won: 0.503 at half the
  rows' rate, 0.417 at it, 0.434 at a quarter; 20.1 ms a deciding step against 49.6; with the back
  step in both minds 13% standing silent against 5% without, the most any kind moved that. It
  reads no walk to a site. A half-life on life traded later won nothing held out (0.483). Unset
  (`d87df83c2`, `eb2876fb1`). *Shown.*
- **The foe's steps, measured or carried on, add nothing**: the foe's own steps by range and what
  the body does, from bout rows, left the walk's time and the back step's exit to them (`FoeSteps`,
  `measuredSteps`): standing silence 20% with the back step as without them; its velocity carried
  on had the walker 0.9 m past its window and the mirror fell apart (`46d7b4e09`, `c9b5e7b39`).
  *Shown.*
- **A body measured on none fights by another's trials at ranges by stature**: a profile records
  its body's stature; with none on its own body, the nearest body's in stature is read scaled and
  its price says coarse (`acrossBodies`). Held out, the woman's punches answered 1,157 of the
  man's 1,310 starts by stature against 786 unscaled, near his own trials' error. Every other
  body's pooled and read as a written form beat the nearest body in 11 of 18 sets, 9 of 12 where
  the others had hundreds of trials, and lost where they had about 60, as the man's do
  (`5f394cae0`, `b7d2fb56a`). *Shown.*
- **Two foes cost a little less than the sum of each, and the Option Mind prices them so**: a man
  in an open Crypt room lost 0.79 (0.65 to 0.96) of what two men took from him alone, summed, and
  the Mind's expectation of each foe fell with two as the loss did, within about 15%; skeletons
  summed plainly, but it expected about 20 times what they took (`16d74daf4`,
  `research/minds/two-on-one.mjs`). *Shown.*
- **Not built**: the ground as numbers (room behind, slope, the nearest wall: nothing reads it);
  what a body holds as numbers (a profile is still keyed by what it holds, `holdsOf`, so each
  loadout pair is its own table or none; only stature carries across bodies); one model a skill
  across bodies in the game (the nearest body's trials scaled is). The skeletons' overprice two on
  one is likely their pricing by rate: the measured pressure has a table for a man on a man only,
  so any other foe is priced by the most its strikes could deal at reach (`measuredOthers`,
  `ratePressure`); not isolated. The kinds were fitted by bouts on the Warrior empty-handed
  alone, the stature reading went into the game on held-out trials with no bouts, and the
  written form into it with no look in a browser. *Suspected* where a cause is named.
- **Not yet read**: the search spread over steps and the branch kept (each rests on a kept worth
  standing for a situation since moved, as the warm start's does); a value read from bouts is the
  Minds' that fought them, and how a table stays true as the Mind reading it changes is not
  answered; what the chosen moments hold that a start does not (the foe's action and its
  progress, the seconds since the body last decided).
