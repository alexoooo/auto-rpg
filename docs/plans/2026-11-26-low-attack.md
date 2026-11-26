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
  foot and side from one decision to the next. The man's forward walk-run is held to 0.7 m/s
  (`walk-run-envelope.json`: the fastest every trial held; at 1.0, 8 of 20), 1.5 backward. The
  owner, on the run gait: "it has ok top speed but it's quite slow to get there, so it's possible
  htat locomotion might need some work". So the lever is the man's speed forward, the envelope
  holding him to 0.7 m/s, and a route that keeps its window, before the kick or the Mind's pricing.
- **The forward cap is stale.** Re-measured on today's code (`stance-envelope.mjs --legs walk-run
  --models man --holds empty --walks --gusts 1:5:1,2,3,4`, 5 trials a speed), the empty-handed
  man holds 4.0 m/s forward (2 of 5 at 4.5), against the asset's 0.7; 1.0 to each side (0.7
  before); and 0.7 back, against 1.5 before (2 of 5 at 1.0): the back walk holds less than it did.
- **The run stalls its first second.** Asked to run forward at 2 m/s from standing (the walk trial
  of `stance-trials.mjs`, traced), the man goes 0.03 to 0.12 m/s for 1.1 s, reaches 0.5 m/s at
  1.25 s, 0.9 at 1.7 and 1.8 at 2.2 (some 1.6 m/s² once moving), then runs 2.5 to 2.9 m/s against
  the 2 asked. The run's record brings its pace up at 2.5 m/s² (`walk-run.json`, `accel`).
- **Ordered by the owner**, on the forward cap and the run's start: "good catch, i think we'll need
  to fix both these issues". First, the man's walk-run envelope re-measured and landed; then the
  run's start, why its first second does not move, looked at in frames, authored to reach pace as
  fast as its body holds, and the envelope measured with it; then the back walk, 0.7 m/s against
  1.5, a regression fixed (the owner: "I don't care if it make something worse, that just reveals
  another broken thing that must be fixed."). The window a route runs to, changing
  foot and side between decisions, is the lever after them, not started; the run's overshoot is
  noted, not started.
- **Next**: the low front kick searched again at the empty-handed man, as the bite is, on the rung
  its profile is measured on: `sparring-laid`'s twin (`sparring-laid-twin`, its starts from
  another stream), its own cases confirming (`skill-search.mjs stomp/front man --loadout
  empty,empty --target man`, 80 starts each); then the price below.

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
