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
Rogue for the first equipped fighters; preserve existing compatible bodies and controllers.

## Sequence

| Step | Deliverable | Exit condition |
|---|---|---|
| 1 | Level definition and selection | Open stage and obstacle court construct consistently in the page, headless runner, links, saves and replays |
| 2 | Navigation task and reference navigator | Actual fighters reach a target around an obstruction and respond to a blocked or changed route |
| 3 | Explicit loadouts | Both hands can carry assigned compatible items with correct physical load, appearance and recipe identity |
| 4 | Buckler and guard | Club-and-buckler fighters physically intercept attacks while moving and retaining the other hand's control |
| 5 | Cutting fixture, then sword skills | Edge, flat and tip contacts behave distinctly; cut and thrust actions execute and return under control |
| 6 | Integrated Arena round | Named equipped fighters run on both levels, with results and failures inspectable from reproducible recipes |

Environment work (steps 1-2) and equipment work (steps 3-5) are independently useful workstreams.
Develop navigation first with the existing club, and the initial equipment on the open stage,
then combine them. Land small changes at each step.

## Environment: level recipes

Introduce a stable level selection in the bout recipe. The initial proposed ids are `open` and
`obstacle-court`; keep the current stage as the default for recipes and links that omit a level.
A level definition owns its physical solids, visible placement descriptions, valid starting
positions/headings and the geometry granted to senses. Its resolved definition and revision
participate in construction, save/load, replay and evaluation identity.

Build on `src/arena/room.ts` (`arenaSolids`, `addArenaSolids`, `validateRoomPlacements`) and
`src/core/mind/object-senses.ts`. Use one resolved definition for colliders, their corresponding
visible pieces and sensed geometry. Extend the room's collider/visual checks to the chosen
level. Reachable solid-looking props have matching colliders; decorative geometry carries no
collision or hit authority.

Thread the selection through `src/arena/matchup.ts`, `main.ts`, `scene.ts` and `duel.ts`, and
through `research/bout.mjs`. The browser and Node runner must not independently invent the
obstacle placements. World-building arithmetic keeps the exact-math boundary, including any
new module that contributes geometry or spawn poses.

The level owns valid spawn pairs and the allowed effect of a starting-gap adjustment. Validate
body/loadout clearance and refuse invalid configurations before play. Preserve an old recipe's
meaning; loading a checkpoint still requires matching world construction. Explicitly record
any placement variant or seed if generated variants are introduced later.

The obstacle court is initially an authored, flat-floor layout with columns and a few low stone
tombs or static barrels. Include clear routes around obstacles, space to fight beside them and
valid spawns that can require a detour. Keep barrels fixed in this milestone. Retain the current
sensing policy initially: physical obstacles block motion and weapon contact, while sight
occlusion is a separate experiment.

Acceptance covers selected/default level links, safe spawns, physical/visual correspondence,
headless construction and exact recorded replay. Keep the existing open-stage match as a
reference condition; results on a new level name that level and protocol.

## Environment: navigation

Add a replaceable navigation component between tactical movement objectives and locomotion.
Tactics chooses the desired position or fighting range; navigation chooses a route;
locomotion executes movement. Retain immediate clearance steering
(`src/core/mind/clear-step.ts`) to deal with local obstruction.

The navigator reads permitted fixed geometry and current observations, without world or engine
handles. Start with a small waypoint or visibility graph over collision-derived footprints.
Use the body's clearance requirements and account for carried equipment where relevant.
Geometry helpers can be shared with the Crypt when their inputs satisfy this boundary; the
core does not import a screen's map or planner.

Save route, waypoint progress, replanning and stuck/retry memory as ordinary participant state.
Replan when the destination or relevant conditions change, and report unreachable or stalled
movement explicitly. Avoid an implementation that repeatedly switches sides of a column without
making progress. Reachability and physical execution are separate observations.

Build a shared headless/visible task on `src/core/tasks/environment.ts` that exercises detours,
corners, constrained passages, changed destinations and blocked routes. Include several start
conditions and both side assignments, and verify that the fixture has a route before judging
execution. Score the body's actual progress, contacts, falls and arrival independently of the
planner's path. Use a short execution floor in the software gate and broader navigation
capability cases separately.

Acceptance requires a reference controller to move an actual fighter around an obstruction,
reach the task's destination and repeat through save/load and replay. Path generation alone
does not complete this step. The task becomes a development target for alternative navigators
and locomotion implementations.

## Equipment: loadouts

Replace the Arena's one-item-in-the-right-hand selection with explicit item instances and
attachment/grip assignments. Give instances stable identities and validate compatible mounts,
grips and occupied hands. Initially expose left/right choices for the supported humanoids;
keep the underlying description tied to actual body capabilities.

Build on `src/core/items/held.ts`, `src/core/human/grip.ts`, `src/core/build/rigid.ts` and
`src/core/models.ts`. Rigid attachment to a hand is sufficient for the first one-handed items.
Use the separate-equipment/grip path (`src/core/equipment.ts`,
`src/core/mind/equipment-port.ts`) when an item actually needs independent motion or grip
changes. Two-handed weapons and dropping/regripping items remain later work, with
`src/core/tasks/bar.ts` as existing apparatus.

