# Grounded combat

## Policy settings

`GROUND_COMBAT` is an experimental neutral policy over detached geometry and the supported
executor. Node Arena Duel, Rapier coordinate gameplay engine, 120 Hz, empty Warrior hands,
balance 0/0. An ordinary 90 Ns upper-trunk shove creates the knockdown; no pose is installed.

A 0.35 m side offset, 0.04 m forward offset and 0.35 m outer waypoint keep the approach beside
the torso. The along threshold is 0.12 m. Both walking components are capped at 0.18 m/s,
with a 0.5 s braking time; raising forward speed to 0.35 m/s topples the attacker in the close
fixture. Arrival stops inside 0.10 m and enters support acquisition inside 0.12 m only when
COM speed is below 0.10 m/s and the ordinary step reports standing. Geometry refreshes every
0.5 s between strokes. Target displacement above 0.20 m or range above 0.60 m requests standing
return before repositioning. The requested lowering is 0.50 m, the measured shared fold.

The 0.80 m head threshold over own support is an engineering low-opponent classifier, not an
opponent recovery-state grant. A 30 s approach limit, 5 s support-acquisition limit, 8 s attack
window and 1 s retry spacing bound failed attempts. These deadlines are engineering limits,
not measured optimal combat parameters. The shared executor independently verifies loaded
feet, COM support and clearance before accepting a low stroke.

The exploratory static-grounded fixture records 13 driven strokes, 0.327 HP of real wound
damage and no attacker fall, then physical standing return. Refreshing the approach records
10 driven strokes, 0.113 HP, no fall and one failed return. A recovering target moves away:
refreshing only the approach gives one weak driven stroke (0.002 HP), while a frozen approach
topples the attacker. These findings motivate refreshing the target between committed strokes
and returning to standing for larger target movement. They do not establish autonomous
low-combat strength.

The experimental foot sweep checks both observed soles at a 0.12 m radius against all sensed
body and attached-item collider bounds, projecting each proposed walk for 1 s. The radius is
an engineering footprint approximation for the Warrior fist scope; conservative bounds can
refuse a route. Failed routes remain bounded by the approach deadline.

`ROUTE_MARGIN` adds 0.02 m outside the expanded envelope corners, an engineering clearance
for avoiding exact tangency in the bounded six-node visibility graph. `GROUND_COMBAT` tests
eight equally spaced orientations, rejects occupied planned sole positions and holds the
chosen hand through the low episode. The route checks a 0.12 m centre sweep; the actual
command independently checks both observed soles and is held until the stride counter advances.
The 0.40 m side offset is another measured supported-strike search cell. The top-surface ray
uses sensed collider geometry, allowing a downward path to meet the actual top of the torso.

## Opponent height

`LOW_HEAD` classifies a sensed head centre below 0.80 m over own support as low. The same height
is frozen in the combat evaluator protocol; this is an engineering observation gate, not a
read of the opponent recovery state. A physical Warrior shove gates the reading in tests.
