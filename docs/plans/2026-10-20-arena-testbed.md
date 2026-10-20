# Arena testbed: obstacle levels, buckler and short sword

## Milestone and ownership

Make the Arena a useful shared testbed for equipment, movement and tactical development:
fighters using the existing club, a small buckler and a cutting short sword can fight on both
the current open stage and an obstacle court. The owner can select the level and each side's
loadout, share the bout's recipe and watch its recorded replay. The same construction and rules
run headlessly for component tasks and matches.

This is the next implementation milestone of the
[shared controller workshop](2026-10-20-shared-controller-workshop.md). It owns the level,
navigation, loadout and first-item implementation details below. The workshop owns the broader
component contracts, collaboration and evaluation infrastructure. Make the registration changes
needed by the navigator, shield guard and sword executor as working implementations require
them; a broad framework refactor is not a prerequisite.

The [whole-body control](2026-10-17-general-controller.md) and
[options fighter](2026-10-14-options-fighter.md) efforts can use the resulting tasks and content.
Their running, recovery and competitive goals remain independent and open. Use the Warrior and
Rogue for the first equipped fighters.

## Principles

- **Through the Mind framework.** Route-following, the shield guard and the sword's actions are
  parts of roles in the part catalog (`src/core/mind/parts.ts`, `catalog.ts`): each owns its
  config, defaults, faults, `fits` and explicit state, and is selectable beside alternatives.
  The Arena, the Crypt and the Lab reach them the same way. No mind or screen special-cases a
  level or an item; a level and an item are data that the general rules read.
- **The simplest rule that works.** Reuse an existing mechanism before adding one. The reptile's
  bite grew machinery its result did not need; the sword's rule does not repeat that.
- **No compatibility layers.** Development is early. Recipes, links, tapes and ratings made before
  a change are replaced, not translated. A recording made on other code is refused, not played
  as current (Integration). A toolkit change names the fingerprint cases it moves (`AGENTS.md`).
- **No new art.** The obstacle court is built from the Crypt kit's pieces and footprints.
- **Composition is checked where it is exercised.** Parts that each fit a body can still compose
  badly (support assumptions, trunk ownership, interruption). A gate exercises the composition
  its step needs; an incompatibility found is stated in the parts' `fits` when it first appears.

## Sequence

Two workstreams, then their integration. Each step lands in small commits, and its gate test is
fast-tier unless noted.

| Step | Deliverable | Gate test |
|---|---|---|
| E1 | Declared equipment support in `fits`; both hands loaded in the Arena | `tests/core-held.test.mjs`, `tests/mind-contract.test.mjs` |
| E2 | Item contact regions; edge and point priced on impact, in a physical fixture | `tests/core-blows.test.mjs` |
| V1 | Level definitions; the open stage and a column court | `tests/arena-levels.test.mjs` |
| E3 | Buckler and shield guard: club and buckler on the open stage | `tests/core-buckler.test.mjs` |
| V2 | The movement request, the navigation role and a reference navigator: round a column | `tests/core-navigation.test.mjs` |
| E4 | Short sword with cut and thrust executors | `tests/core-sword.test.mjs` |
| V3 | The Crypt's route-following on the navigation role | `tests/core-navigation.test.mjs`, the Crypt's tests |
| V4 | Falls beside obstacles reported in Stand-up; low furniture in the court | `tests/lab-ground.test.mjs`, `tests/arena-levels.test.mjs` |
| I | Equipped fighters on both levels | `tests/smoke.test.mjs` |

E1, E2 and V1 start together; E2 is pure rules, fast to test and the riskiest item. The first
deliveries are E3, club-and-buckler fighting on the open stage, and V2, a fighter walking round a
column; each is useful alone. V3 lands within the milestone, after the Arena navigator works, so
two route-followers do not stay side by side.

## Equipment

### E1: declared equipment support and loadouts

