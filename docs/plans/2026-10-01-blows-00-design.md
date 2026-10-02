# Blows: the design, and the order it lands in

This is the design of how a body attacks a point it is given, with whatever it holds, how it
covers itself, and what a touch between two bodies costs each of them; and the index of the plans
that build it. Each plan lands green by itself and is deleted as it lands; this file is deleted
with the last of them.

## Why

- **An attack is one recipe thrown at one place.** A hand's blow is a schedule of pushes found by
  search for a target at the attacker's own head height, a set distance straight ahead
  (`assets/core/strikes.json`); the strike skill walks the body until the target stands there
  (`src/core/skills/strike.ts`) and reads only where the target is across the ground. A target
  at the chest, the knee, or off to one side is thrown at as if it were a head straight ahead.
- **The lab reads a blow in the air, one way per weapon.** The Routine strikes a drawn post and
  reads the fist's speed (`src/lab/routine.ts`); the Blow scenario reads the club's energy into a
  mark it passes through (`src/lab/club-blow.ts`). Neither is the rule a fight wounds by.
- **The rule knows two strikers.** `STRIKERS` (`src/core/rules/blows.ts`) is the two hands. A
  kick, a shoulder, a head, a shield's face land nothing. A hand and the club it holds are one
  body to the rule, since a contact names the other body and not which shape was touched
  (`Contact`, `src/core/engine/engine.ts`).
- **The one who strikes never pays.** A fist driven into a skull wounds the skull alone. Nothing
  decided that: the rule was written around the club, whose striker is an item
  (`39407d75`), and no source says a fist is unharmed by its own punch.
- **There is no defence.** The guard is one pose (`src/core/skills/guard.ts`); nothing reads the
  blow coming.

## The design

1. **A blow is a touch between two sides, and has no striker.** After every step, two bodies of
   different sides that the solver pushed apart, that were not touching the step before and were
   closing, have met in a blow. Its energy is what it is today: `impactEnergy` of the masses the
   contact meets on each side and the closing speed. A punch, a kick, a head butt, a shield's
   bash, a body falling on another are the same rule; `STRIKERS` is deleted, not widened.
2. **A contact names the shapes that met.** The engine's `Contact` carries each pair of shapes
   that touched, and a rigid body says whose each of its shapes is: the segment's own, or an item
   it holds. So a blow knows the club from the hand that holds it.
3. **The two surfaces share the blow's energy by their compliance.** The surfaces that met are
   springs in series under one force, so each stores F²/2k: a surface's share is its compliance
   over the sum (`energyShares`). An item with no stated surface is rigid and takes none. So a
   club's blow is the struck part's whole, as it is today; two items meeting wound nobody (a
   clash); a bare hand that meets an item takes it all; two alike surfaces take half each; and a
   fist on a head is split by the two parts' stiffness. A surface's stiffness is a `Quantity` of
   its segment, from the impact literature, with the gaps filled under a decision the owner
   confirms.
4. **What a part tolerates stays the pool's rule**: its cross-section's share of the body's hit
   points (`partHitPoints`), times the unit. No part has a tolerance of its own.
5. **Every blow is blunt until an item states an edge or a point.** The mechanisms' prices are
   in the rulebook already (`MECHANISM_PRICE`); which mechanism a contact is comes with the
   first item that has one (Later).
6. **The unit is a round number, on the owner's yes**: 100 J a hit point, in place of the club's
   best blow (138.26 J).
7. **An attack is a function of its target.** The tactics say what to attack (`HandAction`:
   a point, with whatever the hand holds) and never how. The strike skill chooses how, from two
   primitives:
   - **Power**: a searched, open-loop schedule of pushes, one per body, thing held and height
     band, each with the window about its place where it was measured to land, the window's
     height included. Found by search and scored by the rule itself: the damage it does less
     the damage it costs its own body, standing afterwards whether it lands or misses.
   - **Placement**: feedback. The motor takes named points of a hand's rigid body (its knuckles,
     a club's swell, a blade's two ends) to places, the wrist included. A placed blow carries
     the point through the target at the middle of its path, where a minimum-jerk path is
     fastest. It is what a hand throws when no recipe's window holds the target.
   No technique is authored: no thrust, swing or hook is a kind in the code. A recipe is data a
   search found; the code branches on recipe or placed.
