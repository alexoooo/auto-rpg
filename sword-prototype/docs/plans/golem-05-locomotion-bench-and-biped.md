# Session 05 -- the locomotion bench and the biped

**Status (2026-09-04): planned.** Depends on 02 (the bench page and the module contract). May run
in parallel with 03 and 04. Human gate: not yet asked.

## Outcome

The locomotion module contract, a bench mode that drives a locomotion module with the keyboard
under a golem torso stand, and a biped that walks, strafes, turns, crouches, gets knocked down
and rises, accepted by the owner.

Locomotion is the one slot handled specially, and the reason is on record: continuous
dynamic-root balance was tried at 240 Hz and both bodies fell at rest. A golem moves on the
supported carrier. The legs prove support, sell the motion and take the hits; the carrier does
the moving until a hit takes the carrier away.

## Frozen choices

- The locomotion module owns a carrier, a support proof, a gait and a knockdown rule. Its
  `Command` is the existing `LocomotionRequest` (`localForward`, `localRight`, `yaw`, `recover`)
  plus `crouch` from `Intent.posture`. Nothing in `src/supported-locomotion*.ts` changes shape.
- It uses `VirtualLocomotionCarrier`, `SupportedRootMotor`, `RisingActuator` and the staged port
  from those files as they are, and `constructPostureIsSupported` rather than the fighter
  predicate, because its thresholds are shape-agnostic and suit a squat body.
- The root is `ANIMATED` while support holds and flips to `DYNAMIC` on a stagger that exceeds the
  fall threshold, at which point the whole golem is a ragdoll until the rise. Recovery is a
  bounded rise through the actuator, not an animation.
- Legs never collide with each other or with the torso. Feet collide with the world.
- Crouch is a carrier property: a height range. The biped has one; the wheel in Session 06 does
  not, and that difference is the whole point of offering both.

## Implement

1. **Contract.** `src/golem/locomotion.ts`: `LocomotionModuleDefinition` extending the module
   contract with `carrier: VirtualCarrierConfig`, `heightRange`, `footprint`,
   `supportBindings`, and a `BuiltLocomotion` that exposes the root body, a
   `SupportedRootAdapter`, `postureEvidence(): ConstructPostureEvidence`, and `gait(dt)`.
   The `StabilityAuthority` fields (`carrierPartId`, `supportBindings`,
   `braceCapacityMultiplier`, `gaitStabilityScale`) come from the module.
2. **Bench mode.** A key on `bench.html` switches to locomotion mode: the stand becomes a real
   torso block on top of the module under test, `W`/`S`/`A`/`D`/`Q`/`E` and `Shift` drive it
   exactly as the page does, a row of ring posts and a low step from `src/arena-room.ts` sit in
   the way, and a key applies a measured shove (a specific impulse, not a force) to the torso so
   knockdown can be seen on demand. Readout: commanded versus actual carrier speed, support
   state, posture evidence, foot slip while planted, rise time.
3. **Biped.** `src/golem/locomotion/biped.ts`: pelvis root, two legs of thigh, shin and foot as
   slender capsules and a slab, hips, knees and ankles as motorised joints with limits that do
   not reach the splits (a leg that can reach the splits looks broken the first time it is hit).
   Gait: the Warrior's law-of-cosines leg solve is the precedent; stride phase from carrier
   speed, crouch from the carrier height, joint targets rate-limited and torque-capped so the
   legs read as heavy. Feet on the world layer. Support proof from the foot contact sensors the
   locomotion state machine already expects. Knockdown per the frozen choice; rise through the
   actuator with the footprint sweep.
4. **Headless.** `scripts/golem-bench.mjs --locomotion biped` drives a scripted request sequence
   (stand, walk forward two seconds, strafe, turn, crouch and walk, a shove above the fall
   threshold, recover). `tests/golem-locomotion.test.mjs` asserts: supported for the whole
   pre-shove interval, carrier tracking within its own limits, foot slip while planted below a
   budget written in the module file, the root goes `DYNAMIC` on the shove, and the rise
   completes within the budget. Also the existing V1 obstacle suites, run against the biped as a
   new fixture rather than the Warrior.
5. **Shell.** Chamfered stone plates on the thighs and shins, bronze at the joints, a plain foot.

## Human gate

The owner drives it for a couple of minutes: walk, strafe, circle a post, crouch and walk, walk
into the step, take the shove, watch the rise. The questions: does it look like it is walking or
like it is being dragged with its legs moving; do the feet plant; does the fall look like a fall
and the rise like a rise. The verdict goes into this file's status line. The carrier drags by
design, so the gait has to sell it, and if it does not after two corrections this file records
that the biped is accepted as a moving platform and the visual gait stays open.

## Verification

```powershell
npm run check
node --test tests/golem-locomotion.test.mjs tests/supported-locomotion-runtime.test.mjs tests/supported-locomotion-state.test.mjs
node scripts/golem-bench.mjs --locomotion biped
npm test
npm run build
git diff --check -- .
```
