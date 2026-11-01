# Option Mind on every body

## Why

The owner's direction (2026-11-01): Option Mind is the project's mind. The architecture is
finished and cleaned up first; then Option Mind's skills are made to work robustly on the toed
Warrior, Rogue and Skeleton with every loadout, or the reason one cannot is recorded. A clean shape
with room to grow comes before the retuning it costs.

The owner's choices:

- **One family of minds.** The minds from before Option Mind (Classic's presets, the Duellist
  among them; Vanguard; Crawl) and what only they reach are deleted. The reptile with Option
  Reptile and the bare entrant stay: they show that the framework is general and its concerns
  separate.
- **Every body and loadout**: the Warrior, the Rogue and the Skeleton; empty hands, the club, the
  sword, the club and buckler, the sword and buckler.
- **Stand-up** fast and robust on the Warrior and the Rogue, robust on the Skeleton (an enemy
  unit; its time is read, not held). **The run** on toes, on the Warrior and the Rogue.
- **Minds in parallel** ([its plan](2026-11-01-parallel-minds.md)) lands before any skill is
  tuned again: its delay moves every skill, and each is fine-tuned once, after it.

## Where it starts

At `418f4809`, from the records ([Option Mind's rise](../reference/rising.md#option-minds-rise-on-the-target),
[the walk and run](../reference/locomotion.md#the-walk-and-run),
[on the game bodies](../reference/toes.md#on-the-game-bodies),
[learned punch](../reference/learned-punch.md), [held blows](../reference/held-blows.md),
[front kicks](../reference/front-kicks.md), [sword and buckler](../reference/sword-and-buckler.md)):

| | Warrior | Rogue | Skeleton |
|---|---|---|---|
| Stand-up, the target's falls | 31 of 32, median 9.1 s | 25 of 32, 17.2 s: its arms do not straighten on hands and knees | not read with Option Mind's rise |
| Walk, forward | 1.7 m/s | 1.5 m/s | its envelope, on toes |
| Run on toes | held to 0.7 m/s: it falls past 1 m/s | the same | — |
| Straight punch | 83 % held out | about 67 % at its scaled bar | no record |
| Stomp, front kick | both recorded | the stomp; no kick | a low kick |
| Club blow | 91 and 92 % held out, 3 fallen at 480 Hz | the Warrior's network did not transfer | no record |
| Sword cut, thrust | the best cut 15 to 20 J at the edge, the best thrust 25 to 28 J at the point; neither read at the bars below | the arm's path only (`BLADE_STRIKE`) | the arm's path only |
| Buckler cover | held between the weapon and the body; the Cover drill has no rung against a weapon | — | — |

## The bars

A cell works when its skill meets its bar on held-out trials at 120 and 480 Hz, none falling, its
window's coverage reported beside it, and the owner accepts its rung. A strike is read on the
Strike drill's still, walk and fight rungs; rungs 1 to 5 come after this plan. Another body's bar
is the Warrior's scaled by its strength and mass (`barOf`, `src/evaluation/strike/read.ts`).

- **The punch** (`BAR`): the untrained adult man's, the mean less one SD
  ([human strike reference](../reference/human-strike-reference.md#1-punches-straight-jabcross-hook)):
  the rear fist 6.8 m/s over its last 0.1 m meeting 2.12 kg, the lead 5.3 m/s and 2.34 kg; its last
  0.1 m within 20° of the surface's normal and 45° of the line from the shoulder; the elbow and the
  chest within 30° of straight and upright; on the mark asked within 0.5 s; the striker up. 90 %
  of those thrown land, since every reading must pass at once and each already sits at the mean
  less one SD; in a fight, 90 % of those that meet the foe past its arms. Impulse is reported, not
  gated.
- **A held blow**: a person's motion with that item, in its own measure, as the punch's is; the
  rules price the wound, which is reported beside it. Each meets with the item's face (the club
  blunt, the cut its edge, the thrust its point, as the rules read the contact), on the mark asked,
  the striker up; 90 %, read holding the buckler in the left hand where the loadout has it.
  - The club (`BAR.held`): 64.8 J of the rules' energy, the crutch's 75.5 ± 10.7 J less one SD
    ([human strike reference](../reference/human-strike-reference.md#2-one-handed-stickclubbaton-and-bats-as-a-two-handed-ceiling)).
  - The cut: the edge's speed at its striking point, the lay men's one-handed rod (Muggenthaler
    2018, 23.9 m/s at the tip) less one SD, read at the edge's place on the blade
    ([human strike reference](../reference/human-strike-reference.md#3-one-handed-sword-cut)).
  - The thrust: a person's stab, the mean less one SD of a source read at its source first
    (Horsfall et al. 1999, [wounds](../reference/wounds.md#mechanisms)).
- **The front kick and the stomp**: no human figure is held yet. Their step sources one in the
  human strike reference first, the mean less one SD, before any search.
- **The buckler's cover**: it meets four of five blows that reach the body before the body does
  ([sword and buckler](../reference/sword-and-buckler.md#2-the-buckler-against-a-blade)).
- **Stand-up**: the owner's target on the Warrior and the Rogue in every loadout
  ([rising](../reference/rising.md#the-owners-target)); the Skeleton stands at least 15 of 16 in
  each group, its time read, not held.
- **The walk**: the Locomotion drill's screen, shoves and the lab's gusts in every loadout, none
  fallen, each body's forward pace no less than today's.
- **The run**, on the Warrior and the Rogue in every loadout, calm air and the lab's gusts, seeds 1
  to 4: 3 m/s forward held 10 s, turns at 1 rad/s at 2 m/s, a stop from 3 m/s within 1.5 s, none
  fallen. Decided here, which the owner may reverse.

## Steps

Each lands green on its own: `npm run check`, `npm test`, `npm run build` where browser code or
assets change, and a toolkit change's message names the fingerprint cases it moves
(`scripts/fingerprint.mjs`). A search or training run is priced on the pool from its first trials.

### 1. One family of minds

1. **Opponents and defaults on Option Mind.** The drill opponents' bodies (stand, step in and out,
   guard, punch on a rhythm, press; `src/evaluation/drill-opponents.ts`) become Option Mind
   configurations. Each model's default mind is its Option Mind (`DEFAULT_MINDS`,
   `src/entrants/game.ts`), the reptile's Option Reptile. The evaluations, the match's panel, the
   tournament, the court and the Lab name Option Mind's presets, and earlier versions of them,
   where they name the old minds. Check: each drill's records read again against the version
   before, the readings that move named (a changed drill opponent is a changed drill); the owner
   watches the new drill opponents.
2. **Delete what only the old minds reach.** Found by what the kept code reaches (the Option
   entrants, bare, walker, riser, the evaluations and the pages), not folder by folder: the Classic,
   Vanguard and Crawl entrants; the old tactics, behaviours and planners; the reptile's own mind
   kind; step-up and the staged route once no route falls back to them; the control-foundation
   page and the task fixtures if nothing kept reads them; their reference records and documents.
   Check: the fingerprint's kept cases unchanged and the deleted ones named; `npm run clean`; the
   documents' links.
3. **One Option Mind.** A preset that differs only by what its body has records for is one preset,
   since a body leaves out the skills it has no record for (`usableSkills`): the Skeleton's folds
   into Option Mind's where its parts allow. Option Reptile is tried as the toolkit's Option Mind
   with the reptile's options plugged in, and its own controller deleted if it fits; where it does
   not fit, what in Option Mind assumes a human is fixed or recorded. Its gaits and control layers
   stay the reptile's own. Check: the Mind contract, the swap test and the core's boundary; the
   reptile against itself and against the Warrior in a match against the version before.

### 2. Minds in parallel

[Minds in parallel, a step late](2026-11-01-parallel-minds.md), whole. Balance and the rise are
held under the delay there; the trained skills are fine-tuned in step 3.

### 3. The table

An evaluation reads every cell, body by loadout by skill, each on its drill against its bar: a
cell's drill link at the version read, or the reference section that says why it falls short. It
plays only the cells a change touches and reuses the rows it keeps. A skill has a cell where its
loadout leaves it the limb it uses.

Then its first pass under the delay: each trained network fine-tuned from its own weights, each
searched schedule read again. Check: the table before step 2 and after; every cell as good as
before step 2, or its fine-tune named.

### 4. Stand-up

- **The legs bear on hands and knees**, and on any set of the ends from where the body is
  (`BodySpec.ends`), carrying the root over them as the ground techniques do now (`carryRoot`,
  `bearLimbs`, `src/core/control/bearing.ts`). A ground technique asks its bearing ends in its legs
  goal and holds only the limbs it moves, so an arm it does not use is the policy's, and no
  technique writes the muscles itself (`groundExecutor`, `src/core/recovery/ground/held.ts`).
- **The Rogue's rise**: a route that does not push up on straight arms. The Riser's contact-driven
  rise (`src/entrants/riser/`) is read first: folded into Option Mind's rise where it does better,
  deleted where it does not. Its arms are read before any strength is raised.
- **The Skeleton's rise** on toes on the target's falls, each edge's profile measured on its body.
- **Then speed** on the Warrior and the Rogue: the chain's time (the roll, the front sit-back, the
  hand-over to standing).

Check: every gate of the target on the Warrior and the Rogue in every loadout; the fresh falls
within a placebo's spread of it; the Skeleton at 15 of 16 a group; rising in fights no worse; the
owner looks in the Lab's Stand-up mode.

### 5. The run

The run on toes on the Warrior and the Rogue to its bar in every loadout, then priced by the Gait
drill (`gait`) so that Option Mind chooses it where it pays. One set of legs stands up and runs,
so every leg change is read on both the stand-up and the gait. Where the toes or the body are the
limit, the limit is read and the body's numbers are set for the result, sourced as the owner's
decision with their before and after.

Check: the Locomotion drill's run at the bar; the stand-up target held; the owner watches the run
in the Lab's Locomotion courses and in the Arena.

### 6. The strikes on every body

**A point wounds by its depth** (the owner, 2026-11-01), before the sword is trained. Pricing a
point's whole energy at 33 times blunt (`MECHANISM_PRICE`, `src/core/rules/rulebook.ts`, from an
arrow's penetration) makes today's 25 J thrust about 8.5 HP, more than a whole Warrior. A point's
impact instead goes in as deep as its energy past the skin's breach drives it against the
tissue's resistance, no deeper than the point's own length, and takes the struck part's hit
points in proportion to the depth over the part's thickness, all of them for a point through:

    depth = min(length, max(0, energy - breach) / resistance)
    wound = part's hit points x min(1, depth / thickness)

- `energy` is the struck side's share of the blow (`energyShares`), as every mechanism reads it.
- `breach` (J) and `resistance` (N) are sourced, one each for every body (Gilchrist et al. 2008's
  0.25 J for a sharp knife, read at its source; a stab-penetration source for the resistance);
  the rules do not tell tissues apart for any mechanism.
- `length` is the directed point surface's own (`directed`, a stated depth; the sword's blade from
  its tip to its base), so any pointed item or body states it.
- `thickness` is the struck part's least width, derived from its collider in the spec.
- A point never takes a part off, and its wound does not walk to the attached parts.

The bite keeps its press (`pointLoad`); blunt, the edge and the axe keep their prices. Check: the
gate; the fingerprint, the moved cases named; a table of the cut and the thrust as measured,
their wounds on each part before and after; [wounds](../reference/wounds.md#mechanisms) updated.

Then, in order: the punch; the stomp and the front kick; the club blow; the sword's cut and thrust; the
buckler's cover. Each on the Warrior first, then on the Rogue and the Skeleton seeded from it (the
Warrior's network the start, its outputs scaled down, as the Rogue's punch was), with each body's
own schedule and window at its scaled bar. Where a body cannot reach a bar, its ceiling for the
blow is read; where the body is the limit its numbers are set for the result; where it still
cannot, its cell says why.

Check: each cell's held-out reading at both rates and its drill link; its reel watched, the
failures first; the owner accepts each rung.

## Done when

- One family of minds: no mind from before Option Mind is left; Option Reptile and the bare
  entrant run on the toolkit, held by the core's boundary and the Mind contract.
- [Minds in parallel](2026-11-01-parallel-minds.md#done-when) is done.
- Every cell of the table meets its bar on the rungs above and the owner has accepted it, or
  names, from a reading, why it cannot.
