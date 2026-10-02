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
- **A search scores what the rule does not.** A fist's recipe was found for its speed and the
  club's for the energy it brings to a mark, where a fight wounds by the rule: any two surfaces
  that meet share the blow (`src/core/rules/blows.ts`), so a fist pays for its own punch.
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
6. **The unit is a round number**: 100 J a hit point (`owner-damage-unit`). The club's best
   blow, 138.26 J, is a measurement beside it (`CLUB_BEST`).
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
| **What the bodies hold at 100 J** | The unit is 100 J a hit point and the bodies' hit points are as they were, so every body is 28 % frailer in joules (the Warrior's 6 HP is 600 J, not 830 J): it is what the rulebook has. Or hit points raised to hold the joules (Warrior 8.3, Rogue 5.5), which is every bout as it was at 138.26 J. Measured both ways: `docs/reference/wounds.md#unit`. | the roadmap, Blows and wounds |
| **Whether a blunt blow takes a part off** | A fist takes 62 % of a punch to a head, a hand holds 8.8 J (Warrior), and a part comes off half its hit points past empty: a punch to a head of 21 J or more takes the puncher's hand off. Leave it (a bare fist is for the trunk, where it takes 12 %; plan 07's search finds that by itself); or a blunt blow empties a part and never takes it off (no part comes off until an edge exists; the club no longer takes a head off, it kills by emptying it). Measured both ways: `docs/reference/bouts.md#a-blow-has-two-sides`. | the roadmap, Blows and wounds |
| **Jostling** | Every closing touch is a blow, so two bodies that bump shoulders wound each other a little. Leave it; a floor under which a touch only shoves (`Rulebook`, a decision of its own); or a body out of the fight out of the watch. Measured at two floors, in the same record. | the roadmap |
| **The stiffness gaps** | Confirm, or correct, the values no source gives: the arm's, the shank's, the foot's, the middle and lower trunk's (`docs/reference/wounds.md#gaps`, with what a factor of two in each does). | the roadmap |
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
| one recipe a hand, thrown at a target in its window, three directions; a placed blow elsewhere | a recipe by height band |
| a hand goal takes named points of the hand's rigid body to places, and the strike uses it | the guard uses it too |
| the guard is a pose | a pose, or a cover of a threat |
| a search scores a fist's speed, or a club's energy into a mark | every search scores net damage under the rule |

## The plans

| # | Plan | Lands | Needs | Eye gate |
|---|---|---|---|---|
| 06 | [guard](2026-10-01-blows-06-guard.md) | the guard covers a threat; the block battery | | the owner watches a body cover itself |
| 07 | [searched blows](2026-10-01-blows-07-searched-blows.md) | one evaluator under the rule; recipes by band for every body and thing held | | the owner watches each body's blows, and reads the price before the searches run |

The targets every plan here is read on have landed (`src/lab/targets.ts`,
`docs/reference/blows.md`), and so has the rule: a blow has no striker, and its two surfaces
share it (`src/core/rules/blows.ts`, `docs/reference/wounds.md`), and the unit: a hit point is
100 J of blunt blow (`docs/reference/wounds.md#unit`,
`docs/reference/bouts.md#a-hit-point-is-100-j`, and the targets at it in
`docs/reference/blows.md#at-100-j`), and placement: hand goals on named points, a window's
height, and the placed blow (`src/core/skills/strike.ts`, `docs/reference/blows.md#placed`),
whose eye gate is open: the owner watches the Routine's high and middle targets struck. 07 is
the open-ended one: its structure is fixed here, its
recipes are found by search.

The rising set (`2026-10-01-rising-05-rules.md`) measures `docs/reference/bouts.md` again too:
it measures against the last table in that record.

## Readings

The surfaces' stiffness, the shares, the tolerances beside the literature's and the mechanisms'
prices are in `docs/reference/wounds.md`.

### What each part holds

`partHitPoints`, Node. Joules to empty at 100 J a hit point.

| Part | Warrior (6 HP): kg | HP | J | Rogue (4 HP): kg | HP | J |
|---|---|---|---|---|---|---|
| head | 5.48 | 0.446 | 44.6 | 3.85 | 0.291 | 29.1 |
| upperTrunk | 12.61 | 0.776 | 77.6 | 8.90 | 0.508 | 50.8 |
| middleTrunk | 12.90 | 0.788 | 78.8 | 8.44 | 0.491 | 49.1 |
| lowerTrunk | 8.82 | 0.612 | 61.2 | 7.18 | 0.441 | 44.1 |
| upperArm | 2.14 | 0.238 | 23.8 | 1.47 | 0.153 | 15.3 |
| forearm | 1.28 | 0.169 | 16.9 | 0.79 | 0.102 | 10.2 |
| hand | 0.48 | 0.088 | 8.8 | 0.32 | 0.056 | 5.6 |
| thigh | 11.19 | 0.717 | 71.7 | 8.51 | 0.494 | 49.4 |
| shank | 3.42 | 0.325 | 32.5 | 2.77 | 0.234 | 23.4 |
| foot | 1.08 | 0.151 | 15.1 | 0.74 | 0.097 | 9.7 |

The skeleton's are the Warrior's (`skeleton-placeholders`).

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
