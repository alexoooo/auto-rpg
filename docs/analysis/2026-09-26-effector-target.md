# Task-space effectors: first actuator

Session 06 continuation, 2026-09-26. This is an experimental anatomical-arm implementation,
not a completed headroom result. No shipped default or body tuning changed.

## Contract and authority

`BodyCommand.effectors[hand].target` carries a business-end position in world metres, the world
orientation of the carrying hand's frame, and speed and force fractions. Speed narrows the
anatomical joint target-rate ceilings; force narrows motor effort, still multiplied by the body's
live tone. Both are finite and clamped to [0, 1]. Neither changes a body's transform or velocity.
The module copies and validates the request before handing it to its chain.

The module owns the terminal offset. The chain subtracts that offset along the requested hand
orientation to obtain a palm target, transforms it into its live socket frame, clamps it through
the reachable envelope and solves within its joint stops. This mode removes the solver's soft
elbow-pole preference, which otherwise competes with a fully specified pose and leaves a reachable
target centimetres short. For incompatible poses, the later endpoint-aware fallback tries to
reduce carried-tip error while retaining the palm envelope and anatomical stops; it does not
promise to reach an impossible request. See `2026-09-26-effector-endpoint-fallback.md` for the
correction to the initial palm-only fallback. The legacy mapper retains its mapping exactly.

The flag is `effector`, off by default. A module declares `target`, `speed` and `force` only if
its chain implements `commandTarget`, its terminal declares a rigid tip along the attachment
axis, and it uses one socket. Today that means the anatomical hand with blade, fist or mace.
Both hands work. A forearm-mounted shield declares no target actuator, a flexible lash declares
no rigid endpoint, and paired grips need a joint task envelope. Shared dispatch checks
capabilities rather than family, chain or terminal IDs.

Missing targets and disabled flags take the original aim path. Returning to an old command
restores full rate and effort ceilings. Copying a `BodyCommand` owns all target fields, including
when a caller supplied Babylon vectors/quaternions; the Intent adapter clears both targets.
All held task state participates in the existing exact fork.

## Measured bench

Harness: `research/effector-target-bench.mjs`, using
`tests/harness/effector-target-bench.mjs`: Node/Havok effector stand, awake bodies, fixed solver
steps, no rendering. Targets are reachable kinematic poses transformed through a socket rotated
0.7 rad, with the terminal offset included. The tests also run fist and mace on both
sockets. The uncommanded controls miss the target by more than 50 mm.

Anatomical blade, after 3 simulated seconds:

| mode | primary tip error | secondary tip error | peak joint target rate |
|---|---:|---:|---:|
| full speed / force | 0.34 mm | 0.49 mm | 5 rad/s |
| speed 0.25 | 0.34 mm | 0.49 mm | 1.25 rad/s |
| speed 0 | 570 mm | 673 mm | 0 rad/s |
| force 0 | 2310 mm | 1899 mm | 5 rad/s |

Zero speed holds the commanded joint coordinates exactly; zero force preserves target geometry
while the real mass falls. Full task force with zero body tone produces the same physical
positions as zero task force. These are actuator checks, not combat headroom measurements.

The physical gate is 3 mm at 3 s, separately from the 1 mm commanded-point gate. No drive
constant was changed to make it pass. Speed is checked per joint against that joint's published
rate: comparing the fastest joint in two runs can accidentally compare different joints.

The paired maul exposed an inconsistent intersection in the old command envelope: its anatomical
arm publishes swingMin = swingMax = -0.5 rad, reach 0.50 to 0.56 m, and carryMin = -0.13 m.
At level lift, that angle asks for at least 0.24 m of inboard reach; the carry floor clips it to
0.13 m. A target mapper must not silently call that an exact reachable pose. Paired task targeting
is therefore not declared in this pilot. Its legacy grip following and defaults are unchanged.

## Validation

Final gates: 1051/1051 tests, `npm run check`, `npm run build`, and the line-ending comparison.
The browser's `channels=effector` diagnostic was checked on a temporary server on 5182, then the
server was stopped. Logs and the two 15-bout null comparisons are kept locally under
`research/runs/effector-target-continuation/` in the main checkout (gitignored).

- Seven new tests cover validation/copying, both hands and all declared rigid terminals,
  speed, force/tone, unreachable commands, production dispatch and exact-fork restoration.
- Eleven mutations were caught by assertions: missing fraction clamp, stale off-hand target,
  missing terminal offset, ignored speed, ignored force, removed joint stops, bypassed dispatch,
  missing speed restoration, missing envelope clamp, and incorrectly declaring a flexible lash
  or a paired grip as a supported task endpoint.
- The 15 six-second bout trajectory fingerprints in `tests/harness/body-fingerprint.mjs` are
  bit-identical to `597ecf36`, with the effector flag off and with it on but unwritten. This is
  a null comparison of those 15 named fixtures, not a replacement for the 45-bout expert null run.

## Still open

- Stone and skeleton wrist chains now have a rigid single-socket actuator; see
  `2026-09-27-wrist-task-target.md`. Forearm shields, paired grips and other controllable
  attachment geometry remain open. Do not advertise an actuator merely because another chain has one.
- Expert proposals for target, speed and force are now implemented; see
  `2026-09-26-effector-expert.md`. Full-length paired headroom remains open. The bounded screening
  run is not sufficient evidence to enable the flag.
- The browser proposal preview is now available: see `2026-09-26-effector-preview.md`.
  `?play=arena&channels=effector` alone still does not make legacy minds use targets.
- The pending stance/ruler and release-2 research runs from the handoff are unchanged.
