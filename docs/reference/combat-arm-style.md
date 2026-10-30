# Action-specific arm style

A path action's `armExtension` (`PathActionConfig`, `src/core/skills/strikes/path-part.ts`) is an optional
extension style in [0,1]; omitted, it
inherits `ATTACK_PATH.elbowExtension` ([combat-strikes.md](combat-strikes.md#elbow-extension)).
Zero keeps the guard preference; one asks extension through the joint-range-bounded IK objective.
`validArmExtension` (`src/core/skills/strikes/attack-path.ts`) validates it for the action and the path tuning.

The executor captures the style with the whole action, so a later proposal does not change a
committed swing; the cubic blend eases extension in the swing and restores guard in the return.
Saved skill and action state carry it through fresh-world replay; takeover resets the blend. Low
policies ask zero explicitly, keeping their folded-arm stroke when a standing policy asks full
extension. The style installs no force, strength, pose or velocity.

## Measurement

`combat-arm-admission.json`: four 45 s controlled low fixtures and one 30 s self-play bout. Node
Arena Duel, rapier-coordinate, 120 Hz, Warrior fists, balance 0/0, continuing recovery; standing
candidate with spacing 0.10 m, clean-miss step 0.10 m and full inherited elbow preference, low
actions overridden to zero.

| Attacking hand / target | Driven low blows | Verified returns | Failed returns | Attacker falls |
|---|---:|---:|---:|---:|
| right / stationary fallen | 15 | 15 | 1 | 0 |
| right / recovering | 2 | 4 | 0 | 1 |
| left / stationary fallen | 2 | 10 | 0 | 0 |
| left / recovering | 2 | 8 | 2 | 0 |

Every fixture attacks low and returns standing unassisted. The override cures the left stationary
fall; the right recovering fixture falls on a later approach (2,315 head/trunk floor steps).
Self-play matches the full-elbow range probe: 0.572/0.364 driven HP, 17/9 trunk blows, no falls.
No candidate is promoted.
