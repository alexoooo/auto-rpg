# Arena combat controller

## Outcome

A controller that creates room for driven attacks, lands useful blows against active opponents,
protects itself, and wins substantially more often than Classic and tracked Point control on
unchanged bodies, muscles, damage rules and gameplay physics. The first playable gate is two unarmed Warriors fighting each other, with falls continuing
into attempted recovery and with low strikes against grounded or rising opponents. The owner
authorizes starting this entire improvement loop on Warrior fist fights. Extend evaluation to
Rogue and club use afterwards; report Skeleton separately while its anatomy contains placeholders.

This work follows the shared [control foundation](2026-10-04-control-foundation.md). The initial
baseline is recorded in [autonomous combat](../reference/arena-combat.md). The remaining chunks
below are implementation work. The core has an experimental `arena-fighter` and measured
straight and close curved trajectories; it is exposed experimentally and is not competitively promoted.

The current physical and autonomous prototype measurements are in
[combat strikes](../reference/combat-strikes.md). Straight punches repeat with both hands and
misses on the unpinned gameplay body. Terminal velocity, moving path identity, explicit-order
priority and fresh-world strike/return replay are gated. Self-play takes initiative and breaks
prolonged pressure, but most blows meet the guard. Hull/capsule/box surface selection, both-hand path ranking and detached contact response are implemented, including lateral
escape after repeated physical blocks. Sensed boundaries and experimental defense reach/timing are implemented. The predictive
variant remains optional after reduced initiative in self-play. Low support transitions,
low support and competitive promotion remain. A torso-preferring mixed candidate wins 40/40 development cap bouts against linear Combat; held-out evaluation and decisive striking remain. Built Warrior fist play is inspected.

## Why the current controller fails

`trackedEngagement` in `src/core/mind/engagement.ts` targets the head and admits a broad placed
reach window. `pointFighter` supplies an empty searched repertoire. `strikeSkill` in
`src/core/skills/strike.ts` executes one straight point stroke, freezes movement through its
preparation and outbound phases, and returns on any new external hand contact. The skills give
that strike priority over locomotion except during return. The prepared home point can already
be crowded by the opponent. Neither tactics nor the preparation gate requires a clear stroke.

The previous engagement benchmark's opponent receives movement/standing orders and never
attacks. Contacts followed by returns are mechanical progress, not a combat objective.
The autonomous Warrior baseline reproduces sustained hand pressure and many returns with very
little damage. The mixed and Classic bouts also expose falls and stalled placement. These six
cases identify failure modes; they establish neither win rates nor general motion capability.

## Controller design

Keep tactical selection separate from physical execution. A replaceable combat policy chooses
space, a hand, an observed target surface, a strike family or a defensive action. A shared
combat skill executes a measured trajectory, guard and footing through the existing body
command and muscle limits. A new `arena-fighter` MindConfig keeps Classic and Point available
for comparisons. Its mutable perception, action and trajectory memory lives in bout state.

Priorities are recovery, immediate threat response, escaping crowding or a stalled action,
then exploiting an opening. Idle is a useful guard at fighting distance. Visible initiative is
required: two equal controllers must not continually wait for the other to attack.

1. **Space before stroke.** Compute a hand/weapon-specific working distance from the actual
   chamber, intended contact surface and complete stroke, rather than the arm's maximum reach
   alone. Estimate closing velocity and brake before entering the opponent. A crowded or
   blocked chamber asks for backward or lateral movement even before a stroke has launched.
   Repeated failed attempts trigger an angle or target change. Forward retreat is not the only
   escape; select a physically reachable side step when the approach remains blocked.
   Respect sensed solid arena boundaries rather than backing into a wall. Grant fixed geometry
   through `mind/object-senses.ts` from trusted Duel wiring; policies receive detached geometry.
2. **A measured attack repertoire.** Start with a fast straight and a stronger straight using
   controlled trunk rotation/weight shift; then add an arc around a guard and a downward club
   stroke. Use body-relative hand/item paths and joint-range-bounded trunk objectives, with
   clear chamber space and explicit desired velocity at contact. Sweep execution time, path,
   footing and torso participation on the real body. Return and guard readiness are measured
   from actual motion, but a combination need not stop the entire body between every stroke.
