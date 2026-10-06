# Action-specific arm style

`CombatAction.armExtension` optionally specifies an extension style in [0,1].
Omitted inherits `ATTACK_PATH.elbowExtension`. Zero retains the guard preference;
one requests extension through the existing joint-range-bounded IK objective.
`validArmExtension` owns validation for the action and the shared path tuning.

The common executor captures the style with the entire action. Later proposals do
not change a committed swing. Its existing cubic blend eases extension during the
swing and restores guard during return. Saved skill/action state carries the style
through fresh-world replay; takeover resets the interpolation.

Low policies explicitly request zero. This preserves their measured folded-arm
stroke even when a standing policy selects full extension. The action still
provides no engine handle, force, strength, pose or velocity installation.

`combat-arm-admission.json` retains four whole 45 s controlled low fixtures and
one 30 s self-play bout with source fingerprint. Node Arena Duel,
rapier-coordinate, 120 Hz, Warrior fists, balance 0/0, continuing recovery. The
standing candidate uses spacing 0.10 m, clean-miss step 0.10 m and full inherited
elbow preference; low actions explicitly override it to zero.

| Attacking hand / target | Driven low blows | Verified returns | Failed returns | Attacker falls | Head/trunk floor steps |
|---|---:|---:|---:|---:|---:|
| right / stationary fallen | 15 | 15 | 1 | 0 | 0 |
| right / recovering | 2 | 4 | 0 | 1 | 2315 |
| left / stationary fallen | 2 | 10 | 0 | 0 | 0 |
| left / recovering | 2 | 8 | 2 | 0 | 0 |

Every fixture attacks low and returns standing without assistance, but one later
falls. The override fixes the earlier left-hand stationary-target fall; the
right-hand recovering-target fixture instead falls during a subsequent approach.
It does not establish universal stability or a stronger playable controller.
The self-play pose/outcome is unchanged from the full-elbow range probe:
0.572/0.364 driven HP, 17/9 trunk blows, no falls or prolonged pressure episodes.
No candidate is promoted.

Physical regression compares whole contact and miss records for both hands,
with both zero and full action overrides against the corresponding inherited
preference. It checks invalid requests, committed-action immutability, actual
verified return, fresh-world fork traces and takeover. Original playable low
fixtures remain part of the full suite. Startup turning after low return is the
next separate stability investigation; these rows do not isolate its cause.
