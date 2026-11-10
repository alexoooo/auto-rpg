# Roadmap

Where the project is going and what is open. What is built is in the
[architecture](architecture.md).

## Where the project is going

- **A testbed for AI-controlled bodies, built into a game**: muscle-driven bodies fight in an
  Arena and a generated Crypt. Every layer advances, each depending only on those below it
  ([the layers](architecture.md#the-layers)).
- **Skills** in one shape, read on drills the owner watches, chosen by a mind's Options from their
  entry conditions and profiles ([Skills](architecture.md#skills)).
- **The fight is a black box**: at most two minutes, life draining from the first minute; nothing
  else ends or judges a bout.
- **Real time**: a mind decides within its step from what it holds; search ahead is offline
  research.
- **Competencies first**, without assistance: footwork, striking, guarding, standing, standing up,
  running. **Items next**: weapons, shields, two-handed items, ranged weapons, armour.
- **Assistance as attributes**, each metered against a ceiling the character's attributes set;
  **attributes** (size, weight, strength, speed, assists) so characters differ.
- **Later**: an end-to-end learned controller on the muscles; a Ladder of Arena bouts; a Crypt
  party commanded by a person or an AI.

## Plans in flight

| Plan | What it builds |
| --- | --- |
| [Option Mind's speed](plans/2026-11-04-option-mind-speed.md) | mean and tail cost at 100 runs: exact search storage and lifetime, decisions spread over steps, tree reuse, profile tables and a learned leaf; 8.33 ms at the 99th percentile |
| [Options trained body by body](plans/2026-11-03-options-training.md) | every table cell raised from its baseline: stand-up on every body and loadout, the run on the Warrior and the Rogue, the strikes on every body |
| [Warrior travel](plans/2026-11-05-warrior-travel.md) | first milestone: preserve 4 m/s from-rest entry while training stops; then the Run from a stand with no braced step, directions, manoeuvres and loadouts |
| [Warrior bonk](plans/2026-11-05-warrior-bonk.md) | an intentional overhead club strike at the head with either hand, with and without the buckler, returning to guard: a graded reader, a searched push schedule, then a learned actor |
| [Commander](plans/2026-10-29-commander.md) | the Option Commander: team options claiming members, priced by the hero's life at the exit, read against `clearer` |
| [Readable code](plans/2026-11-10-readable-code.md) | Option Mind's build as one declared type read top to bottom, shown to the owner; then `Part` split by role, one walk of a part tree, kinds the compiler checks |
| [The rat](plans/2026-11-01-rat.md) | the reptile at 1.0 m/s or more, the rat righting on Option Mind's loop, then rats in the Crypt |

Now: the Warrior's [travel capabilities](plans/2026-11-05-warrior-travel.md) and
[bonk](plans/2026-11-05-warrior-bonk.md), with recovery performance preserved; the remaining Option control
contracts and body-by-body training, the rat's open
steps, fights the owner watches, the Strike and Footwork rungs, and the Commander in the Crypt
with Option Mind as its hero.

## Waiting on the owner

**Choices**, each landed at its default:

- Haste's range and each character's value.
- The Crypt's set values: how wide the passages are; how the dead disappear.
- The stand-up target's falls: a shove the body holds is given again with doubled impulse, up to three.
- An optional skeleton costume, after seeing the bones in play.

**To watch:**

- The Strike drill's rung 1, the pad on a rail (`src/game/arena/rail.ts`).
- Health under the defaults: a crippled leg's limp in the Lab, limbs coming off in sword fights.
- Random Crypt's guard hall (`?play=dungeon&scene=random-crypt&seed=42`).
- A bout fought with orders (`?play=arena&you=left`), one played turn by turn, and its tape.
- Locomotion: the five Lab courses, the Crypt's long walks, the Warrior's run.
- Standing up in the Lab, the Arena and the Crypt, and whether the rise looks human.
- The reaction time, 0.15 s, beside a bout at `&senseDelay=0`.
- The crowd fight and the Crypt with minds on workers (`npm run preview`): smooth, no slow motion.
- The Skeleton in play (`?play=arena&matchup=crypt-skeleton,workshop-fighter`).
- The reptile and the rat on the game's Option Mind against a Warrior and a Reptile: the trot,
  the bite, righting; the Walker in the Lab (`&scenario=reach`).
- The Crypt's commands (H, X, Q, E, right click), the level-clearer (`&party=clearer`) and the mob.

## Open, by layer

### Framework

- Rare dear steps break real time at a step's delay (the crowd fight's opening, a Crypt body's
  build step); cut one when it shows in play.
- A step that allocates nothing beyond what Rapier does ([step cost](reference/step-cost.md)).
- One notion of a task across evaluations, the Lab and the Ratings; the Ratings reel plays bout
  cases only.
- The orders vocabulary is closed: a new kind of order edits `Orders`, `isOrders`, `Command` and
  the Commanders.
- A planner's memory forks only through the skills it drives (`driveBy`).
- Research-only code under `src/core/` moves to `research/` or goes with its question.
- 42 modules wrap all they hold in `createX(context)`; `src/app/evaluation.ts` spreads 38 of them
  into one object and `src/evaluation/evaluations.ts` builds each evaluation a second time.
- Meaning is read from a name's spelling: `endsWith("Trunk")`, `startsWith("shoulder.")`,
  `startsWith("strike-")`, `startsWith("ended:")`.
- The compiler checks no caller of `src/` under `scripts/`, `research/` or `tests/`.
- Ratings when asked: items, characters and attributes; ablations beside a battery; live runs on
  the screen.

### Body and motor control

- Walking contracts to check at their owners: a planned step lands before the next shift moves
  weight onto that foot; a walk asked to stand at a place holds the centre of mass there; a
  strike's entry admits the quiet supported body that walk supplies.
- The braced walk falls under shoves at a third of its orders; the Skeleton's shoved walk with
  the club falls most.
- Yaw at speed: the pelvis swings either side of the heading past 1 m/s; a turning walk past
  0.7 m/s and the run's turns need it held.
- Braking: the walk's pace ramp, and the stance envelope measured again at it.
- The stance asked to stand a lying body diverges; no mind asks it.
- The Warrior's [travel](plans/2026-11-05-warrior-travel.md): its start, slow paces and stop; the club throws the Rogue's run.
- Stand-up time, every body in every loadout, beside the [owner's 10 s](reference/rising.md#the-owners-target); the Rogue's arms on hands and knees; the Skeleton holding the club.
- The Warrior's stand-up: on hands and knees with the club and buckler the hands bear almost
  nothing and the trunk sinks back; the sit-back hands over to the stance still on its knees and
  lurches into a split stance; its sword falls rise a second past 10 s.
- Strikes on every body: the punch, then sword, club and buckler; the stomp on the Warrior and
  the Rogue.
- The Rogue's stomp holding a club or a sword never chambers: each try runs about 10 s
  uncommitted and stalls (`withdrawal deadline`), and Option Mind chases it, priced by its prior.
- Holds and equipment: shield and weapon lines, two hands on one item (a closed chain), equipped
  recovery, armour and bows.
- Grit, a rising assist, has no mechanism; movement and attack-and-defence assists are not built.
- The reach solver runs to its cap on a cover the joints' ranges keep out of reach.
- A body on paws righted does not stand: the rat's recipe ends propped on folded legs, not its
  paws, and any drive of its legs from there rolls it onto its back; the reptile's routes turn it
  over while placing a paw, or hold a swept leg short of the hip's yaw limit.

### Blows and wounds

- Not built: a part's own tolerance, the face apart from the head, armour, edges and points.
- The fist's threshold against a head; read again before a punch is trained on the head.
- A punch at the head goes around or over the guard, or waits for it to open.
- Striking a body that is down waits on faster rises.

### The AI

- Option Mind's footwork: places around the foe chosen by its reach and striking arc.
- An approach to a downed target, to check: it stops within its tolerance and keeps its chosen
  side as the target moves (the Skeleton's stopping path, the Rogue's side through the stomping
  approach).
- A cover of the predicted blow that keeps the head; a dodge and a counter, each with its drill.
- Footwork's rungs 0 to 4; Cover's rung 2 waits on a counter.
- Warrior recovery after two rapid Lab shoves is slow.
- The foe's phase reads `rising` in bursts only.
- Nothing in the rules costs effort; fatigue only if a trained mind strikes without pause.
- Options chosen by profile: targets after a guard, spacing, ground choices, obedience.
- Option Mind's decision cost: reduce mean and tail time at 100 tree runs, and justify the
  ownership and lifetime of search-path allocations
  ([Option Mind's speed](plans/2026-11-04-option-mind-speed.md)).
- The measured stomp profiles, which waited on a chooser that prefers a strike sooner, are read
  again under the tree.
- A predicted state reads the body's real view, then a predicted foe: begun when the tree's lost
  bouts recur on choices made from states mispredicted so.
- A learned value at the tree's leaf, fitted to its own searched values: begun when its runs are
  capped below what reaches a strike from the ground.
- A learned mind; sight that is blocked; team bouts in the Arena.

### The game

- The Arena: the Ladder; wider walking courses; fighting strength.
- The Crypt: how many die clearing a level; set pieces; the skeleton's own wounds; the party's bow;
  the frame rate on the owner's machine; saving a run.
- Sound: unplayed cues dropped at the end, two blows at once heard as one.
- The Reptile: richer surface response, broader recovery, combat against the humans.
- Another physics engine.