3. **Openings and initiative.** Evaluate exposed head and upper-trunk surfaces from sensed
   poses and collision shapes, including the opponent's forearms/items obstructing a path.
   Choose the reachable hand/path with useful predicted contact and acceptable balance/return
   cost. Maintain action commitment; retargeting must not restart a trajectory every tick.
   Use a bounded sequence such as a short lead-hand attack followed by the other hand if an
   opening persists. Choose timing/offsets deterministically from ordinary sensed state and
   saved policy memory; equal fighters must resolve mirrored indecision without privileged IDs.
4. **Defense that changes the next action.** Use relative point motion, including own head
   motion, to estimate incoming contact time. Place the available guard on a reachable intercept;
   step away or cancel an unlaunched attack when guarding cannot arrive. Detect blocking versus
   a free lane geometrically. Recover or counter after the observed threat passes. Never read
   the opponent's controller phase, orders, health or future simulation state.
5. **Contact with meaning.** Treat a block, target contact, incidental touch and persistent
   pressure separately, using trusted detached contact identities/normal/impulse and sensed
   geometry. Physics still decides whether a blow exists and its damage. Stop pushing after an
   obstruction and create a new opening. Repeated low-progress contact cannot count as attack
   success. Contact memory must identify the actual hand/item and survive recovery and replay.

The first executor uses the shared stance/IK/muscle path. If that path cannot produce useful
speed and survive misses/blocks within sourced muscle limits, replace the executor behind the
same combat action contract with the independent motion-controller route. That is a measured
branch, not permission to inflate strength or switch solver profiles silently. Offline search
or a learned motion policy may supply primitives; a learned tactical policy may select them.
No particular learning algorithm becomes part of the physics/body contract.

## Landable chunks

Each chunk runs `npm test`, `npm run check`, `npm run build`, the normal/ignore-CR diff gate,
then commits. Freeze files while research fingerprint checks run. Preserve every failed case.

1. **Autonomous baseline (landed).**
   `research/arena-combat-probe.mjs` and `docs/reference/arena-combat-baseline.json` reproduce
   Warrior self-play and mixed old controllers through ordinary Duel/World.step.
   Extend it into `research/arena-combat.mjs` (trial/accounting) and
   `research/arena-combat-run.mjs` (two-worker queue) with recorded model/loadout/mind profiles,
   sense delay, recovery rule, initial spacing, outcome, falls, active-host phase time,
   contact-pressure episodes, real blows and actual elapsed time. Add
   `tests/arena-combat.test.mjs`: contact accounting excludes self-contact, hand-contact damage
   includes no claim of a striker, and pressure cannot score as a driven launch.
2. **Break crowding and stalled preparation.**
   Add `src/core/mind/combat.ts` for working-distance/closing-speed decisions and
   `src/core/skills/combat.ts` for explicit locomotion ownership during pre-launch escape.
   Share predicates rather than privately copying range/contact rules. Extend
   `src/core/mind/intent.ts`, `src/core/skills/skills.ts` and `src/core/mind/config.ts` with the
   new neutral action/skill and `arena-fighter` kind; wire through `minds.ts`.
   `tests/core-combat-skill.test.mjs` and `tests/arena-combat.test.mjs` require real separation
   after a blocked chamber, forward/lateral approach, explicit player-order priority, and
   fresh-world replay during an escape, including a wall-constrained start reached through
   ordinary movement orders. Physical self-play must reduce persistent pressure;
   simply remaining at a safe distance indefinitely fails initiative acceptance.
3. **Prove powerful primitives before clever tactics.**
   Add `src/core/skills/attack-path.ts`, reusing `control/point-path.ts` and body/item geometry.
   Extend `HandGoal`/the motor path in `src/core/control/motor.ts` only as required to carry
   contact velocity and segment-wise paths; preserve existing Point/Classic behavior.
   `src/core/skills/combat.ts` composes supported footing and bounded torso objectives using
   `skills/locomotion.ts` and the existing `StanceGoal`. Do not overwrite bearing-leg torque.
   Add `research/combat-strikes.mjs`: sweep straight paths, body participation and club arcs
   against free targets, fixed obstructions and misses on Warrior, Rogue and Skeleton.
   Record driven pre-contact velocity/energy, actual damage, path error, muscle saturation,
   support, return and falls in `docs/reference/combat-strikes.md`; source each retained setting
   there. Ignore struck peaks and startup. Reject a primitive that only wins by throwing its
   body or weapon. Validate contact velocity and path continuity under mutation tests.
