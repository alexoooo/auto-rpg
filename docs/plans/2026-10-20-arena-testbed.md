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
  a change are replaced, not translated. A toolkit change still names the fingerprint cases it
  moves (`AGENTS.md`).
- **No new art.** The obstacle court is built from the Crypt kit's pieces and footprints.

## Sequence

Two workstreams, each in order, then their integration. Each step lands in small commits, and
its gate test is fast-tier unless noted.

| Step | Deliverable | Gate test |
|---|---|---|
| E1 | Item use in `fits`; both hands loaded in the Arena | `tests/core-held.test.mjs`, `tests/mind-contract.test.mjs` |
| E2 | Edge contacts in the blow rule, in a physical fixture | `tests/core-blows.test.mjs` |
| E3 | Buckler and shield guard | `tests/core-buckler.test.mjs` |
| E4 | Short sword with cut and thrust executors | `tests/core-sword.test.mjs` |
| V1 | Level definitions; the open stage and a column court | `tests/arena-levels.test.mjs` |
| V2 | The navigation role, a reference navigator, the Crypt on it | `tests/core-navigation.test.mjs` |
| V3 | Stand-up beside obstacles; low obstacles in the court | `tests/lab-ground.test.mjs`, `tests/arena-levels.test.mjs` |
| I | Equipped fighters on both levels | `tests/smoke.test.mjs` |

E2 is pure rules and fast to test, and is the riskiest item: it starts first, beside E1 and V1.

## Equipment

### E1: item use and loadouts

`fits` is wrong for any item that is not struck with. The tempo mind and the options fighter fit
a body only if they strike with every item it holds (`strikesWithAll`,
`src/core/mind/action-config.ts`), so every mind refuses a buckler. The rule's purpose is that a
mind uses what its body carries and misuses nothing (a punch is not thrown from a held club's
end). State it generally: every part says which of its body's held items it uses and how
(an executor strikes with one, `ExecutorPart.strikesWith`; a guard covers with one), and a mind
fits a body when its parts together use every held item and no part commands an effector it
cannot use. One predicate, exported by the module that owns it, read by every mind's `fits`.
Land it as its own toolkit change, before the buckler.

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
assignment is refused with a reason, a mind that leaves an item unused is refused, and an
equipped bout forks and replays.

### E2: edge contacts

Give items contact regions as segments have them (`ContactRegionSpec`, `contacts` in
`src/core/spec/body.ts`): a shape with its own surface. A held item's shapes then report their
region through the existing `"region"` path in `surfaceOf` (`src/core/rules/blows.ts`) instead
of the item's one `surface`.

A surface's directed property generalizes from `point` to a mechanism with a direction and an
alignment cosine:

- **Point**: unchanged. A sustained load along the direction pierces (`pointLoadDamage`).
- **Edge**: an impact whose normal into the other body lies within the edge's cone is priced as
  `edge` on the impact path (`blowDamage`, `MECHANISM_PRICE.edge`), sharing its energy by
  compliance as every blow does.
- Anything else is blunt.

No drawn cut, no damage accumulated over sliding contact, and no new coefficient: the edge's
price is the rulebook's, and its cone is the item's spec. Drawn cuts are a later experiment, if
watching the sword says one is missing.

The fixture is a blade on a fixed rig against a body: an aligned edge strike, a flat strike, a
thrust, a miss and a resting blade. Gate: an edge strike wounds at the edge price, a flat one at
the blunt price, a thrust through the point path, a resting blade not at all; blunt contacts and
the reptile's piercing are unchanged.

### E3: buckler and shield guard

A small centre-grip buckler: a hull disc whose handle is a haft for the existing grip
(`handHolding`), with its mass, inertia, cover points and surface in its item spec, sourced as
the spec rules require. Its look is a simple mesh drawn from its own collider. Durability and
breakage are later work.

The buckler protects by occupying space; contacts with it are ordinary contacts. A shield guard
is a guard part: it places the buckler's centre between the threat and what it protects and faces
its surface at the threat, through the effector tracker (`src/core/control/effector-tracker.ts`),
building on `src/core/skills/guard.ts`. It fits a body that holds an item with cover points, and
declares the buckler used (E1). Its reported state awards nothing.

