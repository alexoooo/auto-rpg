# Warrior bonk

## Goal objective

Make Option Mind's toed Warrior perform a recognizable, controlled club bonk with either hand:
chamber above the target, deliver an effective head strike with the club's swell, follow through
and return to a settled guard. Meet every gate below on the complete confirmation suite, unassisted,
with the club alone and with the buckler in the opposite hand. Preserve paired attack
effectiveness and affected recovery and movement performance. Deliver saved evidence, passing implementation checks and
versioned drill links after watching their reels, failures first, at normal speed and slow motion.
The autonomous objective ends ready for review; only the owner accepts the rung.

## Scope and starting points

Use `workshop-fighter` at default attributes, whose record key is `workshop-fighter+toes`, with
`empty,club`, `buckler,club`, `club,empty` and `club,buckler` loadouts. Both fighters have zero
balance assistance. Train the bonk at the `high` mark. A horizontal trunk swipe is a separate use,
with its own Option if retained;
training that use or the other bodies' club attacks is outside this objective.

Begin development with the right hand and club alone. Reuse bilateral mirroring where its
contract fits, then verify each physical hand independently. A mirrored record or a pass on one
hand does not establish the other hand's motion, clearance, contact or effectiveness.

The relevant implementation is:

| Owner | Starting point |
| --- | --- |
| Swing execution and record | [swing.ts](../../src/skills/strikes/swing.ts), [swing-part.ts](../../src/skills/strikes/swing-part.ts), [club record](../../assets/skills/strikes/club-blow/club-blow.json) |
| Physical stroke lifecycle | [strike-cycle.ts](../../src/skills/strikes/strike-cycle.ts), [effector-strike.ts](../../src/skills/strikes/effector-strike.ts) |
| Option configuration | [Option Mind](../../src/entrants/option/mind.ts), [strike kinds](../../src/minds/option/kinds.ts) |
| Drill cases and readings | [cases.ts](../../src/evaluation/strike/cases.ts), [read.ts](../../src/evaluation/strike/read.ts), [index.ts](../../src/evaluation/strike/index.ts) |
| Search and objective | [swing search](../../research/skills/strikes/swing/swing-drill.mjs), [score.ts](../../src/evaluation/strike/score.ts) |
| Item geometry | [club.ts](../../src/core/bodies/items/club.ts), [held face](../../src/skills/strikes/held-blow.ts) |

The swing holds its windup posture beneath independently timed muscle pushes; an unpushed
channel follows that posture. Preparation accepts a channel at its requested angle or moving
slowly. Release asks for guard and ends on a timer. Treat their contribution to visible flailing
as hypotheses to reproduce before selecting a repair.

The Strike reader measures return proximity and speed after the action ends; its landed outcome
does not require that return. The club Option targets the trunk with a surface aim. Bind the
bonk's target and aim explicitly, and distinguish physical contact and recovery from lifecycle
labels when extending the reader.

Reuse or extend existing training and evaluation scenarios where they fit. Add bonk-specific
cases, readings, training adapters or a skill implementation where needed. Keep physical rules
in core, tracking in control, attack execution in skills, choices in Options and measurement in
evaluation. Application composition supplies concrete registrations. Shared pieces remain
body-neutral; the Warrior's settings live in immutable skill records. Rendering follows physics.

## Motion contract

Declare continuous chamber, stroke, follow-through and return courses with their hand positions
and club and trunk orientations. The stroke is one overhead or diagonal descending arc; its chamber puts
the swell at least 0.25 m above its intended contact point, and its contact tangent descends at
least 45 degrees below horizontal. The shaft sweeps through at least 45 degrees and at most
150 degrees during the stroke. These bounds distinguish a bonk from a horizontal swipe, a
downward shove or a spinning club.

Construct the stroke course from the observed target and declared technique at commitment,
in a fixed world frame. Keep its geometry fixed through the stroke, including a miss. Validate
the course's descending shape independently of execution; it cannot contain loops, repeated
windups or extra oscillations. Derive hand and orientation courses from the same technique.
The reader measures simulated motion against these courses; it cannot fit a reference to the
observed trajectory. Preparation may track the sensed target; recovery uses the guard relative
to the chest. A target moving out of the frozen stroke produces a miss rather than a new arc.