4. **Opening selection and continuous combinations.**
   Add `src/core/mind/openings.ts` using sensed collision geometry to rank hand, surface,
   straight/arc path, travel time and obstruction. Finish `src/core/mind/combat.ts` and
   `src/core/mind/arena-fighter.ts` over the proven executor, including finite sequence and
   deadline memory. Derive target surfaces from `BodySense.spec`, not visible meshes.
   Tests use a real raised guard and moving target: blocked head leads to a reachable body
   attack or angle change, exposed target receives a driven blow, target movement does not
   restart the committed clock, and two equal unarmed controllers show repeated initiative.
   Fork before selection and between sequence actions and compare complete state/motion.
5. **Defense and contact response.**
   Extend `src/core/mind/threat.ts`/`control/intercept.ts` with own-target relative motion and
   a reach/time predicate consumed by the new policy. Add detached contact identity/normal
   readings in `control/hand-feedback.ts`/`body.ts` through trusted wiring, not engine handles
   in policy inputs. `guard.ts` and the combat skill leave one hand available and resolve
   cancellation before launch, blocking and return. Tests cover slow pressure, fast incoming
   hands/clubs, both sides, unavailable guard, observed recovery/counter windows, physical
   guard contacts and replay across takeover. Run defense enabled/disabled ablations.
6. **Arena exposure, evaluation and promotion.**
   Add selectable Combat control to `src/arena/matchup.ts` and the arena's controller inputs
   in `index.html`/`src/arena/main.ts`; show actual prepare/strike/defend/escape status and
   preserve recipe/tape/snapshot compatibility. Evaluate frozen held-out recipes only after
   tuning stops, against attacking Classic, attacking tracked Point, and new-controller
   self-play. Mirror model, mind and equipment assignments. Vary gap, sensed delay and body
   proportions through documented valid specs; duplicate deterministic bouts are not samples.
   Inspect two unarmed Warriors and mixed armed bouts in the built browser; record rate,
   visible striking/defense/escape and cost with two active fighters. Stop the owned server.
   Update architecture, roadmap and reference records; delete this plan when it lands.

## What counts as stronger

Mechanical strike/return gates remain required, but promotion uses active combat:

- Real driven attacks, target damage per simulated second and damage received, attack-to-damage
  conversion, hand/item impact speed before contact, incapacitation time, self-falls and actual
  win/draw/loss. Label incidental and fall-driven damage separately; the evaluator may inspect
  blow records, while the policy only receives body observations/senses.
- Self-play must produce repeated driven blows or defensive/escape responses without long
  pressure-only episodes or permanent mutual retreat. Measure episode duration, not just touch
  counts. Define the stall predicate and freeze its thresholds from the baseline before tuning.
- Proposed promotion target: at least 70% paired win score against each old controller, with
  draws worth half and a reported 95% confidence lower bound above 50%; at least 100 distinct
  held-out opponent/recipe pairs per baseline. These are engineering acceptance proposals,
  not achieved results. Treat mirrored bouts as one paired recipe when estimating uncertainty.
  Retain Warrior/Rogue and empty/club strata rather than averaging away
  a failing loadout. Report default fall-ending and long-recovery rules separately.
- A majority of wins against tracked Point should end before the cap through ordinary wound
  rules with observed driven attacks. Publish ending types and incapacitation times separately:
  an opponent's unforced fall or a tiny health advantage at the cap cannot establish powerful
  striking. This is also a proposed target, pending measured capability.
- Clean attack damage rate should materially improve across loadouts; the initial target is
  twice tracked Point's rate without more self-caused falls. Publish paired damage deltas and
  uncertainty; a ratio against a nearly zero baseline is insufficient by itself.
- Compare defense and repertoire ablations. Require serial/fresh-world replay and browser
  frame/step costs. The complete two-body world plus rendering must fit its measured game
  budget; use bounded heuristic candidate selection first. Live full-physics planning is a
  separate optimization only after a measured budget permits it.

## Learning route

Motion imitation plus task objectives is a credible later executor route: DeepMimic demonstrates
physical martial-arts skills and adaptation across bodies
(https://xbpeng.github.io/projects/DeepMimic/index.html). Its results do not validate this Rapier
world or its muscle contract. Start training with measured successful motions and opponent
mixtures, then retain self-play history to avoid learning only one opponent. Train and evaluate
through the same body/actuation/contact contract; learned selection or execution must pass the
same real combat gates as the reference controller.
