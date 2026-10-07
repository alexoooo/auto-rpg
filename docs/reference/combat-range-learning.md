# Working distance from observed misses

`ArenaFighterConfig.spacingStep` (`src/core/mind/config.ts@352fbe24`) optionally reduces the extra spacing requested by
`spacing`, in metres. `rangeLearning` in `src/core/mind/range-learning.ts` observes
the ordinary shared executor's chamber, swing and return. A correction requires
an actually launched swing, no external hand contact during its episode, and an
increase in that hand's verified-return count. Preparation failures, return
timeouts and touches during any phase do not justify moving closer.

The offset only falls toward zero: the original working-distance rule is its
floor. The policy steps through ordinary locomotion; no pose, velocity, impulse,
force, muscle strength or damage rule is changed. A successful contact does not
raise spacing again. Learning from an evaded target can shorten the extra spacing
too; the tactile observation alone does not identify a miss's geometric cause.

Opportunity state, current offset, clean-miss count and adjustment count are plain
saved tactical data. Orders, recovery/resumption and low-combat takeover cancel
the pending episode. A changed observed opponent restarts the offset and counts.
Low strokes do not train the standing range. The observation reaches no opponent
orders, health, controller or future state. Omitted/zero `spacingStep` preserves
fixed spacing; active adaptation requires finite nonnegative spacing and step.

The physical tests reach a correction through real self-play, fork a subsequent
committed swing to a fresh world, compare complete state and pose traces, and
cancel pending learning with an ordinary order. A real short-return-deadline
fixture launches clean swings and times out every return; it never trains a
shorter distance. Pure episode tests cover every contact phase, preparation,
cancellation and the offset floor.

## Self-play development

`combat-range-selfplay.json` retains seven whole development bouts and source
identity. Node Arena Duel, rapier-coordinate, 120 Hz, Warrior fists, balance 0/0,
continuing recovery, the same 30 s self-play recipe. Each contender has identical
body-targeting Scrapper configuration with additional spacing 0.10 m.

| Step (m) / optional objective | Driven HP, left/right | Trunk blows, left/right | Final extra spacing, left/right |
|---|---:|---:|---:|
| Fixed spacing | 0.072 / 0.009 | 1/0 | 0.10/0.10 |
| 0.02 | 0.113 / 0.373 | 1/6 | 0.02/0.04 |
| 0.05 | 0.398 / 0.174 | 10/5 | 0/0.05 |
| 0.10 | 0.251 / 0.283 | 10/7 | 0/0 |
| 0.05 + bounded combinations | 0.279 / 0.313 | 5/7 | 0.05/0.05 |
| 0.10 + bounded combinations | 0.478 / 0.073 | 13/3 | 0/0 |
| 0.10 + full elbow preference | 0.572 / 0.364 | 17/9 | 0/0 |

All contenders remain upright and use zero assistance. Each adaptive case records
actual clean misses and bounded corrections. These single-recipe self-play cells
select development candidates; they do not establish competitive strength. The
full-elbow candidate improves total delivered damage about 37% over the original
unspaced Scrapper's same-recipe 0.269/0.415 HP, but must pass low and active-opponent
gates too. Damage is the evaluator's observed driven wound credit; it is not motor
work, requested contact speed or a count of touches.

## Low-attack admission

`combat-range-low.json` retains all four 45 s controlled low bouts of the 0.10 m
step/full-elbow candidate, on the same Node Arena engine/rate/body/assist recipe.
Each hand meets a lying or ordinarily recovering Warrior. Three fixtures pass the
existing low gates. The left-hand lying case lands two driven low blows and returns
standing but later falls, contacts the floor with its head/trunk, and has one
failed return. Its whole record is retained. No profile with that failure replaces
playable Scrapper.

## Active-opponent development

`combat-range-development.json` retains all 128 bouts and eight matched groups.
Node Arena Duel, rapier-coordinate, 120 Hz, Warrior fists, balance 0/0, continuing
recovery, 60 s cap. Each cell has eight mirrored recipes (16 bouts). Point and
Brawler use development indices 8-15; Classic reuses indices 100-107 from the
previous spacing holdout. Reused recipes are development evidence here, not a
fresh promotion holdout. Fixed spacing is the matched reference.

| Opponent | Profile | W/D/L | Driven HP/s | Received HP/s | Own falls |
|---|---|---:|---:|---:|---:|
| classic | Fixed spacing | 15/0/1 | 0.003239 | 0.000091 | 5 |
| classic | Adaptive + full elbow | 16/0/0 | 0.007799 | 0.001132 | 3 |
| point | Fixed spacing | 15/1/0 | 0.005597 | 0.000053 | 0 |
| point | Adaptive | 15/1/0 | 0.010363 | 0.000267 | 0 |
| point | Adaptive + full elbow | 16/0/0 | 0.009132 | 0.000346 | 0 |
| brawler | Fixed spacing | 16/0/0 | 0.018593 | 0.010031 | 0 |
| brawler | Adaptive | 10/0/6 | 0.013684 | 0.012938 | 0 |
| brawler | Adaptive + full elbow | 13/0/3 | 0.016086 | 0.011364 | 0 |

All bouts end at the cap. Adaptive range with full elbow preference improves
Classic damage rate and reduces its own falls (five to three), but both adaptive
profiles lose more often to Brawler than fixed spacing. This iteration provides
useful optional control state without establishing a stronger playable profile.
The original Scrapper remains selected. Action-specific arm preference is implemented and measured in
`combat-arm-style.md`; its complete low admission still exposes a later approach
fall. Stronger low-path stability and finishing remain open.