`fits` is wrong for any item that is not struck with. The tempo mind and the options fighter fit
a body only if they strike with every item it holds (`strikesWithAll`,
`src/core/mind/action-config.ts`), so every mind refuses a buckler. The rule's purpose is that a
mind has a use for what its body carries and misuses nothing (a punch is not thrown from a held
club's end). State it generally: every part declares which of its body's held items it supports
and how (an executor strikes with one, `ExecutorPart.strikesWith`; a guard covers with one), and
a mind fits a body when its parts together support every held item and no part commands an
effector it cannot use. One predicate, exported by the module that owns it, read by every mind's
`fits`. A declaration is static; whether a fighter uses an item well is its task's reading. Land
it as its own toolkit change, before the buckler.

The Arena's loadout becomes one item per hand, the shape the Lab already has (`LabLoadout`,
`src/lab/scenarios.ts`): `HELD` (`src/core/items/held.ts`) grows by each new item, and each side
names its right and left hand's. `armed` (`src/core/human/grip.ts`) already holds in either
hand. Replace `&held=` with a per-hand parameter, and carry the loadout through the recipe,
construction, sensing, recorded commands and match identity. Rigid attachment to a hand is
sufficient for one-handed items; the separate-equipment path (`src/core/equipment.ts`,
`src/core/mind/equipment-port.ts`) is for an item that needs independent motion. Two-handed
items and regripping are later work.

The first loadouts are empty hands, club, club and buckler, short sword, and short sword and
buckler. Mass, centre of mass, inertia, shapes and contact ownership follow from what is
carried; anatomy and muscle limits do not change with it. Rendering and pickers read the same
item definitions.

Gate: each hand carries a distinct item with its load and contact attribution, an invalid
assignment is refused with a reason, a mind that supports no use of an item is refused, and an
equipped bout forks and replays.

### E2: item contact regions and the blow rule

Give items contact regions as segments have them (`ContactRegionSpec`, `contacts` in
`src/core/spec/body.ts`): a shape with its own surface. `surfaceOf` (`src/core/rules/blows.ts`)
gains a case for an item's region that reports both the item and the region, and turns the
region's direction out of the item frame as the held case does now. The anatomical `"region"`
case reports `item: null` and is not reused for items.

A surface's directed property is a mechanism with a direction and an alignment cosine: `point`,
as now, or `edge`. One rule prices every blow an item gives: an impact whose normal into the
other body lies within the struck region's cone is priced at that region's mechanism on the
impact path (`blowDamage`, `MECHANISM_PRICE`); anything else is blunt. Every blow shares its
energy by compliance, so a cut and a thrust keep the rulebook's ratios to the club. The
sustained-load path (`pointLoadDamage`) stays as the reptile's teeth use it and reads no item's
surface, so no contact is charged on both paths. Whether the bite moves onto the impact path is
a later question.

No drawn cut, no damage accumulated over sliding contact, and no new coefficient: the prices are
the rulebook's, and each cone is its item's spec. Drawn cuts are a later experiment, if watching
the sword says one is missing.

The impact path prices a touch by its strongest pair (`strongest`), so a touch on two regions at
once is classified by that pair alone and charged once. The fixture is a blade on a fixed rig
against a body, at speeds a swung arm gives, at 120 Hz: an aligned edge strike, a flat strike, a
thrust, a miss, a resting blade, a blow across the edge-flat seam and a blow touching edge and
tip together. Gate: each wound names the item, the region and the mechanism its geometry
implies; a touch is charged once; a resting blade wounds nothing; blunt contacts and the
reptile's bite are unchanged.

### E3: buckler and shield guard

A small centre-grip buckler: a hull disc whose handle is a haft for the existing grip
(`handHolding`), with its mass, inertia, cover points and surface in its item spec, sourced as
the spec rules require. Its look is a simple mesh drawn from its own collider. Durability and
breakage are later work.

