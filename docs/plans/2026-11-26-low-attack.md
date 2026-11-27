# The low attack

**Begun 2026-11-26**, the next step of [the kicker's falls](2026-11-25-kicker-falls.md#after-it):
the low attack in the game's Mind, by its own profile, so the Mind prices it by measurement.

## The goal, in the owner's words

On 2026-11-24: "Re the excessive falls after kicking, I do want that addressed, but only after
modelling and better low attack (stomp)"; on the low attack, "it doesn't have to be a stomp, it
can be like kicking a football or anything". On 2026-11-26, judging the front kick: "we don't have
any good way to capitalize on opponent falls".

Later on 2026-11-26, the Warrior keeping the front kick: "that way we will see falls for the low
kick to act on. We don't need anything re the club, again we are looking at empty handed warrior
only [...] And now that we have the new kick with more falls, I am hoping that the low kick can
bring faster knockouts."

So the low attack's bar is faster knockouts in the empty-handed Warrior's mirror, the Warrior
holding the front kick: the Warrior with the low attack against the same Warrior without it, on
the scorecard (warrior-drawn), read by its knockouts within 60 s, its time to a knockout and its
share of a bout with either body down. Everything it is searched, looked at and read on is the
empty-handed man.

Once it is tuned, it is read on warrior-drawn, the empty-handed man alone:
- **Its pace**: the scorecard's mirrors of three subjects in one run, the Warrior with no kick,
  with the front kick, and with the front kick and the low front kick: knockouts within 60 s,
  time to a knockout and ground share. The front kick's row against the front and low kick's
  says what the low kick adds; the no-kick row, whether it reaches the punching pace.
- **Its winning**: the match of the Warrior with the front and low kick against the Warrior with
  no kick, the punching Warrior. The owner, on the punching Warrior falling less on his own: "if
  we can['t] beat it then that's an indicator that one or both of front/low kick needs more work.
  If the front and low kick are working properly, then I don't see why they wouldn't win." So a
  lost match is not a trade recorded: it is more work on whichever kick the readings point to.

## Where it stands

- **The low front kick (`stomp/front`), authored**: the front kick's executor (`frontKickExecutor`,
  its chamber and its firm, straight drive through the target, the trunk upright) with its window
  where the low kick's (`stomp/kick`) is, at a lying trunk. Its look,
  `research/looks/man/stomp-front/f1766baa92a3`: on the stomping twin it lands 5 of 18 and none
  fall, 10 meeting the body off the mark (below); the low kick on the push kick's record,
  searched on that rung, lands 14 of 18 there with 1 fall, a short jab with no chamber
  (`research/looks/man/stomp-kick/6f2961845d25`). Pickable under Stomp in the Arena's Skills panel.
- **Where its foot lands off the mark is its aim along the body, not the place it stands.** On
  the look's 18 trials, the first blows of its misses: the pelvis (`lowerTrunk`) 3, the head 3, a
  thigh 1; the kicker stands beside the body, 0.6 to 0.7 m off its length near its hips (the
  strips' side-on camera reads it as the feet end). A place chosen with the strike's way to the
  target's region clear of the rest of the body (a line at the target's height, followed to where
  it first meets the region) moved the thigh's one trial and nothing else, and was not kept; its
  first form, followed to the mark itself, refused 5 of 17, the pelvis's collider overlapping the
  trunk's mark from every side.
- **Its search kept the authored record.** Searched on the stomping twin at the man alone
  (`skill-search.mjs stomp/front man --target man`, 13 generations to its plateau), its best
  shortened the chamber (0.35 to 0.25 s), halved the brake and widened the window's far edge
  (0.71 to 0.86): on the man's own cases it read 0.405 at 120 Hz with no fall against the
  record's 0.290 and 1, and 0.173 at 480 Hz with 4 falls against 0.100 and 3, so the record holds.
- **Its profile** (`sparring-laid`, a foe laid down fighting back, 240 starts): of the starts it
  began, landed 44 % with the left foot and 30 % with the right, the kicker down after 5 % and
  17 %; the push-based low kick on the same rung landed 15.8 % and fell 31.5 %. At the man, 33 of
  its 80 starts were beyond its height band, the foe sitting up out of it first.
- **The confirmation's falls are within chance, and none was the empty-handed man's**: it refused
  the best on 4 falls against the record's 3 at 480 Hz over 30 cases, where one fall is inside the
  fall counts' spread; and its 30 were 6 cases in each of the man's five loadouts, the record's 3
  falls with a club or a sword, none empty-handed.
- **At the empty-handed man, 120 and 480 Hz agree on the mean**: the record on sparring-laid's 80
  starts at the man, at both rates, valued 0.092 ± 0.090 and 0.061 ± 0.061; case by case, no
  outcome moves between the rates beyond chance (McNemar: beyond the height band 11 at 120 alone
  against 20 at 480 alone, z 1.44; falls 15 against 10, z 0.80; landed 6 against 2, z 1.06), the
  paired value 0.058 ± 0.230. A case's outcome is not kept: 45 of 80 end otherwise at the other
  rate, a foe fighting back growing a step's difference into another bout. The confirmation keeps
  both rates.
- **Read at f5581cb82 (warrior-drawn, `--fresh`)**: the low front kick in place of the stomp is
  no faster, and lands less on a body down than the stomp does. The scorecard's mirrors, 216
  each; every bout a knockout, so a bout's seconds are its time to one:

  | | no kick | front kick | front kick, the low front kick in place of the stomp |
  | --- | --- | --- | --- |
  | knockouts within 60 s | 0.782 (0.723 to 0.832) | 0.417 (0.353 to 0.483) | 0.468 (0.402 to 0.534) |
  | time to a knockout, mean (median), s | 44.6 (41.6) | 61.3 (63.1) | 59.0 (60.4) |
  | share of a bout with either down | 25.5 % | 36.4 % | 33.8 % |
  | blows a second while one is down | 0.89 | 1.04 | 0.75 |
  | blows a second while both stand | 2.79 | 1.74 | 1.76 |
  | downs a bout | 0.95 | 2.58 | 2.39 |

  The match of the front kick with the low front kick in place of the stomp against no kick, 288
  bouts: 0.406 (0.354 to 0.458), margin −0.127 (−0.179 to −0.074). By the owner's words, more
  work on the kicks, which the readings point to:
  - **The front kick's pace standing**: 1.74 blows a second against the punching Warrior's 2.79,
    most of the gap. In the scorecard's pricing, the front kick's Mind prices its strikes into a
    striking foe at three times what they give (7.5 % of a life against 2.5 %, over its 1140
    choices priced to deal there; the punching Mind 1.7 against 2.5, over 984). The front kick's profile is not what overstates it:
    its trials begun with the foe striking (46 and 34 of 2230 and 2224, against the moving
    punch's 382 and 366 of about 3950) deal about a third of its clear ones' and take two to
    three times as much, and a start at a striking foe reads that phase's trials alone
    (`readProfile`). Where the price comes from is the first thing traced.
  - **The low front kick on a body down**: 0.75 blows a second there against the stomp's 1.04.
- **Its time goes to the walk to the foe.** The owner, on its arriving too late: "Re a faster
  approach, yes that might be necessary to make this work." On sparring-laid's 80 empty-handed
  starts at the man, at 120 Hz, the record: the foe is down by 0.3 s and at rest about 2.2 m off by
  1.3 s (the shove); the striker stands 0.4 s more, then closes at 0.31 m/s (median), and is in its
  window at 6.1 s (median); the 22 kicks begun began 0.01 s after their window first admitted them,
  at 0.37 m/s, under the admitting speed (0.6), and took 0.59 s to commit. Of its 43 starts
  `beyond` its band, 26 came as the foe began to rise, at 4.4 s (median), his trunk's centre
  0.3 m up; the other 17 within 1.5 s of the shove, the foe just landed, where a trial ends at its
  first `beyond` (`Ending`: "standing as the drill stands it, it stays so", which a body laid down
  does not), and a trial not offered is not counted. So the lever is how the Mind closes on a
  lying foe, not the kick's admitting speed.
- **In the game's bouts, the Mind goes for a lying foe and arrives after he is up.** Replayed, 24
  warrior-drawn mirrors each, every down with the other standing: the standing Warrior began a low
  attack in 2 of 48 downs with the low front kick in place of the stomp, and in 2 of 51 with the
  stomp. A down lasted 7.3 s (median); the stander, 1.5 m off at the fall and 1.9 m a second later,
  was 1.4 m off at its end, moving at 0.38 m/s (median) and at most 0.89. Its menu through a down
  (one bout, printed at 0.5, 1.5, 3 and 5 s in): from 1.5 s it chooses to run to a stomp's window,
  each route priced 4 to 8 s from about 2 m, 2.5 s from 0.94 m, and the window it runs to changes
  foot and side from one decision to the next. How long a walk takes is priced by hand
  (`scripts/inventory.mjs`: "a walk: 24 on offer: by hand"). What holds the close in the bout is
  not yet read: the speed asked, the gait not making it, or the route changing windows.
- **The walk-run envelope was stale, and is not what holds the Warrior.** The asset predated the
  envelope's turns onto a way (`turnings`); re-measured whole (2ac1f7f8b), the empty-handed man's
  walk-run holds 4.0 m/s forward (was 0.7), 1.0 to each side (0.7), 0.7 back (1.5), and above
  0.7 m/s no turn at any rate. The empty-handed man's mirror did not move with it: the Warrior
  walks in the stance (`stance-walk`, its own envelope, 2.0 m/s forward, 1.4 back, 0.7 to each
  side), and the walk-run he also holds is not what caps him in these bouts.
- **The walk-run stalls its first second.** Asked to run forward at 2 m/s from standing (the walk
  trial of `stance-trials.mjs` by the walk-run, traced), the man goes 0.03 to 0.12 m/s for 1.1 s:
  the walk's weight shift (0.45 s, the centre still), a short first step, then the left foot set
  0.36 m behind the start before the drive; 0.9 m/s at 1.7 s and 1.8 at 2.2, then 2.5 to 2.9 m/s
  against the 2 asked.
- **Ordered by the owner**, on the run gait, seen in the game: "it has ok top speed but it's quite
  slow to get there", and "i think we'll need to fix both these issues". The back walk's 0.7 m/s is
  the walk-run's, not the Warrior's: his legs walk back by the stance walk, 1.2 m/s on today's code
  (47944b7dc). The window a route runs to, changing foot and side between decisions, and the run's
  overshoot are noted, not started.
- **In the bouts the stander does not make the pace asked, and the limits are not why.** Twelve
  front kick and low front kick mirrors, every 0.1 s with one side down and the other standing:
  the stance walk is asked 0.70 m/s on 272 of its 340 steps asked to move, the fastest pace its
  envelope turns at while the heading still turns (`steeredPace`), and the body makes 0.45 (median).
  Each changed by hand and replayed (24 bouts) moved the close by nothing: the man's stance turns
  allowed at every speed (asked pace 0.82, made 0.45), his side walks to 2 m/s, the stance's
  stopping 0.5 to 2 m/s².
- **Every gait he holds went nowhere for its first second from standing**: braced, staggered, the
  stance's own walk and the walk-run passed 0.2 m/s at 0.9 to 1.1 s, whatever pace was asked. The
  first step from a stand was planned at the pace of the walk's first instant (its acceleration
  over one step, about 0.02 m/s) and its weight shift took the body onto the bearing sole and no
  further, so it landed where it stood and the walk went from the second step.
- **The quick start (`stance-walk/quick-start`), pickable in the Arena, off in the default.** Steps
  that fall to start (`GaitTuning.fallsToStart`): a step from a stand planned at the pace the walk
  will have as it lands, and its shift falling about both soles toward the capture point it needs
  at the lift (`SwingGoal.handover`), lifting there or at the swing's time. By it, from standing,
  the man passes 0.2 m/s at 0.23 s (0.91 braced), makes 0.40 to 0.49 m/s over the first second
  (0.05), is 0.87 m on by 1.3 s (0.25), the first step 0.20 m forward; seen from the side, the feet
  part at 0.4 s and he strides with a heel strike by 0.8 s, the trunk upright. As the stance's
  default it closed the walk-run's stall too (90 % of 2 m/s at 1.33 s, 2.23 before); as a
  variation, the walk-run keeps its stall.
- **As the default, the start slowed knockouts in every subject**, and so it is a variation for
  now. The scorecard (warrior-drawn, 216 bouts each, `--fresh`), today's code with and without it:

  | | no kick | front kick | front kick, low front kick |
  | --- | --- | --- | --- |
  | knockouts within 60 s, without → with | 0.769 → 0.625 | 0.509 → 0.366 | 0.546 → 0.421 |
  | time to a knockout, mean, s | 45.1 → 52.0 | 56.8 → 62.9 | 54.2 → 59.9 |
  | downs a bout | 1.03 → 2.07 | 2.08 → 3.13 | 2.12 → 3.09 |

  The falls, no kick, 24 bouts, a fall after at least 0.5 s up, by what its stance was doing 0.25 s
  before:

  | | falls | in a step to catch a push | standing, no step | in a walking step |
  | --- | --- | --- | --- | --- |
  | without | 17 | 11 | 3 | 2 |
  | the first step's pace alone | 28 | | | |
  | with | 37 | 19 | 10 | 7 |

  Of 37 starts given up before their lift, one was followed by a fall. Most falls came mid-way
  through a step to catch the body; why the start makes more of them is not read. The owner: "I don't care if it make something worse, that
  just reveals another broken thing that must be fixed."
- **Picked, the quick start costs a little, its mechanism unread.** The Warrior holding the quick
  start in the braced walk's place and the staggered walk (`+stance-walk/quick-start+stance-walk/staggered`;
  a variation named replaces every one of its skill's), offered in the braced walk's place
  (2b7847483: walks priced alike, a tie goes to the gait listed first), on the scorecard
  (warrior-drawn, 216 bouts each, `--fresh`), against HEAD:

  | | front kick | front kick, low front kick |
  | --- | --- | --- |
  | knockouts within 60 s | 0.509 → 0.435 | 0.546 → 0.481 |
  | time to a knockout, mean, s | 56.8 → 59.8 | 54.2 → 58.1 |
  | downs a bout | 2.08 → 2.48 | 2.12 → 2.60 |

  Each knockout gap is about 1.4 standard errors. The falls in 24 of the front kick's bouts, a fall
  after at least 0.5 s up: 48 on HEAD (35 in a step to catch a push, 11 standing, 2 in a walking
  step), 40 with the quick start (29, 8, 3). It stays off in the default.
- **The falls in a catch step are the kicker's own, not blows.** On HEAD's default Warrior (front
  kick, 24 bouts), of 35 falls in a catch step, 30 lost no life in the 0.5 s before the catch
  began, and 22 were kicking as it began (most having just chosen a back step); its foot was
  already off the ground in all but four, and the capture point 0.2 to 1.0 m from where it was to
  land. About 20 never landed before the fall. These are the falls [the kicker's falls](2026-11-25-kicker-falls.md)
  reads ("no catch spares these falls").
- **The front kick held forward: landed.** The kick's centre held 0.1 m ahead of the standing
  sole and its trunk forward (lean 0.4), against 0 and 0: in fights the kicker is down after
  half as many kicks (sparring-feet, 9,600 trials: 7.3 % and 5.8 % of kicks begun against 13.2 %
  and 13.8 %), and lands a third as many (5.9 % and 10.1 % against 24.8 % and 23.0 %); the
  scorecard on its own profile, knockouts within 60 s 0.556 (0.489 to 0.620) against 0.509, downs a
  bout 1.62 against 2.08. Its falls now go forward as well as back (its look's one fall,
  f862c1860d0f). The centre held ahead with the trunk upright lands less still on the drill (4
  and 5 of 16 at 0.1 and 0.2 m): it is the centre held ahead that lowers the kick.
- **Searched from there, the front kick is a kick at the knee: landed.** Its window nearer and its
  extension quicker (414a8c586), it meets the foe's shin or knee on every drill trial. Against a
  foe fighting back it is begun less (1,891 and 1,882 against 2,252 and 2,247), its kicker down
  less (5.7 % and 3.4 %), and it deals less and costs more a kick (dealt 0.215 and 0.247, taken
  0.894 and 0.851). The scorecard: knockouts within 60 s 0.676 (0.611 to 0.735), downs a bout
  1.44, blows a second 3.02: the Mind kicking less, falling less, fighting more between kicks.
- **Most time down is both lying, choosing to.** In the 24 bouts of that scorecard, 659 s down over
  1,330 s of bouts (both sides): 55 % on the back, 33 % on the front; 72 % with both down, and in
  4 bouts both lie to the end. A fall on the back lasts 36.6 s on the mean and rises in 4 of 10,
  one on the front 11.9 s and 19 of 21. Lying, each Mind takes `flatten` over every way up: the
  fitted value (`assets/minds/fitted-value.json`, fit at 33be0e76f) prices a body lying on its back
  as dealing more over the next 20 s than one standing (0.230 against 0.155, bout 8 at 50 s, the
  side behind), a rise of the bouts it was fit on in that price, while the tree's own rise from the
  back (a roll, then front-sit-back, 7.8 s) pays its time; and on the front, lying is safer than
  standing near a foe lying (life taken 0.10 against 0.17, bout 13 at 75 s, the side ahead). What
  would change it: a lying body made costly to lie (the low attack, below), then the value fitted
  again on the empty man's mirror, where a body that lies stays down.
- **The quick start is the Warrior's walk.** Under the kick at the knee it matches the braced
  walk's knockouts (0.671, 0.606 to 0.730, against 0.676), stands silent less (0.169 against
  0.216) and out of reach less (0.208 against 0.245), downs a bout 1.57 against 1.44; it takes
  the braced walk's place in the Warrior's skills, the braced walk pickable beside it.
- **A body lying is reached late.** On `sparring-laid` the low front kick refused 56 of 80 trials
  at the man as `beyond` (85150ba18 keeps a laid target a target while the striker senses it
  down). One traced: the man lies in the kick's band from 0.5 s to 4.5 s, the kicker 1.7 to 2.3 m
  off, in reach at 6 s as the man sits up. The kicker stands the first 0.75 s; asks no more than
  0.95 m/s, braked for its spot; its spot moves each second, from 1.0 to 1.8 s away from the man;
  and its legs go over to the walk and run at 1.26 s, whose start stalls.
- **The walk and run's start stalls; its quick start falls.** The run sets off at 0.2 m/s by
  0.77 to 1.11 s from a stand, its first second's mean 0.00 to 0.05 m/s. Its walk stepping as the
  quick start does (`walk-run/quick-start`, e44bacd2f, pickable, not picked) sets off by 0.18 s,
  but under it the scorecard's knockouts within 60 s are 0.542 against 0.671, downs a bout 2.38
  against 1.57, most falls at 1.7 to 2.5 m/s as the walk or the back step takes a body off a run.
- **The run stops on its place, slower.** At the empty man's envelope the run is about one
  speed, 1.6 to 1.9 m/s: its slowest clip goes 2.75 m/s, and under it the run shortens its swing at
  its cadence. Asked slower, it ran on, handing back to its walk only at a landing at 0.954 m/s or
  slower, and sent 4 to 15 m at its 0.2 m/s² ended 0.95 to 1.20 m past (the `arrive` trial,
  `stance-trials.mjs`). Asked under its walk's takeover, it now brakes as asked to stand and its
  walk takes the pace: at 0.2 it ends 0.64 to 1.04 m past, at 0.15 0.04 to 0.32, at 0.1 within
  3 cm. No bout of the scorecard asks it so.
- **Each walk's stop is measured; the walk and run's waits.** The speed rule brakes each stretch
  of a gait's speeds at the fastest rate it was measured to stop within the place's nearness at
  (`assets/skills/locomotion/stops.json`, rates from 0.1), and a walk to a spot stands within the
  spot's own nearness, a window's half the window (`windowNear`). The walk and run's walk stretch
  braked after its walk's lag (0.38 s), measured or not, costs the scorecard's knockouts within
  60 s 0.40 to 0.50 against 0.68, downs a bout 2.6 to 2.9 against 1.6: unmeasured, it is braked
  with no lag, and its entries are kept out of the asset (`stance-stops.mjs --gaits
  walk-run,quick-run` measures them). The falls that lag brings are a walk taking a body over from
  the back step moving: one traced, the quick start takes it backing off at 0.94 m/s, and it goes
  on to 2.78 m/s and falls.
- **A step falls to start only from a stand.** The quick start planned its first step as from a
  stand, falling toward it, wherever it had no stride of its own, so a body it took over moving
  was thrown on the way it went. Now only a body whose capture point is over its feet falls to
  start (`fallsToStart`, `gait.ts`): the scorecard's knockouts within 60 s 0.741 (0.678 to 0.795)
  against 0.713, downs a bout 1.38 against 1.55; its start from a stand as it was. And only about a
  bearing sole reaching back to the body's centre the way it walks: a back step left the man on
  his front foot, 0.61 m ahead of his centre, and asked to walk on, he fell back off it at 2 m/s.
- **The walk and run's walk stretch after its walk's lag, read again**: with its measured stops,
  the scorecard's knockouts within 60 s 0.528 against 0.741, downs a bout 2.50 against 1.38, before
  the bearing sole's test; 0.611 against 0.745 after it; and on the shared Mind defaults, 0.542
  (0.475 to 0.607) against 0.597 (0.531 to 0.660) at 44d1aa1dd, downs a bout 2.11 against 1.93. Kept
  out still, the cost narrowing as the walk's starts are mended. Its falls, twelve bouts each: 23
  against 13, the back step's 13 against 4, 9 of them at more than 1 m/s.
- **The back step throws a body moving back.** One traced on main (bout 0, 8.4 to 10.1 s, no blow
  taken): its sway asks the centre 0.1 m past the rear sole (`BEYOND`) as the body already goes
  back at 0.3 m/s; the stance's catching steps (the left at 8.95 s, the right at 9.15 s) never
  bring the capture point back within the feet, which it leaves by 0.09, then 0.17, then 0.5 m, and
  the man goes on back to 2.07 m/s and down. The low front kick's close waits on the same: it
  brakes at the run's unmeasured 0.2 m/s² over its walk stretch (from 3 s, 0.76 to 0.24 m/s over
  1.1 m), arriving at 6.5 s, the man rising at 4.4; 40 of its 80 trials on its twin end `beyond`.
  Swayed by its capture point since (the approaches' back step), it falls in 1 drill fight of 48
  against 10, and the scorecard reads 0.667 against 0.597.
- **The walk and run's honest stop still costs.** Read on three trees since: 0.639 against 0.667,
  0.602 against 0.662, and on 2937bbf5d (the value refit) 0.625 (0.559 to 0.687) against 0.704
  (0.640 to 0.761), downs 2.12 a bout against 1.82. Its falls in twelve bouts there are as many
  (27 against 28), more of them at speed (22 over 1 m/s against 15), the quick start's 11 against
  6; the low front kick's record gains nothing from it on its twin (`beyond` 41 against 40). Kept
  out. The back step's falls lead on that tree either way: 16 of the 28.
- **A start fell the way one instant asked.** 33 of the low front kick's 80 trials on its twin
  first walked back, 19 of the 37 `beyond`: on one step, the drill's settling stand beside a foe
  just fallen is walked out of him (`keepOut`, nothing exempt on a stand), and the quick start's
  step from a stand, planned from that one step's walk and never re-aimed before it lifts, fell
  the body back for a second against the spot asked forward after. A step not yet lifted whose
  walk has turned from the one it was planned at is now planned again: the traced trial arrives at
  5.26 s against 6.51, the kick's record on the twin scores 0.133 against 0.005 at 120 Hz (0.006 at
  480 Hz), 39 `beyond` against 40; the scorecard 0.662 (0.597 to 0.722) against 0.667.
