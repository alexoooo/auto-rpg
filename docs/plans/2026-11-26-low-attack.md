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
- **The confirmation's falls are within chance**: it refused the best on 4 falls against the
  record's 3 at 480 Hz over 30 cases, where one fall is inside the fall counts' spread; a margin
  by that spread lands with the 120 and 480 Hz work below.
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
- **Next**: the 120 and 480 Hz difference found at its root and fixed (the owner: "Ideally 120
  should not diverge vs 480"; a search mixing in 480 Hz trials only if it is fundamental); the
  low front kick searched again on the code fixed; then the price below.

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
