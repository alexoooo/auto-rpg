# Buckler and club: the Warrior's held skills on Option Mind

## Why

The owner wants Option Mind's Warrior to fight with a buckler in its left hand and a club in its
right, its skills proved on the Ratings ladder as every skill is ([Drills](2026-10-24-drills.md)),
not borrowed from another mind. Today Option Mind holding both strikes nothing standing: its punch
needs an empty hand, so a buckler and a club leave it the stomp alone, and the baseline evaluation
drops those bouts ([the baseline](../reference/baseline.md#measurement)). The club comes before
the sword: the Warrior's club blows are searched and strong ([blows](../reference/blows.md#against-a-recipe)),
where its sword cuts miss their bar ([sword and buckler](../reference/sword-and-buckler.md#1-a-cut-that-wounds)).

The Duellist's recipe swings (`duellist/swing high`, `swing middle`) are read on the same rungs as
the reference the club blow is paired against, not used as Option Mind's skill.

## The bar

A club blow lands when it meets the mark asked with the club, the striker up and its action
ended, carrying at least the untrained adult's blow less one SD: 64.8 J, the crutch's
75.5 ± 10.7 J (Frantz, Sprenger & Jackowski 2026), the household implement nearest a club swung
one-handed ([human strike reference](../reference/human-strike-reference.md#2-one-handed-stickclubbaton-and-bats-as-a-two-handed-ceiling)).
The blow's energy is the rules' (`LandedBlow`'s `energy`), what a hit point is priced by: 0.65 hit points at
100 J a point. Its speed over the last 0.1 m and its time from the action's start are reported,
not gated: the rod's one-handed speeds have no spread to set a bar by, and the punch's 0.5 s is
engineering. The bar is the Warrior's; another body's is scaled as the punch's is
([Punch](2026-10-28-punch.md#the-bar)).

A buckler covers when it meets four of five blows that reach the body before the body does, the
`buckler` evaluation's bar ([sword and buckler](../reference/sword-and-buckler.md#2-the-buckler-against-a-blade)).

## Steps

The owner asked for steps 2 to 6 ahead of Option Mind's design steps 13 to 16.

### 1. The drills hold the loadout

Built. The reference at `fe0de494` (Node, core world, rapier-coordinate, 120 Hz): the Duellist's
swing holding the buckler and club on the still rung lands 7 of 16 at the head with the Warrior's
right hand, at 66 to 165 J, and 1 of 16 at the trunk; the Rogue none, at 3 to 12 J; swing high
and swing middle read alike, the drill asking the mark. Option Mind on the Cover drill's buckler
rows takes 0.14 HP a trial punched (0.32 with the club alone) and 0.37 swung (0.26), its cover
guarding the head alone. The reels play holding both; their motion waits on the owner's eye.

The Strike drill's subject names what its striker holds (`StrikeSubject.held`; a preset's action
as `<mind>/<action>@<left>,<right>`), empty hands where it names none, so a subject file and a
learning environment carry it too. A blow from a held blunt item is judged by the club's bar
(`BAR.held`), and the trainer's score reads it (`barScore`). The Cover drill's rungs add the
buckler and club to the subject's loadouts.

Check: the gate; the Strike drill's still rung of `duellist/swing high@buckler,club` and
`duellist/swing middle@buckler,club` on the Warrior, the reference the club blow is paired against;
the Cover drill's buckler rows of Option Mind; each reel watched.

### 2. The club blow, still

A learned club blow on the toed Warrior holding the buckler and the club, trained on the general
trainer from the Strike drill's still rung with the club (`research/environments/`), the Duellist's
swings its paired reference. Its subject is Option Mind's action (`option/<action>@buckler,club`).

Check: the held-out still rung at the bar at 120 and 480 Hz, none fallen; the reel watched; the
owner accepts rung 0.

Built at the head: a recipe for the toed Warrior searched on the still rung itself
(`research/club-drill.mjs`, Option Mind throwing each candidate through the recipe strike) and
thrown by Option Mind's `club-blow` with a hand that holds an item. The still rung at `4d5b20f7`
(Node, core world, rapier-coordinate, 120 Hz): the right hand at the head 15 of 16 landed, 68 to
105 J, none fallen; 14 of 16 at 480 Hz; 11 of 14 on places it was not searched on. The trunk is
not kept: its blow lands through 120 Hz's error alone
([blows](../reference/blows.md#the-toed-warriors-club-blow)), so the action aims at the head alone.
Its still reel watched: the weak trial meets the head at the bar's edge, the striker stays up and
recovers; at 0.6 m it steps back to its window first.

### 3. The club blow up the ladder

The fight rung and rungs 1 to 5 in the punch's order ([Punch](2026-10-28-punch.md#2-the-punch-at-its-bar-everywhere)),
one ground joined at a time; its profile regenerated from the records
(`research/strike-profiles.mjs`), so Option Mind prices it by measurement.

Check: each rung's held-out reading at the bar; the owner accepts each rung.

Read at `5269c0cc`, the right hand at the head: stepping 1 of 3 landed, guarding 3 of 3, punching
0 of 3; its profile is in `assets/core/strike-profiles.json`, from the still and opponent rungs.
The drill fights by Option Mind's own options until its moment (`Controller.fight`), counting its
strikes alone, and its walk rung asks the head too. The walk rung at `2070d52d`: 14 of 16 landed
settled, 11 of 16 walking. The fight rung at `69383e2c`: of the 7 moments reached at the head, 1
landed (Counter, 92 J), 4 guarded, 2 weak; 9 unreached in its 30 s: against the classic mind
Option Mind never asks a blow (below), against Counter and Vanguard it is down and rising.

Open: against a foe that presses to clinch range (the classic mind holds 0.69 m apart), Option Mind
never strikes. The blow's window is 0.81 to 1.1 m head to head, and thrown from 0.75 to 0.8 m it is
weak at both rates; Option Mind backs toward the window at about 0.25 m/s and the foe follows as
fast. Walking in, the two cross the 0.3 m window at about 2.7 m/s, faster than the blow's settle.
It needs footwork that strikes a foe walking in, or backs out faster than one presses.

### 4. The buckler cover

Option Mind's cover meets the weapon before the body where its covering hand holds a covering
face (`READINGS.ward`), not the blow predicted at the head alone; the share of a blow it keeps off
(`STOPS`) read on the Cover drill's buckler rows. Then Cover's rung 2, cover and a counter, the
club blow the counter.

Built: with a covering face in a hand, Option Mind's guard holds it between a foe's weapon and the
body while one is within 2 m (`Situation.ward`), and its cover meets the weapon there. At
`6bec72f3` (Node, core world, rapier-coordinate, 120 Hz), paired with step 1's records: holding
the buckler and club, punched 0.24 HP a trial (0.14), swung 0.24 (0.37), the head 0.64 HP over the
twelve (0.74); the bare and club rows play identically. About even on six trials a side.

Check: the Cover drill's rungs 0 and 1 at the buckler's bar, paired with the step before; rung 2;
the owner accepts each rung.

Open: the Cover drill has rungs 0 and 1 (`swung`, `punched`); rung 2, a cover and a counter, is a
protocol still to write.

### 5. Up again holding both

Option Mind's rise on toes holding the buckler and the club: the Rise drill armed and the
`equipped-rise` evaluation, both items still held after the rise.

Built: the Rise drill's rungs and the equipped falls hold the buckler and club, the equipped falls
take a whole mind, and a hand on all fours bears through what it holds. At `621b836e` (Node, core
world, rapier, 120 Hz), Option Mind's equipped falls stand 15 of 16 holding both (median 11.7 s)
against 13 of 16 with the club alone. On the Rise drill holding both, the placed sit-back from the
front is done 2 of 6 and the roll down 4 of 6; after the roll down, the sit-back is begun 1 of 6.

Check: as many of the falls stood holding both as with the club alone; the owner watches a rise.

### 6. Fighting

The baseline evaluation's buckler-and-club bouts played, not dropped, against the Duellist and
Vanguard; `npm run match` of Option Mind against the Duellist on the buckler and club.

Check: Option Mind ahead of both in those bouts; the owner watches a bout and accepts it.

Read at `d6200840` (Node, core world, rapier-coordinate, 120 Hz): the baseline plays every loadout,
none dropped. Holding the buckler and the club, Option Mind wins 3 of 6 against the Duellist and 5
of 6 against Vanguard (`npm run match`, match `9405ddeaecb0d709` and `cced6f2a9c3bd57d`, the
Warrior alone; the Rogue is dropped, Option Mind playing the Warrior). Even with the Duellist, not
ahead. In those bouts it throws the club blow 1 to 9 times to its end, and more of its asks stall
short of the blow's window than end.

## Done when

The Warrior's club blow on Option Mind has the owner's acceptance on the still rung, the fight rung
and rungs 1 to 5; its buckler cover on Cover's rungs 0 to 2; its rise holding both stands as often
as with the club alone; and Option Mind leads the Duellist and Vanguard holding the buckler and the
club, in matches the owner has watched a bout of and accepted.
