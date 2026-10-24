# Grounded combat

The cells of fighting a foe who is down or rising: the approaches (`GROUND_APPROACH`, shared,
`src/core/mind/ground-approach.ts`; `GROUND_NEAR`, `ground-near.ts`; `GROUND_COMBAT`,
`ground-wide.ts`; `ROUTE_MARGIN`, `ground-route.ts`), their admission (`GROUND_ADMISSION`,
`ground-position.ts`), the low-foe gate (`LOW_HEAD`, `sensed-bounds.ts`) and the Scrapper that
uses them. All are development search cells or engineering deadlines on the ordinary Warrior,
common muscle bounds and the shared supported low-strike executor.

Harness for every figure: Node Arena Duel, rapier-coordinate, 120 Hz, Warrior fists, balance 0/0,
continuing recovery. An ordinary 90 N s upper-trunk shove at 3 s makes the knockdown (no pose
installed); attack orders are released at 4 s.

## Policy settings

`GROUND_APPROACH` holds the cells both approaches share:

| Cell | Value |
|---|---|
| walking component cap / braking (`speed`, `braking`) | 0.18 m/s / 0.5 s |
| arrival stop / support acquisition radius (`near`, `settle`) | 0.10 / 0.12 m |
| COM speed for acquisition, standing (`quiet`) | below 0.10 m/s |
| geometry refresh between strokes (`refresh`) | 0.5 s |
| target displacement that asks standing first (`targetShift`) | 0.20 m |
| approach / acquisition / attack / retry limits (`approach`, `acquisition`, `attack`, `retry`) | 30 / 5 / 8 / 1 s |

`GROUND_NEAR` approaches the highest actual vertex of the sensed upper or middle trunk:

| Cell | Value |
|---|---|
| side / forward / outer waypoint offset (`across`, `ahead`, `outside`) | 0.35 / 0.04 / 0.35 m |
| along threshold (`along`) | 0.12 m |
| range that asks standing first (`reach`) | 0.60 m |

The lowering depth is the blow's own (`lower` on the action, 0.50 m for the Scrapper's downward
blow), which the support fold reaches against its own full depth (`COMBAT_FOLD`,
`src/core/skills/support-fold.ts`).

Forward approaches at 0.35 m/s topple the attacker in the close fixture, hence 0.18 m/s. The
deadlines bound failed attempts; they are not optimal combat parameters.

`GROUND_COMBAT` is the wider placement: 0.10 m across, 0.65 m ahead, 0.80 m reach, with the shared
cells. It tests eight orientations (`orientations`), takes foot separation from its own
sourced spec, rejects occupied planned sole positions, and routes round observed colliders, both
observed soles checked at a 0.12 m radius (`footRadius`, an engineering footprint) with 1 s
lookahead (`lookahead`). A walking direction holds in world space until the stride counter
advances. `ROUTE_MARGIN` is 0.02 m outside the expanded envelope corners of the six-node
visibility graph.

Both keep the chosen hand through an episode. The executor independently verifies foot load on
fixed ground, COM support and trunk clearance.

## Motion and route admission

`GROUND_ADMISSION` chooses the close approach once all three sensed trunk segments stay below
0.10 m/s (`quiet`) and 0.20 rad/s (`spin`) for 0.50 s (`steady`), and the observed soles' routes
to an outer waypoint 0.70 m across (`outside`) and 0.04 m ahead (`ahead`) clear a 0.12 m radius
(`footRadius`). Otherwise the wider policy takes it. A close approach stays chosen through its
episode; observed movement while lowered asks a standing return. Alternate-hand control may take
either admitted hand; explicit left/right keeps that hand. Neither selection nor withdrawal reads
opposing orders or recovery state.

The cells reject the direct opposite-hand approach that crosses a lying Warrior's limbs and trips
the attacker. Box-envelope routing also rejects useful space beside tilted bodies, and exact
convex routing did not solve the tested placement failures.

## Arena integration

`SCRAPPER` (`src/core/mind/config.ts`; research names it `scrapper-v1`) fights low through its
`ground` tactic and the shared supported executor (`support-fold`). Its policy memory, route,
deadlines and active hand are plain bout state. Orders reset the episode; recovery takeover clears
execution, and resumption reads the body as it is.

Four controlled 45 s bouts, either attacking hand against a stationary lying Warrior and one
running ordinary recovery under standing orders (`ground-combat-fixtures.json`): each lands at
least two driven low blows and returns to standing, with no attacker fall, head/trunk floor
contact or assistance. The recovering foe attempts to rise but need not finish. Prone targets below
the workspace stay out of reach; the policy expires and repositions.

