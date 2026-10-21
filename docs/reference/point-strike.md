# Standing point-space strikes

The declared inputs of the static point-strike task (`SETTINGS` in `src/core/tasks/point-strike.ts`)
and the development screen of its reference policy, `pointStrike`. The policy emits motion
objectives that share one bounded muscle solve with posture and root; it neither owns physics nor
scores hits, and a direct actuator policy can use the same bodies and equipment without it.

`pointStrike` waits for measured guard readiness, plans a quintic point path (zero endpoint
accelerations, zero terminal velocity for a fixed goal), follows through, then returns from the
measured effector position and velocity. Initial point velocity includes angular velocity crossed
with the lever from the centre of mass, held items included. Readiness and return need the
position tolerance held for the hold time; they do not certify zero spin. Idle restarts
preparation; completion is absorbing.

`createPointStrikeProbe` stands a body on ordinary ground at 120 Hz, directional bounds, zero
assistance, with either hand or both, empty or each with its own club, against a fixed box. The
miss variant moves the box sideways and leaves the path. Only a positive impulse on the intended
collider during strike or follow-through, with pre-step closing speed over 0.05 m/s (`closing`),
counts. It is a contact-and-return task, not injury energy, combat or defense; the
[moving-target variant](moving-strike.md) adds tracking and impact braking.

## Engineering inputs

None changes anatomical strength or inertia.

| Input | Value |
|---|---:|
| Guard lateral distance from root centreline (`lateral`) | 0.25 m, plus seeded offset |
| Guard height above initial root, hand / club aim point (`height`, `clubHeight`) | 0.15 / 0.75 m |
| Guard / strike / target-box forward distance (`guard`, `target`, `obstacle`) | 0.25 / 0.65 / 0.7 m |
| Target box dimensions (`obstacleSize`) | 0.2 by 0.2 by 0.08 m |
| Intentional-miss lateral displacement (`missOffset`) | 0.7 m |
| Position tolerance / hold time (`tolerance`, `readySeconds`) | 0.02 m / 0.25 s |
| Strike / follow-through / return time | 0.5 / 0.5 / 0.5 s |
| Frame feedback time / weight (`seconds`, `weight`) | 0.15 s / 1 |
| Joint feedback time (`postureSeconds`) | 0.2 s |
| Arm / remaining joint objective weight (`armWeight`, `bodyWeight`) | 0.03 / 0.3 |
| Normalized effort regularization (`effortCost`) | 1e-6 |
| Continuation after measured return (`continueSeconds`) | 1 s |
| Seeded lateral perturbation | within 0.002 m |
| Deadline / replay checkpoint | 8 / 0.5 s |

The posture clamps joint zero to the anatomical range; the root asks for its initial pose. The
club uses its sourced `aim` point and centre of mass. Contact settings are the sticking settings of
[standing bar tracking](standing-bar.md), redistribution off. The ground is a 20 by 1 by 20 m box
centred at (0, -0.5, 0). Grip capture tolerances are 0.002 m and 1e-5 quaternion-dot error, as in
the item tracking test. The club guard is higher by choice: at the bare-hand height some club
preparations stall and one two-club trial falls.

## Development screen

[The protocol-1 source-frozen run](point-strike.json) passes 72/72: two starts in each body, hand
selection, loadout and hit/miss cell. Every branch replays exactly; no fall, no rejected support
solve, zero root and weapon assistance. Completion, with the extra second, takes 3.600–4.442 s;
the largest final point error is 0.005449 m. Hit peak impulses range from 0.03175 to 6.5612 N s:
the gate proves contact and return, not equal effectiveness. Misses score no contact.

- Run `research/runs/control-foundation/point-strike-v1`: Node 24.19, Rapier 0.21.0-auto-rpg.4,
  adapter 5, 120 Hz, one worker. Source SHA256
  `cbcebc72caade015c858c316f2ca2022e2282508bc87c7c35835a87c8d435ecf`, manifest SHA256
  `c81a5c9de5e70bec9282afbe887281290e795ea021a92c80e882cac215c553fa`.
- [All 36 seed-0 browser combinations](point-strike-browser.json) match the Node hashes, ending
  steps and saved policy/task state.

```powershell
node research/control-foundation.mjs --suite point-strike --actuation directional --samples 2 --workers 1 --out research/runs/control-foundation/point-strike
node --test tests/core-point-strike.test.mjs tests/core-motion.test.mjs   # both @2a1b29ac
```
