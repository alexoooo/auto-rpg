# Combat strike trajectories

The search cells and physical gates of the shared path strike (`ATTACK_PATH`,
`src/core/skills/attack-path.ts`) and of the opening selector (`OPENINGS`,
`src/core/mind/openings.ts`). A tactic names a hand, an observed world target and a trajectory
family; the skill asks ordinary hand goals, supported stance and sourced muscle commands, and
changes no strength, damage rule or assist ceiling. Scope: the Warrior, empty hands.

Every figure here is from the Node core stand (unpinned Warrior) or Node Arena Duel, rapier-coordinate,
120 Hz, symmetric muscles, balance 0 (0/0 in a bout), unless a section says otherwise. Contact
speeds are driven pre-contact readings with startup and post-contact motion excluded.

## Trajectory settings

`ATTACK_PATH` holds experimental search cells:

| Cell | Value |
|---|---|
| chamber / swing / return (`chamberSeconds`, `swingSeconds`, `returnSeconds`) | 0.22 / 0.12 / 0.32 s |
| contact speed asked (`contactSpeed`) | 5 m/s |
| windup / cross offset (`windup`, `across`) | 0.12 / 0.05 m |
| follow-through (`followSeconds`) | 0.04 s |
| thoracic rotation (`torso`), clamped to the joint limits | 0.2 rad |
| hook: duration / lateral curve / lateral terminal component (`hookSeconds`, `curve`, `hookAcross`) | 0.18 s / 0.05 m / 0.15 |
| chamber and return gate: point error / body-relative speed / hold (`near`, `slow`, `hold`) | 0.05 m / 0.6 m/s / 0.05 s |
| preparation / return timeout (`prepareLimit`, `returnLimit`) | 0.8 / 1.2 s |
| startup wait (`startup`) | 2 s |

The path is the shared quintic Hermite; its continuation past the endpoint is linear, so the IK
finite differences keep the asked contact rate. A segment identity starts each path; a moving
target within a segment keeps its start and clock. The point's actual position and velocity, not
the clock, admit launch and verify return. A new external contact interrupts the stroke.

Hooks use a degree-six midpoint deviation with zero endpoint value, velocity and acceleration;
the retained hook is a close-range primitive. Downward paths keep a straight outbound segment from
a higher chamber.

### Timing sweep

Right hand, target (0.15, 1.63, 0.65) m, a fixed obstruction and the same point in empty space,
8 s a cell, swing 0.12/0.15/0.18 s × ask 3/5 m/s × straight/cross (`combat-strikes-physical.json`).
No cell fails a cycle or falls. 0.12 s at 5 m/s gives the lowest contact forward speed of
4.493 m/s (straight) and 4.644 (cross) with 7/7 returns; slower cells land weaker late contacts
(down to 3.197) and the cross at 3 m/s down to -0.227.

### Close hook

Targets (±0.1, 1.63, 0.5) m. Either hand lands 8 contacts (min. forward/total speed 2.72/3.04 m/s
left, 2.69/3.01 right), mean driven path error 0.009 m, returns 7 hit / 6 miss, no failure or
fall, inward speed above 1 m/s. Misses show 0.43–0.45 m endpoint error where the asked extension
exceeds reach. In `combat-hook-search.json`: a 0.7 m lateral direction misses every target; a
0.1 m curve at 0.5 m ahead misses at every time; 0.15 s reaches with a weaker first contact. It is
a small arc round a local obstacle, not a sweeping hook.

## Opening selection

`OPENINGS` ranks head, upper-trunk and middle-trunk collision surfaces. Capsules and spheres are
sampled on their boundary; a box or hull is clipped by its outward convex planes, and the first
ray entry gives the surface point (nine rays round the mean of the points, offsets ±0.25 of the
extent). Hull geometry is cached per sourced segment.

