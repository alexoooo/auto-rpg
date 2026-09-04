# Session 02 -- the effector bench and the first two rungs

**Status (2026-09-04): implemented, human gate not yet asked.** `bench.html` puts one module on a
kinematic stand and drives it with the mouse; the module contract, the chain-and-terminal
factoring, the anchor drive, the blade terminal and both chains exist, and `npm run dev` plus
<http://localhost:5180/bench.html> is where the owner answers the three questions.
**Rung 0, `effector.none`** is a capped socket welded rigidly to the stand with no driven axis,
and it measures the bench's noise floor: 0.0000151 mm of tip wander at rest with activation
forced in the Node bench, exactly 0 on the page, and zero contacts of any kind.
**Rung 1, `effector.pitch.blade`** is one hinge, a 0.34 m stone link and an 0.80 m steel blade
welded once, 10.70 kg over 1.140 m of reach, and what was measured on it is the three things that
decide whether it is a limb rather than a robot arm -- the torque cap, the target rate limit and
the stroke shape -- each swept, tabled beside its number in `src/golem/config.ts` and recorded in
`docs/measurements.md` with its harness named. The verdict on both is the owner's.

## Outcome

A second page, `bench.html`, that puts one module on a fixed stand and lets the owner drive it
with the mouse in a seconds-long edit loop. The golem module contract, the chain-and-terminal
factoring of effectors, the reusable anchor drive, the blade terminal, and the first two chains
(none, pitch) exist and are accepted by the owner on that page. A headless twin of the bench runs
the same modules under Node with real Havok, so a chain's regression floors can be pinned after
acceptance.

This is the session that answers the question that failed three times: can one effector look and
feel right in isolation. Nothing here fights. Nothing here has legs.

## Frozen choices

- The bench torso is a kinematic stand: an `ANIMATED` stone block at Warrior torso height with one
  socket frame at shoulder height on each side. It does not move, lean or fall. Later sessions
  put a real torso under the socket; the socket frame contract does not change.
- The mouse mapping is the page's existing one: the cursor is absolute, its position is where the
  effector is asked to be, and `F` swaps sockets. `Controls` from `src/input.ts` produces a
  `HandIntent`; the bench feeds it straight to the module without a mind, because a mind is a
  later session's business and the human is the reference here.
- The module reads `HandIntent` and nothing else. `pointerX`, `pointerY`, `roll`, `wristBend`,
  `thrust`, `guard` are the whole vocabulary, and a chain that has no use for a field ignores it.
- Every chain is benched with the blade terminal, so what the owner judges is the chain. The
  blade is built here and is not revisited; the other terminals are Session 04.
- Colliders are slender: a socket cap or blade is no wider than it needs to be to register the
  contact it exists for. Shell proportions are chosen on the bench, by eye, and written into the
  module file with the date.

## Implement

1. **The page.** `bench.html` next to `index.html`, and `build.rollupOptions.input` in
   `vite.config.ts` naming both entries. `src/bench/main.ts` builds the engine and scene, loads
   Havok through the `?url` path the arena uses, calls `attachPhysics`, sets the 240 Hz sub-step
   exactly as `src/arena.ts` does, and uses `buildArenaColliders` from `src/arena-room.ts` for
   the floor and walls without the cosmetic room. Reuse `src/camera.ts` for the orbit. Keys:
   `1`..`9` pick a module, `F` swaps sockets, `Tab` toggles the readout, `G` toggles a bench rig
   overlay, `R` rebuilds the current module from its file, `Space` pauses. The `RigView` in
   `src/rigview.ts` is typed on the concrete `Fighter`, so the bench gets its own small overlay
   (anchors, joint frames, contact points, the envelope) rather than a widening of that class;
   Session 08 decides which of the two survives in the arena.