The buckler protects by occupying space; contacts with it are ordinary contacts. A shield guard
is a guard part, building on `src/core/skills/guard.ts`: it places the buckler's centre between
the threat and what it protects and turns its face to the threat. Two cover points fix a line,
not a face, so the face is an orientation goal (`EffectorGoal.orientation`,
`src/core/control/effector-tracker.ts`). It fits a body that holds an item with cover points,
and declares that item supported (E1). Its reported state awards nothing.

Whatever asks for cover asks by what each hand holds, not only by the threat's side: with one
shield hand, the cover reflex (`src/core/mind/options/reflex.ts`) and the fighter's tactics
send the threat to the hand that covers with an item, and an empty or striking hand takes it
only where the mind's config says.

Check the wrist with the buckler as the club's is checked: the disc's inertia across the wrist
weld is the case where a held item jiggles.

Gate: a buckler in guard intercepts a strike on a fixed rig and an unguarded one lands; a
club-and-buckler body walks with the guard held; a strike arrives while the club hand attacks,
the buckler meets it, and the attack is interrupted or completes and hands back to the guard; the
body falls and rises as the stand-up suite reads it, with capability failures reported apart
from software faults. Club-and-buckler bouts are shown on the open stage before the court.

### E4: short sword

A one-handed short sword with edge, flat, tip and hilt regions (E2), and cut and thrust actions
as executor parts on the existing action lifecycle (preparation, commitment, controlled return,
interruption) and surface-aim machinery. A cut aims an edge region, a thrust the tip. Existing
injury and severing rules apply; no mesh slicing.

Gate: a cut and a thrust against a fixed target reach it with the named region and return under
control; sword, and sword-and-buckler, bouts run. How well the sword fights is a capability
measurement; armed fighting is weak today (the options fighter's club bouts lose most of the
field), so the gate is the fixture and the executors' own tasks, not how the bouts look. The
first sword bouts show whether cuts or thrusts dominate; the rule changes only if that exposes
a concrete problem.

## Environment

### V1: levels

A level is data: its solids, the visible pieces that draw them, which solids block sight, and
its valid spawn pairs and headings. `LEVELS` names `open` (the current stage) and
`obstacle-court`. One resolved definition makes the colliders, the meshes and the geometry granted
to senses (`SolidSense`, `src/core/mind/object-senses.ts`); the room's checks
(`validateRoomPlacements`, `src/arena/room.ts`) run on every level. The selection threads through
`src/arena/matchup.ts`, `main.ts`, `scene.ts`, `duel.ts` and `research/bout.mjs`, and is part of
the recipe and the bout's identity. World-building arithmetic keeps the exact-math boundary.

The court's furniture is the Crypt's. `CRYPT_FURNITURE` and `CRYPT_SIGHT`
(`src/dungeon/crypt-archetypes.ts`) and the kit's assembly move to a module both screens read, so
one footprint makes a column's collider and its mesh in the Crypt and the Arena alike. The first
court is flat with columns only, with clear routes, room to fight beside a column, and spawns
that need a detour. Low furniture (tombs, benches) joins it in V4.

The level owns what a starting gap may do and refuses a spawn whose bodies or loadouts do not
clear the solids. Every mind is granted the level's whole static geometry as `SolidSense`, alike
for every implementation compared; what it knows of an opponent is its senses', a separate
grant. Sight occlusion by `CRYPT_SIGHT` is the first tactical experiment the court enables;
until then senses keep the current policy.

Gate: each level builds the same colliders and senses in the page and the Node runner, every
spawn clears, visible and collision pieces correspond, and a court bout replays exactly.

### V2: the movement request and navigation

