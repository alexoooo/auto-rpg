# Attributes 05 -- turning

Turning scales how fast a body can turn and how hard it accelerates into a turn. It follows the
per-stat protocol in `-00-overview.md`.

## The knob

- **What it scales.** `carrier.maxYawSpeedRadS` (3.0 on the stone biped) and
  `carrier.maxYawAccelerationRadS2` (11.0), on every locomotion module.
- **The path is movement's.** Scale the one per-build table that session 03 made, and hand it to
  both the port and the gait, so the legs and the carrier agree.
- **Movement's four fields are left alone.** If both stats are set, the table carries both.
- **Check what else reads yaw.** Before choosing the knob, grep for readers of the two fields
  outside the carrier, such as the biped's stepping or the torso twist. If the trunk's twist rate
  (`TORSO_WAIST.twistRate`) turns out to be what a mind leans on to face a flanker, record that
  finding. Do not quietly scale a second table: the waist is the torso's, not the locomotion's,
  and turning it would be a separate decision for the owner.

## Bench (Node harness, `runGolemLocomotion`)

- **Yaw rate reached.** Command a hard turn in place, and record the peak and time-to-90-degrees at
  0.75, 1.0, 1.25 and 1.5, for all three locomotion modules.
- **Feet.** On the biped, a fast pivot is where the feet skate first. Watch it on `/bench.html` at
  the top level before choosing the range, as an eye gate.
- **Stumbles in the turn**, per second of turning, at each level.

## Sweep

Run the protocol levels. Two things to look at:
- bouts where the opponent circles. `GOLEM_TACTICS.circleMin` and `circleMax` drive that, so the
  duelist's split is the interesting one;
- whether turning matters at all when both bodies mostly face each other. If the sweep is flat,
  that is the finding, and the table says so.

## Done when

Turning is `live` with a measured range, the tables are recorded, and the fingerprint reads all
`same` at 1.00.
