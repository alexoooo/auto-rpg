# How the arena's bouts end

The standing set of arena bouts each change to the bout's rules is read against: how they end, how
often bodies fall and blows wound, and what the blows cost. Each section is one tree, read against
the section before it; a corrected reference voids the conclusions drawn from it, so earlier
sections stay as they were read. Nothing cites a figure here from code.

## Measurement

- **The bout** is `playBout` (`research/bout.mjs`): two bodies built from a recipe (`DuelRecipe`,
  `src/arena/duel.ts`) in a world of their own with the arena's solids, stepped to the verdict.
  Nothing in a bout is random, so one recipe is one bout; the spread comes from matchups and gaps.
- **Harness**: Node 24.19, the core world (`src/core/world.ts`), Rapier, 120 Hz, each side's
  balance its character's (0 %), the club in every right hand unless `--held empty`.
- **The set**: every ordered pair of `workshop-fighter`, `workshop-rogue` and `crypt-skeleton`.
  27 bouts at gaps of 3, 4 and 5 m, or 45 at 3, 3.5, 4, 4.5 and 5 m:

  ```powershell
  node research/bout-baseline.mjs --gaps 3,4,5 --workers 14 --floors 1,5
  node research/bout-baseline.mjs --gaps 3,3.5,4,4.5,5 --workers 26
  node research/bout-baseline.mjs --gaps 3,3.5,4,4.5,5 --held empty --workers 26
  ```

  Other flags: `--never-off` (no blunt blow takes a part off), `--unit` (joules a hit point),
  `--hand` (the hands' surfaces). A bout's count of blows is not a rate; the rates below are over
  the set's bout time.
- **The crypt** (`node research/crypt-blows.mjs`, and `--companions 2`): Node, a crypt run with no
  visuals, Rapier, 120 Hz, seeds 1 to 4, the hero exploring to the run's end or 120 s.
- **Digests** (`research/bout-trace.mjs`): every segment's pose at every step (`traceOf`,
  `src/evaluation/trace.ts`), on the development host. A change that should change nothing leaves
  them as they were; on another Node or processor, read them before a change and compare after.

