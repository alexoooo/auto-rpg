# Grounded combat

## Policy settings

The experimental Arena policy uses the ordinary Warrior body, common muscle bounds and
supported low-strike executor. Settings are development search cells measured in Node Arena
Duel, rapier-coordinate, 120 Hz, empty hands, balance 0/0. An ordinary 90 Ns upper-trunk
shove creates the knockdown at 3 s; no pose is installed. Attack orders are released at 4 s.

`GROUND_NEAR` approaches the highest actual vertex of the sensed upper or middle trunk.
Its side offset is 0.35 m, forward offset 0.04 m and outer waypoint offset 0.35 m. The
along threshold is 0.12 m. Walking components are capped at 0.18 m/s with 0.5 s braking;
0.35 m/s forward approaches topple the attacker in the close fixture. Arrival stops inside
0.10 m and requests support acquisition inside 0.12 m only during ordinary standing with
COM speed below 0.10 m/s. Geometry refreshes every 0.5 s between committed strokes.
Displacement above 0.20 m or range above 0.60 m requests standing before repositioning.
The requested lowering is the measured 0.50 m common fold.

`GROUND_COMBAT` in `ground-wide.ts` retains a wider placement: 0.10 m across, 0.65 m ahead
and 0.80 m reach. It tests eight equally spaced orientations, derives foot separation from
its own sourced spec, rejects occupied planned sole positions, and searches routes around
observed colliders. Both observed soles are checked at a 0.12 m radius with 1 s walking
lookahead. A walking direction stays fixed in world space until the stride counter advances.
The radius is an engineering footprint approximation; polyhedral bounds are conservative.
`ROUTE_MARGIN` is 0.02 m outside expanded envelope corners in the six-node visibility graph.

Both policies retain the chosen hand through an episode. A 30 s approach limit, 5 s
support-acquisition limit, 8 s attack window and 1 s retry spacing bound failed attempts.
These are engineering deadlines, not optimal combat parameters. The common executor
independently verifies actual fixed-ground foot load, COM support and trunk clearance.

## Motion and route admission

`GROUND_ADMISSION` chooses the close approach after all three sensed trunk segments remain
below 0.10 m/s linear speed and 0.20 rad/s angular speed for 0.50 s. It checks the observed
soles' routes to an outer waypoint 0.70 m across and 0.04 m ahead, at a 0.12 m radius.
Alternate-hand control may choose either admitted hand; explicit left/right control retains
that restriction. The wider policy handles motion and a rejected close route. A close
approach stays selected through its episode; observed movement while lowered requests a
standing return. Neither selection nor withdrawal reads opposing orders or recovery state.

These cells reject the direct opposite-hand approach that crosses a lying Warrior's limbs
and trips the attacker. More conservative box-envelope routing also rejects useful space
beside tilted bodies. Exact convex routing was explored but did not solve the tested
placement failures; it is not part of this policy. A motion gate and footprint admission
improve the tested cases, not every downed pose or approach direction.

## Arena integration

`ARENA_SCRAPPER_REFERENCE` extends retained `BRAWLER` with `ground: true`;
research names it `scrapper-v1`. Playable `SCRAPPER` retains that profile after
standing/low admission rejects the spacing and heading-ceiling candidates below. The selectable
Scrapper controller, recipe links, snapshots and research runner all use `combatTactics`
and the same supported executor. Its policy memory, route, deadlines and active hand are
plain bout state. Orders reset the autonomous episode; recovery takeover clears execution,
and resumption reads the body as it is. The HUD exposes low approach, preparation and return.

Four controlled 45 s bouts test both attacking hands against a stationary lying Warrior and
a Warrior running ordinary recovery while receiving standing orders. Each lands at least
two driven low blows and returns to standing; the attacker neither falls nor contacts the
floor with its head/trunk and uses zero force or moment assistance. The recovering opponent
attempts recovery; this test does not require it to finish while being attacked. Complete
records, source fingerprint and actual damage are in `ground-combat-fixtures.json`.
A fresh-world fork covers approach and committed low swing; an ordinary standing order
cancels selection and restores standing through the common executor.

