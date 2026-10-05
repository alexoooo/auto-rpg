# Standing handover and subsequent control

The point fighter uses `supportRecovery` to run the reference `stagedRise`, followed by
locomotion's gradual height restoration and foot squaring. A separate `recoveryReady`
predicate reads detached body observations and support geometry. It requires the host's upright
reading, positive fixed contacts at both feet, no other fixed supporting segment, the centre
of mass inside the foot support polygon, and low linear velocity of every segment. It does not
accept a pose request or stage completion as standing. Feet supply corners within the existing
`DOWN` tolerance of their lowest corner; `withinSupport` supplies its existing inset.

## Handover settings

`RECOVERY_VERIFY` contains engineering acceptance settings: `slow = 0.1` m/s for each segment,
`minUpNormal = 0.9` for the absolute vertical contact-normal component, `hold = 0.5` s of
continuous acceptance, and `limit = 6` s before stabilization retries the reference route.
These are chosen development thresholds validated below, not anatomical measurements or a
claim of optimal tuning. Height ramp and foot squaring retain the existing locomotion settings.
The supervisor captures standing reference height before the fall, not from the low pose
where the riser hands over. Without this reference and gradual restoration, handover can
immediately topple the body. Recovery takeover and retry require no support state.

The host releases its commands on takeover. It resumes only after verified stabilization;
recovery keeps sensing the opponent. All clocks, counters, locomotion reference and motor
state belong to the body's replay state. Tests save during stabilization, replay into both
the same and a fresh Duel, compare whole state and every segment's motion, and then walk.

Removing the upright check in an isolated copy of `recoveryReady` makes the handover acceptance
test fail (`true` instead of `false` for a down body); the test exercises the physical gate.

## Physical development cases

Harness: Node arena Duel, vendored Rapier gameplay adapter 8, 120 Hz, symmetric actuation,
Warrior versus stationary Rogue at 8 m separation, normal arena solids and damage, balance
0% on both sides. The full engine revision is in the raw JSON. No optional engine profile,
anatomical strength, inertia or assist ceiling changes. After one second standing, a horizontal
impulse of 1.5 Ns/kg is applied to the middle trunk. Directions are world +z, +x, -z, -x, not
body-relative. The runner requires a real fall, allows 60 s after it, then commands one second
walking and two seconds standing. A passing walk has strides, travels over 0.15 m, and never
reads down. Every passing row also acquires hand/shin support on its actual rise trajectory.

| Held | Direction | Fall to verified standing (s) | Walk travel (m) | Result |
| --- | --- | --- | --- | --- |
| Empty | +z | 25.617 | 0.329 | Pass |
| Empty | +x | 25.300 | 0.301 | Pass |
| Empty | -z | 27.525 | 0.343 | Pass |
| Empty | -x | 28.867 | 0.409 | Pass |
| Club | +z | 27.392 | 0.410 | Pass |
| Club | +x | 27.842 | 0.352 | Pass |
| Club | -z | No completion within 60 s | Not attempted | Fail |
| Club | -x | 28.025 | 0.404 | Pass |

The failed club case repeatedly falls during the later rising sequence. It is retained in the
record, not excluded from the evaluation. These eight fixed development cases are not an
estimate of a general recovery success rate.

Two successive +z falls in the same Duel, with walking after each, complete for empty hands
(25.617 and 25.725 s) and the retained club (27.392 and 25.617 s). The subsequent 15 s attack
window yields four incoming impacts and four verified right-hand returns for empty hands;
the club yields four incoming impacts, three verified returns and one phase timeout. Neither
falls during that attack window. See [strike-cycle definitions](arena-point-control.md#strike-cycle)
for the distinction between contacts, thrown strokes, returns and failures. Root assist meter
readings at trial completion are zero; these character configurations grant zero balance.

## Limits and next evidence

This supplies an integrated reference route through support, standing, walking and attack;
it does not solve a general contact-driven get-up policy. The reference riser still uses timed
poses. The independent research support-entry policy remains available, but its installed
minimum-effort support pose is not a demonstrated reliable starting point for this route.
Simple pose interpolation or immediate full-height stance takeover did not establish that
transition. Other bodies, disturbances during handover, slopes, two-hand items, faster recovery
and moving-target strike/return remain open. The failed club direction is the next recovery
fixture to address. Classic and the independent observation/action policy interfaces remain
available; no alternate AI must adopt this supervisor or these pose stages.

## Reproduction

```powershell
node research/arena-control-cycle.mjs docs/reference/recovery-cycle.json
node --test tests/arena-control-cycle.test.mjs tests/arena-point-control.test.mjs
```

The two-worker runner executes one sequential queue per worker and writes all 19 development
cases to [recovery-cycle.json](recovery-cycle.json), including failures. It uses the same Duel
and World.step as gameplay. Static target coordinates and cancellation are fixture inputs,
not additions to the body's anatomy. Node evidence does not establish browser timing capacity
or cross-engine arithmetic equivalence beyond the repository's existing arena replay gates.
