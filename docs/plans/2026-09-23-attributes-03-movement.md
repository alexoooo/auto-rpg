# Attributes 03 -- movement

Movement scales how fast a body travels: forward, backward and sideways, and how hard it
accelerates. It follows the per-stat protocol in `-00-overview.md`, and this file adds what is
particular to movement.

## The knob

- **Where it lives.** It is the locomotion module's `carrier` table: `maxSpeedMps` (3.2 on the
  stone biped), `backSpeedMps` (1.9), `strafeSpeedMps` (2.4) and `maxAccelerationMps2` (9.0).
  `HUMAN_BIPED` overrides the top speed to 2.6.
- **Scale the four fields together.** The back and strafe ratios, 0.59 and 0.76 of a walk, are
  kept by construction. They exist because a golem that backs off as fast as it advances can
  never be cornered.
- **Scale the table, not only the port's config.** The biped reads `B.carrier` every step in more
  places than the port:
  - `bipedFootSpeed` and `bipedPose` (the stride);
  - `carrierSpeed()`;
  - the gait scale in `authority()`;
  - the envelope axes.

  The `VirtualLocomotionCarrier` constructor freezes a copy of the config it is handed. So the
  builder makes one scaled table per build, `{ ...B, carrier: scaled }`, and hands that one table
  to both. Scaling only the port lets the carrier outrun its own legs.
- **Wheel and multileg bind their tables internally.** `wheelModule` and `multilegModule` read
  `LOCOMOTION_WHEEL` and `LOCOMOTION_MULTILEG` inside the function. First refactor them to take
  their table as an argument, the way `bipedDefinition(id, label, B)` already does, and commit that
  refactor on its own with an all-`same` fingerprint. Then scale.
- **Hobble still applies on top.** `GOLEM_RUIN.strippedMobility` and each ruined leg's share are
  fractions of the scaled command, so a ruined leg costs the same fraction at every setting.

## Bench (Node harness, `runGolemLocomotion` in `tests/harness/golem-bench.mjs`)

- **Top speed reached** on a straight course, at levels 0.75, 1.0, 1.25 and 1.5, for the biped,
  the wheel and the multileg. It must track the multiplier until something else binds. If it stops
  tracking, name what binds.
- **Foot slip.** The biped's mean slip against `meanFootSlipBudgetMps`. The carrier drags by design
  and the gait has to sell it. A level where the feet visibly skate is a level the UI does not
  offer. This is an **eye gate**: watch the biped at the top level on `/bench.html` before choosing
  the range.
- **Stability while moving.** The supported state machine must not stagger a body that is only
  walking. Stumbles per metre at each level.

## Sweep

Run the protocol levels. Two things are worth reading in the per-mind split:
- whether a mind that keeps range (the miser, or the fencer if added) gains more than a closer
  (the brawler) does;
- bout length, because faster bodies close sooner.

## Hazards

- **The dungeon also paths on the footprint and speed.** Check that a fast hero is still stopped
  by walls and posts. `validateRoomPlacements` and the dungeon's movement both read the carrier.
- **The walker bench's floor.** A walker stops at 12.66 m on the stand's floor authority. A fast
  course must fit inside it, or the course has to be shortened (a trap an earlier session paid
  for).

## Done when

Movement is `live` with a measured range. The table is in the row's doc comment and the
measurements doc. The wheel and multileg take their tables as arguments. The fingerprint reads all
`same` at 1.00.
