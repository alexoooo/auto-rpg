# Predictive combat defense

The search cells of predictive cover (`DEFENSE`, `src/core/perception/threat.ts`) and the boundary
clearance check (`clearStep`). Both read sensed striking points and physical shapes, never the
opponent's intentions, wounds, commands or future world state. Actual physics decides blocks and
damage.

## Settings

`DEFENSE` holds development search cells, conservative planning inputs that raise no muscle:

| Cell | Value |
|---|---|
| guard neighbourhood a closing ray must enter (`out`) | 0.3 m |
| horizon (`horizon`) | 0.3 s |
| hand travel speed the intercept needs (`speed`) | 3 m/s |
| reach reserve (`reserve`) | 0.08 m |
| minimum tracking duration (`minimum`) | 0.05 s |

Sensed hand spin adds to the striking point's velocity; observation time corrects sample age, and
saved own-head samples give relative velocity. A free hand gets an intercept only if it meets both
travel time and sourced reach; otherwise the controller asks for an escape. An unlaunched strike
returns on cancellation; a launched one keeps its committed path.

## Boundaries

The Arena builder grants detached copies of the boxes and hulls it installs as collision geometry;
decorative meshes grant nothing. `clearStep` sweeps the trunk's collision radius plus the margin
against rotated boxes and hull bounds. A body already inside the margin may move out of it; retreat
tries the asked side, its mirror and lateral alternatives before asking for no movement. It is a
necessary clearance check, not future-physics planning.

## Measurement

Nine 30 s Node Arena probes (`combat-defense-probes.json`): rapier-coordinate, 120 Hz, empty
Warriors, balance 0/0, gap 4 m, six-step sensed delay, continuing recovery; same bodies and attack
paths.

| Defense | Self-play driven contacts | Self-play driven damage (HP) |
|---|---:|---:|
| reference cover | 17/16 | 0.039/0.032 |
| predictive | 10/8 | 0.046/0.044 |
| disabled | 18/17 | 0.105/0.083 |

Predictive cancellation costs initiative in this diagnostic; Point assignments are mixed. A mind
chooses it as its cover's `guard: "predictive"`.
