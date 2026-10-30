# Upward head-strike experiment

The optional `uppercut` family and its cells: `ATTACK_PATH.uppercutWindup` and `uppercutSeconds`
(`src/core/skills/strikes/attack-path.ts`), `OPENINGS.uppercut` and `uppercutReserve`
(`src/core/perception/openings.ts`), and the hull-plane tolerance of `tests/core-combat-uppercut.test.mjs@2a1b29ac`.
The chamber drops behind the guard; the stroke uses the tracked path, an explicit world contact
direction, shared IK, muscle limits and verified return. No root force, strength, collision or
damage rule changes.

## Path cells

`uppercutWindup` is 0.12 m (chamber drop) and `uppercutSeconds` 0.25 s (outbound), with the
ordinary 5 m/s endpoint ask. At 0.35 m ahead either hand lands six contacts and six verified
returns with no failure, fall or assistance; lowest upward closing speeds 3.030/3.029 m/s
(right/left), mean contact mass 0.264/0.263 kg. Misses return four times a hand.

Harness: 46 Node core-stand cells (unpinned) in `combat-uppercut-probes.json`, `-timing.json`,
`-close.json` and `-physical.json`; rapier-coordinate, 120 Hz, Warrior fists, balance 0, 8 s. The
target is a horizontal 0.20 × 0.08 × 0.20 m box, bottom at 1.63 m, lateral ±0.10 m, direction
[0,1,0]. Peaks are driven pre-contact knuckle speeds; contact mass is the game's free-joint value
at the post-step solver point, not impulse or work.

- 0.12 s outbound misses in all twelve chamber (0.12/0.22/0.35 m) × elbow cells.
- 0.18/0.25/0.35 s at 0.50 m ahead land with small contact mass.
- 8 m/s asks miss in every close cell (0.30/0.35/0.40 m ahead), as do all 0.30 m cells.

## Selection cells

The `boxing` repertoire adds the upward family to straight and hook ranking. Lower surfaces come
from the sensed capsule or hull; a ray that misses returns null, never an interior centre. The
action carries world [0,1,0], turned into the root frame by the skill. `OPENINGS.uppercut` is the
rank cost, 0.1, and `uppercutReserve` the close-range reach kept back, 0.25 m: development cells,
not validated across bodies or loadouts.

The test's ray geometry allows 1e-6 m of hull-plane error: the native quaternion round trip leaves
1.0743e-7 m in the central standing fixture, while replay stays bit exact.

## Arena diagnostics

`combat-uppercut-diagnostics.json`: fourteen Node Arena Duel bouts, rapier-coordinate, 120 Hz,
Warrior fists, balance 0/0, continuing recovery; each profile against each opponent on both sides
for 60 s, and itself for 30 s. Ranked: head 0, trunk 0.20/0.40, ordinary uppercut cost; preferred
changes only the uppercut cost to -0.60.

| Profile | Opponent | W/D/L | Own driven HP, left/right side | Head blows, left/right side |
|---|---|---:|---:|---:|
| ranked | point | 2/0/0 | 0.4221/0.4178 | 1/1 |
| ranked | brawler | 0/0/2 | 0.3173/0.2269 | 0/0 |
| ranked | classic | 2/0/0 | 0.3659/0.2163 | 11/1 |
| preferred | point | 2/0/0 | 0.0108/0.0330 | 0/0 |
| preferred | brawler | 0/0/2 | 0.0439/0.0079 | 1/0 |
| preferred | classic | 1/0/1 | 0.0087/0.0066 | 0/1 |

Every bout reaches the cap and nobody falls. Ranked mostly throws straights; preferred throws
uppercuts that meet guards (self-play 0.00336/0.00329 HP against ranked's 0.257/0.190, pressure
episodes over 2 s against Point). Preferred fails admission; the primitive stays for research.