The first loadouts are empty hands, club alone, club plus buckler, short sword alone, and short
sword plus buckler. Support assignment to either compatible hand and validate each side's Mind
against the whole loadout. Existing `held` selections and links resolve to their equivalent
loadouts; saved-world construction guards remain strict.

Physical mass, center of mass, inertia, shapes, contact ownership and hand pose must reflect
what is carried. Rendering and editor labels read the same item definitions. Propagate loadouts
through recipes, UI/link serialization, construction, sensing, recorded commands and match/job
identity. Keep each body's anatomy and muscle limits unchanged by equipment selection.

Acceptance includes both hands carrying distinct items, correct attribution of contacts and
physical load, rejected invalid assignments, legacy links, and fork/replay of equipped bouts.
If grip changes enter gameplay, record their accepted commands and application steps before
claiming action-recording replay for that path.

## Equipment: buckler

Add a small center-grip buckler with its physical shape, mass, inertia, attachment frame and
protective face described in the item spec. Source its initial physical values as required by
the repository's spec rules. Start with a simple visible model whose collider can be inspected.
Item durability and breakage are outside this milestone.

The buckler blocks by occupying space and transferring physical contact loads. Add a shield
guard component that positions the protective center and faces its surface toward the threat,
using the existing effector position/orientation support
(`src/core/control/effector-tracker.ts`). Build on `src/core/skills/guard.ts`, with explicit
shield requirements and compatibility. A covering line alone is not the shield-face contract.

Start with a usable protective posture, then reactive placement. Guard, locomotion and the
opposite hand's attack use the normal ownership and interruption paths. The guard does not
move the item or body outside muscle control, and its reported blocking state cannot award
protection or damage immunity.

Acceptance covers actual intercepted and bypassing attacks, resulting contact/impulse paths,
movement with the added load, and attacking with the other hand while the shield remains under
control. Exercise falling and recovery with the loadout, recording existing capability failures
separately from software faults. Show club-and-buckler bouts on the open stage before judging
them in the obstacle court.

## Equipment: cutting rule and short sword

First resolve the cutting rule in a small shared physical fixture. `src/core/rules/rulebook.ts`
already names `edge` damage and its sourced conversion, while
`src/core/rules/blows.ts` currently classifies blunt and pointed surfaces. The reptile's
directional piercing/contact-load path is useful shared infrastructure for the sword tip;
its coefficient does not define a cutting edge's behavior.

Give equipment contact surfaces enough geometric identity to distinguish cutting edges, blade
flats, guard/hilt and tip. Extend surface attribution through `src/core/spec/body.ts` and
`src/core/build/rigid.ts` as needed. Share injury, surface and contact accounting across anatomy
and equipment. The sword's rules do not import the reptile's bite policy or depend on an
executor saying that it is attacking.

The cutting prototype must choose and specify:

- How contact position and blade orientation distinguish edge, flat and tip.
- How real contact load and relative motion admit impact cuts and drawn cuts.
- How injury accumulates during sustained contact without repeated solver points or support
  impulses creating unintended extra damage.
- How cutting, piercing and blunt injury combine without charging the same event twice, and
  how their quantities relate to the existing sourced mechanism conversions.

Use a simple, explicitly calibrated game rule. Source new coefficients as physical evidence or
owner design decisions, and write the rule in terms of quantities available to the shared
contact path. Its physical fixtures cover an aligned edge strike, a drawing contact, a flat
strike, a thrust, a miss, and a resting blade. Distinguish rule-contract checks from capability
measurements. Preserve blunt-contact and reptile-piercing contracts.

Then add a one-handed short sword with the corresponding physical surfaces and a cut and a
thrust action, including preparation, commitment, controlled return and interruption. Reuse or
extend registered executors, the action lifecycle and surface-aim machinery. Equip it alone
first, then with the buckler,
and exercise reach variation, moving targets, self-injury, balance and simultaneous guard.
Use existing injury and severing rules; dynamic mesh slicing is outside this milestone.

Acceptance requires the fixture's outcomes to depend on actual contacted surfaces and motion,
followed by muscle-driven cut/thrust actions and inspectable sword-and-buckler bouts. Freeze
the implemented cutting protocol before making comparative damage or fighting-strength claims.

## Integration, checks and completion

Use the same level, loadout, rules and participant configuration in the Arena page, task runners
and Node matches. Include the resolved level definition, item assets, cutting rule, controller
code and engine configuration in run/cache identity. Keep results by level, loadout and opponent;
an empty-stage result is not an obstacle-court result.

The milestone completes when the owner can select either level and the supported loadouts,
run reference fighters through the normal control/combat path, and inspect shared recipes and
exact action-recording replays. Demonstrate navigation around obstacles, physical buckler
interception, and sword cutting/thrusting in integrated bouts. Report software validity,
individual capabilities and competitive quality as separate outcomes. This does not establish
the unfinished fast stand-up, running or strongest-fighter goals.

Use `AGENTS.md`'s normal gate for implementation: `npm run check`, `npm test`, and
`npm run build` for browser/assets changes. Run relevant slow tests by name, keep new tests fast
or register them in the slow tier, and use capability suites when evaluating those capabilities.
Inspect visible changes briefly and leave motion acceptance to the owner. A feature does not
require a broad tournament or a new measurement record. Update the architecture, README and
roadmap as behavior lands, and remove this plan when the milestone is complete.
