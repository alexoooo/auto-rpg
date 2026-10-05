# Standing point-space strikes

`pointStrike` is an optional reference policy over named segment or item points. It emits
motion objectives, sharing one bounded muscle solve with posture and root objectives. It
neither owns physics nor scores hits. Direct actuator policies can use the same bodies and
equipment without this planner or tracker.

The policy measures guard readiness, plans a quintic point trajectory, follows through, then
returns from the measured effector position and velocity. Initial point velocity includes
angular velocity crossed with the lever from the centre of mass, including separately held
items. The polynomial has zero initial acceleration and zero terminal velocity/acceleration.
Readiness and return require position tolerance to hold for the configured interval. They do
not certify zero residual spin. Idle interruption restarts preparation; completion is absorbing.

The shared `createPointStrikeProbe` fixture starts standing on ordinary ground at 120 Hz with
directional bounds and zero assistance. It supports either hand or both independently, empty
or each holding a separate club. The target is a fixed box. An intentional-miss variant moves
the box sideways while leaving the requested path unchanged. Only positive impulses against
the intended collider, during strike/follow-through, with pre-step closing speed over 0.05 m/s
count. Startup, return, floor and sustained resting contacts cannot satisfy that gate.

These are contact-and-return demonstrations, not injury-energy, opponent-combat or defense
gates. A slow late contact can pass; impulse and closing speed are reported. Shared-item strikes,
moving targets, contact-triggered replanning and damage attribution remain separate work.

## Engineering inputs

These settings specify the experiment; none changes anatomical strength or inertia.

| Input | Value |
|---|---:|
| Guard lateral distance from root centreline | 0.25 m, plus seeded offset |
| Guard height above initial root, hand / club aim point | 0.15 / 0.75 m |
| Guard / strike / target-box forward distance | 0.25 / 0.65 / 0.7 m |
| Target box dimensions | 0.2 by 0.2 by 0.08 m |
| Intentional-miss lateral displacement | 0.7 m |
| Position tolerance / hold time | 0.02 m / 0.25 s |
| Strike / follow-through / return time | 0.5 / 0.5 / 0.5 s |
| Frame feedback time / weight | 0.15 s / 1 |
| Joint feedback time | 0.2 s |
| Arm / remaining joint objective weight | 0.03 / 0.3 |
| Normalized effort regularization | 1e-6 |
| Continuation after measured return | 1 s |
| Seeded lateral perturbation | within 0.002 m |
| Deadline / replay checkpoint | 8 / 0.5 s |

The posture clamps joint zero to the anatomical range. The root asks for its initial pose.
The club uses its sourced `aim` point and centre of mass. Contact settings are the measured
sticking settings in [standing bar tracking](standing-bar.md); redistribution remains disabled.
The ground is a 20 by 1 by 20 m box centred at (0, -0.5, 0). Grip capture tolerances are
0.002 m and 1e-5 quaternion-dot error, as in the independent item tracking test.

A guard at the bare-hand height stalls some club preparations and one two-club trial falls;
the higher club guard is a declared workspace choice. This does not solve general reachability.

```powershell
node research/control-foundation.mjs --suite point-strike --actuation directional --samples 2 --workers 1 --out research/runs/control-foundation/point-strike
node --test tests/core-point-strike.test.mjs tests/core-motion.test.mjs
```

Regression fixtures cover all three bodies and all six hand/loadout combinations. The miss
continuation checks both in-place and fresh-world replay with bare hands and separate items.
`createMotionBody` also accepts the same delayed external senses as the actuator-policy host;
its policy receives detached observations, and target-driven commands replay with the senses hub.

## Development screen

[The source-frozen run](point-strike.json) passes 72/72 trials: two starts in each body, hand
selection, loadout and hit/miss cell. Every branch replays exactly; no body falls and no support
solve rejects. Root and weapon assistance remain zero. Completion, including the extra second
of control, takes 3.600–4.442 s. Maximum final point error is 0.005449 m.

Qualifying hit-cell peak impulses range from 0.03175 to 6.5612 N s. That wide range matters:
the gate proves contact and return, not equal attack effectiveness across bodies or hands.
Intentional misses score no qualifying contact. Held-out starts remain unused.

Run `research/runs/control-foundation/point-strike-v1`, Node 24.19 / Rapier
0.21.0-auto-rpg.4 / adapter 5 / 120 Hz / one worker, with no concurrent tests or browser trial.
Mean instrumented step cost ranges from 2.793 to 4.737 ms, p95 from 3.324 to 6.367 ms and
p99 from 4.036 to 8.444 ms. These include the fixture's observation/scoring hooks and exclude
trace hashing; they are not a game or browser capacity claim.

Source content SHA256 `cbcebc72caade015c858c316f2ca2022e2282508bc87c7c35835a87c8d435ecf`;
manifest SHA256 `c81a5c9de5e70bec9282afbe887281290e795ea021a92c80e882cac215c553fa`.
The run retains its source archive and full task settings.

[All 36 seed-0 browser combinations](point-strike-browser.json) match these Node hashes and
ending steps. Each browser replay also matches its saved policy/task state. The built shared
viewer exposes hand selection, equipment, intentional misses and physical contact counts;
its play and save/restore controls were checked separately.
