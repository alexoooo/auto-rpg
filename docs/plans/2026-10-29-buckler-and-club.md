# Buckler and club: the Warrior's held skills on Option Mind

## Why

The owner wants Option Mind's Warrior to fight with a buckler in its left hand and a club in its
right, its skills proved on the Ratings ladder as every skill is ([Drills](2026-10-24-drills.md)),
not borrowed from another mind. Today Option Mind holding both strikes nothing standing: its punch
needs an empty hand and it has no club blow, so a buckler and a club leave it the stomp alone. A
club blow is tuned for each body that throws it, and a body without its own throws none: no mind
swings a club until one is trained. The club comes before the sword, whose cuts miss their bar
([sword and buckler](../reference/sword-and-buckler.md#1-a-cut-that-wounds)).

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

Built. The Strike drill's subject names what its striker holds (`StrikeSubject.held`; a preset's
action as `<mind>/<action>@<left>,<right>`), empty hands where it names none, so a subject file and
a learning environment carry it too. A blow from a held blunt item is judged by the club's bar
(`BAR.held`), and the trainer's score reads it (`barScore`).

Check: the gate.

### 2. The club blow, still

A learned club blow on the toed Warrior holding the buckler and the club, trained on the general
trainer from the Strike drill's still rung with the club (`research/environments/`). Its subject
is Option Mind's action (`option/<action>@buckler,club`).

Check: the held-out still rung at the bar at 120 and 480 Hz, none fallen; the reel watched; the
owner accepts rung 0.

### 3. The club blow up the ladder

The fight rung and rungs 1 to 5 in the punch's order ([Punch](2026-10-28-punch.md#2-the-punch-at-its-bar-everywhere)),
one ground joined at a time; its profile regenerated from the records
(`research/strike-profiles.mjs`), so Option Mind prices it by measurement.

Check: each rung's held-out reading at the bar; the owner accepts each rung.

### 4. The buckler cover

Option Mind's cover meets the weapon before the body where its covering hand holds a covering
face (`READINGS.ward`), not the blow predicted at the head alone; the share of a blow it keeps off
(`STOPS`) read on the Cover drill's buckler rows. Then Cover's rung 2, cover and a counter, the
club blow the counter.

Built: with a covering face in a hand, Option Mind's guard holds it between a foe's weapon and the
body while one is within 2 m (`Situation.ward`), and its cover meets the weapon there. At
`6bec72f3` (Node, core world, rapier-coordinate, 120 Hz), on the Cover drill's buckler rows of
that tree, paired with the same rows at `fe0de494`: holding the buckler and club, punched 0.24 HP a
trial (0.14), swung 0.24 (0.37), the head 0.64 HP over the twelve (0.74); the bare and club rows
play identically. About even on six trials a side.

Check: the Cover drill holding the buckler at the buckler's bar, against a weapon; rung 2; the
owner accepts each rung.

Open: the Cover drill has one rung, `punched`, its subject empty-handed. Its buckler rows against a
weapon (a drill opponent whose body has a blow of its own with what it holds) and rung 2, a cover
and a counter, are protocols still to write.

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
ahead.

## Done when

The Warrior's club blow on Option Mind has the owner's acceptance on the still rung, the fight rung
and rungs 1 to 5; its buckler cover on Cover's rungs against a weapon and rung 2; its rise holding both stands as often
as with the club alone; and Option Mind leads the Duellist and Vanguard holding the buckler and the
club, in matches the owner has watched a bout of and accepted.