The contract comes first. Today tactics and orders ask for a direction (`Orders.move`,
`src/core/mind/orders.ts`; the intent's velocity), and `Orders.destination` is only the distance
left on a route the Crypt's run follows. A movement request replaces them, one union for a mind's
tactics and a person's orders alike:

- **Direct**: a direction and pace in the body's frame, as keyboard movement and footwork ask
  now; it keeps its meaning and is only steered clear of solids.
- **Place**: a point and how near counts as there; a drawn route is a list of them.
- **Range**: a focus (an opponent, as sensed), a band of distance and a preferred side; the
  navigator seeks a reachable spot in the band and follows it as the focus moves, never routing
  into the focus's own place.

The navigator owns the route, arrival, braking at corners and stopping, and reports a goal that
is unreachable or stalled. The requester owns facing, which passes through, and cancellation,
which is asking for something else; on a report it decides what next. A route that exists and
one the body's gait walks are separate readings.

`navigation` is a new role between tactics and locomotion. A mind holds it in a slot like its
other parts, so navigators are swapped and compared like gaits. A navigator reads the solids its
senses are granted and its own body, no world or engine handle; its route, progress and stuck
memory are its state. Local clearance steering (`clearMove`, `src/core/mind/clear-step.ts`) stays
inside the navigators that want it.

The reference navigator is a visibility graph over the solids' footprints grown by the body's
clearance (and its carried item's), committing to one side of an obstacle until it is past it,
so it does not dither round a column.

The task, on `src/core/tasks/environment.ts`, covers a detour round one column, a corner, a
narrow passage, a moved destination, a blocked route and a range request against a moving
target, from several starts, and checks a route exists before judging the walk. It scores the
body's progress, contacts, falls and arrival, not the navigator's path.

Gate: the reference navigator walks a fighter round a column to its destination, holds a range
on a moving target without walking into it, reports a blocked route, and replays. Wider cases go
in a `core-navigation-capability.test.mjs` listed in `tests/experimental.json`.

### V3: the Crypt on the navigation role

The Crypt's route-following moves into the core as navigators: `findPath` (`src/dungeon/map.ts`)
and the run's following, stopping, corner braking and replan on no progress
(`DungeonRun.follow`, `straightOf`, `src/dungeon/run.ts`). They are rewritten on the core's own
arithmetic (`src/core/math/real.ts`): both files use the engine's `Math` functions now. The Crypt
grants its solids as `SolidSense` and its run gives place requests; its grid search may stay as
a second navigator if it does better there. `Orders.destination` goes with it.

Gate: the Crypt's fight and run tests pass on the role, and its humanoids reach their goals on
several seeds.

### V4: falls beside obstacles

Fighters will fall against columns and onto tombs, and every rise controller assumes open, flat
ground. In this milestone a fall beside an obstacle is supported as a test condition: it is made,
read and reported correctly. Standing up from it successfully is later work.

- The Lab's Stand-up mode (`src/lab/ground-mode.ts`) takes a level, so its falls are made beside
  a column, against a wall and onto low furniture, the same shoves as on the open floor. Stepping
  back into a tomb is one of them.
- The owner's 64-fall target (`research/rising-bed.mjs --target`) stays exactly as it is. The
  obstacle falls are a separately named suite sharing its builders and reports.
- Rise and recovery parts are granted the solids through their senses, as navigators are.

Low furniture enters the court once these falls are read.

Gate: a body beside each obstacle kind falls, rises or is reported failing, stays finite and
replays. The share that stands is a capability measurement, not a gate.

## Integration

The Arena page, task runners and Node matches use the same level, loadout, rules and mind
configuration. Results name their level and loadout; an open-stage result is not a court result.

A recording (a `#tape=` link, an actuation recording, a match result) carries the identity of
the build and protocol it was made on, and a replay on other code is refused with that reason.
A recipe link reruns its configuration on current code and promises no more.

The milestone completes when the owner can pick either level and each loadout, and watch and
replay bouts that show navigation round obstacles, buckler interception, and sword cuts and
thrusts. Software validity, each capability and fighting strength are reported separately; this
does not establish the unfinished stand-up, running or strongest-fighter goals.

Use `AGENTS.md`'s gate: `npm run check`, `npm test`, and `npm run build` for browser or asset
changes. Run touched slow tests by name; keep new tests fast or list them in `tests/slow.json`.
Look at visible changes briefly and leave motion to the owner. Update the architecture, README
and roadmap as behavior lands, and delete this plan when the milestone is complete.
