# The workshop models: the Warrior and the Rogue

The game's two humans are the character workshop's models: the fighter, who plays the Warrior,
and the rogue, who plays the Rogue. The male fighter and female rogue use customized
MakeHuman/MPFB CC0 anatomy, skin textures, hair, eyes and rig weights. Their clothing, armour,
boots, weapons, equipment fitting and preview motion are this project's work. They are not wholly
original anatomical meshes.

The models reach the game in two forms: the workshop's own GLBs with their authored preview
motion, shown on `/character-lab.html`; and animation-free derivatives that the core measures and
the pages wear as skins on bodies.

## Where each file comes from

| File | Made by | Read by |
|---|---|---|
| `assets/character-lab/fighter.blend`, `rogue.blend` | `scripts/character-lab/realistic/build.py` (saved over on every build) | the export below |
| `public/assets/character-lab/fighter.glb`, `rogue.glb` | `scripts/character-lab/realistic/build.py` (`refresh_motion.py` and `refresh_deformation.py` rewrite the motion and deformation in place) | the workshop page (`src/character-lab/main.ts`), `tests/character-lab.test.mjs`, `tests/character-motion.test.mjs` |
| `public/assets/humanoid/workshop-fighter.glb`, `workshop-rogue.glb` | `scripts/humanoid/export-workshop.py` | the skins (`src/render/skin.ts`); `SKIN_TOP` in `src/core/human/model.ts` cites an accessor of each |
| `assets/humanoid/workshop-fighter.json`, `workshop-rogue.json` | `scripts/humanoid/export-workshop.py` | the core's rig (`src/core/human/rig.ts`), the skins |
| `assets/humanoid/workshop-*-trunk-hull.json` | `node scripts/core/workshop-envelope.mjs --write`, from the humanoid GLBs | the core's envelope (`src/core/human/envelope.ts`) |

The humanoid GLBs, the rig JSON and the trunk hulls are `SOURCES` entries (`src/core/sources.ts`),
as is the envelope measurement (`workshop-envelope`), so a number the core takes from a model names
the file and the place in it. The workshop models themselves are not: the core reads only their
derivatives.

## Building the workshop models

The generator is `scripts/character-lab/realistic/build.py`, run in Blender through its wrapper
(`-Blender` defaults to `blender` on the path):

```powershell
scripts/character-lab/realistic/rebuild.ps1 -Blender PATH_TO_BLENDER_EXE
```