8. **Defence is the guard placing.** A guarding hand may be told what to cover (`HandAction`'s
   `guard` gains `cover`: the threat and the part of its own body), and the guard skill puts
   what the hand holds, or the hand, between them. There is no block kind: a parry with a blade,
   a forearm before the face and a shield raised are one skill over different points. What the
   cover costs is the rule's: an item takes nothing, a bare hand takes its share.
9. **One instrument reads all of it.** The lab's targets are bodies: a ball of a head's mass
   hung in the air, with a pool, struck under `watchBlows`. Ten of them drawn by seed in a box
   scaled to the attacker, high, middle and low. Whatever the body is and whatever it holds, the
   reading is the rule's blow, or how near the nearest of its hands' shapes passed. The Routine
   is one reader of it and the battery another; the mechanism knows neither.
10. **All of it is core.** Nothing here knows a screen: the Routine draws targets and reads; the
    arena and the crypt get the same skill.

A sub-mind (`src/core/mind/sub-mind.ts`) is not the mechanism for any of this: it takes the
whole body and drops the stance. What is copied from it is its pattern: what varies is plain data
by kind, one list, one function per rule.

## The owner's answers, 2026-10-01

1. **A bare hand that meets a blow takes the wound**; only a held item clashes.
2. **Two bare hands meeting are both wounded**, half the blow each: "what happens in real life?
   both?".
3. **That the striker never pays is a bug**: "why does the head not already work this way? seems
   like a bug".
4. **A part's tolerance is the pool's general rule**: "keep the general rule, don't introduce
   special case (unless there's a general way to do it)".
5. **The head is one surface for now**; its face and its vault are split later.
6. **Values may be approximate**: "approximately physically based (within the limits of a browser
   game)".

## The owner's choices, open

Each is put with its table at the gate of the plan that measures it. None is assumed.

| Choice | Options, and what each does in the game | Where |
|---|---|---|
| **The unit** | 100 J a hit point with the bodies' hit points as they are (every body 28 % frailer in joules: the Warrior's 6 HP is 600 J, not 830 J); 100 J with hit points raised to hold the joules (Warrior 8.3, Rogue 5.5); or 138.26 J kept. | 04 |
| **A hand ruined by its own punch** | On the candidate stiffnesses a fist takes 62 % of a punch to a head, a hand holds 12 J (Warrior), and a part comes off half its hit points past empty: a punch to a head of about 30 J or more takes the puncher's hand off. Leave it (a bare fist is for the trunk, where it takes 15 to 35 %; plan 07's search finds that by itself); or a blunt blow empties a part and never takes it off (no part comes off until an edge exists; the club no longer takes a head off, it kills by emptying it). | 03 |
| **Jostling** | Every closing touch is a blow, so two bodies that bump shoulders wound each other a little. Leave it; or a floor under which a touch only shoves (`Rulebook`, a decision of its own). | 03 |
| **The stiffness gaps** | Confirm, or correct, the values no source gives: the hand's (a porcine figure), the arm's, the shank's and the foot's. | 03 |
| **Where a fighter aims** | The head, as today; or the part its blow pays most on. Chosen on a paired table of bouts. | 07 |

## Recorded, not asked

- An item with no stated surface is rigid: it takes no share of a blow. White ash across its
  grain crushes at about 8 MPa and bone fractures at about 10 MPa of contact pressure, so a club
  is not clearly rigid on a small patch; the club's blow keeps today's price by this.