Check the wrist with the buckler as the club's is checked: the disc's inertia across the wrist
weld is the case where a held item jiggles.

Gate: a buckler held in guard intercepts a strike on a fixed rig and an unguarded one lands; a
club-and-buckler body walks and strikes with the club while the guard holds; it falls and rises
as the stand-up suite reads it, with capability failures reported apart from software faults.
Club-and-buckler bouts are shown on the open stage before the court.

### E4: short sword

A one-handed short sword with edge, flat, tip and hilt regions (E2), and cut and thrust actions
as executor parts on the existing action lifecycle (preparation, commitment, controlled return,
interruption) and surface-aim machinery. A cut aims an edge region, a thrust the tip. Existing
injury and severing rules apply; no mesh slicing.

Gate: a cut and a thrust against a fixed target reach it with the named region and return under
control; sword, and sword-and-buckler, bouts run. How well the sword fights is a capability
measurement; armed fighting is weak today (the options fighter's club bouts lose most of the
field), so the gate is the fixture and the executors' own tasks, not how the bouts look.

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
that need a detour. Low furniture (tombs, benches) joins it in V3.

The level owns what a starting gap may do and refuses a spawn whose bodies or loadouts do not
clear the solids. Sight occlusion by `CRYPT_SIGHT` is the first tactical experiment the court
enables; until then senses keep the current policy.

Gate: each level builds the same colliders and senses in the page and the Node runner, every
spawn clears, visible and collision pieces correspond, and a court bout replays exactly.

### V2: navigation

A new role, `navigation`, between tactics and locomotion: tactics asks for a place, a navigator
gives the next heading and pace toward it, locomotion walks. A mind holds it in a slot like its
other parts, so navigators are swapped and compared like gaits. Local clearance steering
(`clearMove`, `src/core/mind/clear-step.ts`) stays inside the navigators that want it.

A navigator reads the solids its senses are granted and its own body, no world or engine handle.
Its route, progress and stuck memory are its state. It replans when the destination or the
solids in its way change, and reports an unreachable or stalled goal through its role's
feedback; reachability and physical progress are separate readings.

The reference navigator is a visibility graph over the solids' footprints grown by the body's
clearance (and its carried item's), committing to one side of an obstacle until it is past it,
so it does not dither round a column. The Crypt's route-following (`findPath`,
`src/dungeon/map.ts`; replan on no progress and arrival in `src/dungeon/run.ts`) moves into the
core as the same role: the Crypt grants its solids as `SolidSense`, its run gives a destination,
and the body's navigator walks it. Its grid search may stay as a second navigator if it does
better there. A drawn route is a destination list the navigator follows.

The task, on `src/core/tasks/environment.ts`, covers a detour round one column, a corner, a
narrow passage, a moved destination and a blocked route, from several starts, and checks a route
exists before judging the walk. It scores the body's progress, contacts, falls and arrival, not
the navigator's path.

Gate: the reference navigator walks a fighter round a column to its destination and replays,
and the Crypt's fight and run tests pass on it. Wider cases go in a
`core-navigation-capability.test.mjs` listed in `tests/experimental.json`.

### V3: rising beside obstacles

Fighters will fall against columns and onto tombs, and every rise controller assumes open, flat
ground. Rising beside obstacles is a supported feature, not a court-only problem:

- The Lab's Stand-up mode (`src/lab/ground-mode.ts`) takes a level, so its falls are made beside
  a column, against a wall and onto low furniture, the same shoves as on the open floor.
- The owner's target (`research/rising-bed.mjs --target`) gains an obstacle condition beside its
  open one; figures name which.
- Rise and recovery parts read the solids through their senses, as navigators do.

Low furniture enters the court once falls beside it have been read. Stepping back into a tomb is
one of the falls the Lab makes.