| Cell | Value |
|---|---|
| linear/spin prediction (`prediction`), plus observation age | 0.12 s |
| blocked lane cost (`blocked`) / repeated blocked surface (`repeated`) | 2 / 1 |
| working-range error (`reachPenalty`) | 2 per metre |
| hand-radius margin (`handMargin`) | half the sourced radius |
| surface priority head / upper / middle trunk (`head`, `upperTrunk`, `middleTrunk`) | 0 / 0.2 / 0.4 |
| capsule sample elevations (`elevation`) | -0.5, 0, 0.5 radii |
| hook rank cost / reach kept back (`hookCost`, `hookReserve`) | 0.1 / 0.15 m |
| samples of the commanded hand path (`pathSamples`) | 4 |
| a side blow's line off square (`square`): the line from the striking shoulder (`shoulderFromHead`) to the target against the surface's outward normal there (a hull's entry plane, a capsule's radius), costed by one plus their cosine | 0; a tuning sets it |

These are development search cells. Mixed selection can compare both hands (ties keep the
alternating hand), refreshes at most every 0.12 s while free, and keeps its committed choice and
path clock through a stroke; its memory is bout state. The policy reads no opposing orders,
controller phase, wounds or future physics. `hookCost` is an immutable override for ablations; it
picks among the same measured paths.

### Surface priorities in bouts

Eighteen 30 s diagnostics (`combat-hull-probes.json`), gap 4 m, each candidate mirrored against
linear Combat, Point and Classic; every win at the cap. A capsule-only selector omitted the hull
trunks and gave head-only behaviour (`combat-openings-bouts.json`).

| Priorities head/upper/middle | Driven damage vs Point, both sides (HP) | Driven target contacts vs Point | Self-falls / 6 |
|---|---:|---:|---:|
| 0 / 0.2 / 0.4 | 0.182 / 0.240 | 8 / 8 | 0 |
| 0.3 / 0 / 0 | 0.504 / 0.451 | 19 / 17 | 0 |
| 1 / 0.2 / 0 | 0.525 / 0.632 | 22 / 17 | 1 |

The 0.3 / 0 / 0 candidate, over twenty mirrored 60 s development recipes against linear Combat
(`combat-body-development.json`), wins 40/40 at the cap (Wilson 95 % [0.839, 1.0], Elo lower
bound +286.6), one fall, 2,038 straights and one hook. Development results, not held-out promotion.

## Overhand settings

`ATTACK_PATH.overhandWindup` is 0.35 m: a vertical chamber above the guard for the optional
overhand family, after the ordinary 0.12 m windup back. Preparation, swing, contact speed and the
return gate are the ordinary ones. An optional world contact direction is turned into the root
frame each step; the vertical repertoire asks a downward velocity at top-surface targets.
`OPENINGS.overhand` adds 0 to the rank by default; an override varies it for ablations.

Lift-in-place search, fixed box 0.20 × 0.20 × 0.08 m, target height 1.73 m, lateral ±0.10 m,
8 s a cell, first 2 s excluded, chamber 0.25/0.35 m × preparation 0.22/0.35 s; no cell falls or
uses assistance. At 0.50 m ahead every cell lands 7–8 contacts and 6–7 returns a hand, lowest
axial speed 3.26–3.45 m/s; the 0.35 m chamber at 0.22 s gives 8/8 and 7/7 at 3.441/3.450 m/s
(right/left), with later peaks near 4.1 m/s against 3.9 for 0.25 m. At 0.40 m the box obstructs
preparation in every cell: five chamber-gate failures a side, returned unlaunched. The backed chamber against a top face (0.20 × 0.08 × 0.20 m, top
at 1.73 m, 0.50 m ahead, direction [0,-1,0]) gives 6/7 contacts and 6/6 returns, downward closing
speeds 0.75–3.11 m/s right and 1.41–4.41 left: the hand can meet a surface before its knuckle
point reaches the asked 5 m/s.

## Elbow extension

