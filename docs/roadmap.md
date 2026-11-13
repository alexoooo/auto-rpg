# Roadmap

What is in work now, what is next, and what is open. What is built is in the
[architecture](architecture.md); how each skill reads now is
[the table](reference/the-table.md) (`npm run evaluate -- table`).

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
- **A web app**, played wherever a browser runs, with no device or touch goals; a person can take
  either side in the Arena.
- **Later**: an end-to-end learned controller on the muscles; a Ladder of Arena bouts; a Crypt
  party commanded by a person or an AI.

## Now

**Every cell of the table has its baseline**, read on the drills as they are at `82e2c881`: 114
cells, 43 readings, none faulted. The ways up take 1.6 to 6 s an attempt on the Warrior, 3 to 10 s
on the Rogue and 5 to 16 s on the Skeleton, worst holding a club; the walk loses 2.1 to 3.1 s
against its orders, the runs 6.3 to 7.3 s; the blows trade at most 0.28 hp a second, the
Skeleton's punch 0 and the stomp under 0.02, most of those not begun outside their window; the
buckler's cover loses 0.12 to 1.05 hp a trial. Its sword cells were read against a sword that cut
and thrust; the sword now only thrusts, so they stand to be played again.

**Stand-up on the Rogue and the Skeleton**, a goal driven unattended
([driven](recipes/documents.md)): their ways up are read on the table's way-up cells, a cell per
way up on its own attempts ([the way-up drill](reference/rising.md#the-way-up-drill)). A run works
one question of it from an approved brief ([the rules](../AGENTS.md#the-rules)). Of each way
up's 135 bouts, 84 make no fall within 30 s (`BOUT_WAIT`), and the buckler loadouts' bouts but the
Warrior's with the sword make none. Open: whether the hand-set choices read right on the obstacle
falls, now played: being stuck (`STUCK`), another body pressed not counting, a try let go not
blocking the same way up, the attempt cap (`ATTEMPT_CAP`).

The standing goal behind it: every cell of the table raised from its baseline, a row at a time
([the skill recipe](recipes/skill.md#one-row-one-question)).

## Next

In order; each is a row of the table or one question, taken up on the owner's request.

1. **The Warrior's punch**: the table's `punch` row on `workshop-fighter`
   ([its notes](plans/2026-11-10-warrior-punch.md)): the straight punch at the trunk.
2. **The strikes' profiles from fights**: a strike's profile is built only from the Strike drill's
   fights (`fights`, [the evaluations](architecture.md#evaluations)). The asset still holds the
   ones measured at a drill's target, and no fight is played for them yet. The first build
   replaces every strike's profile, so it plays every strike that has one: the punch, the stomp
   and the bonk.
3. **The Warrior's bonk with the buckler**, which never meets the head
   ([its plan](plans/2026-11-05-warrior-bonk.md)).
4. **The Warrior's thrust**: the grip's geometry before another search
   ([the approaches](approaches.md#weapon-strikes)).
5. **The Warrior's start from a stand**: a controller that places feet by balance under the run
   ([its plan](plans/2026-11-05-warrior-travel.md)).
6. **Blows in fights**: Option Mind's footwork, places round the foe chosen by its reach and
   striking arc, so the blows that land in the drill land in a bout.

## Parked plans

Each holds its goal, where it stands and the questions open
([the documents recipe](recipes/documents.md)).

| Plan | What it builds |
| --- | --- |
| [Warrior travel](plans/2026-11-05-warrior-travel.md) | the Run from a stand with no braced step, slow paces, the stop, directions, manoeuvres and loadouts |
| [Warrior bonk](plans/2026-11-05-warrior-bonk.md) | an overhead club strike at the head with either hand, with and without the buckler: the buckler cell, then a learned steer |
| [Commander](plans/2026-10-29-commander.md) | the Option Commander: team options claiming members, priced by the hero's life at the exit, read against `clearer` |
| [The rat](plans/2026-11-01-rat.md) | the reptile at 1.0 m/s or more, the rat righting on Option Mind's loop, then rats in the Crypt |

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

What no plan and no row above carries. A skill that reads low is a cell of the table, not a line
here.

### Framework

- Rare dear steps break real time at a step's delay (the crowd fight's opening, a Crypt body's
  build step); cut one when it shows in play.
- A fight step's 99th percentile is past 8.33 ms (a sword bout about 18 ms): its slowest steps are
  Option Mind's decisions ([step cost](reference/step-cost.md)). What would cut them changes the
  mind: a decision spread over steps, the tree kept from one decision to the next, profiles read
  from a table, a learned value at the leaf. The crowd fight plays about 53 steps a second in the
  browser.
- The posture is assembled and read by channel name, about 2% of a sword bout's time; the minds'
  mirror (`mirror-channel.ts`) about 2%.
- Research playing scenarios of its own, not its drill's twin: the run's orders training
  (`travel-environment.mjs`, `travel-curriculum.mjs`, `travel-seed.mjs`, its top pace 6.5 m/s
  its curriculum's) and the residual search, screens and environment (`residual-*.mjs`); the
  walk's turn rates are in no drill.
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
- The Warrior's stand-up: on hands and knees with the club and buckler the hands bear almost
  nothing and the trunk sinks back; the sit-back lurches into a split stance when it hands the
  body to the stance from its knees; its sword falls rise a second past 10 s.
- The Rogue's stomp holding a club or a sword never chambers: each try runs about 10 s
  uncommitted and stalls (`withdrawal deadline`), and Option Mind chases it, priced by its prior.
- Holds and equipment: shield and weapon lines, two hands on one item (a closed chain), equipped
  recovery, armour and bows.
- Grit, a rising assist, has no mechanism; movement and attack-and-defence assists are not built.
- The reach solver runs to its cap on a cover the joints' ranges keep out of reach.
- A way up reads no solid before it begins: it lets go once stuck against one (`STUCK`).
- A body on paws righted does not stand: the rat's recipe ends propped on folded legs, not its
  paws, and any drive of its legs from there rolls it onto its back; the reptile's routes turn it
  over while placing a paw, or hold a swept leg short of the hip's yaw limit.

### Blows and wounds

- Not built: a part's own tolerance, the face apart from the head, armour, edges and points.
- Striking a body that is down waits on faster rises.

### The AI

- An approach to a downed target, to check: it stops within its tolerance and keeps its chosen
  side as the target moves (the Skeleton's stopping path, the Rogue's side through the stomping
  approach).
- A cover of the predicted blow that keeps the head; a dodge and a counter, each with its drill.
- Footwork's rungs 0 to 4; Cover's rung 2 waits on a counter.
- Warrior recovery after two rapid Lab shoves is slow.
- The foe's phase reads `rising` in bursts only.
- Nothing in the rules costs effort; fatigue only if a trained mind strikes without pause.
- Options chosen by profile: targets after a guard, spacing, ground choices, obedience.
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