Gate: a body beside each obstacle kind falls, rises or reports its failure, stays finite and
replays; the share that stands is a capability measurement, not a gate.

## Integration

The Arena page, task runners and Node matches use the same level, loadout, rules and mind
configuration. Results name their level and loadout; an open-stage result is not a court result.
The milestone completes when the owner can pick either level and each loadout, and watch and
replay bouts that show navigation round obstacles, buckler interception, and sword cuts and
thrusts. Software validity, each capability and fighting strength are reported separately; this
does not establish the unfinished stand-up, running or strongest-fighter goals.

Use `AGENTS.md`'s gate: `npm run check`, `npm test`, and `npm run build` for browser or asset
changes. Run touched slow tests by name; keep new tests fast or list them in `tests/slow.json`.
Look at visible changes briefly and leave motion to the owner. Update the architecture, README
and roadmap as behavior lands, and delete this plan when the milestone is complete.

## Implementation readiness review

The four plans form a coherent direction and are ready to begin in small slices. The workshop
owns the shared platform, the Arena supplies a concrete integration target, whole-body control
develops execution, and the options fighter develops decisions. Keeping those efforts
independently useful, scoring physical outcomes independently, and extending registration only
when a working implementation needs it are sound choices.

The main concern is scope: the next Arena milestone includes several projects that could delay
useful results. The recommendations below identify scope and contract decisions to settle;
they remain proposals alongside the implementation sequence above.

### Smaller first deliveries

Two useful early deliveries are club-and-buckler fighting on the open stage, and an existing
fighter navigating around a column. Either gives a useful result independently. Then add the
sword and combine the equipment with obstacle fighting.

Move the full Crypt navigation migration and low-furniture recovery work into subsequent
deliveries. They belong in the direction, but neither needs to block demonstrating a useful
Arena testbed. Keep E2's early blade fixture: resolve the risky contact representation before
investing in sword actions.

### Navigation requests and ownership

Specify the navigation request before implementing the navigator. Today `Orders`
(`src/core/mind/orders.ts`) carries a movement direction; its `destination` field is a remaining
distance, not a position. `Intent` also carries a velocity. Tactics asking for a place therefore
introduces a new contract.

Distinguish direct movement, travel to a destination and combat positioning. Keyboard strafing
preserves its meaning; approaching an opponent seeks a suitable fighting position rather than
routing into the opponent's occupied centre. Define who owns arrival tolerance, facing,
stopping, cancellation and the response to a stalled route.

A route that exists geometrically and one the selected gait can negotiate are separate
readings. The Crypt's `DungeonRun.follow` and `straightOf` already handle progress and corner
braking; a visibility graph alone does not replace those responsibilities. Moving that work
into the core also requires its arithmetic to satisfy the core's exact-math boundary.

Decide whether the first navigator receives the complete static map. That is a reasonable
initial permission, but it is explicit and shared across compared implementations. Geometry
permissions and visibility of opponents are distinct decisions.

### Shield orientation, cover requests and compatibility

The existing guard (`src/core/skills/guard.ts`) positions one or two points. Two points constrain
a line without fully determining a buckler's face. Use the existing `EffectorGoal.orientation`
(`src/core/control/effector-tracker.ts`), or sufficient noncollinear points, to specify that face.

Registering a shield guard and supplying it useful cover requests are separate requirements.
The current cover reflex (`src/core/mind/options/reflex.ts`) chooses a hand by the threat's
side. With one shield hand, that choice needs equipment awareness.

Include an incoming strike while the opposite hand attacks, followed by interruption and
recovery hand-back, in the first demonstration. This exercises the composition the equipped
fighter needs, beyond interception on a fixed rig.

Replace `strikesWithAll`, but describe the static requirement as declared equipment support.
An assembly's `fits` check establishes that its parts support the loadout and command legal
effectors; the physical task establishes whether the fighter uses the equipment effectively.

### Sword contact representation

Impact-only cutting is a good first model. Keep drawn cuts, penetration geometry and mesh
slicing outside this milestone.

