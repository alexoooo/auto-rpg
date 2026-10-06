# Predictive combat defense

The Combat policy uses sensed striking points and physical shapes. It does not read the
opponent's intentions, wounds, commands or future world state. Classic and Point retain
their reference cover. `defenseMode` and `defense: false` retain both ablations as recipe data.

## Settings

`DEFENSE` contains development search cells: a 0.3 m guard neighbourhood, 0.3 s horizon,
3 m/s necessary hand travel speed, 0.08 m reach reserve and a 0.05 s minimum tracking
duration. These are conservative planning inputs, not increases to muscles or certificates
of attainable joint motion. Sensed hand spin contributes striking-point velocity. Actual
body observation time corrects sample age, while saved own-head samples supply relative
velocity. A closing ray must enter the guard neighbourhood. A free hand must satisfy both
travel time and sourced reach before it receives an intercept. Otherwise the controller
requests an escape. An unlaunched strike returns on cancellation; a launched strike retains
its committed path. A passed observed threat opens the bounded 0.2 s counter window in
`COMBAT` (`combat-strikes.md#tactical-settings`). Actual physics decides blocks and damage.

## Boundaries

The Arena builder grants detached copies of the same boxes and hulls that it installs as
collision geometry. Decorative meshes grant nothing. `clearStep` checks a conservative
sweep against rotated boxes and hull world bounds. The sweep uses trunk collision radius
plus the recorded margin. Already touching a margin can move out of it. Retreat considers
the requested side, its mirror and lateral alternatives before asking for no movement.
This is a necessary clearance check, not full future-physics planning.

## Validation

Tests cover mirrored hands, slow pressure, tangential misses, head motion, sample age, spin,
necessary reach/travel checks, rotated wall/post clearance, physical available-hand guard
commands and fresh-world replay. A real parapet fixture reaches the boundary through ordinary
movement orders before autonomous combat; it installs no pose or velocity.

Nine 30 s Node Arena probes in `combat-defense-probes.json` use rapier-coordinate, 120 Hz,
empty Warriors, balance 0/0, gap 4 m, six-step sensed delay and continuing recovery. Reference,
predictive and disabled defense retain the same bodies and attack paths. Reference self-play
produces 17/16 driven contacts and 0.039/0.032 hp driven damage; predictive self-play gives
10/8 and 0.046/0.044 hp; disabled gives 18/17 and 0.105/0.083 hp. Thus predictive cancellation
reduces initiative in this diagnostic. It remains an explicit experimental variant and is not
the default. Point assignments also show mixed outcomes; these fixtures are not rating samples
and establish no stronger defense claim.
