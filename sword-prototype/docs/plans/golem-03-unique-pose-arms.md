# Session 03 -- unique-pose arms: rungs 2 and 3

**Status (2026-09-04): implemented, human gate not yet asked.**

Rung 2 (`reach`) is a yaw collar, an upper arm and a forearm on a position-only anchor: three
driven axes against a three-dimensional target, with the elbow's position measured at 0.34 mm of
disagreement over a grid of the envelope visited from both directions, against 17.08 mm with the
shoulder opened to three axes. Rung 3 (`wrist`) adds a roll ring and a bend link whose two motors
are the only owners of orientation, and a roll driven past its own stop costs the position 0.03 mm
of anchor stray. The envelope is published as a clamped sphere shell with a minimum outboard
carry and the mapping clamps into it before the anchor is ever handed a target, so nothing
downstream has a refusal branch. Both rungs run the scripted sequence with zero contacts and zero
stuck steps; rung 3 rings for 1.75 s from its build pose where rungs 0, 1 and 2 settle inside 0.5,
and that number is recorded rather than judged. Every threshold added to
`tests/golem-bench.test.mjs` is provisional and is not a regression floor.

## Outcome

Two chains whose every reachable target has exactly one pose: a three-axis reach chain driven
by a position-only anchor, and a five-axis wrist chain that adds roll and bend. Both are benched
with the Session 02 blade terminal and accepted, or the ladder is recorded as stopped at rung 1.

These are the rungs that decide whether the Warrior's anchor idea survives once its redundancy is
removed. The recorded arm defects (an elbow that wraps, a hand that swings behind the trunk) are
all failures of a seven-axis chain asked for a six-axis pose; a three-axis chain asked for a point
has no such freedom.

## Frozen choices

- The reach chain is shoulder yaw and pitch (two hinges in series, or one two-axis joint) and an
  elbow hinge that bends one way only. Three driven axes, one three-dimensional target, unique
  pose by construction. No wrist: the terminal is welded to the forearm's end, so a blade's edge
  follows the forearm and a plate's face does too.
- The wrist chain is the reach chain plus a wrist with roll and bend. The shoulder and elbow are
  still driven by the position-only anchor; the wrist's two angular motors are the only owners of
  orientation. There is no six-axis hand pin anywhere in a golem. The Warrior's wrist was left
  angularly free because its grip motor already owned orientation and the two fought; here the
  ownership is split by axis, not doubled. What `roll` means (edge, face, lash) is the
  terminal's business; the chain only turns the last link.
- The mouse mapping copies the Warrior's `Arm.aim` in shape: `pointerX` to azimuth with the
  per-socket asymmetry, `pointerY` to elevation, `thrust`/`guard`/neutral to reach with the
  first-order lag, then a target on a sphere about the socket in the stand's frame. The numbers
  live in the module's own table in `src/golem/config.ts`, not in `CONFIG.arm`.
- The envelope is explicit: the shell between guard reach and maximum reach, clipped by the
  azimuth and elevation limits and by a minimum outboard carry so the hand can never be asked
  across the sternum. The Warrior refused that pose in its controller; here it is simply not in
  the envelope, and the mapping clamps to the envelope before the anchor ever sees a target.

## Implement

1. **Reach chain.** `src/golem/effectors/chains/reach.ts`: upper arm and forearm as slender
   capsules, shoulder and elbow joints with limits, the forearm's end offered as the terminal
   weld frame. The anchor drive from Session 02 with linear axes driven and angular axes free,
   force-capped at a value set on the bench with its table. Rate-limit the target. Strokes:
   `thrust` extends along the current aim as a velocity event with follow-through and return; a
   cut is the target swept along an arc inside the envelope over a fixed duration, also as a
   velocity event. Publish `EffectorView` (anchor, tip, tip velocity, reach, lost), with the tip
   taken from whatever terminal is welded on.
2. **Wrist chain.** `src/golem/effectors/chains/wrist.ts`: the reach chain with a wrist link and a
   two-axis joint. `roll` drives the wrist roll motor toward an absolute angle within stops;
   `wristBend` drives the bend motor. Both motors torque-capped and rate-limited. With the blade
   terminal on, the edge alignment that `src/scoring.ts` multiplies by speed becomes controllable
   for the first time on the ladder, and the readout shows it.
3. **Envelope publication.** `ModuleEnvelope` for both: the clamped sphere-shell description plus
   the stroke primitives the module supports (`thrust`, `cut`, `cover`) so Session 09's mind can
   pick by capability. The bench overlay draws the envelope.
4. **Bench and headless.** Add both rungs to the bench registry, the scripted `HandIntent`
   sequences (rest, guard, thrust, a cut across the envelope, a demanded cross-body point that
   must clamp rather than reach) and the per-rung assertions in `tests/golem-bench.test.mjs`. Add
   an assertion that the elbow's position is a single-valued function of the hand target over a
   sampled grid of the envelope (the rope-elbow test: no two samples with the same hand target and
   different elbow points).
5. **Shell.** Two or three primitives per bone with authored proportions and a bronze bearing at
   each joint, using the salvaged materials. Proportions chosen by eye on the bench; write the
   chosen numbers and the date in the module file.

## Human gate

Per rung, the three questions, driven for about a minute each including deliberate attempts to
make it look wrong: point across the body, point behind, flick between guard and thrust, hold the
cursor still at the edge of the window. The verdict goes into this file's status line.

If rung 2 is a no after two corrections, record it, keep rung 1 as the top of the ladder, and
Session 04 offers its terminals on the pitch chain alone. If rung 2 passes and rung 3 does not,
rung 2 is the top; the whip needs a roll axis to be worth having and is dropped from Session 04.

## Verification

```powershell
npm run check
node --test tests/golem-bench.test.mjs
node scripts/golem-bench.mjs --chain reach --terminal blade
node scripts/golem-bench.mjs --chain wrist --terminal blade
npm test
npm run build
git diff --check -- .
```