- A surface's stiffness is one number: the reading nearest a blow's speed where the literature
  gives a range. It does not change with speed, area or direction.
- A target body is a free ball of the attacker's head's mass and radius, held up against its own
  weight and nothing else: a head on no neck.
- A fall onto the ground wounds nobody: the ground is no body.

## How it extends

| Added later | Where it goes | What it leaves alone |
|---|---|---|
| **A sword, a spear**: an edge, a point | An item's shape states its mechanism where it cuts or pierces; a blow whose surface is that shape is priced by it (`blowDamage`'s mechanism), after a breach cost under which it is a blunt blow. The item states `aim` and its points; a search finds its recipes; the guard places its two ends. | The shares, the pool, the skill, the instrument. |
| **The face and the vault** | A segment takes several shapes, each with its own surface (`SegmentSpec.shape` becomes a list); a blow reads the surface of the shape that was touched, which a contact already names. | The pool: one head, one share of hit points. |
| **Armour**: boots, greaves, a cuirass, vambraces, gloves, a helmet | A worn item, rigid with its segments as a held one is: it adds its mass, and its surface is one more layer in series (`energyShares` takes a list of layers), taking its share and wounding nobody; it raises the breach cost of an edge or a point. A glove protects the puncher by the same rule. | The rule's shape; `Rigid.owners` gains a kind. |
| **A shield** | A held item with a face: its points are what the guard places; a bash is a blow like any other. A third place on one rigid body fixes its roll (`HandGoal.places`). | The guard skill, the rule. |
| **A staff, a spear in two hands** | An item held by two segments: the builder closes the loop with a joint at the second hand, and a placement solves both arms to the item's points. | Recipes, which are per thing held; the rule. |
| **A bow** | Shooting is a skill beside the strike in the one list (`createSkills`); an arrow is a body, and what it touches is a blow by the same rule, its point's mechanism priced. The draw is a placement. | Every contact rule. |
| **A kick, a knee** | A recipe whose pushes are a leg's, once the stance can give a leg up; the rule already wounds by any segment. | The rule, the instrument. |
| **A crouch, a low target** | The stance lowers the body beyond `STANCE_LOWER`; a recipe's band names it (`Recipe.lower`). The low stratum of the instrument is the row that turns from missed to hit. | The search, the skill's choice by window. |
| **Another body**: four legs, a tail | A search on it: recipes are per model. Its surfaces are its spec's. | Everything else. |
| **A learned or a planning mind** | It asks the same `HandAction`s; or, at the muscles, it is a `MindConfig` kind and the instrument scores it as a row. | The rule, the instrument. |

## What exists today, and what changes

| Today | After |
|---|---|
| the hands strike (`STRIKERS`) | any two segments of different sides that meet |
| a contact names the other body | and each pair of shapes that touched |
| a blow wounds the struck part alone | each surface takes its share by compliance; an item takes none |
| `LandedBlow`: an attacker, a target, a `clash` flag | two sides, each with its share, damage and wound; `isClash` |
| the unit is the club's best blow, 138.26 J | 100 J, on the owner's yes |
| a blow is thrown at head height, straight ahead | a recipe by height band, with a window in three directions; a placed blow elsewhere |
| a hand goal takes the knuckles to a place, and no skill uses it | named points of the hand's rigid body, the wrist freed for two; the strike and the guard use it |
| the guard is a pose | a pose, or a cover of a threat |
| the Routine strikes a drawn post three times | ten target bodies by seed, each read by the rule |
| a search scores a fist's speed, or a club's energy into a mark | every search scores net damage under the rule |

## The plans

