# Optional joint-stop prediction

The experimental whole-body tracker can predict nearby anatomical joint stops. This is an
optional controller model; it installs no physical constraint, changes no joint range and
applies no assist. Final commands still use the body's bounded muscle actuators. The bar,
point-strike and defense probes expose it with `jointStops: true`; the common runner uses
`--joint-stops`, and the task viewer has an experimental selector. It is off by default.

## Model and selection

`nearJointStops` samples the actual angle, gradient, rate and curvature from
[joint-coordinate motion](joint-coordinate.md). For an inward gap g and rate v, the local
backward-Euler approximation is g + dt*v + dt*dt*a >= 0. An active row requests equality;
its acceleration target includes the changing coordinate gradient. Only bounds within the
angular margin are considered. Distant impacts, restitution and exact finite-step rotation
are outside this model.

The first bounded objective solve has no stop reactions. Rows whose free prediction crosses
the bound become active. Subsequent solves release any active row requiring a pulling reaction.
Released rows retain affine no-crossing bounds in actual actuator torques. These share the
contact-force solve, or a separate effort-bound solve when the fixture has no contact model.
This avoids both freezing a joint at a limit when its goal moves inward and repeatedly
removing/re-adding a row whose reoptimized effort would cross the bound.

Selection has a structural finite bound: a free pass followed by at most N+1 passes for N
nearby rows. Each retry after selection releases at least one row. This is a mode heuristic,
not a global complementarity optimizer. A rejection does not prove the task has no feasible
mode. Rejected predictions command zero torque and count as task failures. Reports include
near/active/released rows, work, pulling-force and acceleration violations. State and reports
replay; returned lists are detached.

## Numerical inputs

`SETTINGS` contains declared experimental solver inputs in `tasks/stop-settings.ts`, not anatomical
measurements or increases in strength. The angular margin is a local admission threshold;
the other tolerances accept numerical residuals. They are not task success tolerances.

| Input | Value | Meaning |
|---|---:|---|
| margin | 0.001 rad | Near-stop admission |
| forceTolerance | 1e-5 N m | Permitted pulling reaction roundoff |
| accelerationTolerance | 1e-4 rad/s2 | Active equality or released inward-slack residual |
| iterations | 2048 | Cold active-set solve work ceiling |
| absoluteTolerance | 1e-7 | Normalized quadratic solve tolerance |
| relativeTolerance | 1e-6 | Relative quadratic solve tolerance |

## Mechanical regression

Harness: Node stand, corrected-limit Rapier 0.21.0-auto-rpg.5 / adapter 6, directional
actuation, 120 Hz, pinned synthetic parent, gravity, no ground and zero assist. A two-N-m
hinge is preloaded against either +/-0.3 rad limit. An outward rate request remains at the
loaded stop for all 60 measured steps, with zero measured muscle effort and at most two
selection passes. Changing the same policy's goal to zero releases the stop on the first
step and reaches +/-0.00021584632452372208 rad after 180 steps. Snapshot replay is exact.
Removing free prediction makes the inward-release assertion fail. Sampling rows leaves the
complete physical/state snapshot unchanged.

Affine-effort fixtures also check actual torque scaling, incompatible bounds, malformed rows
before mutation, and contact friction competing with a stop bound. These tests establish
local controller behavior; they do not establish recovery or gameplay readiness.

## Common-runner comparison

[All 348 rows and eight manifests](joint-stop-tracking.json) are retained. Harness: Node
24.19.0, core world, corrected-limit Rapier .5 / adapter 6, 120 Hz, directional actuation,
ordinary ground and zero root/weapon assistance. Each configuration uses Warrior, Rogue and
skeleton and development seeds 0 and 1. Shared strikes retain both hands or release either
hand, include hits and deliberate misses, and watch ten seconds beyond measured return.
Moving hits compare tracked and fixed aim. Defense includes either/both hands, bare hands
and independent clubs, with prediction paired against pose. Task gates are unchanged.