Read club geometry from its declared swell and shaft, and track the striking hand, club
orientation, wrist channels and trunk. A plausible club-head path alone cannot establish a
controlled limb. Use continuous joint angles and quaternion angular distances across wrapping.

## Gates

These engineering limits define the intended motion. Freeze them and the course construction
before training. An implementation defect in a reader is corrected with its evidence reread;
a failed candidate does not justify relaxing a limit or changing confirmation cases.

| Gate | Requirement |
| --- | --- |
| Complete attack | A contact case passes only when the same attack meets preparation, directed stroke, limb and trunk control, effective head strike, recovery and safety requirements, with complete case coverage. One failed or unverified requirement fails the attack. Component passes from different cases cannot combine into a successful attack. |
| Preparation | From admission in an eligible standing entry, reach the declared chamber within 1 s. Hold the swell and hand within 0.05 m of their chamber positions, their speeds relative to the chest at or below 0.3 m/s, and club orientation within 10 degrees of its chamber orientation for 0.1 s before commitment. A stalled limb elsewhere fails. |
| Directed stroke | Complete the stroke and follow-through within 0.5 s of commitment. Outside collision, keep the swell within 0.10 m and the hand within 0.05 m of their declared courses. Cumulative backward progress along the stroke course is at most 0.05 m. |
| Limb and trunk control | Outside collision, keep club and chest orientations within 15 degrees of their courses. For each phase, excess angular travel above each declared orientation course is at most 15 degrees. For each wrist channel, cumulative reversals away from its declared phase direction are at most 15 degrees. Keep chest tilt within 30 degrees of upright throughout the attack. Apply the same accounting to preparation and return so chatter cannot move between phases. |
| Effective head strike | Identify the first blunt impact from the swell's collision shape on the requested head region during the committed stroke. Its pre-impact motion must meet the contact descent bound, and it must deliver at least 60 J, using the existing physical impact-energy calculation. A weak first impact fails; a later impact cannot replace it, and energies cannot be added across contacts or attacks. Hand, haft, windup and return contacts cannot satisfy the gate. |
| Recovery | Within 1 s of the physical stroke's end, return the swell and hand within 0.05 m of their guard positions relative to the chest, with speed at or below 0.3 m/s and club orientation within 10 degrees of guard. Hold all conditions for 0.2 s before becoming ready again. A deadline expiry fails; elapsed time cannot establish recovery. |
| Safety | Remain upright throughout preparation, stroke, collision, return and the following 0.5 s. Admit no penetration between nonadjacent body segments or between the club and the body outside its grip. Measure geometric clearance even for collision-filtered pairs; exclude only the spec's joint overlap and intended grip geometry. Keep the club gripped and require zero assistance. |
| Contact repetition | Complete ten consecutive successful contact attacks within 30 s after the first admission, each beginning only after verified recovery. Every cycle meets the complete attack requirements, including its own effective head strike. One weak hit or failed recovery fails the sequence. |
| Miss handling | An unobstructed miss meets preparation, directed stroke, limb and trunk control, recovery and safety requirements without relying on impact to stop. Report its result as "miss recovered safely" or failed handling. It cannot count as a successful attack. |
| Cancellation handling | A precommit cancellation never launches, maintains control and safety, returns within 1 s of cancellation and releases resources only through a safe handover after verified recovery. Report its result as "cancelled safely" or failed handling. It cannot count as a hit or a successful attack. |
| Effectiveness | On identical contact cases, preserve or improve the baseline's intended-hit share and median impact energy over all requested attacks, counting a miss as zero. Report each hand, loadout and rate separately. The energy floor for an effective head strike applies to every required contact attack; a mean or median cannot compensate for a weak hit, and meeting the floor cannot excuse a baseline regression. |

Measure cumulative backward progress from successive nearest positions along the simple course,
with a fixed tie rule; never move the course to absorb an error. Measure orientation travel as
the sum of shortest quaternion angular increments, and wrist reversals from signed joint-angle
increments against the phase's declared direction. Split a course into explicit monotonic
angular phases before execution where a deliberate change of direction is required; do not
split phases retrospectively to hide reversals.

