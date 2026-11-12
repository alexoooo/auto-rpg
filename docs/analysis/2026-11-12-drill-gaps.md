# Situations research tries that the drills do not hold

The owner: "I thought that how we train skills is via drills, but you're saying we have a more
broad set of scenarios that are not even part of the drills? That sounds like a gap." and "we
should confirm that there are no gaps in other drills". A code reading at `28510ddc`, nothing
played: each skill's research scripts (`research/skills/`) against the drill protocols its table
cells read (`src/evaluation/table/cells.ts`). The ground and strike profiles are outside the
drills on purpose and not counted.

## Where research goes past its drill

| Skill | Research tries, the drill does not hold | Where |
| --- | --- | --- |
| stand-up | obstacle levels; 128 shove ways; scoring offsets | `rising-bed.mjs --obstacles`, `core-rise.mjs --shoves`, `rise-search.mjs --offsets` |
| punch | offsets across −0.15 to 0.3 m (the drill: 0, 0.2); 480 Hz; target bodies other than the Warrior | `straight-punch/environments/punch.json`, `punch-drill.mjs --rates`, `--targets` |
| thrust | offsets −0.45 to −0.15 m; gaps 1.3 to 1.6 m (still holds to 1.3, walk from 1.6); 480 Hz | `sword-thrust/environments/sword-thrust.json`, `sword-thrust-search.json` |
| cut | gap 1.5 m; the Skeleton as target; 480 Hz; the item in the left hand (no rated loadout) | `swing-drill.mjs` (`--verify`, `--targets`, `--hands`) |
| bonk | gaps 0.95 to 1.5 m (the drill: to 1.3); offsets −0.1 to 0.25 m; 480 Hz | `swing/environments/bonk.json` |
| stomp | gaps 0.9 and 1.1 m (the drill: 0.8, 1.0, 1.2); other rates | `skill-search.mjs` (`SEARCHES.stomp`) |
| walk | paces 0.2 to 2.5 m/s and a diagonal; courses of 20 to 30 s; turn rates 0.25 to 4 rad/s; other gusts; 10 seeds; shoves 10 to 60 N s from 16 ways, random orders; edge, wide and staggered starts; Balance 25; 240 to 1920 Hz | `locomotion-scorecard.mjs`, `locomotion-run.mjs`, `stance/core-stance-*.mjs`, `stance-stagger.mjs`, `idle-footing.mjs` |
| run | paces 0.9 to 6.5 m/s and changes of pace; place orders over routes with corners and a moved goal; moving, crouched and facing-away starts; turns at 3.5 m/s; a core stand with the passive-toe body | `travel-curriculum.mjs`, `travel-environment.mjs`, `travel-screen.mjs`, `residual-*.mjs`, `run-cycle-search.mjs` |

Each skill's drill also holds some cases its research never tries: the high mark (punch, thrust),
the walk rung (thrust, cut), two-item loadouts (bonk with the buckler, stomp holding anything,
walk), the plain sword (thrust). Buckler-cover has no research script at all.

## Read beside it

- **Physics rate**: the skill recipe searches at both rates, the worse counting
  ([the skill recipe](../recipes/skill.md)); no table strike rung sets one, so every cell reads
  120 Hz alone.
- **`bonk-bodies`**: a bonk cell on a body other than the Warrior names the protocol
  `bonk-bodies` (`strikeProtocol`), which the Strike drill does not have. No cell reaches it now:
  only the Warrior offers the bonk.

## Open

How a gap closes, skill by skill: the drill widened to hold what the skill must handle, research
held to the drill's protocols, or both.