| Tree | The Warrior against the Rogue at 4 m | Skeleton against skeleton at 4 m |
|---|---|---|
| [Standing table](#standing-table) | 2271 steps, right wins by a fall at 18.925 s, `fd30dd8586076627` | |
| [With senses](#with-senses) | 2547 steps, left wins by a fall at 21.225 s, `3ab8855dc81d4dfa` | 1947 steps, left by a fall at 16.225 s, `91dc2fa923804d70` |
| [Down read from the body](#down-read-from-the-body) | 2563 steps, left by a fall at 21.358 s, `4a4223d7a7cf67e8` | 1981 steps, left by a fall at 16.508 s, `356c4896aa6f3b7b` |
| [Lying still](#lying-still) to [A hit point is 100 J](#a-hit-point-is-100-j) | 2563 steps, `6f7ded18dd73c7f8`; bars 0.992 and 0.791 at 100 J | 1981 steps, `489780706aad98b9`, no blow |
| [Placed blows](#placed-blows) | 2434 steps, left by a fall at 20.28 s, `88668e71fdacd2fd`, bars 1 and 0.799 | as before |
| [Searched blows](#searched-blows) | 1145 steps, left by the right's death at 9.54 s, `60cab1dda3377989`, bars 0.985 and 0.494 | |

## Standing table

Read on the tree that first held `research/bout-baseline.mjs`, the commit after `e01d7bc5`; a blow
was a striker (a hand, with what it holds) landing on a body, and a clash striker on striker.

- 27 bouts: fatal 1, fallen 20, severed 6; 361 s of bout time.
- 3.33 falls a minute; 10.8 wounding blows a minute.
- 8 of 27 end before any wounding blow.

## With senses

The first tree whose bouts go through the senses (`createSenses`, `src/core/mind/senses.ts`):
every body is read before any mind steps, so both sides decide on the same step (the left side had
aimed at the right a step late), and each side picks its foe from what it sees
(`seekFoe`, `src/core/mind/recipe-tactics.ts@cee7aae2`).

| | Standing table | With senses |
|---|---|---|
| Bouts by ending | fatal 1, fallen 20, severed 6 | fatal 2, fallen 19, severed 6 |
| Bout time, s | 361 | 375 |
| Falls a minute | 3.33 | 3.04 |
| Wounding blows a minute | 10.8 | 10.4 |
| Ended before any wounding blow | 8 of 27 | 7 of 27 |

Every bout is another bout, since nothing damps a difference of one step; each rate moved by under
a tenth of itself.

## Down read from the body

The first tree whose bouts take a fall from the body's own reading (`BodyView.down`,
`rising.md#down`): the centre of mass over the body's lowest point, where it was over the soles'
middles. Every winner, ending, blow and bar is as it was. The 19 bouts that end by a fall end 0.05
to 0.6 s later, since a body's lowest point is never above its soles' middles; the other eight end
at the same step. Played to the old verdict's step (`node research/bout-trace.mjs workshop-fighter
workshop-rogue 21.224`, and `crypt-skeleton crypt-skeleton 16.224`), both give the previous digests.

377 s of bout time; 3.02 falls and 10.3 wounding blows a minute; 7 of 27 end before a wounding blow.

## Lying still

The first tree whose bodies lie still once down (`lie`, `rising.md#lying`): on the step its loser
is first down, the loser's mind hands its body to `lie`. A bout that ends by a fall is the same to
the bit up to the step before its verdict, with the same verdict at the same step; any other bout
is the same throughout. With a mind that hands its body to nobody
(`--mind '{"kind":"fighter","subs":[],"guard":"pose"}'`) both digests are the previous section's,
and a step short of the verdict the two minds agree (`76fd792f95855fef` over 2562 steps,
`35fa4058e1f57862` over 1980).

## A blow has two sides

The first tree whose blows have no striker: any two segments of the two sides that meet closing
have met in a blow, and the two surfaces share its energy by their compliance
([wounds.md](wounds.md#shares)). Every winner, ending and second is as it was, since a wound moves
no body until it decides the bout. What changes is the count:

| | Down read from the body | A blow has two sides |
|---|---|---|
| Wounding blows a minute | 10.3 | 13.8 |
| Clashes | 64 | 10 |
| Ended before any wounding blow | 7 of 27 | 6 of 27 |

A clash was read once from each hand, so the 64 were 32 meetings; a touch is read once, and is a
clash only where both surfaces are items. A club on the hand under another club, a club caught on a
bare left hand, and an arm or a leg meeting the other body are blows where they were nothing.

**Over 45 bouts**, with clubs: fallen 33, severed 8, fatal 4; 633 s; 3.13 falls and 14.9 wounding
blows a minute; 12 end before a wounding blow. A bout's blows take 0.419 HP, 0.023 of it a bare
hand's in a blow it was in (a left hand that punched, or met a club); three hands are emptied and
taken off; nothing is jostled (a blow with neither a hand nor an item in it). With `--never-off`:
fallen 32, fatal 13, 627 s, the same three hands emptied and kept on.

**Bare hands** (`--held empty`), the same 45:

- **Every bout ends by a fall**, and its blows take 0.145 HP a bout of the 10 to 12 the sides have:
  the hardest of 4365 blows is 22 J, and nine in ten are under 0.3 J. Fists decide nothing.
- **Most of what is lost is jostled**: 0.102 of the 0.145 HP is from blows with neither a hand nor
  an item in them, two bodies walking into each other. A side's bare hand costs it 0.024.
- **One hand was emptied** by a blow it was in, and none came off.
- **The Warrior with an empty right hand, on the right, falls at 2.9 s** in all 15 of its bouts,
  before any touch: it turns a quarter turn from its heading as it sets off. It is a defect of the
  walk, and those 15 bouts say nothing of the blows.

**A floor**, read from the blows that landed (a bout a fall or the clock decided is the same bout
under a floor, less those blows):

| Held | Blows | HP taken | Under 1 J: blows | Of all HP, % | Under 5 J: blows | Of all HP, % |
|---|---:|---:|---:|---:|---:|---:|
| the club, 27 bouts | 97 | 9.185 | 44 | 0.5 | 65 | 4.7 |
| the club, 45 bouts | 175 | 18.841 | 75 | 0.4 | 112 | 3.7 |
| nothing, 45 bouts | 4365 | 6.542 | 4165 | 22.6 | 4327 | 60.1 |

With clubs a floor of 1 J drops four blows in ten and half a per cent of the hit points; bare
handed it drops 95 % of the blows and 23 % of the hit points. A club bout's blow: half under
1.5 J, three quarters under 13.5 J, nine tenths under 64.6 J, the most 131.8 J.

**In the crypt**, every one of the 400 blows between two bodies with no hand or item in them had a
side already on the floor (a body walking over a fallen one, or a limp one settling against it);
they cost the sides still in the fight 0.10 to 0.12 HP over four runs. An item on a body is the
dearest (32 blows to 73.2 J, 1.2 HP a set of runs); a bare hand on a body lands 9 to 14 blows of
under 3 J.

## A hit point is 100 J

The first tree whose unit is 100 J of blunt blow a hit point ([wounds.md](wounds.md#unit)); every
section above is at 138.26 J, the Warrior's strongest club blow. The bodies' hit points are as they
were, so each holds 28 % fewer joules. Read on one tree against `--unit 138.26`:

| | 138.26 J a hit point | 100 J |
|---|---|---|
| 27 bouts by ending | fatal 2, fallen 19, severed 6 | fallen 19, severed 8 |
| 27 bouts: wounding blows | 87 | 85 |
| 27 bouts: HP a bout the blows took | 0.340 | 0.470 |
| 45 bouts by ending | fallen 33, severed 8, fatal 4 | fallen 31, severed 12, fatal 2 |
| 45 bouts: bout time, s | 633 | 601 |
| 45 bouts: HP a bout the blows took | 0.419 | 0.543 |
| 45 bouts: a bare hand's own, HP a bout | 0.023 | 0.032 |

- Of the 27, every winner and second is as it was; the two fatal wounds become a head coming off at
  the same step, and two blows fewer land after an arm comes off at 10.19 s.
- Of the 45, two long bouts at 3.5 m are ended sooner by a fatal wound: the Warriors' at 12.89 s
  where a fall ended it at 29.15 s, and the skeleton against the Warrior at 30.65 s, with the
  other winner, where a fall ended it at 45.67 s. The other 43 have their winner and second.
- With `--never-off` the 45 end at the same seconds: fallen 31, fatal 14.
- **Bare hands**: every bout is the bout it was; the blows take 0.200 HP a bout where they took
  0.145, 0.140 of it jostled and 0.032 a side's own bare hand's.
- **A floor** drops within 0.2 of a per cent of the same shares: 1 J drops 42 of 95 club blows and
  0.5 % of the hit points; bare-handed, 4148 of 4347 blows and 22.6 %.
- **In the crypt**, where a wound ends a monster and so changes the run: the hero alone is dead in
  all four runs, by 14 s, 40 s, 57 s and 66 s; with two beside it, it is playing at 120 s in all
  four. The blows with no hand or item in them (188) all have a side already down, and cost the
  sides in the fight 0.11 and 0.05 HP.

## Placed blows

The first tree where a hand's attack at a target off its recipe's height is a placed blow
(`blows.md@bca8fc87#placed`). A fighter attacks its foe's head: a fist's blow is placed at a head
under or over its straight's window (the Warrior's 2 cm under his own head to 10 over, the Rogue's
6 under to 8 over), and a club's at a head more than 58 cm under its holder's or 20 over, a foe
going down. The Rogue's head stands 14 cm under the Warrior's and the skeleton's 18.

**With clubs**, 40 of 45 bouts are the bouts they were, and the five that are not keep their
winner:

| | Before | Placed |
|---|---|---|
| Bouts by ending | fallen 31, severed 12, fatal 2 | fallen 32, severed 12, fatal 1 |
| Bout time, s | 601 | 608 |
| Wounding blows a minute | 14.9 | 12.9 |
| HP a bout the blows took | 0.543 | 0.490 |
| Of it, a bare hand's own | 0.032 | 0.019 |

**Bare hands**:

| | Before | Placed |
|---|---|---|
| Bouts by ending | fallen 45 | fallen 35, time 10 |
| Bout time, s | 583 | 1670 |
| Falls a minute | 4.63 | 1.26 |
| Blows a bout | 96.6 | 321.4 |
| HP a bout the blows took | 0.200 | 0.313 |
| Of it, a bare hand's own / jostled | 0.032 / 0.140 | 0.093 / 0.169 |
| Hands emptied by a blow of their own, a bout | 0.02 | 0.36 |

- **Ten bouts run to the 120 s cap**: the Warrior on the left against the Rogue and the skeleton,
  at every gap, each a fall in 10.7 to 18.7 s before. Their heads are under his straight's window,
  so he places his fists at 0.4 to 0.7 J where the straight landed 6 to 10 J
  (`blows.md@bca8fc87#against-a-recipe`); nobody falls, 409 to 1950 blows land, and the bars
  decide.
- **29 bouts are the bouts they were**: the 15 a Warrior on the right falls out of at 2.9 s, the
  Rogues' five, and nine whose heads stand within each other's straight's window.
- **A placed fist costs its own hand**: in the Warrior's five bouts against the skeleton 13 hands
  are emptied by blows they were in, and one comes off.

## Searched blows

The first tree whose repertoire is searched for every body, with a fist and with the club, at a
head and at an upper trunk (`blows.md@bca8fc87#searched`). A fighter attacks its foe's head with
the recipe whose window holds that head's height over its own, or placed.

**With clubs**, 45 bouts; 3 are the bouts they were, and 30 keep their winner:

| | Placed | Searched |
|---|---|---|
| Bouts by ending | fallen 32, severed 12, fatal 1 | fallen 30, severed 9, fatal 6 |
| Bout time, s | 608 | 686 |
| Falls a minute | 3.16 | 2.62 |
| Wounding blows a minute | 12.9 | 32.8 |
| Ended before any wounding blow | 12 of 45 | 3 of 45 |
| HP a bout the blows took | 0.490 | 0.715 |
| Of it, a bare hand's own | 0.019 | 0.064 |
| Hands emptied by a blow of their own, a bout | 0.04 | 0.20 |
| Bouts won: the Warrior, the Rogue, the skeleton | 23, 11, 11 | 22, 8, 15 |

- **A club lands where there was no club blow.** The Rogue and the skeleton had no club recipe, and
  their placed club blows passed their targets (`blows.md@bca8fc87#the-battery-placed`): between
  two Rogues the blows took 0.010 HP a bout and take 0.425, between two skeletons 0.072 and 0.670.
  The three bouts that end before a wounding blow are each a Warrior on the right falling at 3.5 to
  3.7 s, from 4.5 m.
- **A hand in its own side's blow costs more**, most where the skeleton is on the right of the
  Warrior (0.187 HP a bout) and of a skeleton (0.130): its club blow at a head lands its hand
  (`blows.md@bca8fc87#on-a-standing-body`).

**Bare hands**:

| | Placed | Searched |
|---|---|---|
| Bouts by ending | fallen 35, time 10 | fallen 34, fatal 8, time 3 |
| Bout time, s | 1670 | 1734 |
| Blows a bout | 321.4 | 218.3 |
| HP a bout the blows took | 0.313 | 0.783 |
| Of it, a bare hand's own | 0.093 | 0.123 |
| Of it, in blows with no hand in them | 0.169 | 0.562 |
| Hands emptied by a blow of their own, a bout | 0.36 | 0.62 |
| Bouts won: the Warrior, the Rogue, the skeleton | 10, 18, 17 | 14, 12, 19 |

- **Three bouts run to the cap where ten did.** The Warrior on the left wins all five against the
  Rogue, four by its death; against the skeleton two of five still run to the cap.
- **Most of what a bare bout takes is in blows with no hand in them**, because a searched fist
  lands its forearm, which the script counts with the jostling: in the Warrior's bout against the
  Rogue from 4 m, 1.62 of the 1.89 HP taken were the Warrior's forearm on the Rogue's upper trunk
  (8 blows, to 33.7 J) and head (13, to 18.7 J), and 0.10 its hand on the head in 63 blows.
- **A fist at a head costs its hand** most of what it does the head, and the hardest more than the
  hand holds (`blows.md@bca8fc87#the-searches`).
- **The 15 bouts a Warrior on the right falls out of at 2.9 s are the bouts they were**: with a bare
  Warrior on the right, the bout is its fall, whoever aims where.

The crypt's fights are other fights (`scripts/fingerprint.mjs`: seed 1 `f51bc51da2733bd5`, seed 2
`c5ce688d4676d6a4`); its runs with no fight in them are as they were.