| # | Plan | Lands | Needs | Eye gate |
|---|---|---|---|---|
| 01 | [targets](2026-10-01-blows-01-targets.md) | the target bodies, the Routine and a battery on them, the baseline table | | the owner watches the Routine strike at ten targets |
| 02 | [sides](2026-10-01-blows-02-sides.md) | contacts name shapes; a blow's record has two sides; nothing wounds differently | | none |
| 03 | [shares](2026-10-01-blows-03-shares.md) | surfaces' stiffness; any touch is a blow, shared by compliance; the bouts measured again | 02 | the owner reads the tables and answers three choices |
| 04 | [unit](2026-10-01-blows-04-unit.md) | 100 J a hit point | the owner's yes | none |
| 05 | [placement](2026-10-01-blows-05-placement.md) | hand goals on named points; windows with height; the placed blow | 01 | the Routine's high and middle targets are struck |
| 06 | [guard](2026-10-01-blows-06-guard.md) | the guard covers a threat; the block battery | 02, 05 | the owner watches a body cover itself |
| 07 | [searched blows](2026-10-01-blows-07-searched-blows.md) | one evaluator under the rule; recipes by band for every body and thing held | 01, 03, 05 | the owner watches each body's blows, and reads the price before the searches run |

01 and 02 buy no compute and change no fight. 03 and 04 change what every bout is worth: each
measures the standing table before and after, and the two tables are not merged. 07 is the
open-ended one: its structure is fixed here, its recipes are found by search.

The rising set (`2026-10-01-rising-05-rules.md`) measures `docs/reference/bouts.md` again too.
Whichever of it and 03 lands second measures against the other's table, not against the one both
replaced.

## Readings

### Probes

Node, Rapier, 120 Hz, two bodies of one ball each (`lone`, `tests/core-blows.test.mjs`), a fist of
1 kg sent at 6 m/s into a ball of 5.48 kg under gravity, read by `watchBlows`:

| The target is | closing, m/s | masses met, kg | energy, J | the fist after, m/s | the target after, m/s |
|---|---|---|---|---|---|
| held up by a force equal to its weight each step (`applyForce`), free otherwise | 5.96 | 1.00, 5.48 | 15.0 | 0.93 | 0.93 |
| held fixed (`setFixed(true)`) | 6.00 | 1.00, 5.48 | 15.2 | 0 | 0 |

Either way the rule reads the blow. Held up, the target gives way as a free head does; fixed, it
is a wall to the fist. Held up for 10 s before the blow, it does not move.

### What each part holds

`partHitPoints`, Node. Joules to empty at 138.26 J and at 100 J a hit point.

| Part | Warrior (6 HP): kg | HP | J at 138.26 | J at 100 | Rogue (4 HP): kg | HP | J at 138.26 | J at 100 |
|---|---|---|---|---|---|---|---|---|
| head | 5.48 | 0.446 | 61.7 | 44.6 | 3.85 | 0.291 | 40.2 | 29.1 |
| upperTrunk | 12.61 | 0.776 | 107.3 | 77.6 | 8.90 | 0.508 | 70.2 | 50.8 |
| middleTrunk | 12.90 | 0.788 | 108.9 | 78.8 | 8.44 | 0.491 | 67.9 | 49.1 |
| lowerTrunk | 8.82 | 0.612 | 84.6 | 61.2 | 7.18 | 0.441 | 61.0 | 44.1 |
| upperArm | 2.14 | 0.238 | 32.9 | 23.8 | 1.47 | 0.153 | 21.2 | 15.3 |
| forearm | 1.28 | 0.169 | 23.4 | 16.9 | 0.79 | 0.102 | 14.1 | 10.2 |
| hand | 0.48 | 0.088 | 12.2 | 8.8 | 0.32 | 0.056 | 7.7 | 5.6 |
| thigh | 11.19 | 0.717 | 99.1 | 71.7 | 8.51 | 0.494 | 68.3 | 49.4 |
| shank | 3.42 | 0.325 | 44.9 | 32.5 | 2.77 | 0.234 | 32.4 | 23.4 |
| foot | 1.08 | 0.151 | 20.9 | 15.1 | 0.74 | 0.097 | 13.4 | 9.7 |