| Task | Stops off | Stops on |
|---|---:|---:|
| Standing shared bar | 12/12 | 11/12 |
| Static shared strike | 26/36 | 34/36 |
| Moving shared strike | 39/54 | 51/54 |
| Predictive defense | 33/36 | 32/36 |
| Pose-only defense | 0/36 | 0/36 |

Every row replays exactly. Strike improvement is not universal improvement:

- The bar failure is skeleton/seed 1/release left: it returns within 0.765 mm but has no
  obstacle contact. It remains a failure; positional accuracy cannot replace the contact gate.
- The two static and three moving failures with stops enabled all release the skeleton's
  right hand at seed 1. The moving tracked hit has four rejected steps, a 9.523 mm peak grip
  gap and a 0.7516 m final return error. No strike trial falls, but this is a substantial
  late-control regression even as the aggregate success count improves.
- Both Warrior independent-club defense starts with both hands fail preparation; seed 1 also
  receives protected-region contact. Rogue/both clubs/seed 1 receives protected-region contact.
  Rogue/both clubs/seed 0 falls with 556 rejected steps, despite zero protected-region impulse.
  The unchanged defense gate rejects all four cases.

Maximum stop selection work is five passes. Maximum reported acceleration violation reaches
24.4865 rad/s2 in the rejected Rogue defense sequence; it is not an accepted residual.
The model remains optional. Reliable preparation, release/clearance planning, sustained
defense, general contact modes and recovery remain open; these results do not authorize a
gameplay-default migration. The skeleton still has placeholder anatomy. Held-out cases are
unused. Concurrent verification/browser activity makes these runs unsuitable for capacity
claims, although their raw timings remain in the records.

All eight runs use source content
`dfab8d862432baf3df4bb527dd860f73b63ef8a26fad946ddd33cf44855bf024`.
The source archive predates only a source-citation comment repair in `stop-settings.ts`.
With the option disabled, all twelve bar outcomes, observation hashes and physical meters
match the previous committed corrected-profile [bar-posture run](bar-posture.md). State hashes
change because controller state now explicitly contains a null stop report.

Reproduce each pair with distinct output directories; omit `--joint-stops` for the off member:

```powershell
$env:CORE_ENGINE = 'rapier-coordinate'
node research/control-foundation.mjs --suite bar --samples 2 --workers 3 --actuation directional --support standing --joint-stops
node research/control-foundation.mjs --suite point-strike --samples 2 --workers 3 --actuation directional --shared --centre-control --continue-seconds 10 --joint-stops
node research/control-foundation.mjs --suite moving-strike --samples 2 --workers 3 --actuation directional --shared --centre-control --continue-seconds 10 --joint-stops
node research/control-foundation.mjs --suite defense --samples 2 --workers 3 --actuation directional --joint-stops
```

## Browser parity

[The browser records](joint-stop-tracking-browser.json) retain full configurations and outcomes.
Harness: built task viewer and Node task builders, corrected-limit Rapier .5, directional
actuation, 120 Hz and zero assistance. Each browser branch replays exactly; its full observation
trace and complete task outcome match Node. Both initial and final poses were inspected, with
no browser warnings or errors. The unsupported support-transfer task disables and clears the
stop selector. The owned preview was stopped after inspection.

| Task | Development start | Steps | Outcome |
|---|---|---:|---|
| Skeleton, static shared club, retain both hands | 0 | 1657 | Returned, then controlled for 10 seconds |
| Skeleton, tracked moving target, release right | 1 | 2040 | Failed: late loss of return control, four rejected solves and excessive attachment gap |
| Rogue, right-hand club defense | 0 | 1200 | Prepared, six qualifying contacts, zero protected-region impulse |

The moving failure replays too. Replay correctness is independent of physical success; an
initial return is insufficient when subsequent control drifts outside the task tolerance.
