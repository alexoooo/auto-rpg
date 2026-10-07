# Independent strike and return

`ArenaFighterConfig.overlap` enables one opposite-hand follow-up while the first hand
returns. It requires `combinations`, alternate hands and opening selection. A confirmed
target contact offers the existing finite combination window. The executor grants overlap
only while standing, after external hand contact has cleared and the actual root-relative
hand velocity points toward its captured guard position. The policy also checks a fresh
unblocked opening, fighting distance, alignment, quiet centre motion and standing footing.
There is no additional timer that substitutes for those physical checks.

Each hand of `combatSkills` is a strike of its own (`effectorStrike`, `state.hands`): the first
hand goes on returning with its captured goal, initial velocity, motion sequence, elapsed time and
elbow preference while the other runs the ordinary chamber/swing/return lane. The measurements
below were taken with the first hand's return held in a saved copy (`state.returning` in
`src/core/skills/combat.ts@a9b7724a`). There is one locomotion owner, one trunk objective and one body
command. Each hand earns a return only through the existing actual distance, speed and
upright hold checks. A deadline counts a failure, and recovery takeover interrupts each
active hand. The report excludes the returning hand from predicted guard placement and
remains busy until both hands finish. Orders cancel the offered follow-up; cancellation
returns both hands. The tactical sequence permits one follow-up, not a third strike.

These are optional capabilities behind the shared action/body/muscle interface. They change
no anatomy, strength, balance assist, contact damage or engine profile. The playable Scrapper
remains `ARENA_SCRAPPER_REFERENCE`.

## Physical stand

Node unpinned core stand, Warrior empty hands, rapier-coordinate, 120 Hz, balance 0. A fixed
front face spans both fist targets at height 1.63 m, lateral +/-0.10 m and forward 0.60 m.
Miss trials remove the box. Ten seconds includes two seconds of startup. All four rows remain
upright, record no preparation/return failures or assistance, and complete at least five
pairs. Speeds below are actual pre-physics closing speeds on swing contacts, not struck peaks.

| Leading hand | Case | Left/right swing contacts | Left/right verified returns | Steps with both hand goals |
| --- | --- | --- | --- | --- |
| Right | Hit | 3 / 7 | 6 / 6 | 230 |
| Left | Hit | 7 / 5 | 6 / 6 | 254 |
| Right | Miss | 0 / 0 | 6 / 6 | 307 |
| Left | Miss | 0 / 0 | 5 / 5 | 259 |

Contact closing speeds exceed 4 m/s. The second fist sometimes misses this fixed target;
verified return does not establish perfect impact accuracy. Full rows, paths and contacts
are in [the admission record](combat-overlap-admission.json.gz), compressed UTF-8 JSON.

Tests prove homeward motion and contact release at transfer, retain the old motor sequence,
and explicitly forbid a transfer from counting as a completed return. Fresh-world forks
cover both leading hands during the overlapping chamber and swing. They compare whole
state and physical traces. Further fixtures cover ordinary cancellation, takeover of both
hands, an actual auxiliary return deadline, both Arena assignments and an Arena fork.
Disabling overlap and falsely crediting a return at transfer each turn the physical test red.

## Matched development comparison

Node Arena Duel, two Warrior fist fighters, rapier-coordinate at 120 Hz, balance 0/0,
continuing recovery and 60 s cap. Both candidates use retained Scrapper with 0.10 m extra
spacing and bounded combinations; only `overlap: true` differs. Four fresh development
recipes per opponent, indices 16–19, vary gap, sense delay and an ordinary initial facing
order, and are mirrored. This is 48 bouts, not the 100-pair held-out promotion battery.
All outcomes are at the cap. Full recipes, rows, paired ratings and uncertainty are in
[the development record](combat-overlap-development.json.gz).

| Opponent | Serial W/D/L | Overlap W/D/L | Serial / overlap driven HP/s | Serial / overlap opposing driven HP/s | Serial / overlap own falls |
| --- | --- | --- | --- | --- | --- |
| Classic | 7/0/1 | 7/0/1 | 0.002330 / 0.002850 | 0.000020 / 0.000021 | 2 / 3 |
| Point | 8/0/0 | 8/0/0 | 0.003845 / 0.002799 | 0.000019 / 0.000023 | 0 / 0 |
| Brawler | 7/0/1 | 7/0/1 | 0.017700 / 0.017816 | 0.009544 / 0.008412 | 0 / 0 |

Win scores are unchanged. Point damage decreases about 27%; Brawler incoming damage
decreases about 12%, with nearly unchanged outgoing damage. Classic adds one fall. Four
pairs give broad uncertainty: the 0.875 score's 95% interval is approximately 0.396–0.987.
These results do not establish a stronger overall controller or improved finishing power.

Thirty-second identical-candidate self-play gives 24 serial versus 29 overlapping driven
blows. Total driven damage is 0.611409 versus 0.618539 HP; neither side falls. The longest
pressure-only episode decreases from 0.35 to 0.091667 s. Counts are specific to this equal
duration and single recipe, not a distributional claim.

## Continuing recovery and low admission

The actual Arena path uses an ordinary 90 Ns upper-trunk shove at 3 s and releases the
attacker's stand order at 4 s. Four 45 s fixtures per candidate mirror side assignment and
use a lying or recovering opponent. Candidates retain alternate hands. No attacker falls,
hits the floor with its head/trunk, or uses assistance. A successful low hit must be a driven
hand blow while the foe is down or recovering; an ordinary later standing hit is insufficient.

| Assignment / opponent | Serial / overlap low blows | Serial / overlap standing return after low hit |
| --- | --- | --- |
| Left / lying | 14 / 14 | yes / yes |
| Left / recovering | 2 / 2 | yes / yes |
| Right / lying | 1 / 1 | yes / yes |
| Right / recovering | 0 / 0 | no / no |

Both candidates fail the mirrored recovering-opponent low-initiative gate. The recovering
foe attempts to rise but does not complete recovery during these attacked 45 s trials.
The existing fixed-hand playable low regressions remain separate evidence; they do not
erase this wider admission failure. No new profile is promoted.

The measured source fingerprint is
`7e7b4b8dd5884415212c129814ca4ff5803fef5f582704f1d16412da7d2afb04`.
Every failed row remains in the compressed records.
