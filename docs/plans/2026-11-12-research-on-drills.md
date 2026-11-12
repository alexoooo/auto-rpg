# Research on drills

## Why

The owner: "keep cells as drills, make research score on drills". A table cell is a skill read on
its drill, never a fight; research (searches, training, screens) scores a skill on its drill, not
on scenarios of its own. Then, of three choices:

- **Held out**: research plays the same drill drawn at other points, so a cell stays a test of
  cases nothing was tuned on.
- **The game's situations**: a situation the game presents that only research plays now is added
  to the drill; a probe scores no skill.
- **The rate**: "i am worried that 120 hz only will exploit Rapier glitches instead of genuine
  skill, 480 hz was meant to avoid that. it would be better (more efficient) to just do 120 hz,
  but that only works if the held out trials are enough to catch engine glitches." Held-out
  trials at 120 Hz do not catch it: a fit to the engine's step shows the same on any case at that
  rate. So research scores at 120 Hz, and the confirmation that keeps a record plays the cell's
  cases at 120 and 480 Hz, the worse counting.

The rule is [the skill recipe's](../recipes/skill.md#an-options-code) "Research scores on its
drill".

## Where research stands (a code reading at `858f57f3`, nothing played)

Almost no search, training or screen plays its drill's cases, and several run another Mind:

| Skill | The cells read | Research plays, the drills do not hold | Where |
| --- | --- | --- | --- |
| stand-up | `rising-target`: 3 bodies, 5 loadouts, 16 shoves, open floor | obstacle levels; falls from bouts; 128 shoves; seeded impulses; placed starts (the Rise drill) | `rising-bed.mjs --obstacles`, `core-rise.mjs`, `rise-search.mjs`, `skill-search.mjs` (sit-back, roll) |
| punch | `still` (Warrior, Rogue; gaps 0.6 to 1.3 m; across 0, 0.2 m; middle mark; both hands), `walk` | across −0.15 to 0.3 m; an admission window the Option never offers (`AROUND`); 480 Hz; other target bodies | `punch-drill.mjs`, `straight-punch/environments/punch.json` |
| thrust | `still`, `walk` (Warrior) | across −0.45 to −0.15 m; gaps 1.16 to 1.6 m; the buckler always held | `sword-thrust/environments/*.json` |
| cut | `still`, `walk` (Warrior) | gap 1.2 m alone; the Skeleton as target; the item in the left hand | `swing-drill.mjs` |
| bonk | `bonk` (still places, high mark, right hand) | gaps to 1.5 m; across −0.1 to 0.25 m; read at the release | `swing/environments/bonk.json` |
| stomp | `stomping` (gaps 0.8, 1.0, 1.2 m; a Warrior or Skeleton lying) | the search's own split of the gaps | `skill-search.mjs` (`SEARCHES.stomp`) |
| walk | Locomotion `every` (8 ways at 0.3, 0.7 m/s and the body's fastest that way; unpaced run and turn; shoves; gusts) | turn rates, long courses, 16-way shoves, edge and staggered starts; on the Lab's Mind or a core stand | `locomotion-*.mjs`, `stance/*.mjs`, `stride-search.mjs` |
| run | Travel `confirmation` (Warrior), Locomotion `run` (Rogue), each with a run from a walk, a route with a corner and a goal moved | paces to 6.5 m/s and changes of pace; crouched and turned starts; on the default Mind | `travel-environment.mjs`, `travel-screen.mjs`, `warrior-travel.mjs`, `residual-*.mjs`, `run-cycle-search.mjs` |

Buckler-cover has no research script. No cell reads the high mark (every blow's Option but the
bonk aims at the middle, `caseFaults`), so no research must play it.

**Defects found**: the stomp search writes a Mind config with `executors` and `actions`, keys
Option Mind no longer has, so its trials are refused; the punch, bonk and thrust training
environments name the `option` preset, the profiles and the tree, against "not for skills
training" (`37f9be19`).

## The design

- **A drill's training twin**: each protocol a cell reads has a twin, the same situations
  (bodies, loadouts, marks, limbs, starts, orders, ranges) drawn at other points, as the target's
  `fresh` falls are its shoves turned halfway. Research scores on the twin; the cell's own cases
  are held out, played by the confirmation.
- **One way to play a skill's trials from a script**: (skill, body, loadout, twin or cell, rate)
  to the protocol's conditions (`faults`, `casesOn`), each played through its world and reader,
  valued by the cell's own value (`trialValue`) and the graded score beside it. The drills' Mind
  with the candidate's settings (`research/drill-trials.mjs`).
- **Training on the twin**: an environment's places are the twin's conditions (`where`, as
  `case-learning-environment.mjs` takes them), its Mind `option-drill`.
- **The drills widened** with the game's situations above, skill by skill, a probe left out: a
  rate the game does not run, a Balance or physique changed, a finer sample of situations the
  drill already holds.

## Stages

Each lands on its checks; nothing is played without a brief.

1. The defects: the stomp search's Mind, the training environments' preset. *Landed*
   (`5aa6efd8`).
2. The twins and the shared player. *Landed*: every protocol a cell reads names its twin
   (`Cases.twin`, `src/evaluation/twin.ts`), sharing no case with it; `research/drill-trials.mjs`
   lists a cell's or its twin's trials, plays one at a rate and values it as the cell does, and
   confirms on the cell's cases at 120 and 480 Hz; lone bodies and falls take a rate; a fall costs
   a fixed 10 s (`FALL_PRICE`). A twin of a list of points has one fewer (the punch's 42 trials to
   the cell's 96).
3. Strikes: the scripts and environments on their twins; the drills widened (target bodies).
   *Landed*: the still, walk, bonk and stomping rungs (and their `-bodies`) strike each of the
   game's foes (the Warrior, the Rogue, the Skeleton; `FOES`), so the strike cells hold 2580
   cases where they held 920; the bonk is read walked to as well (the `walk` rung, its right
   hand at the head), 48 cases a cell to 144. `punch-drill.mjs` (punch, thrust), `swing-drill.mjs` (cut, bonk)
   and the stomp's search (`skill-search.mjs`) search a body's row on its cells' twins at
   120 Hz, a candidate the cell's own subject with its settings as the skill's tuning (its window,
   loadout and Mind the cell's), each trial scored by its value graded (`searchScore`: a blow that
   did not land up to 0.05 hp a second below its value, by how near it came to the bar), and
   confirm on the cells' own cases at 120 and 480 Hz, the worse counting (`confirmRow`). The
   punch, bonk and thrust environments place on the twins at 120 Hz;
   `punch-policy-check.mjs` screens on them and confirms with `--cell`. The environments reward
   an episode by the search's score, the Strike drill's `value` term (`graded`), the bonk's
   played on past its release so its value reads the whole trial. Left: the new reward's scale
   against the effort and `unmet` terms, which only a training run checks; the club's trunk blow
   (`club-blow`) has no cell, so no drill to search on.
4. Stand-up, with [its plan](2026-11-12-stand-up-drills.md): the obstacle levels and bout falls
   in the drill; `rise-search.mjs` and the sit-back and roll searches on the twin. *Landed*: a
   cell per way up on the way-up drill, its twin the fresh falls; the searches on the twin.
   the obstacle levels in the drill. *In work*: the bout falls.
5. Walk and run: the drills widened (paces to the envelope, diagonals, place orders); the
   scripts on their twins. *The walk widened*: Locomotion `every` walks eight ways, each at 0.3
   and 0.7 m/s and the fastest the body holds that way (705 trials to 1,115; its twin 705 to
   825). *Place orders valued and in the run drills*: a place's progress is how much less of its
   route the body has to go (`routeLeft`); Travel (Warrior) and Locomotion `run` (Rogue) add a run
   from a walk, a route with a corner and a goal moved as the body runs, to each side (Travel 1,560
   trials to 1,760, the Warrior's run cell 312 to 352; Locomotion `run` 320 to 720, the Rogue's run
   cell 32 to 72); the Locomotion drill plays on the open floor, as its runs went
   through the arena's posts. *The run trains on its twin*: the case environment steers Move's
   run gait (`gaitLearningMind`, `environments/run.json` on Travel's `confirmation-twin`), each
   episode valued as the cell values it; a stance's settings reach a drill case as its balance's
   `tuning`. *The scripts on their twins*: `move-drill.mjs` gives a body's walk or run row's twins
   and a candidate's gait, legs or stance settings in the cell's subject; the stride and run-cycle
   searches, the scorecard, the run's checkpoint screen (`travel-screen.mjs`) and `travel-case.mjs`
   play on it, scored by the time lost, and confirm on the cells' own cases at 120 and 480 Hz;
   `warrior-travel.mjs` is gone (`travel-case.mjs --settings --rows` retains a trial). Left: the
   `travel-orders` training environment (`travel-environment.mjs`, `travel-curriculum.mjs`,
   `travel-seed.mjs`) and the residual search, screens and environment still play scenarios of
   their own; the walk's turn rates are not in the drill; the probes (`locomotion-run.mjs`,
   `stance/*.mjs` and the like) score no skill.

## Open

- Each drill's twin draws (where a grid's halfway points are, how a course is shifted).
- The run's 6.5 m/s ceiling was set by its training (`walk-run.json`, `travel-training-ceiling`):
  whether the drill asks for it.

## The price

The drills grow, so a table play and a search candidate take longer. Every cell already reads
"not read" until played on `option-drill`, so widening voids no saved reading beyond that. A
search or training run kept outside Git (`research/runs/`) on a scenario of its own resumes on the
twin, not on its old trials.
