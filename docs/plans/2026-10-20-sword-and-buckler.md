# A reference sword-and-buckler fighter

## Goal

One named fighter, the Warrior and the Rogue with a short sword in the right hand and a buckler
in the left, that fights on the Arena's open stage and obstacle court:

- it reaches its opponent, round the court's columns where they stand between;
- it keeps the buckler between itself and the opponent's weapon while its sword hand works;
- it cuts and thrusts so that a blade that lands wounds, and comes back to guard;
- it gets up when felled, still holding both, and fights on.

It is a reference, not a champion: the assembly later entrants are measured against, frozen at a
checkpoint with its ratings and its capability results, built only from shared parts so that each
part is also a reference for its role. It is the next milestone of the
[shared controller workshop](2026-10-20-shared-controller-workshop.md), since it exercises every
role at once (navigation, guard, executors, recovery, tactics, motor control) with equipment.

## Where it starts

A first reading at `e6419a2c` (Node core world, Rapier, 120 Hz, Balance 0, 90 s cap, recovery
off): every mind that builds with sword and buckler (Options, Classic, Puncher, Counter-puncher,
Behaviours), each against each, as Warrior against Warrior and Warrior against Rogue, on the open
stage at 3 and 4.5 m and the court at 4 and 6 m. That is 200 bouts, four for each pair and level:
too few to rank, enough to see the shape.

- **Blades touch, but almost nothing ends.** The bouts recorded 3,294 wounding edge contacts and
  458 point contacts, yet 192 of the 200 ran to the cap and were judged on the bars. Seven ended
  by a fatal wound, one by a severed part.
- **No mind leads.** Score shares, with a draw as half: Behaviours 0.59, Classic 0.54, Options
  0.51, Puncher 0.45, Counter-puncher 0.41, all within the noise of four bouts a pair.
- **Puncher and Counter-puncher never swing the sword.** Their only action is the punch, which
  needs an empty hand. They fit the loadout because the line guard declares the sword a covering
  item, so they fight as two shields. Against each other they land nothing but buckler contacts.
- **The court fells bodies; the open stage does not.** 15 bodies were down at the end of the
  100 court bouts, none at the end of the 100 open bouts.

What the code shows:

- **The sword is placed, not swung.** The blade actions (`src/core/skills/blade.ts`) aim the edge
  or the tip to arrive at `BLADE_STRIKE.contactSpeed`, 0.8 m/s, after a 0.45 s course. The
  fixture that holds them (`tests/core-sword.test.mjs`) pins all but the sword arm. By the
  rulebook, an edge's joule is worth 5.7 blunt ones and a point's 33, so a Warrior's head (0.446
  HP, [wounds](../reference/wounds.md)) is emptied by about 7.8 J of edge or 1.3 J of point. A
  driven cut needs a few metres a second at the blade, not the 15 to 25 m/s a person's reaches
  ([human strike reference](../reference/human-strike-reference.md), section 3).
- **The buckler covers against a club.** `tests/core-buckler.test.mjs` intercepts a club strike
  while the club hand's action owns its hand. Nothing tests it against a blade, whose cut arrives
  along a line and whose thrust arrives at a point.
- **A blade action takes the legs and trunk** from preparation to its return (`holds` in
  `blade.ts`), so the fighter stands still while it cuts, and its approach and its cover must
  hand over around every blow.
- **Recovery holding both is unread.** The owner's 64-fall target fixes empty hands and the
  club; `research/rising-bed.mjs --held` takes only those. The Lab's Stand-up mode and the
  separate trials take any loadout (`60674ef1`), and the named equipped falls fail.
- **Fitting is not constructing.** Scrapper fits every loadout by `modelSupportsMind`, and throws
  at construction ("estimate selection needs comparable estimates for every action") on each of
  the four loadouts whose hands hold only a sword or a buckler: its estimate selector reads no
  estimate from a blade action. `npm run tournament` reaches those loadouts.
- **The standard match plays empty hands and the club** (`MATCH`, `scripts/match.mjs`); the
  tournament plays every loadout of `LOADOUTS`, sixteen of them, double bucklers included.

## Principles

- **Through shared parts.** The fighter is a preset of a registered mind, a recipe of parts in
  the catalog; every improvement lands in a part that any mind may use. No part, preset or
  tactic names the sword or the buckler: it reads the item's regions, points and cover.
- **A task before the bout.** Each capability is first read on its own task, where a failure is
  a cause, then in the assembly, then in bouts.
- **One change at a time against a frozen reference.** A stage's candidate runs beside the part
  it may replace, both selectable; retiring the old one is the owner's decision.
- **The body is not raised for the sword.** Muscle strength, speed and the rulebook's prices are
  unchanged; Balance is 0 for every claim. An assisted reading is labelled as one.
- **The toolkit lands on its own** (`AGENTS.md`): a shared part's change is its own commit, with
  the fingerprint cases it moves named.

## The protocol

A representative set of loadouts replaces every combination in ratings and the tournament:

| Loadout (left, right) | Name |
|---|---|
| empty, empty | Bare hands |
| empty, club | Club |
| buckler, club | Club and buckler |
| empty, sword | Sword |
| buckler, sword | Sword and buckler |

`REPRESENTATIVE` in `src/core/items/held.ts` names it; the tournament rates each mind on each
character and representative loadout it fits, and the standard match adds the two buckler
loadouts. `LOADOUTS` stays the whole catalog for pickers and validation.