- **The low front kick waits on its arrival.** Searched again at the empty-handed man on
  `sparring-laid`'s twin (`--loadout empty,empty --target man`), its record scoring 0.005 with 17
  falls: the first generation's best 0.131 (0.030 at 480 Hz, 18 falls), the next three's 0.075,
  0.077 and 0.070, their medians about 0.04, stopped there. With half its trials `beyond`, its
  timings do not move it: its arrival does.
- **Next**: the drill's straight spot named as a place by its foe; the back step's falls in the
  fights traced again; then the low front kick's close and the price below.

## Then: a strike's price, every start a number

The owner, on 2026-11-26, on pricing a strike with the foe attacking: "I do think that we need
that and many other features. But I want to make sure to do it in a simple and general way that
is scalable." Then: "Yes, queue the pricing approach."

The profile's reading (`src/skills/framework/profile/nearest.ts`, `reading.ts`), the empty-handed
man first:
1. **Every feature of a start is a number in the nearest trials' distance**, each with its span:
   the foe striking, how far into its strike, and the rest. No feature splits the trials by
   category (as the foe's phase does now); a new feature is a number recorded, not a new path in
   code.
2. **Spans fitted, not set by hand**: each chosen by the error of predicting the profile's own
   trials held out, a feature that does not predict given a span wide enough to drop out, so
   features are added freely. The fitted spans replace the hand-set ones (`NEAREST`,
   `STANCE_SPANS`, `STRUCK_SPANS`, `HELD_SPANS`).
3. **Coverage and confidence**: where the game's Mind asks for prices in real bouts is recorded,
   and a profile's starts are sampled there; a reading whose nearest trials are far leans toward
   a broader mean rather than trusting a few distant trials.

**Its gate**: the scorecard's priced dealt over given, by slice, near 1 in every slice; the front
kick's slice with the foe striking, 3.04 now, the first. A part that proves not simple in the
code is said so before it is built.

## After the kicks land: shorter fights

The merge of the shared Mind defaults (f3743dea2) made the Warrior's Mind beat its old self and its
own mirror slower: on the scorecard (warrior-drawn), knockouts within 60 s 0.583 (0.517 to 0.647)
at f74a3df3b against 0.745 (0.683 to 0.799) at e62f6ff59, downs a bout 1.92 against 1.49. The
owner, on 2026-11-27: "Stronger and slower is fine for now, but after we land the two kicks and
other changes, we can come back and see how to make fights shorter (perhaps increase aggression
or something else)." So once the front and the low front kick have landed, fights are made
shorter, read on the same scorecard against the baseline then.