## Opponent height

`LOW_HEAD` classifies a sensed head centre below 0.80 m over the body's own support as low; the
combat evaluator's protocol freezes the same height. It is an observation gate, never a grant of
the opponent's recovery state; physical Warrior shoves gate the reading.

## Low workspace

The shared executor lowers the Warrior, strikes a horizontal face 0.33 m above the floor with
either fist, verifies each return and restores standing (`support.shared: true` in
`research/combat-strikes.mjs`, the game's `supportFold`;
`tests/core-combat-low-workspace.test.mjs@2a1b29ac`).
Node core stand (unpinned), lowering at 2 s to `lower: 0.5`, attacks from 4 s, standing at 12 s, 16 s
a trial; box 0.20 × 0.08 × 0.20 m with its top at the target, ±0.10 m across, 0.35 m ahead, full
elbow preference (`combat-low-shared-qualify.json.gz`):

| Hand / fixture | Contacts | Verified returns | First contact downward speed (m/s) |
|---|---:|---:|---:|
| left / hit | 8 | 9 | 5.106 |
| right / hit | 8 | 8 | 5.103 |
| left / miss | 0 | 8 | - |
| right / miss | 0 | 7 | - |

No failed cycle, fall, head/trunk floor contact or assistance. Later contacts slow to 0.641/1.072
m/s: repeated touches are not repeated 5 m/s strikes. The 18-cell workspace and 16-cell elbow
screens (`combat-low-shared-workspace.json.gz`, `combat-low-shared-arm.json.gz`; their `closing`
is radial, read `-velocity[1]` for motion into the top) map access, not damage: 0.27 m lands
almost nothing, 0.40 m lands 7–9 a hand at 0.45–0.55 m ahead, and the 0.33/0.45 m full-left cell
falls.

```powershell
node research/combat-strikes.mjs '{"hand":"right","family":"downward","mode":"hit","surface":"top","ahead":0.35,"across":0.1,"up":-1.3,"armExtension":1,"support":{"shared":true,"lower":0.5,"attackAt":4,"riseAt":12},"seconds":16}'
```

## Profile admission

`combat-profile-admission.json`: per profile the same 30 s self-play recipe and four 45 s
knockdowns (either hand, lying or recovering foe), through `groundFight` and the ordinary Arena
mind. The low gates: acquisition before 15 s, over 100 quiet-ready steps, at least two driven low
blows, over 0.015 HP, verified returns and a standing return.

| Profile | Self-play driven HP | Self-play trunk blows | Low driven blows: right lying/rising, left lying/rising | Low gates / 4 |
|---|---:|---:|---|---:|
| Scrapper | 0.269 / 0.415 | 10/11 | 15/2, 2/2 | 4 |
| extra spacing 0.10 m | 0.072 / 0.009 | 1/0 | 15/2, 2/2 | 4 |
| heading ceiling 2 rad/s | 0.362 / 0.248 | 10/6 | 6/0, 1/0 | 1 |
| both | 0.097 / 0.672 | 1/11 | 6/0, 1/0 | 1 |

No proposed setting passes both useful self-play and all four low gates. Spacing admits a target
past the original reserve, so two equal fighters can settle outside a useful stroke (a plausible
cause, not measured).

## Tried and not kept

Each prototype ran against an exact source override of its `baseCommit`, recorded in its file.

- **Nearer wide placement** (`combat-ground-ahead-screen.json.gz`, 12 bouts of 45 s): 0.40 m ahead
  gives 11/0 left and 0/5 right lying/rising low blows with 1 fall in 4; 0.45 m, 3 falls; 0.50 m,
  no blows and 4 falls, mostly on the approach.
- **Walking-column clearance** (`combat-ground-volume-screen.json.gz`, 8 bouts): projecting shapes
  between feet and COM onto the ground suppresses approaches (0 and 2 low blows) and still falls once.
- **Moving low target tracking** (`combat-low-tracking-screen.json.gz`): neither surface-point
  prediction nor age-only advance lands the missing right recovering blows; both lose stationary
  access. The folded heading is within 0.016–0.018 rad of the plan.
- **Manually driven folds** (`combat-low-workspace-front.json.gz`, `-top.json.gz`, 18 cells each)
  skip the readiness gate; the front box's face rises 0.10 m above the asked point, so touching it
  does not prove low access.