There is an implementation trap in E2: the existing `"region"` branch in `surfaceOf`
(`src/core/rules/blows.ts`) denotes an anatomical region and returns `item: null`. A sword
region retains both its item identity and its region identity, including the item-frame
direction transform. It cannot simply become an anatomical region.

Specify what happens when edge, flat and tip shapes contact during the same impact. The current
impact path selects the strongest contact pair for pricing. Region geometry and selection must
avoid duplicate energy or accidental classification at seams. Include mixed-region and seam
cases in the small physical fixture, with representative blade speeds at 120 Hz, to establish
that the intended surface contacts and is classified correctly.

### Sword thrust pricing

Treat thrust pricing as an explicit gameplay decision. The proposed thrust inherits the
reptile's sustained-load rule. It does not use the rulebook's point-energy multiplier: the
current impact path excludes pointed injury, and the load path prices it separately
(`src/core/rules/blows.ts`, `src/core/rules/rulebook.ts`).

Consequently, the existing weapon energy ratios do not establish the balance between sword
cuts and thrusts. This may be the intended result. The initial sword demonstration should
reveal whether sustained tip pressure dominates cutting. Keep the shared rule initially and
change it if that exposes a concrete problem; the reptile calibration alone does not validate
the sword model.

### Recovery scope and capability claims

Preserve the canonical 64-fall target exactly. V3 proposes adding an obstacle condition to the
owner's target, while the whole-body plan preserves the original battery's scope. Keep
`research/rising-bed.mjs --target` as the existing 64 falls and add a separately named obstacle
suite. They can share builders and reporting without changing what completing the owner's
target means.

V3 calls obstacle recovery a supported feature, but its gate permits every recovery to fail
provided failure is reported correctly. That establishes supported testing and execution.
Successful obstacle recovery remains a separate capability claim. Keep that distinction
visible, especially when admitting low furniture.

### Recording identity

Replacing incompatible recordings without migrating them is appropriate. Still, a recording
from another rules, body or level revision should fail clearly when exact playback is
unsupported. Carry a protocol/build identity with recordings and evaluation results. A recipe
link can intentionally rerun a configuration on current code; an exact replay makes a stronger
promise. Old-build support is unnecessary, but silently interpreting an old recording as
current is misleading.

### Implications for the other plans

Component interchangeability needs declared limits. A gait, attack and motor can all be
individually valid yet compose poorly because of different support assumptions, trunk ownership
or interruption behaviour. The workshop's transition tasks address this. Make the assumptions
concrete as the first incompatible combination appears, rather than promise that every set of
individually compatible parts works together.

Keep tactical research matched to execution reliability. The options plan distinguishes poor
decisions from requests that cannot be executed. Prioritize that diagnosis before richer
option models or lookahead. If a request routinely cannot be carried out, a more sophisticated
value model can spend considerable effort predicting unreliable execution.

### Alternatives worth considering

- **An early learned recovery experiment.** The plans already permit learned control; elevate
  it to an early, bounded competing approach. Start with recovery alone through the existing
  observation/actuation boundary and independent verifier, with authored navigation and tactics.
  This tests whether continued investment in hand-built recovery is the best route without
  committing the whole game to learning.
- **Separate research and playable defaults.** If near-term playability is a priority, an
  explicitly assisted preset could target shorter recoveries and more dependable exchanges
  while the zero-assist goals remain intact. The same core serves both purposes. This is a
  prioritization change, not evidence that the unassisted problem is solved.
- **A smaller game-facing configuration surface.** Keep the full component editor for the
  workshop, but offer one recommended assembly per body/loadout and a few demonstrated player
  choices in ordinary play. Requiring players to assemble compatible motors, guards and
  executors could overwhelm the combat experience. Preserving research implementations does
  not require presenting every one equally in the game.

### Recommended start

Begin E1, the E2 physical fixture and V1. Before V2 and E3, settle the navigation request and
shield orientation/cover contracts. The overall direction does not need a rewrite.

This review is based on the four plans and the relevant source paths. It adds no simulation
measurements or claims that the unfinished capabilities are met.