These are controlled ability checks, not competitive ratings. Flat prone targets below the
measured workspace and other approaches can remain unreachable; the policy expires and
repositions rather than claiming a hit. Warrior fists are the validated scope. The retained
Brawler's 600 held-out bouts do not rate the grounded extension. Finishing power, broader
loadouts and repeated league evaluation remain open.

## Opponent height

`LOW_HEAD` classifies a sensed head centre below 0.80 m over own support as low. The same
height is frozen in the combat evaluator protocol. This is an engineering observation gate,
not a grant of the opponent's recovery state. Physical Warrior shoves gate the reading.

## Built browser check

The production Arena opens two unarmed Warriors with Scrapper selected on both sides, balance
0/0 and continuing recovery. Tactical view shows the bodies and the HUD advances through
approach, chamber and return. The passive measurement covers 182 active frames and 2,145
physics steps (17.875 simulated seconds at 120 Hz): mean step 2.384 ms, batch-step mean p95
3.267 ms, frame CPU median 29.6 ms and p95 40.7 ms. Median delivered frame interval is
1,008.2 ms despite a visible tab, and simulated/real time is 0.1004. Node checks overlap
the early part of inspection. This checks built integration, not 60 FPS, GPU time, individual
step p95 or visually demonstrated low combat. The owned preview and tab are stopped.

## Profile admission

`combat-profile-admission.json` retains twenty whole physical trials and their
configurations/source identity. Node Arena Duel, rapier-coordinate, 120 Hz, Warrior
fists, balance 0/0, continuing recovery. Each profile runs the same 30 s self-play
recipe and four 45 s controlled knockdowns: each attacking hand, against a lying
or recovering opponent. `groundFight` accepts an immutable candidate configuration
for this matched comparison; it still uses the ordinary Arena mind and body path.

| Profile | Self-play driven HP, left/right | Self-play trunk blows, left/right | Low driven blows: right lying/rising, left lying/rising | Low fixture gates passed / 4 |
|---|---:|---:|---|---:|
| Retained Scrapper | 0.269 / 0.415 | 10/11 | 15/2, 2/2 | 4 |
| Additional spacing 0.10 m | 0.072 / 0.009 | 1/0 | 15/2, 2/2 | 4 |
| Heading ceiling 2 rad/s | 0.362 / 0.248 | 10/6 | 6/0, 1/0 | 1 |
| Both | 0.097 / 0.672 | 1/11 | 6/0, 1/0 | 1 |

Every controlled low-fixture attacker stays upright, clear of the floor with its
head/trunk, and uses zero assist. The low gates require acquisition before 15 s, more than 100 quiet-ready
steps, at least two driven low blows, more than 0.015 HP damage, verified hand
returns and standing return after the low episode. No proposed setting passes both
the existing useful-self-play gate and all four low gates. Neither becomes the
selected Scrapper profile. The earlier competitive results remain valid for their
recorded configurations; they do not establish that two equal candidates fight
effectively or that those configurations preserve the controlled low ability.

The added selectable-Scrapper self-play regression rejects the combined proposed
profile and keeps that gap visible alongside the low tests. Spacing admits a target
farther out than the original reserve: two equal controllers can settle outside a
useful stroke. This is a plausible geometric cause, not yet a measured workspace
explanation. Target reach/launch admission and turn-aware low approach need physical
validation before another profile is promoted.

## Low workspace and failed approach refinements

The shared executor qualifies a bilateral 0.33 m top-face strike with verified
miss returns and standing restoration. Nearer approaches, conservative walking
columns and moving-surface tracking fail broader Arena admission. Their complete
rows, exact prototype sources and measurement distinctions are retained in
[low workspace](combat-low-workspace.md). They do not change playable Scrapper.
