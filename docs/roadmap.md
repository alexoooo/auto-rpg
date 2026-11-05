# Roadmap

Where the project is going and what is open. What is built is in the
[architecture](architecture.md).

## Where the project is going

- **A testbed for AI-controlled bodies, built into a game**: muscle-driven bodies fight in an
  Arena and a generated Crypt. Every layer advances (framework, motor control, skills, minds,
  command), each depending only on those below it ([the layers](architecture.md#the-layers)).
- **Skills** in one shape, proved on drills the owner accepts, chosen by a mind's Options from their
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
| [Option Mind general](plans/2026-11-03-option-mind-general.md) | the known bugs fixed; Option Mind one loop and one body contract for every body, every act an Option; bodies told apart in data; skills developed against their own baselines |
| [Option Mind's speed](plans/2026-11-04-option-mind-speed.md) | the tree's decisions within a step's 8.33 ms at the 99th percentile at 100 runs: a decision spread over steps, the tree kept, the profiles read from a table, a learned leaf |
| [Options trained body by body](plans/2026-11-03-options-training.md) | after Option Mind general: stand-up within 10 s on every body and loadout, the run on the Warrior and the Rogue, the strikes on every body |
| [Commander](plans/2026-10-29-commander.md) | the Option Commander: team options claiming members, priced by the hero's life at the exit |
| [The rat](plans/2026-11-01-rat.md) | the rat and the reptile at 1.0 m/s or more, righting, then the Crypt |

Now: the Warrior's equipped stand-up within 10 s, held on fresh falls. After it: the
remaining Options trained body by body, the rat's open steps, fights
the owner watches, the Strike drill's rungs, Footwork's rungs, the Commander in the Crypt with
Option Mind as its hero.

## Waiting on the owner

**Choices**, each landed at its default:

- Haste's range and each character's value.
- The Crypt's set values: how near a foe the party sets upon it, how wide the leader's aim picks,
  how wide the passages are; how the dead disappear.
- The stand-up target's falls: a shove the body holds is given again, up to three.
- An optional skeleton costume, after seeing the bones in play.

**To watch:**

- The Strike drill's rung 1, the pad on a rail (`src/arena/rail.ts`).
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
- The bout's and the Crypt run's world builders sit among their screens' files; the Lab's
  scenarios reach the page's render.
- One notion of a task across evaluations, the Lab and the Ratings; the Ratings reel plays bout
  cases only.
- The orders vocabulary is closed: a new kind of order edits `Orders`, `isOrders`, `Command` and
  the Commanders.
- A planner's memory forks only through the skills it drives (`driveBy`).
- Research-only code under `src/core/` moves to `research/` or goes with its question.
- Ratings when asked: items, characters and attributes; ablations beside a battery; live runs on
  the screen.

### Body and motor control

- The braced walk falls under shoves at a third of its orders; the Skeleton's shoved walk with
  the club falls most.
- Yaw at speed: the pelvis swings either side of the heading past 1 m/s; a turning walk past
  0.7 m/s and the run's turns need it held.
- Braking: the walk's pace ramp, and the stance envelope measured again at it.
- The stance asked to stand a lying body diverges; no mind asks it.
- Running toward 5 m/s on the Warrior, with stops and turns; the club throws the Rogue's run.
- Stand-up on the [owner's target](reference/rising.md#the-owners-target), every body in every
  loadout; the Rogue's arms on hands and knees; the Skeleton holding the club.
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
- A body that is down may be struck once a rise meets its bar.

### The AI

- Option Mind's footwork: places around the foe chosen by its reach and striking arc.
- A cover of the predicted blow that keeps the head; a dodge and a counter, each with its drill.
- Footwork's rungs 0 to 4; Cover's rung 2 waits on a counter.
- Warrior recovery after two rapid Lab shoves is slow.
- The foe's phase reads `rising` in bursts only.
- Nothing in the rules costs effort; fatigue only if a trained mind strikes without pause.
- Options chosen by profile: targets after a guard, spacing, ground choices, obedience.
- Option Mind's tree chooser (`TREE_CHOOSER`, 100 runs a decision) costs a bout with an Option
  Mind on each side 17.8 ms a step at the 99th percentile, against a target of 8.33 ms (the valued
  chooser 9.7 ms; Node, core world, 120 Hz): a search begins about one mind-step in seven, and
  scoring each state it reaches (its leaf, the strike profiles read there) is most of a search
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