The wrapper downloads MPFB and MakeHuman's core assets to the ignored `.tools/mpfb`; it installs
nothing into the user's Blender preferences. MPFB is pinned to commit
`3edf9df0551765be43563d047888cf7877eb89b4`; its code is GPLv3, and its graphical assets and
generated output are CC0 (see [its licence](https://github.com/makehumancommunity/mpfb2/blob/3edf9df0551765be43563d047888cf7877eb89b4/LICENSE.md)
and `assets/character-lab/MAKEHUMAN-CC0.txt`). The asset archive is
[MakeHuman's system assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html),
downloaded by the wrapper (`makehuman_system_assets_cc0.zip`, saved as `.tools/mpfb/assets.zip`) and checked against SHA256 `B542127A8E25547C7C29C19F2D1D2ADB9A664C80396ECD694095DBC8028A0107`. The
models use the middle-aged Caucasian male and young Caucasian female skins, low-poly eyes,
eyebrow001, eyelashes01, teeth_base, and the short02 and ponytail01 hair, all from that CC0 pack.
The maps are packed into the Blender files and GLBs, so nothing depends on `.tools` at runtime.

The build's helpers, beside it:

- `motion.py`: equipment placed relative to the anatomy, fitted finger poses, and the
  walk-and-attack timeline.
- `rig.py`: shoulder and forearm twist spread across helper joints, skin influences normalized.
  Shoulder plates follow the upper arm's swing without its full axial twist.
- `grip_fit.py`: finger flexion fitted against a handle using the weighted skin itself.
- `phases.py`: one timeline for the bow's poses, string flex, fingers and the arrow's release;
  `morph_export.py` binds the flex and string to the exported clips. The arrow has its own joint,
  so it leaves the hand in world space.
- `refresh_motion.py` and `refresh_deformation.py`: re-author the motion, or rebake the
  deformation helpers, on a saved body without rebuilding MPFB.

The archery stance turns hips and feet together to 83 degrees; the bow's extension uses each
model's measured arm length, and the drawing hand follows the nock that the string and arrow use.
Equipped poses refuse unreachable wrist targets while authoring.

## Exporting the game's derivatives

`scripts/humanoid/export-workshop.py` opens a saved workshop file and writes its derivative
without saving over the source:

```powershell
blender --background --disable-autoexec assets/character-lab/fighter.blend --python scripts/humanoid/export-workshop.py
blender --background --disable-autoexec assets/character-lab/rogue.blend --python scripts/humanoid/export-workshop.py -- rogue
```

The GLB keeps the source's mesh, UVs, materials, embedded textures and rest transforms, and drops
the preview animation, authoring helpers and (for the fighter) the bow. The JSON holds the source's
SHA-256, the anatomy's lengths, bone frames, the palm, grip frames, equipment geometry and the
authored finger poses.

## How the core uses them

- **The body.** `src/core/human/rig.ts` reads the joint centres and lengths from the JSON;
  `src/core/human/envelope.ts` takes the trunk's hulls and the feet from the clothed envelope that
  `scripts/core/workshop-envelope.mjs` measures (`tests/core-human.test.mjs` measures it again).
- **The size.** `src/core/human/model.ts` sets x1 to the owner's typical adult, a 1.77 m man of
  79 kg: the fighter's skin top at the authored size sets one fit scale (`FIT_SCALE`), and both
  models are built at it, so the Rogue keeps her size against him. Her mass is his times the ratio
  of the two models' measured volumes.
- **The skin.** `src/render/skin.ts` loads the humanoid GLB once per scene and carries each bone
  rigidly on the core segment it belongs to, reading only the segments' achieved transforms. It
  owns no collision and decides nothing. Boots and armour are shown or hidden by `visiblePart`
  (`src/character-lab/catalog.ts`); a hand that holds the club closes on it (`CLUB_GRIP`,
  `src/lab/club-grip.ts`), and a free hand's fingers take a pose between relaxed and a fist
  (`src/lab/fist.ts`).

## The character workshop page

`/character-lab.html` (`src/character-lab/`) is an authored animation study, separate from the
game's physics and minds. Choose **The Fighter** or **The Rogue**; set Footwear (None or Boots),
Armour (None or Equipped) and what is in the hands (empty hands, sword, shield, sword and shield,
or a two-handed bow). Each character keeps its own loadout.

- Drag to orbit, right-drag to pan, scroll to zoom; on the focused canvas the arrow keys orbit and
  raise the target, and `+` and `-` zoom.
- **Walk & attack** plays the authored loop; **Neutral** stops on the inspection pose. Pause,
  restart, scrub the Motion timeline, or slow playback down.
- **Inspect grip** pauses and frames the equipped hand; **Reset view** restores the camera.

Clothing changes keep the motion's time; changing character or weapon restarts it.

To run it on a port of your own: `npm run dev -- --host 127.0.0.1 --port 5183 --strictPort`, then
open `http://127.0.0.1:5183/character-lab.html`, and stop the server when done.

## Checking the models

`npm test` loads the real GLBs (`workshopModel`, `tests/harness/workshop-model.mjs`, which works
out every node's world matrix again at each pose and before each read).
`tests/character-lab.test.mjs` checks every loadout's groups, strap and clips, real
forward-and-return displacement, the stance foot, the attacks and the bow's flex; samples every
loop for a wrist bent past 60 degrees, and the bow's for hands entering the torso; and, on each
loop's first frame, that the palm and finger pads lie on the sword's, shield's and bow's grips
(`gripDistances`, `contactPatch` and `gripGap`), in the hand the page inspects (`gripHand`).
`tests/character-motion.test.mjs` checks that the bow hand turns no faster than 180 degrees a
second at every half frame, and, at every frame of the sword-and-shield and bow loops, that the
wrists keep their area, the forearms their girth, and the arms and what they carry clear the head,
the body and each other. Its controls show each check finding what it looks for: a crossed
triangle, the head pushed a centimetre through itself, a wrist pressed flat, a forearm pushed out
to twice its girth.

Over those two loops the least a wrist keeps of its rest area is 0.71 on the fighter and 0.74 on
the rogue, both drawing the bow, against a bound of 0.65; the forearm's skin never stands farther
from its axis than at rest (a greatest ratio of 1.000 on both), against a bound of 1.5; and the
bow's hands stay outside a torso twice as wide and deep as the one the check uses (Node,
`NullEngine`, both GLBs, every frame at 60 a second).
These are sampled surface checks, not proof of clearance between samples, and they do not judge
anatomy or art: a person looks as well.

### What the checks read

The checks find their regions on the skin in the rest pose (`skinRegions`,
`scripts/character-lab/validation.mjs`), by the numbers of `SKIN`:

| Field | Value |
|---|---|
| `hand` | 0.1209 m, the fighter's wrist to middle knuckle (0.12086 m at rest; the rogue's is 0.09919 m). The generator authors the grips on this hand and scales them to each model's (`handScale`, `scripts/character-lab/realistic/motion.py`); the checks scale their lengths along the hand the same way |
| `palm` | the skin bound to the hand by more than 0.6, from 0.055 to 0.115 m along the hand from the wrist, whose normal has a cosine above 0.25 with the palm's. A grip's line crosses the palm 0.095 m from the wrist, with a radius of 0.018 m (`point(s, x, .095, .046)` in `motion.py`) |
| `pad` | a digit's pad is the skin bound to its two outer bones by more than 0.65, whose normal has a cosine above 0.05 with the palm's |
| `wrist` | the skin from 0.72 to 1.02 of the way from the elbow to the wrist, within 0.07 m of the forearm's axis. Its area is read at 0.77, 0.84, 0.91 and 0.98, over the skin within 0.027 of each |
| `forearm` | the skin from 0.2 to 0.75 of the way from the elbow to the wrist, between 0.015 and 0.065 m from the axis |
| `patch` | a pad's contact is read at the distance a tenth of the way up its order from the nearest (`contactPatch`) |
| `part` | a triangle belongs to a part of the body when each corner is bound to the part's bones by more than 0.65 (`skinPart`) |

The values are kept as they were set with the grips; none was swept. Four of the bounds are
looser than either model: the skin of the wrist stands within 0.06 m of the axis, and the
forearm's bare skin lies between 0.025 and 0.040 m from it, beyond 0.25 of the way down (Node,
`NullEngine`, both GLBs). The surface index's cell is `CELL`, 0.12 m, which changes how fast it
answers and not what.

`node scripts/fingerprint.mjs --character` prints a hash of what these checks measure on both
models, at three frames of every clip: a change to the checks that is meant to change nothing
leaves it as it was.

With a server running, and Playwright fetched for the run (it is not a dependency); every script
launches Microsoft Edge (`channel: 'msedge'`):

- `npm exec --yes --package=playwright -- node scripts/character-lab/browser-check.mjs URL`: every
  loadout and animation sample, retained loadouts, orbit and zoom, grip framing, mobile overflow,
  browser errors and resource counts; captures go to `.review/character-lab/`.
- `visual-review.mjs URL fighter` (or `rogue`, with `armour` to add it): grip close-ups and front,
  side, rear and overhead attack poses. Look at the frames between poses too.
- `anatomy-review.mjs` and `grip-review.mjs` (URL argument, default port 5182) and
  `realistic-grips.mjs` (fixed to port 5183): further captures.
  `geometry-report.mjs` and `contact-report.mjs` print measurements from the GLBs in Node.