2. **The contract.** `src/golem/module.ts` with the types sketched in the overview: `GolemSlot`,
   `GolemModuleDefinition`, `BuiltModule`, `GolemPart` (part id, physics body, collider leaf,
   shell meshes, health, vitality weight, fatal flag), `ModuleBuild` (scene, side, socket frame,
   layer membership and mask, material palette) and `ModuleEnvelope`. An effector module's
   `Command` is `HandIntent`, and an effector is a pair: `EffectorChainDefinition` (links,
   joints, drive, envelope, strokes) and `EffectorTerminalDefinition` (a body welded once to the
   chain's last link, its striker, its layer, its shell), as sketched in the overview. Add
   `src/golem/registry.ts`: a `Record` over the option ids per slot, and for effectors over every
   legal chain-terminal pair, so an option without a builder fails to compile (the
   shield-shipped-as-a-club lesson).
3. **The anchor drive.** `src/golem/anchor-drive.ts`: a standalone class that builds a massless
   `ANIMATED` sphere on no collision layer, joins it to a target body with a six-axis constraint
   whose chosen axes are `POSITION`-motorised toward zero with a force cap, and each substep
   computes the commanded velocity from consecutive targets and calls `setTargetTransform` so the
   constraint sees motion rather than a teleport. Parameters: which linear and angular axes are
   driven, linear and angular force caps, and a target rate limit. This is the copy-and-cut of
   what `src/arm.ts` does in its anchor construction, `driveAnchor` and `applyTuning`; it must
   not import `Arm`. Its tuning block lives in `src/golem/config.ts` and each number carries a
   short table when it is set, as the arm block does.
4. **The blade terminal.** `src/golem/effectors/terminals/blade.ts`: one slender blade body,
   its mass and length in its table, an edge striker through `src/combat.ts`'s `Striking` with
   `hand` set to the socket name, the blade layer (passes through its owner), a steel shell.
   It is built in the frame its weld demands and welded once to whatever last link a chain hands
   it (the recorded fling was a weld whose two frames disagreed at construction). It has no
   control code at all; if a terminal file ever reads `HandIntent`, the factoring has leaked.
5. **Rung 0, none.** `src/golem/effectors/chains/none.ts`: no driven axis. The socket carries a
   slender cap body with a mass-bite striker like the bare fist so a shove registers. The cap is
   the one terminal that belongs to its chain, because there is nothing to weld a terminal onto.
   It exists so the body plan is complete without effectors and so the bench's noise floor is
   measured on something that cannot move: tip wander at rest must read zero, with activation
   forced, because a sleeping body hides every steady-state defect.
6. **Rung 1, pitch.** `src/golem/effectors/chains/pitch.ts`: one hinge at the socket about the
   side axis and a short forearm link; the blade terminal welds to the forearm's end. Control:
   the hinge's own angular motor, torque-capped, toward a pitch target from `pointerY` that is
   rate-limited; `guard` raises to a high preset; `thrust` runs a chop as a velocity event
   (accelerate down and through, follow through, return to the target) rather than a pose
   sequence. For a one-axis chain task space and joint space are the same number, so what makes
   it not a robot is the torque cap, the target rate limit and the stroke shape, and the bench
   measures exactly those.
7. **Readout.** Target versus actual, settle time after a step, overshoot, tip speed, anchor
   stray where an anchor exists, stuck steps (target error not converging), self-contact count
   (must be zero), and the peak tip speed with the first 0.6 s and 0.25 s after any contact
   excluded, as the measurement record requires.
8. **Headless twin.** `scripts/golem-bench.mjs` on top of `scripts/golem-headless-arena.mjs`:
   builds a named chain-terminal pair on the stand under `NullEngine` with real Havok, applies a
   scripted `HandIntent` sequence (rest, step to guard, chop, rest), and prints the readout
   numbers. `tests/golem-bench.test.mjs` asserts, per chain: builds and disposes cleanly, zero
   self-contact over the sequence, zero tip wander at rest with activation forced, settle within
   the budget written in the chain file, and the stroke's peak tip speed inside the excluded
   windows. Thresholds are placeholders until the human gate passes; then they are pinned from
   the measured run and dated.

## Human gate

The owner opens `bench.html`, drives each chain with the mouse for about a minute, and answers
the three questions from the overview. The verdict, per chain, goes into this file's status
line. Only after a yes does the session pin the regression floors in step 8 and record the
harness and numbers in `docs/measurements.md` under a new "Golem effector bench" heading.

If the pitch chain is a no, one correction session is allowed, then a second; after that this
file records the stop and Session 03 does not start.

## Verification

```powershell
npm run check
npm test
node --test tests/golem-bench.test.mjs
node scripts/golem-bench.mjs --chain pitch --terminal blade
npm run build
git diff --check -- .
```

`npm run dev` and open <http://localhost:5180/bench.html>; both pages must build and both must
load. Stop the server and confirm the port is free.
