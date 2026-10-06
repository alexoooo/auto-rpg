# Upward head-strike experiment

The optional `uppercut` action lowers the chamber using `uppercutWindup`, behind
the ordinary guard. It uses the same tracked path, explicit world contact direction,
shared IK, muscle limits and verified return. An upward contact direction aims at
a lower surface; no root force, strength, collision or damage rule changes.

The initial chamber search tests 0.12, 0.22 and 0.35 m with either inherited elbow
preference. Physical admission precedes selection or playable exposure. The bottom
fixed-face stand observes pre-contact upward knuckle speed and actual solver
contact mass, not requested speed or a motor-work measurement.

## Physical admission

`combat-uppercut-probes.json`, `combat-uppercut-timing.json`,
`combat-uppercut-close.json` and `combat-uppercut-physical.json` retain all 46 whole
Node unpinned core-stand development cells with the same source fingerprint:
rapier-coordinate, 120 Hz, Warrior fists, balance 0, eight simulated seconds.
The fixed target is a horizontal 0.20 by 0.08 by 0.20 m box, with its bottom at
1.63 m, and lateral +/-0.10 m. The declared direction is world [0,1,0]. Peaks are
driven upward pre-contact knuckle velocity, excluding startup and post-contact
motion. Contact mass is the game's free-joint/floating-body value at the post-step
solver point/normal; it is not impulse, work or whole-body transfer.

The 0.12 s outbound requests miss in all twelve initial chamber/elbow cells.
The timing search tests 0.18, 0.25 and 0.35 s with all three chambers. At 0.50 m
forward, slower cells land, but contact mass is small. The close search uses
0.30/0.35/0.40 m forward and 5/8 m/s requested endpoint speed; every 8 m/s cell
misses, as do the 0.30 m cells. Those requests are not stronger primitives.

The retained optional family settings are chamber drop 0.12 m, outbound duration
0.25 s and the existing 5 m/s endpoint request. At 0.35 m ahead, either hand lands
six contacts and six verified returns, with no failures, falls or assistance.
Lowest actual upward closing speeds are 3.030/3.029 m/s (right/left); mean contact
masses are 0.264/0.263 kg. Misses return four times each without failures or falls.
The family timing is independent of the retained straight/hook timings.

Physical tests cover both hands and misses, explicit upward direction, mirrored
chambers, invalid duration and fresh-world swing/return traces. Actual Warrior
capsule/hull rays and a real Arena uppercut fork gate the selector/executor path.
The native quaternion round trip leaves 1.0743e-7 m hull-plane error in the central
standing fixture; the geometry assertion allows 1e-6 m, while full replay remains
bit exact. Replacing the lower ray with the upper ray makes the test fail.

## Experimental selection

`boxing` repertoire adds the upward family to straight/hook ranking. Its lower
surfaces come from the actual sensed capsule or hull. A ray that misses returns
null; it never supplies an interior centre as a hit surface. The selected action
carries world [0,1,0], converted into the current root frame by the common skill.
Contact geometry, support, preparation and return remain physical.

The initial optional close-range reserve is 0.25 m and ranking cost 0.10, with an
immutable `uppercut` cost and nonnegative `uppercutReserve` override for searches.
They are development cells, not anatomy or retained playable settings. The
single-recipe active comparison below rejects the preferred policy; it does not
validate these costs across bodies or loadouts.

`combat-uppercut-diagnostics.json` retains fourteen whole Node Arena Duel bouts:
rapier-coordinate, 120 Hz, Warrior fists, balance 0/0, continuing recovery.
Each profile meets each retained opponent in both assignments for 60 s and itself
for 30 s. Ranked uses head cost 0, trunk costs 0.20/0.40 and ordinary uppercut cost;
preferred changes only the uppercut cost to -0.60. These are diagnostics, not
independent held-out rating samples.

| Profile | Opponent | W/D/L | Own driven HP, left/right assignment | Head blows, left/right assignment |
|---|---|---:|---:|---:|
| ranked | point | 2/0/0 | 0.4221/0.4178 | 1/1 |
| ranked | brawler | 0/0/2 | 0.3173/0.2269 | 0/0 |
| ranked | classic | 2/0/0 | 0.3659/0.2163 | 11/1 |
| preferred | point | 2/0/0 | 0.0108/0.0330 | 0/0 |
| preferred | brawler | 0/0/2 | 0.0439/0.0079 | 1/0 |
| preferred | classic | 1/0/1 | 0.0087/0.0066 | 0/1 |

Every bout reaches the cap. Neither profile falls, but ranked mostly chooses
straight strokes, while preferred launches uppercuts that mostly meet guards.
Ranked self-play delivers 0.257/0.190 driven HP; preferred delivers only
0.00336/0.00329 HP. Preferred Point bouts have pressure-only episodes above two
seconds. The policy fails initiative/strength admission and is not promoted or
added as a playable preset. The shared optional primitive remains available for
executor and contact-access research. Original Scrapper remains selected.
