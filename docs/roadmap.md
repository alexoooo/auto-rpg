# Roadmap

Where the game is going, and what is open. A figure here with no record of its own is from the
plans this replaces, which commit 2e99105f holds under `docs/plans/`; measure it again before
building on it.

## Where the game is going

- **The Arena**: a bout of two bodies to a verdict. A person watches, or takes a side and gives
  it orders.
- **A Ladder** of bouts, to be designed.
- **A Diablo-like Dungeon**: a dark isometric action RPG after Diablo's Cathedral, with loops,
  scored layouts and authored rooms, where a person commands a party and each member's mind carries
  the orders out.
- **Equipment**: swords, a maul, a mace, a whip, and the loadouts to choose them. Edged and pointed
  weapons bring the rulebook's other mechanisms into play; every weapon keeps its ratio to the club.
- **Many morphologies**: every body a sourced spec, families sharing code and not values. The human
  is the reference body, the skeleton is on the core, a reptile is next.
- **Layered AI**: each layer depending only on those below it -- world, body, motor control,
  skills, minds. Above the muscles a mind is a function from its body's senses to its body's
  effectors, with the layers as one way to write it; a person gives orders
  ([architecture](architecture.md#minds)).

All of it on a physically based core, humans first ([architecture](architecture.md)).

## Open items

### The AI

- The structure above the muscles is built ([architecture](architecture.md#minds)): the mind at
  the muscles, sub-minds, a mind made from its config, senses, a person's orders, an assist whose ceiling is the character's balance, a
  bout that saves, loads and forks ([architecture](architecture.md#state)), and an oracle. Not
  built: a learned mind (a recipe names each side's mind by its config, `DuelRecipe.minds`, and
  the fighter is the one kind there is); sight that is blocked (the senses pass
  every body whatever stands between); a library for a body of another shape behind the same
  seam.
- The owner's to choose, each landed at its default:
  - Each character's balance, a per cent of its own weight. Every character has 0 %. At 25 % for
    both sides, 19 of 99 bouts end by a fall where 80 do at none, and the mean bout is 55 s where
    it is 14 s ([reference/assist.md](reference/assist.md)); a different balance for each makes it
    a trait that tells characters apart. The moment that goes with a per cent
    (`Rulebook.balance`, 0.0026 weight-metres) is proposed with it; 25 % spends the effect.
- The controls are to be worked over in play. Until then the pointer does nothing while a person's
  body stands still, and the person walks to turn; the other way is a slow step toward its heading,
  which moves it without being asked.
- The owner's to watch: a bout fought with orders
  (`?play=arena&matchup=workshop-fighter,workshop-rogue&you=left`); bouts with balance against
  none (`?play=arena&matchup=workshop-fighter,workshop-fighter&balance=25`, `&balance=100`,
  `&balance=25,0`); an oracle's bout ([reference/oracle.md](reference/oracle.md), Watching
  one); and a body that lies where it fell: the lab's Stance (`?play=lab&scenario=stance`) with a
  shove of 90 N s, and an arena bout that ends by a fall
  (`?play=arena&matchup=workshop-fighter,workshop-rogue`: the loser lies, the winner stands).
- The oracle's readings ([reference/oracle.md](reference/oracle.md); counts of 18 sides, not
  rates): choosing among seven orders every half second, with the true world to try them in,
  turns 6 of 9 lost bouts into wins while leaving the tactics' own choice in over 90 % of
  decisions. With no balance every one of those wins is a fall, so it is a ceiling on not
  falling, not on fencing; and it is nearly the same ceiling blind, with each fork nudged a few
  centimetres off the true one, so little of it is knowing the other side's exact future. With
  a balance of 25 % the search turns 6 of 9 again, 2 of them by a wound, and makes bouts
  long: 7 of its 18 reach the cap where 1 of the tactics' 9 does. A search that values 2 s on
  finds how not to be hit, and not how to end a bout.
- The oracle's next spaces to search: a horizon long enough to end a bout with balance, a
  response held longer than one period, two decisions looked ahead, and strikes chosen by name,
  since an attack at where the head stood is taken in under 1 % of decisions. Its next
  readings: a rate over several gaps, a blind search with balance, and a wider nudge.
- An arena bout is the same to the bit in Node and in a browser
  ([reference/real-functions.md](reference/real-functions.md)). The lab and the crypt still place
  bodies and aim orders with the engine's `Math` (`src/lab/`, `src/dungeon/`), so a lab scenario
  or a crypt run is not yet held to be the same in every engine; the boundary test's
  `WORLD_BUILDERS` names the modules it holds, and theirs join it when they are moved.
- The tactics (`fighterTactics`) cannot yet attack a moving body, block or parry.
- The arena needs tactics of its own, beyond walking at the other body and attacking its head.

### Strikes

- Hand goals: a placed blow is a place and a time for the hand's point, met by the arm alone
  ([reference/blows.md](reference/blows.md#placed)). Left: a speed at the place, and the trunk
  and the legs in the blow, and the strike search in that form; a placed blow lands a tenth of a
  recipe's energy. A recipe stays wherever it beats the hand goal.
- A hand goal's path is a straight line of its point, and for a point of a held thing that line
  can run through places no pose of the arm puts it: of 32 placed club blows 8 land, and the
  skeleton's club, which rests behind its shoulder, never comes within half a metre
  ([reference/blows.md](reference/blows.md#the-battery-placed)). A path a pose can follow from end
  to end (through the joints' angles, or by a point between) is not built.
- A strike thrown while walking comes with hand goals.
- The repertoire is three recipes: the Warrior's and the Rogue's right straights and the Warrior's
  club blow. A body with no recipe of its own for what its hand holds borrows the first that fits
  (`recipeFor`): the Rogue and the skeleton the club blow, the skeleton also the Warrior's straight.
  The borrowed ones miss and put their bodies down: the Rogue's club passes its targets 0.5 to
  0.7 m off where the same hand's placed blow lands
  ([reference/blows.md](reference/blows.md#against-a-recipe)), and in the Routine the Rogue with
  the club falls in two runs of three and the skeleton with it in every one, at its second
  target ([reference/blows.md](reference/blows.md#a-loop-of-ten-placed)).
- A target off a recipe's height is struck by a placed blow: every middle target of the battery
  is hit by a fist ([reference/blows.md](reference/blows.md#the-battery-placed)). Left:
  - blows searched by band of height, for each body and thing held, in place of one recipe a
    hand and a placed blow everywhere else;
  - the low targets: 16 of the fists' 27 are filled by the body's own leg as it stands at its
    toes, and 3 are hit. Nothing stoops or kneels to strike;
  - a fist's window up is read by its point through an empty sphere and is narrower than its
    blow: the Warrior places 0.4 to 0.7 J at a head 4 to 14 cm under his own, where his straight
    lands 6 to 11 J ([reference/human-and-strikes.md](reference/human-and-strikes.md#window-height)).
    Bare-handed against the Rogue and the skeleton, whose heads are there, he fells nobody in
    120 s ([reference/bouts.md](reference/bouts.md#placed-blows)).
- A blow of its own that lands can put a body down. The Warrior in the Routine falls in 4 runs
  of 6 of ten loops at 120 Hz and in 2 of 6 at 480 Hz, setting its feet for a target or closing
  on one ([reference/lab.md](reference/lab.md#routine-gait)). Before the placed blow it fell in
  3 of 6 with its blows landing and in 1 of 6 with the same strikes thrown at nothing; in the
  one fall read, a recovering step after the blow left its feet together, and it fell stepping
  to the next target.
- A blow that meets nothing unbalances the body that threw it. The Warrior with the club on the
  Node stand (Rapier, 120 Hz), attacking a point 1.6 m off with nobody at it, ends its swing
  turned 0.75 rad from where it faced, and takes 2 s of steps to face it again. Held rigid for
  0.4 s as it chambers and handed back, it stands its time again, ends the swing turned 0.4 rad,
  and is down a second later (`tests/core-sub-mind.test.mjs`'s fixture; one point, read once).
- The club blow that sets the damage unit lands harder 6-8 cm beyond where it was searched from, so
  the unit was not thrown from its best distance; a wider search might move the unit.
- What a straight is held to (its time, its path) is the owner's to say. The Warrior's best reads
  9.5 m/s at 960 Hz, in the elite's 9-11 band rather than a typical person's 8, and 8.2 at the
  game's 120 Hz (`assets/core/strikes.json`).
- The unit search's separate grounds per trial (`--grounds 20,30,40,25`) have not been run on a
  full search.
- Searched blows found at 120 Hz read between 20 % and 100 % of their converged value.

### Blows and wounds

- A blow has no striker and its two surfaces share its energy by their compliance
  ([architecture](architecture.md#rules-and-wounds), [reference/wounds.md](reference/wounds.md)). Not
  built: a tolerance of a part's own (the pool's rule stands, by the owner's answer, and a hand
  is a third as tough as a knuckle while a head is far tougher than a face:
  [reference/wounds.md](reference/wounds.md#tolerances)); the face apart from the rest of the
  head; armour, which is a layer more in the list `energyShares` already takes; an edge and a
  point, whose prices are in the rulebook and which no item states.
- The owner's to choose, each landed at its default:
  - What the bodies hold now that a hit point is 100 J of blunt blow (`owner-damage-unit`).
    Today their hit points are as they were, so each holds 28 % fewer joules: of 45 bouts with
    clubs, 43 have the winner and the second they had and two long ones are ended by a wound,
    and 14 end by a wound where 12 did. Hit points raised to hold the joules (Warrior 8.3,
    Rogue 5.5) is every bout as it was ([reference/wounds.md](reference/wounds.md#unit)).
  - Whether a blunt blow takes a part off. Today it does, half a part's hit points past empty.
    With clubs, 12 of 45 bouts end by a part coming off; where none does, each of the 12 ends
    by a fatal wound at the same second
    ([reference/bouts.md](reference/bouts.md#a-hit-point-is-100-j)). Three bare left hands in
    those 45 bouts are emptied by a club and come off.
  - What two bodies that walk into each other cost. Today any touch that closes is a blow,
    however slight. With clubs nothing is lost that way; bare-handed, 0.14 of the 0.20 HP a
    bout's blows take is from blows with neither a hand nor an item in them, and in the crypt
    every such blow has one side already on the floor and costs the living 0.05 to 0.11 HP over
    four runs. A floor of 1 J would drop 95 % of bare-handed blows and 23 % of their hit
    points, and half a per cent of the clubs'; a body out of the fight taken out of the watch
    would drop the crypt's.
  - The stiffness of the parts no paper was read for (`contact-stiffness-gaps`: the arms, the
    shank and the foot, the middle and lower trunk, each given its neighbour's). A factor of two
    in one moves a share by 0.06 to 0.17 ([reference/wounds.md](reference/wounds.md#sensitivity)).
- The owner's to watch: a bare-handed bout
  (`?play=arena&matchup=workshop-rogue,workshop-rogue&held=empty`) beside one with clubs
  (`?play=arena&matchup=workshop-fighter,workshop-rogue`).
- Fists decide nothing: of 45 bare-handed bouts 35 end by a fall and 10 at the 120 s cap, and
  a bout's blows take 0.31 of the sides' 10 to 12 HP
  ([reference/bouts.md](reference/bouts.md#placed-blows)).
- The Warrior with an empty right hand, on the right side of a bout, falls at 2.9 s before any
  touch: it turns a quarter turn from its heading as it sets off. On the left, and on either
  side with the club, it walks.
- The crypt makes its watch again at each body it builds, and a watch made again has forgotten
  which bodies were touching: a touch that is still closing lands once more.
- Two parts of one body that meet another's part in one step are two blows, each priced from its
  own contact as if it met the part alone: a bare Rogue's fist and forearm landing together
  on a ball 6 cm under its head's height read 8.8 J and 2.8 J (`tests/lab-targets.test.mjs`).

### Body and motor control

- Walking: the fastest walk held every way is 0.7 m/s for the Warrior, 0.5 for the Rogue and 0.2 for
  the skeleton (`assets/core/stance-envelope.json`). Fast walks run at 0.82-0.94 of the pace asked,
  where a person's preferred walk is near 1.4 m/s. The next step is a controller that holds the
  pelvis against the moment the soles miss, or one whole-body solve. The assist supplies the
  moment the soles miss, as a cheat with a ceiling (`docs/reference/assist.md`).
- Rising after a fall is built as far as knees and hands, and for the lab alone (its
  Character section's "Down"). A fallen body rolls onto its front, draws its knees under, props
  itself and bears on its shins and hands; nothing stands it up, so on the battery of falls
  none rises ([reference/rising.md](reference/rising.md#staged)), and in a fight a fallen body
  still lies (`lie`) and is out of it. Open, each with its readings in the record:
  - the way on from knees and hands is a limb moved to a place (a foot planted, a hand walked
    back), which a stage of a rise does not have
    ([reference/rising.md](reference/rising.md#where-the-rise-stops));
  - the Rogue plays the Warrior's recipe and its arms do not raise its chest: it wants a recipe
    of its own;
  - the skeleton is not turned over by the humans' roll;
  - a body shoved onto its front lies twisted, and gives the rise up from there;
  - the club in the Warrior's hand costs it rises its empty hand plays to the end;
  - a recipe found by search and a learned riser, each a row of the same battery;
  - the fights take rising up once the battery's bar is met: the design and the rules' plan
    are `docs/plans/2026-10-01-rising-00-design.md` and `2026-10-01-rising-05-rules.md`.
- A limp body does not always come to rest: a light segment at a joint's limit on the ground
  goes on moving, a skeleton's hand at 0.2 m/s to the end of a 15 s watch
  ([reference/rising.md](reference/rising.md#lying)). It is what a body lying after a fall and a
  crypt body out of the fight look like. What in the solver keeps it going is not read, nor
  whether a slack joint's passive damping, a sourced number that would change every bout, is
  the cure.
- Running (a flight phase), a dash or lunge, a roll, a crouch, and turning on the spot: a standing
  body under orders does not turn to the pointer, and a half turn made while walking still drops
  the humans now and then ([reference/orders.md](reference/orders.md)). A lower
  stance also needs the hip to hinge; in the lab's Stance a lower centre of mass stands only about
  1 cm lower, and walking from there falls.
- A two-handed grip: a hand holds its own item and nothing holds one item with both.
- The envelope does not measure a turn from standing; the Routine walks and turns at 0.3 m/s and
  1 rad/s to stay up.
- Set and not swept, each said so in its record: the least lead a walk needs before it turns
  (`TURN_LEAD`), where a placed foot lands beside its place (`PLACING.near`), how near a fighter
  attacks (`ATTACK_METRES`) and the shaping of an arm's path (`IK_POSTURE_PULL`, `IK_TURN`)
  ([human and strikes](reference/human-and-strikes.md)); the stance's height and its fall bar
  (`STANCE_LOWER`, `FALLEN`, [stance tuning](reference/stance-tuning.md#stance-height)).
- Set on readings from an engine that is gone, to read again on this one: how long a body stands
  before it throws (`STAND`: the Warrior reads 6 mm/s at 1.5 s where it read 5) and whether a step
  into a stance before a strike converges with the rate
  ([human and strikes](reference/human-and-strikes.md#stand-time)); how far ahead a walker on a
  track faces (`AIM_AHEAD`) and the lab's seek budget ([lab](reference/lab.md)).
- Records no script reads again, to measure afresh when their subject changes: the servo's hold
  ([servo and muscle](reference/servo-and-muscle.md)), the servo's time constant on the routine and
  Rapier's per-step disturbance by rate ([body and engine](reference/body-and-engine.md)), the
  wrench lever and the bounded swing's routine table
  ([stance tuning](reference/stance-tuning.md#wrench-lever)), and the models' volumes
  ([human strike reference](reference/human-strike-reference.md), section 8).
- Shoves: the least impulse held from any way is 55 N s on the Warrior and 35 on the Rogue.
  Bounding the swing costs 15 held shoves on the Warrior and 11 on the Rogue
  ([stance tuning](reference/stance-tuning.md#bounded-swing)). No sourced human reference exists
  for shove impulses or for reversal time.
- The stance does not model the thighs touching.
- A hand goal has no orientation or speed yet, and the trunk takes no goal.
- Attributes: a size range (x0.9-1.18), a weight range (x0.85-1.25), and arm speed as a muscle's
  fibre share.
- Contact materials: every contact has one friction, 0.5.
- `contactMass` reads a blow with the joints free; whether a joint's give belongs in it is open.
- A blow lasts while the solver pushes on it (`watchBlows`, `lasts: "pushed"`), so one the solver
  lets go of for a single step lands again; a touch read with `lasts: "contact"`
  (`src/core/touches.ts`) lands again only once the two have parted. Whether a blow should is a
  change of rule, which moves every bout, and comes with its table.
- Rapier's limits, held as `todo` tests: a limit pushes along its parent's axis, so a pressed angle
  can pass its stop by up to 0.046 rad; and the JavaScript binding does not read joint impulses,
  so the muscle driver guesses which side pulled.

### The Arena

- Loadouts: every body carries one club.
- The Ladder.

### The Crypt

- Authored set pieces for Generated depths: rooms drawn as text (a pillared hall, a pier, four
  chambers) and stamped into a generated room, kept only where every corridor into the room is
  still a way through. A draft is `docs/plans/2026-09-23-depths-06-set-pieces.md@144961d4`.
- The skeleton's intent (see [architecture](architecture.md#standing-decisions)): the ribcage and
  pelvis fatal and the skull not, weak joints, blunt blows worth more against bone. Today its
  wounds are the human's and the head is vital.
- The skeleton's placeholders (a typical man's 79 kg, men's strength tables, the Warrior's 6 hit
  points, `skeleton-placeholders` in `SOURCES`) await the owner's numbers.
- The skeleton's reference pose presses `GUARD`'s elbows into their stops; its envelope is a
  0.2 m/s walk, and its feet slide 5.7 cm in guard.
- The party carries only clubs; a ranged weapon (the Rogue's bow) would need projectiles on the
  core.
- The crypt's frame rate on the owner's machine is unmeasured.
- The crypt's triangle budget waits on its frame rate, measured on a range of hardware: the owner
  sets it from what holds the frame rate there, and names no number before that. A generated
  crypt places up to 415,986 triangles ([art/crypt.md](art/crypt.md#triangles)), and its test
  holds it to what it places today.
- Saving a run. A bout saves and loads (`Duel.save`, [architecture](architecture.md#state)); a
  run does not, since its bodies are built as they wake.
- The run plans for its fighters with the map and hands each its orders; its bodies sense the
  clock alone. A crypt on senses, and a hero that walks one way and faces another, are not built.
- Set, and to measure on the core ([reference/play.md](reference/play.md)): how long a hero
  facing the cursor stands being hit from behind, with `SET_UPON` and `AIM_COSINE` and without.
- The crypt's step ([reference/play.md](reference/play.md#bodies-in-the-step)): a body out of
  the fight lies limp and still costs the solver 0.28 ms a step. Fixed where it lies once it is
  still, it would cost 0.02 ms and could not be pushed aside; an engine that let it rest would
  take none until something touched it.
- Hearing a run costs 8 to 11 % of its step
  ([reference/play.md](reference/play.md#hearing-in-the-step)), nearly all of it asking the
  engine what is near every segment, every step. Rapier's collision events tell of a contact as
  it starts and ends, and a watch on them would read only what began. That is another rule for
  when two are in contact than the solver's contact point, so the touches of
  [reference/look.md](reference/look.md#sound) are counted again under it before it replaces
  the asking.
- The generator keeps 0.65 m clear about every place a body stands (`LEVEL.clearance`), written
  for a body that is gone; a walker's path keeps 0.35 m (`FOOTPRINT_METRES`), less than the
  0.38 m the Warrior's elbows stand out in the pose its spec writes. Both are the owner's to
  confirm, as every value of [reference/play.md](reference/play.md) is.

### Art and look

- The skeleton's look in play is the owner's to judge. Its drawn fist ends about 7 cm short of the
  hand's collider.
- An optional skeleton costume (a loincloth and belt, bracers, one shoulder plate), only if the
  owner wants it after seeing the bones in play. Each piece is rigid, rides a part like the bones,
  collides with nothing, and is checked for clearance over a driven sweep.
- A pixel look for the dungeon, behind a switch: render at a fraction of the canvas and upscale
  without filtering, for the owner to judge against the concept images. A draft is
  `docs/plans/2026-09-24-dungeon-look-06-pixel-look.md@144961d4`.
- A raking-light check that `tangentBasis: "babylon-lh"` in `surface()` orients OpenGL normal maps
  correctly.
- Every value of the look and the sound is kept as found until the owner confirms it
  ([reference/look.md](reference/look.md)). Of them, the dungeon's stand open until the owner
  judges them in play: torch density, and which floor and wall textures ship.
- The arena goes silent at its verdict and the crypt at its run's end, and each drops the cues
  it has not played yet: the blow that decides a bout, what it took off, and the fall that ends
  a bout or a run are not heard. A fall is heard in the lab, and in the crypt while somebody of
  the party still stands.
- In the arena both sides' blows are one pair's (`left:right`), and of a pair's touches within
  60 ms the loudest alone plays (`CueInbox`): two blows exchanged at once sound as one.
- The crypt's listener is made again when a body is built, and remembers no touch under way: a
  segment pressing something at that step, and still closing on it, sounds once more
  (`hearRun`, `src/dungeon/hearing.ts`).
- A body's air (`MIX.swish`, the `swish` formula), which of the two that meet decides a touch's
  voice, and how loud a footfall is beside a blow (`MIX.impact`) are set and not heard: the
  owner's to judge in play.
- A hand that holds something sounds as what it holds, whichever of the two met
  (`substanceOf`, `src/audio/cues.ts`). A touch names the shapes the solver pushed on
  (`Touch.pairs`), as a blow reads them, and a sound does not read them yet. What a thing is
  made of is a name beside its surface's stiffness (`BodySpec.substance`, `SegmentSpec.surface`):
  whether the softer of two is the one of less stiffness, and a voice follows from that, is open.
- A step that stays within the engine's contact margin is not heard: of 24 recoveries from a
  shove, 14 footfalls ([reference/look.md](reference/look.md#sound)). A touch that began again
  when the solver pushed anew would hear them, and gives a walk more touches than strides.
- The reptile needs art; it starts as procedural shells.
- The unused templates inside `public/assets/forge/forge-kit.glb` could be removed by
  re-exporting from Blender.

### New bodies

- The reptile: a quadruped of about 8 kg that bites, with 1 hit point, several to a dungeon room,
  selectable in the arena, built entirely on the core. Once it exists: the Warrior and the Rogue
  against it, blows to end a fight, one-shots and severs.

### Engines

- Box3D, Jolt or another engine: a bench adapter in `src/physics-bench/engines/` first, then
  `src/core/engine/<name>.ts` and `CORE_ENGINE=<name> npm test`.