`ATTACK_PATH.elbowExtension` defaults to 0, keeping the guard-biased point executor. A fraction
in [0,1] eases the active elbow preference toward extension during the swing and back toward guard
during return (cubic endpoint blend, the segment's duration), clamped to the joint range and
composed with trunk rotation; it sets no pose, velocity or strength. Its fractions live in shared
skill state for takeover and replay.

`research/combat-strikes.mjs` reads `measureMass` optionally: contact mass along the solver normal
at the post-step pose, the blow rule's free-joint convention. Twenty cells in
`combat-elbow-probes.json`, fists, fixed front face ±0.10 m across, 0.60 m ahead, 8 s less 2.
At head height (1.63 m) full preference meets 0.351/0.335 kg mean contact mass (right/left)
against 0.246/0.234 at zero, about 43 % more, with 8/8 contacts and returns and axial speeds above
5.0 m/s; at body height (1.23 m) the gain is small (0.248/0.243 against 0.234/0.222). No cell fails
a return, falls or uses assistance.

## Lateral head surfaces

`OPENINGS.headLateral` defaults to 0, the original surface ray. A fraction in [0,1] adds two
horizontal rays either side of it at each height, kept on the sensed sphere or capsule and ranked
by the same lane, reach and prediction terms. It is an optional geometric search cell.

Wider hooks are rejected (`combat-hook-head-probes.json`; fists, 1.63 m, ±0.10 m, 0.50 m ahead):
full elbow preference with the 0.05 m curve lands 8 contacts and 7 returns a hand (mean contact
mass 1.524/1.397 kg, lowest axial speed 2.664/2.694 m/s); 0.10 m curves land 0/3 and 0.15 m none.

Eight held-out-family recipes (0–7) mirrored against Brawler for 60 s, extra spacing 0.10 m
(`combat-elbow-development.json`); every win at the cap:

| Scrapper profile | Wins / 16 | Driven / received driven HP | Own/opponent falls |
|---|---:|---:|---:|
| guard elbow, body targets | 16 | 19.808 / 8.503 | 1/1 |
| full elbow, body targets | 15 | 17.957 / 9.053 | 1/1 |
| full elbow, head-first | 2 | 7.703 / 10.993 | 0/0 |
| full elbow, head cost -0.6 | 3 | 8.539 / 10.896 | 0/0 |

The 128-bout matrix at `1391b685` (`combat-head-access-development.json`) against Point: lateral
head selection raises driven damage to 5.728 HP over 16 bouts against 2.742 for the body reference;
hook preference lowers it to 2.161. Against Brawler lateral surfaces change little. None is promoted.

## Tried and not kept

- **Higher asked speed** (`combat-power-probes.json`, straights at 0.50/0.60/0.70 m): 8 m/s
  contacts and returns at 0.50–0.60 m but not 0.70; 12 m/s mostly misses and fails preparation and
  return. The mirrored Arena matrix does not favour 8 m/s; 5 m/s stays.
- **Overhand selection** at rank cost -0.6: wins both sides against Classic, loses both against
  Point and Brawler, all at the cap (`combat-overhand-diagnostics.json`, no source fingerprint).
- **Tactical cells `COMBAT`** of the Combat policy (range band 0.08 m, braking horizon 0.5 s,
  pressure escape 0.6 s, counter window 0.2 s, boundary escape 0.18 m/s): removed with that
  policy's constant in `ef94828a`. Its prototype (`combat-prototype-bouts.json`) landed 19/20
  driven contacts in self-play, all on hands or forearms, and beat Point on both sides at the cap.
- **Combinations** (`ArenaFighterConfig.combinations`, `src/core/mind/config.ts@352fbe24`): one
  opposite-hand follow-up after a sensed contact, in a window of return deadline plus chamber
  (1.20 + 0.22 s). Little change in Brawler damage advantage and lower Point damage
  (`arena-combat-evaluation.md#matched-combinations-and-low-mode-development`).
- **Shorter chamber and return** pass the standing checks but lose low stability or hook accuracy
  across 51 trials (`docs/reference/combat-cadence.md@7f3ebcdb`).
