# Low strike workspace and approach admission

The shared combat executor can lower an unpinned Warrior, strike a horizontal face
33 cm above the floor with either fist, verify each return, and restore standing.
That capacity does not establish safe placement around every fallen opponent.
The nearer approach, walking-column clearance and moving-target prototypes below
fail admission and are absent from the playable controller.

Every physical record here uses the Node unpinned core stand or Node Arena Duel,
rapier-coordinate at 120 Hz, Warrior fists, balance 0 (0/0 in Arena), unchanged
muscles and wound rules. Contacts are measured before they strike; startup and
post-contact peaks are excluded. Rows retain failures as well as successes.

## Shared supported stroke

`research/combat-strikes.mjs` accepts `support.shared: true` to use the game's
`supportFold` through the ordinary combat command. Lowering begins at 2 s,
`lower: 0.5`; the probe requests attacks at 4 s and standing at 12 s and runs
16 s. The shared executor waits for actual foot load, support and quietness.
It never installs a pose or velocity. `supportPhases` and `supportState` are
measurement outputs read by `tests/core-combat-low-workspace.test.mjs`.

The fixed box is 0.20 by 0.08 by 0.20 m. Its top is exactly the requested target
height; lateral targets are +/-0.10 m. `combat-low-shared-qualify.json.gz` retains
all four qualification rows at 0.33 m height, 0.35 m ahead in world coordinates,
with action elbow preference 1. This is a physical primitive, not a tactical
COM-to-target placement recommendation.

| Hand / fixture | Contacts | Verified returns | First contact downward speed (m/s) |
|---|---:|---:|---:|
| Left / hit | 8 | 9 | 5.106 |
| Right / hit | 8 | 8 | 5.103 |
| Left / miss | 0 | 8 | ? |
| Right / miss | 0 | 7 | ? |

Every row has zero failed cycles, falls, trunk/head floor contacts and assistance,
and returns to standing. Later contact speeds diminish: the lowest left/right
values are 0.641/1.072 m/s. Repeated touches cannot be described as repeated
5 m/s strikes. The two hits have verified returns beyond their contact counts
because a launched stroke can miss or be cancelled before the standing request.

The regression requests a stroke at 2 s, before support is ready, and checks that
its chamber starts only after the actual readiness reading. A fresh-world fork
covers lowering and each extended low swing through return into standing.

The preceding 18-cell workspace and 16-cell elbow screens are retained in
`combat-low-shared-workspace.json.gz` and `combat-low-shared-arm.json.gz`, source
fingerprint `18d327065eacd777feac40752e49bbe7e0a11d38d89a1bd01a64c94332aba031`.
Those older `closing` fields are radial target-closing speeds; read `-velocity[1]`
for motion into the top. The qualification harness reports top/bottom contact
speed along the face normal. Its source fingerprint is recorded in its file.

| Top height / forward distance (m), ordinary elbow preference | Right/left contacts | Right/left failed cycles | Falls |
|---|---:|---:|---|
| 0.27 / 0.45 | 3/0 | 0/0 | None |
| 0.27 / 0.55 | 0/0 | 1/0 | None |
| 0.27 / 0.65 | 0/0 | 1/0 | None |
| 0.33 / 0.45 | 5/4 | 0/0 | Left |
| 0.33 / 0.55 | 6/3 | 0/1 | None |
| 0.33 / 0.65 | 0/1 | 0/0 | None |
| 0.40 / 0.45 | 8/9 | 0/0 | None |
| 0.40 / 0.55 | 7/7 | 0/1 | None |
| 0.40 / 0.65 | 3/3 | 0/0 | None |

Some of those contacts have zero or negative downward speed. These counts map
contact access, not useful damage or striking power. The elbow screen supplies
both hands and two elbow fractions at 0.27/0.33 m height and 0.35/0.45 m ahead.
The 0.33/0.35 full-preference cell motivates qualification; the 0.33/0.45 full
left cell falls and remains in the record.

## Manually driven fold screens

`combat-low-workspace-front.json.gz` and `combat-low-workspace-top.json.gz` each
retain 18 manual-fold cells. `supportedStrikeCommand` supplies the root/posture
command after the ordinary executor; it requests attacks at 4 s and standing at
9 s during a 12 s trial. It does not use the actual supported readiness gate.
Those cells are exploratory measurements, not Arena ability tests.

The front box has a 0.20 m tall face centred on the requested point: its upper
edge is 0.10 m above it. Touching that box does not prove access to the requested
low height. The top-box screen corrects that geometry by placing its top at the
requested height. Both complete records remain available with their input
recipes and source identity. This is why the shared qualification uses a top
face and verifies standing return.

## Nearer placement in Arena

`combat-ground-ahead-screen.json.gz` retains twelve 45 s bouts and exact source
file overrides against its `baseCommit`. Only the wide policy's forward distance
changes to 0.40, 0.45 or 0.50 m; its retained distance is 0.65 m. Each trial uses
alternating hands, both side assignments, and a lying or normally recovering foe.
The 90 N s shove is always world +Z at 3 s; these are mirrored assignments, not
geometrically reflected falls. Autonomous attack begins at 4 s.

| Forward distance (m) | Left lying/rising low driven blows | Right lying/rising low driven blows | Attacker falls / 4 |
|---|---|---|---:|
| 0.40 | 11/0 | 0/5 | 1 |
| 0.45 | 13/0 | 0/5 | 3 |
| 0.50 | 0/0 | 0/0 | 4 |

Several attackers fall while approaching, before the first fold or stroke.
Moving closer cannot be promoted from the improved right recovering case alone.
No distance override is retained in `MindConfig`.

## Conservative walking-column clearance

`combat-ground-volume-screen.json.gz` retains eight complete 45 s bouts and exact
source overrides. This prototype projects observed shapes that intersect the
vertical interval from the feet to the attacker's actual COM onto the ground,
and applies conservative horizontal clearance in route/placement/near decisions.
It is not an exact prediction of the walking legs' future shape.

| Forward distance (m) | Left lying/rising low driven blows | Right lying/rising low driven blows | Attacker falls / 4 |
|---|---|---|---:|
| 0.40 | 0/0 | 0/0 | 1 |
| 0.65 | 2/0 | 0/0 | 1 |

The rule suppresses approaches and does not remove falls. It does not establish
that missed lower-leg clearance caused the nearer-placement failures. The entire
prototype is removed after this failed admission; the original clearance remains.

## Moving low target tracking

`combat-low-tracking-screen.json.gz` retains two four-fixture variants, source
fingerprints and exact file overrides against `baseCommit`. One captures a local
point on the selected observed surface and predicts its centre/spin through the
nominal stroke time. The other advances only by the observation's age. Neither
uses engine handles or opponent policy state. Neither improves the missing right
recovering low blows; each also loses stationary access. Target tracking is not
retained. These failures do not isolate the cause of the missed attacks.

The folded heading differs from the planned approach by roughly 0.016?0.018 rad
in the recorded overlap admission fixtures. This rules out a large initial
heading error in those fixtures; it says nothing about subsequent target motion.

Run the physical qualification with:

```powershell
node --test tests/core-combat-low-workspace.test.mjs
node research/combat-strikes.mjs '{"hand":"right","family":"downward","mode":"hit","surface":"top","ahead":0.35,"across":0.1,"up":-1.3,"armExtension":1,"support":{"shared":true,"lower":0.5,"attackAt":4,"riseAt":12},"seconds":16}'
```

All failed prototype rows and their exact source files are retained without
turning an unqualified controller into the playable preset. Standing fighting,
low placement and finishing must pass together before promotion.
