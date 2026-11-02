# Art for new characters

## Question

What free art can new characters be made from, in the game's realistic look, and what does each
candidate cost to adopt?

## Answer

- **The rat first**: Poly Haven's Street Rat, the owner's choice, on the reptile's body plan
  ([the rat](../plans/2026-11-01-rat.md)).
- **Next cheapest**, both on the same four-legged body: the grass lizard as the Reptile's skin, and
  the carved dog as a wooden guardian hound.
- **Human-shaped characters** come from MakeHuman (a ghoul, a brute, a dwarf) or are built in code
  (a golem, an armoured revenant, a mummy's wraps), on the human body plan.
- **Open**: which creature follows the rat; whether a six- or eight-legged body family (the spider,
  the centipede) is worth its core work.

## What adopting a model takes

Rigs and animations in a model are worth nothing here: the game plays no animation. A mesh is cut
into rigid pieces, one per segment, each carried by its segment, as the skeleton's is
([the skeleton's art](../art/skeleton.md#how-it-rides-the-core)); a body is fitted to the art
([the body fitted to the bones](../art/skeleton.md#the-body-fitted-to-the-bones)). What decides a
model's cost:

- **Its pose**: a body is built in the pose its art is in. Rigid pieces cannot unfold a sitting or
  pinned pose.
- **Its body plan**: a model on an existing plan (human, or the reptile's quadruped) is art work;
  a new plan (six legs, eight, many) is a new body family, its controller and its mind.
- **Its cleanup**: scans are 35,000 to 570,000 triangles against the 14,286 of the rat; a scan
  carries a colour-calibration cube or a statue's plinth; the jaw is cut from a closed mouth.
- **Its licence**: CC0 or CC-BY, with the raw files in a public repository. Mixamo, MetaHuman, Daz,
  Character Creator and most marketplace licences forbid that; AI-generated catalogues' CC0 claims
  are checked model by model.
- **Its look**: the cartoony CC0 packs (Quaternius, Kenney, KayKit) clash with the realistic
  humans and skeleton.

## Findings

### MakeHuman's range

Heights at the macro sliders' extremes, MPFB at `3edf9df0` (the build's pin,
`scripts/character-lab/realistic/rebuild.ps1`), its own base mesh and macro targets, the body's
vertex group crown to sole, Blender 4.5.12 headless. The Warrior's settings
(`scripts/character-lab/realistic/build.py`) read 1.775 m against the game's 1.77 m.

| Body | Shortest | Tallest |
|---|---|---|
| Adult man (age 25) | 1.373 m | 2.431 m |
| Adult woman (age 25) | 1.235 m | |
| 11 years | 0.953 m | 1.312 m |
| About 6 years | 0.705 m | |
| 1 year | 0.495 m | 0.963 m |
| All sliders at 0.5 | 1.659 m | |

Weight and muscle at their highest leave the tallest man's height as it is. The 1-year-old's head
is about twice the adult's share of its height.

- **Height is not MakeHuman's limit**: Size scales any body (`CHARACTER_ATTRIBUTES`,
  `src/core/character-attributes.ts`). Its limit is shape: it makes humans. It has pointed ears
  and head-scale targets (`data/targets/ears`, `data/targets/head` in MPFB); horns, tails, snouts,
  hooves and claws are sculpted on top.
- **A small creature is a thin short adult scaled down** (the 1.235 m woman at Size 0.5 is about
  0.6 m), never the child or baby shapes: in a game about bodies taking blows, those read as a
  hurt child.

### Sources

| Source | Licence | What it offers |
|---|---|---|
| MakeHuman / MPFB | CC0 (assets and output) | realistic humans of any proportion, skinned; in the pipeline ([characters](../art/characters.md)) |
| Blender Studio Human Base Meshes | CC0 | human bases to sculpt from; the skeleton's source. No animal bundle |
| Built in code | the project's | anything rigid: the robot shells, the reptile's shells |
| Poly Haven | CC0 | one creature, the Street Rat; statues and animal heads as props |
| ffishAsia-and-floraZia on Sketchfab | CC0, model by model | photogrammetry of real specimens: spiders, centipedes, crabs, a whip scorpion, beetles, lizards |
| Museum scans on Sketchfab (Virtual Małopolska, Arms Museum, artsmia) | CC0 | statues and pinned specimens |
| Blender open movies (Spring's Alpha and Beta creatures, Sintel) | CC-BY | stylized creatures |

Sketchfab's search API finds downloadable CC0 models by name
(`api.sketchfab.com/v3/search?type=models&downloadable=true&license=cc0&q=<name>`); a download
needs a signed-in account. Searched for and not found as realistic free models: dog, wolf,
goblin, orc, troll, ogre, zombie, ghoul, imp.

### Candidates

None has a rig or an animation (Sketchfab's `animationCount` 0; the rat's glTF has no skin).

| Model | Licence | Triangles | Pose | Cost |
|---|---|---|---|---|
| [Street Rat](https://polyhaven.com/a/street_rat) (Poly Haven, Sean Buckley) | CC0 | 14,286 | standing on all fours, tail out, mouth shut | cut only; fur in the texture, one mesh, 0.148 m long as published |
| [Grass lizard](https://sketchfab.com/3d-models/8ec4811184f34fc5b6699eca34008f68) | CC0 | 383,783 | flat, legs sprawled, long thin tail | reduce and cut; the reptile's sprawl |
| [Sculpture of a Dog](https://sketchfab.com/3d-models/d479cc72dcf94d5ea4e0ca982ec39abe) (Arms Museum) | CC0 | 35,096 | standing, on a plinth | cut from its plinth; a carved borzoi, a wooden guardian |
| [Fishing spider](https://sketchfab.com/3d-models/320e77ebe2e049dcbb759dd79ee03a8c) | CC0 | 437,904 | standing, legs spread | reduce; legs are rigid pieces by nature; an eight-legged family |
| [Centipede](https://sketchfab.com/3d-models/8f8d1c0305d04637b7abaf4cb54d25a8) | CC0 | 178,633 | flat, near straight | reduce; a many-legged family |
| [Asian paddle crab](https://sketchfab.com/3d-models/4915ee5a2d9f46af9a24d3b8da505d00) | CC0 | 567,578 | not looked at | a new family |
| [*Blaps mortisaga*](https://sketchfab.com/3d-models/d7d0e0204d4a4a5cb428f021d9429487), the churchyard beetle | CC0 | 512,778 | pinned specimen, legs drawn in | the pose is the obstacle |
| [European stag beetle](https://sketchfab.com/3d-models/05d5d69295644b9eadd4cd8a7ac5adca) | CC0 | 345,893 | not looked at | a six-legged family |
| [Rhinoceros beetle](https://sketchfab.com/3d-models/27c5c17dab7c4143821a7ecc1bfa2def) | tagged CC0; its description says "use as CC-BY" | 342,100 | not looked at | credit required |
| [Wild boar cast](https://sketchfab.com/3d-models/34a9f999ce2f4e47a13b05b65473ad23) | CC0 | 146,600 | sitting, legs folded | a prop only |

### Characters by cost

1. **The human body plan, a new look**: a ghoul (MakeHuman, a rotting skin); an armoured revenant
   (the skeleton under plates built in code); a stone or iron golem (rigid pieces in code, the
   crypt's stone); a mummy (wraps in code); a brute or a dwarf (MakeHuman's proportions, Size).
2. **The human plan with parts added**: a lizardman or ratman (a tail segment, a snout); a
   minotaur (legs that bend backward, new leg joints).
3. **The quadruped plan**: the rat, the lizard, the hound.
4. **A new family**: the spider, the centipede, the beetles, the crab.