The skeleton's are the Warrior's (`skeleton-placeholders`).

### Stiffness, as looked up

Read in the paper or its abstract unless marked (2nd) for a secondary source or (mine) for
arithmetic on a paper's numbers. **Every one is opened again at its source before it enters a
spec** (plan 03); a value not found as cited becomes a gap.

| Part | Candidate, N/mm | From |
|---|---|---|
| head | 201 | Cormier et al. 2010, the nasal bone's second slope (55 then 201). The face's, until the head is two surfaces; the vault is 812 static to 4023 dynamic (Yoganandan et al. 1995, J Neurotrauma 12:659), and a 6.45 cm² disc on the frontal bone reads 331 then 731 (Cormier et al. 2009). |
| upperTrunk | 26.3 | Lobdell 1973 (2nd); Kent 2005 (IRCOBI) gives 17. |
| middleTrunk | 21 to 70, rising with speed | Cavanaugh 1986; Hardy 2001 (2nd). The reading nearest a blow's speed is taken. |
| lowerTrunk | the middle trunk's | gap |
| thigh | 247 | Funk 2004: the femur fails at 4.35 kN and 17.6 mm (mine). |
| upperArm, forearm, shank | the thigh's | gap: no stiffness found for the humerus, the forearm or the tibia |
| hand | 122 | Ochman 2011, porcine; no human fist stiffness was found. Gap. |
| foot | the hand's | gap |

Tolerances beside the pool's, for the record plan 03 writes (`docs/reference/wounds.md`): the
vault fails at 14 to 68 J (Yoganandan 1995); the thorax at about 200 J and the femur at about
38 J by F²/2k (mine); the knuckle joint's 50 % injury is 3.0 kN axial (Carpanen et al. 2019,
JMBBM 97:306), about 37 J at 122 N/mm (mine); a boxer's punch is 3427 N at 9.14 m/s with an
effective mass of 2.9 kg (Walilko, Viano & Bir 2005). Against these the pool's head, trunk and
thigh are within about a factor of two, and its hand is about three times too frail.

### Shares on the candidates

A surface's share is the other's stiffness over the sum.

| Meeting | First's share | Second's share |
|---|---|---|
| hand, head | 0.62 | 0.38 |
| hand, upper trunk | 0.18 | 0.82 |
| hand, middle trunk (21 to 70) | 0.15 to 0.36 | 0.85 to 0.64 |
| hand, hand | 0.50 | 0.50 |
| hand, forearm | 0.67 | 0.33 |
| foot, thigh | 0.67 | 0.33 |
| club, anything | 0 | 1 |
| club, club | 0 | 0 |

So a bare fist is a poor weapon against a head and a fair one against a trunk, and a club costs
its holder nothing anywhere. Nothing authored says so.

### Mechanisms, for later

The rulebook's prices are blunt 1 : edge 5.7 : point 33 a joule. Against the literature a point
is in range (people stab at up to 64 J underarm and 115 J overarm, Horsfall et al. 1999; skin
breaches at about 0.25 J with a sharp knife, Gilchrist et al. 2008); an edge is plausible on soft
tissue and only 1.5 to 3.4 times blunt on bone (Gentile et al. 2019; Gaudet et al. 2020); an axe
against a sword is unsupported either way.

## Later, in order

Each is a plan of its own when it is taken up, and has its place in How it extends: the face and
the vault; an edge and a point, with a sword; a shield; armour; an item in two hands; a bow; a
crouch and the low targets; a kick.

## Not in this set

- Any new item, any worn item, any mechanism but blunt.
- A tolerance of a part's own: the pool's rule stands.
- What an emptied part can still do. A part with no hit points left moves as it did.
- Throwing a blow while walking, a blow at a target that moves, a feint, a counter. The senses
  carry what a mind would read for them (`BodySense`).
- A mind that plans by forking its body.
- Falling damage.
