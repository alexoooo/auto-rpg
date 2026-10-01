# Roadmap

Where the game is going, and what is open. A figure here with no record of its own is from the
plans this replaces, which commit 2e99105f holds under `docs/plans/`; measure it again before
building on it.

## Where the game is going

- **The Arena**: a bout of two bodies to a verdict. A person watches today; a person will give a
  side orders.
- **A Ladder** of bouts, to be designed.
- **A Diablo-like Dungeon**: a dark isometric action RPG after Diablo's Cathedral, with loops,
  scored layouts and authored rooms, where a person commands a party and each member's mind carries
  the orders out.
- **Equipment**: swords, a maul, a mace, a whip, and the loadouts to choose them. Edged and pointed
  weapons bring the rulebook's other mechanisms into play; every weapon keeps its ratio to the club.
- **Many morphologies**: every body a sourced spec, families sharing code and not values. The human
  is the reference body, the skeleton is on the core, a reptile is next.
- **Layered AI**: each layer depending only on those below it -- world, body, motor control,
  skills, minds. What sits above `fighterMind` (tactics, a person's orders) is open, and the owner
  is designing it.

All of it on a physically based core, humans first ([architecture](architecture.md)).

## Open items

### The AI

- The structure above `fighterMind` (tactics, a person's orders, how minds are layered) is being
  designed; the owner decides it before any restructuring of minds and skills.
- A mind cannot yet attack a moving body, block or parry.
- The arena needs a mind of its own, beyond walking at the other body and attacking its head.

### Strikes

- Hand goals: a strike as a place, a speed and a time for the hand, met by arm, trunk and legs
  together, and the strike search in that form. A recipe stays wherever it beats the hand goal.
- A strike thrown while walking comes with hand goals.
- The repertoire is three recipes: the Warrior's and the Rogue's right straights and the Warrior's
  club blow. A body with no recipe of its own for what its hand holds borrows the first that fits
  (`recipeFor`): the Rogue and the skeleton the club blow, the skeleton also the Warrior's straight.
  The skeleton falls after two borrowed strikes in the Routine.
- The club blow that sets the damage unit lands harder 6-8 cm beyond where it was searched from, so
  the unit was not thrown from its best distance; a wider search might move the unit.
- What a straight is held to (its time, its path) is the owner's to say. The Warrior's best reads
  9.5 m/s at 960 Hz, in the elite's 9-11 band rather than a typical person's 8, and 8.2 at the
  game's 120 Hz (`assets/core/strikes.json`).
- The unit search's separate grounds per trial (`--grounds 20,30,40,25`) have not been run on a
  full search.
- Searched blows found at 120 Hz read between 20 % and 100 % of their converged value.

### Body and motor control

- Walking: the fastest walk held every way is 0.7 m/s for the Warrior, 0.5 for the Rogue and 0.2 for
  the skeleton (`assets/core/stance-envelope.json`). Fast walks run at 0.82-0.94 of the pace asked,
  where a person's preferred walk is near 1.4 m/s. The next step is a controller that holds the
  pelvis against the moment the soles miss, or one whole-body solve.
- Rising after a fall. A fallen body is out of every fight until this exists.
- Running (a flight phase), a dash or lunge, a roll, a crouch, and turning on the spot. A lower
  stance also needs the hip to hinge; in the lab's Stance a lower centre of mass stands only about
  1 cm lower, and walking from there falls.
- The envelope does not measure a turn from standing; the Routine walks and turns at 0.3 m/s and
  1 rad/s to stay up.
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
- Rapier's limits, held as `todo` tests: a limit pushes along its parent's axis, so a pressed angle
  can pass its stop by up to 0.046 rad; and the JavaScript binding does not read joint impulses,
  so the muscle driver guesses which side pulled.

### The Arena

- Orders a person can give a side.
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
- The dungeon's look choices stand open until the owner judges them in play: the camera pitch
  (`CAMERA_PITCH`), torch density, and which floor and wall textures ship.
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