The rest of the catalog (a sword in the left hand, two clubs, two swords, a buckler and nothing
else) is the **unseen** set: a mind is never tuned on it, and a checkpoint reads, for every mind
that fits it, whether it constructs, how its bouts against the reference end, and how its
capability tasks read. It is reported beside the ratings, never in them, as how far a mind
carries to a loadout it was not built for.

The sword-and-buckler reading at a checkpoint is the reference fighter against itself and every
mind that fits the loadout, Warrior and Rogue, both sides, the open stage at 3 and 4.5 m and the
court at 4 and 6 m, 90 s, Node core world, Rapier, 120 Hz.

## Stages

Each stage lands in small commits under the normal gate, and is useful alone.

### 0. An honest field

- `fits` and construction agree: a mind that fits a body and loadout constructs on it. The
  estimate selector's requirement is stated where its fit is read, so Scrapper drops out of the
  four loadouts it cannot build on (or a blade action supplies a comparable estimate; whichever is
  smaller).
- `tests/mind-contract.test.mjs` constructs every registered mind on each character and catalog
  loadout it claims to fit, so a gap like this is a red gate. Construction only, so it stays fast.
- `REPRESENTATIVE`, the tournament's and the match's loadouts, and the unseen report.
- `research/rising-bed.mjs` takes `--loadouts left,right;...` beside `--held`, without changing
  `--target`.

### 1. A cut that wounds

Task: a standing Warrior and Rogue, unpinned, sword and buckler, against a standing target body
at the reach the blade's readiness reports, at heights from the head to the thigh. Read per
blow: the blade's speed at contact (driven, before the contact), the energy and wound the rules
give, the region and mechanism, whether the striker is down within 2 s, and the time to return
to guard.

Work: a blade course that drives the sword through its target (the contact speed becomes a
speed reached at the target, bounded by what the arm and trunk give), with the trunk's turn and
the step the recipe strike already makes (`recipe-strike`, `effector-strike.ts`). The thrust the
same way along its line. This is the whole-body plan's strike work applied to an item; it uses
that plan's solve where it helps.

Proposed bar: on every cell, the median cut on the trunk or head empties at least a third of the
Warrior's head (2.6 J of edge), no striker falls, and the blade returns within 1 s.

### 2. The buckler against a blade

Task: the reference fighter standing in guard, a sword cut and a thrust from a rig at the head,
the trunk and the sword arm, from the front and 45 degrees either side. Read whether the buckler
meets the blade before the body does, and the wound taken.

Then the composition: the same incoming blade while the fighter's own cut is under way, so the
buckler's cover and the sword's action hold their hands at once and hand the trunk and legs over
cleanly.

Proposed bar: the buckler meets at least four of five blade attacks it can reach from guard,
with or without its own cut under way.

### 3. Up again, holding both

Task: the rising bed with `--loadouts buckler,sword`, sixteen shoves, Warrior and Rogue, Balance
0, the game's Stand up (`step-up`) and any candidate. Read verified recoveries, the median time,
whether both items are still held, and whether the body then walks a metre on command (the
hand-back).

Work belongs to the [whole-body plan](2026-10-17-general-controller.md)'s recovery; this stage
adds the equipped group and fixes what the items alone break (a buckler on the ground under the
hand, a blade levering the wrist). The owner's 64-fall target is unchanged and remains its own
goal.

Proposed bar: at least as many recoveries with sword and buckler as with the club on the same
falls, with every item held.

### 4. The court

Task: the shared navigation task on the obstacle court, carrying sword and buckler, to a still
and a moving opponent behind the central column, from both spawns. Read arrival in the strike's
window, collisions with furniture, time taken, and falls.

Work: the six failing travel cases of `tests/core-navigation-capability.test.mjs` where the
loadout makes them matter, and the hand-over from navigation to the blade's approach window.

Proposed bar: the fighter reaches its window behind the column in every case within 15 s,
without a fall.

### 5. The assembly and its tactics

The preset: a recipe fighter (`behaviours` tactics) with Move's gaits, `shield-guard` with
predictive cover, `blade-cut` and `blade-thrust`, and Stand up, starting from Behaviours'
assembly. Tactics choose the cut or the thrust by the opening the opponent's buckler leaves
(`surface` aims), keep the spacing at the sword's reach, not a fist's, and step round to the
side the opponent's buckler does not cover.

Bar: it leads every other mind on the sword-and-buckler protocol, by the match's paired score,
with each condition played both ways.

### 6. Checkpoint

Freeze the platform, run the tournament on the representative set and the unseen report, commit
`assets/minds/ratings.json` and the notes, and record the capability results of stages 1 to 4
with the commit they were read at. The owner watches the fighter on both levels in the browser;
it is the reference once the owner accepts how it fights.

## Owner's choices

- The representative loadout set above, and whether the left-hand sword belongs in it.
- The proposed bars of stages 1 to 4, or other figures.
- Whether the reference fighter is a preset of the recipe fighter or of the options fighter. No
  mind starts clearly ahead; Behaviours and Classic, both recipe fighters, read highest, so the
  plan starts there. The options fighter may follow as a second reference.
- Whether a mind with no attack for a loadout (Puncher with a sword) is entered in that
  loadout's ratings, or only where it has one.

## Checks

`npm run check` and `npm test` for every change; `npm run build` for a change to the screens.
Each stage's task is a `-capability` test in `tests/experimental.json` beside a floor in the
gate, and is run by name when its stage changes. Capability readings name the harness: Node core
world, Rapier, 120 Hz, Balance 0.