The collision interval runs from the first physical contact impulse through the last contiguous
contact, plus 0.05 s for recoil. It exempts path and angular tracking only, never safety, effective
head strike or recovery. Cap that exemption at 0.15 s from first contact; prolonged contact fails
the stroke gate. An unobstructed miss has no exempt interval. Continue measuring all motion
during impact and report it. Do not substitute a global acceleration or jerk limit for these
phase readings.

The physical stroke ends at the declared follow-through endpoint, or a measured impact stop
followed by withdrawal; its deadline starts a failed return rather than completing the attack.
Record the reason and time independently of the executor's phase labels. The human `BAR`,
including its 64.8 J [held-blow reference](../reference/human-strike-reference.md#2-one-handed-stickclubbaton-and-bats-as-a-two-handed-ceiling),
remains a reported scale. The task's energy floor is a separate acceptance requirement.

## Cases and confirmation

Use Node's bout world on the vendored Rapier at 120 and 480 Hz, with the same physical command
delay in seconds and Option Mind's normal decision rate. Name both explicitly in every record.
Evaluate motion limits at each rate's native steps; compare faster trajectories at the slower
rate's spacing. Use the browser reel to verify the same recipes and simulated poses.

Declare and freeze a useful entry window before training, initially using the club record's
range and lateral window. Do not shrink it to exclude a failed case. Let `u` and `v` name
normalized depth and lateral position in that window: `u = 0` is its near edge, `u = 1` its far
edge, `v = 0` its centre and `v = -1, 1` its lateral edges relative to the striking hand. Mirror
the geometry when changing hands. All cases use calm air. Place the standing target relative to
the actual eligible entry, rather than treating an initial head-to-head gap as admission.

| Suite | Cases per hand, loadout and rate |
| --- | --- |
| Development screen | Standing contact at `(u,v) = (0.5,0)` is the primary attack screen. Keep one matching unobstructed miss and one precommit cancellation as separate handling checks. Start with the club alone in calm air; widen after the failed gate is understood. |
| Development contact | Depths `0.1, 0.5, 0.9`, each at lateral positions `-0.8, 0, 0.8`, starting heading 0 degrees; target is a standing, empty-handed Warrior. |
| Reserved contact | Depths `0.25, 0.75`, each at lateral positions `-0.4, 0.4`, with starting headings `45, 135, 225, 315` degrees. |
| Entry and moving target | At central entry, approach at 0.5 m/s and stop before admission; separately move the standing target sideways left and right at 0.3 m/s, crossing central entry at the strike request. Use all reserved headings. |
| Miss | At central entry, remove the target's collision response at commitment while retaining the same sensed aim and frozen course. Use all reserved headings. A miss must complete its stroke and return without relying on impact to stop. |
| Cancellation | At central entry, withdraw the request 0.05 s after admission and separately on the last preparation step before commitment. Use all reserved headings and establish that the action actually reaches each cancellation point. |
| Repetition | Ten-attack standing-contact sequence meeting the contact repetition gate, and a ten-request unobstructed-miss handling sequence at central entry, each at all reserved headings. The miss sequence completes within 30 s after its first admission, each cycle meeting the miss handling gate and beginning only after verified recovery. Reset or replace the target between attacks only after verified recovery; preserve the striker's physical state continuously. |

Implement the missed-contact fixture in trusted evaluation composition; do not expose a
collision switch to the Mind. Preserve the command and observation contract when changing the
fixture. Establish the cancellation boundary with a deterministic fixture or checkpoint,
without an executor-specific peek in the Mind. Fixtures that miss their entry, request,
cancellation or target-crossing condition report that failure explicitly.

The final suite includes every development and reserved case, all four loadouts and both rates.
Every required case passes its applicable gates. Missing, faulted, timed-out and unreached cases
prevent completion. All stationary and moving contact cases require a complete successful attack.
Keep reserved cases out of candidate ranking. Miss and cancellation handling results do not enter
the successful-attack count or compensate for a failed contact case.
A confirmation failure returns the candidate to development; retain that case
and reconfirm on additional frozen starts before claiming generalization.

## Work

1. Reproduce the visible flailing on the current code in a small standing-contact or repeated
   attack recipe. Watch it and keep its recipe and rows. Separate preparation chatter, stroke
   reversal, collision recoil, return and repeated-request handover before choosing a repair.
2. Extend the Strike evaluation or add bonk protocols and a focused reader. Include the complete
   attack result, gate values, limits, phase intervals, contact shape identity and explicit coverage
   in saved rows and Ratings. Keep physical contact detection distinct from an effective head strike.
   Show that the reader rejects the reproduced flailing for a physical reason before training.
   Reuse guard-return measurement while extending its hold, orientation and lifecycle checks.
3. Read the unchanged controller on the new high-target contact cases for the paired effectiveness
   baseline. Keep body, aim, target, fixture, delay, rates and scoring identical for candidates.
   Keep existing table baselines and affected recovery and movement readings separately. Reuse
   saved rows only where their current case keys match; a trunk reading is not a head baseline.
4. Repair demonstrated defects at their owning layer. Build a continuous stroke and verified
   preparation and return, reusing the existing path tracker and strike lifecycle where suitable.
   Release or hand over momentum safely when the Option yields. Reserve the arm, trunk and support
   through the work they own. Add a distinct bonk Option configuration with the head target and
   compatible aim; retain any trunk use under its own name and profile.
5. Screen one change against the previous implementation on the same cases; keep or drop it with
   its physical reason. Then run one bounded search for the Warrior's record with form, safety
   and effective head strike as hard feasibility constraints. Optimize effectiveness only among
   candidates whose contact attacks meet the complete attack requirements. The pulse schedule,
   course representation and training method may change where the evidence calls
   for it. Do not train around a broken lifecycle or raise muscles for visual force.
6. Freeze the candidate and run confirmation. Refresh the bonk's profiles and verify that the
   configured Option Mind selects and completes it in the Arena. A drill Commander performing
   it alone does not establish integration. If combat outcomes are claimed, use paired matches.
7. Read shared changes on every affected body and skill, including the sword cut if the swing
   executor changes. Repair exposed downstream defects in the same change. Preserve stand-up,
   travel and fighting-walk performance under their existing definitions and compare scored
   cells with their baselines. Report every remaining shortfall by its owning layer.

Each run answers one named decision and follows [AGENTS.md](../../AGENTS.md#doing-the-work)'s
pricing and run-review rules. Store development work under `.tmp/warrior-bonk/`, retain useful plays
as evaluation rows and remove temporary work when it lands. Commit coherent changes on main;
the record writer requires the case's source to be committed and unchanged. Label a committed
development candidate as short until confirmation passes. Keep the protocol and its baseline
compatible across comparisons, and qualify comparisons when shared runtime inputs change.

## Completion and handoff

All automatic gates pass with complete current case coverage. The baseline comparison shows
preserved effectiveness, affected recovery and movement checks retain their performance, and
the registered bonk is usable by the configured Option Mind. A search ceiling, an improved
score or green implementation checks alone leaves the goal unmet.

Run implementation checks by change under AGENTS.md. Capability evidence belongs in drills and
paired evaluations; add a retained test only for a concrete reproduced regression that those
diagnostics do not establish. Watch failed contact cases first, then representative successful
contact attacks, in normal time and slow motion. Review miss and cancellation handling separately.
Lead each result summary with successful contact attacks out of requested contact attacks,
each attack's head-impact energy and failed requirements. Include missing, faulted, timed-out and
unreached requested contact attacks as failures in that count. Component readings follow as
diagnostics; a pooled gate-pass table cannot substitute for the attack results. Supply versioned
Ratings links, the actual subject and protocol, the observed motion, the baseline summaries,
checks run and any failure left. Leave
`accepted.json` untouched until the owner accepts the rung.

As implementation lands, put the implemented motion contract in reference documentation and
update the architecture and table where changed. After acceptance, delete this plan. The broader strikes work remains
under [Options trained body by body](2026-11-03-options-training.md).
