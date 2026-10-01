# The look and the sound

What the screens draw and play, and the numbers they do it with. Each section names its
constants, where they live, their values, and whose choice they are.

Nothing here was measured. A value is **set by eye** (or by ear): chosen by looking at the page
while the thing was built. Unless a line says the owner chose it, every value in this record is
**kept as found; the owner to confirm**.

None of it decides a fight, with one exception that each section names where it applies: a wall,
a post or a door that is drawn is also a collider, and its size is the collider's.

## Arena light

`ARENA_LIGHT` (`src/arena/scene.ts`), the light `buildArena` sets. Colours are red, green and
blue from 0 to 1.

| Field | Value |
|---|---|
| `clear` | 0.055, 0.062, 0.078, alpha 1: what shows where nothing is drawn |
| `ambient` | 0.14, 0.15, 0.18 |
| `camera` | made at (0, 2, -4) before the orbit places it; field of view 0.95 rad; near plane 0.05 m, far 220 m |
| `environment` | the reflected image, a cube of 256 px, at strength 0.85 |
| `sky` | a fill from (0.2, 1, 0.1) at strength 0.45: 0.72, 0.78, 0.92 from above, 0.24, 0.2, 0.16 from the ground |
| `sun` | along (-0.45, -1, 0.62) from (9, 16, -12) at strength 2.6: 1, 0.85, 0.66 |
| `shadow` | the sun's map, 2048 px; bias 0.0015, normal bias 0.012 |

## Grade

`GRADE` (`src/render/post.ts`), which the arena and the crypt share (`postPipeline`): contrast
1.12, exposure 1.15, vignette weight 1.35, and a bloom from brightness 1.1 at weight 0.16. With
it go FXAA and ACES tone mapping, which are switches and not strengths.

## Arena camera

`ORBIT` (`src/arena/orbit.ts`): the camera starts at bearing 0, raised 0.32 rad, 7 m from what it
looks at. A person moves it between 2.5 m and 16 m away, and between 0.05 rad and 1.35 rad up.

## Arena room

The room `buildArenaWorld` builds (`src/arena/room.ts`). The floor's slab, the four walls and the
posts are colliders (`arenaSolids`): a body meets them, so `ROOM`'s wall sizes and `ARENA_POSTS`
are in every bout, and changing one changes bouts. The rest is drawn only.

`ROOM`, m:

| Field | Value |
|---|---|
| `groundHalfExtent`, `floorSize` | 30, 60: the floor is 60 m square |
| `maxReachHeight` | 3.6: the highest a fighter reaches; a solid piece below it must name a collider |
| `wallHalfExtent` | 13: a wall's face stands this far from the centre |
| `wallWidth`, `wallHeight`, `wallThickness` | 26.24, 4.2, 0.24 |
| `floorMetresPerRepeat`, `wallMetresPerRepeat`, `bannerMetresPerRepeat` | 2.4, 2.1, 0.4: what one repeat of the image spans |

`ARENA_POSTS`: 14 posts on a ring of 9.5 m, each 1.5 m tall, 0.17 m across, with 8 sides.

`ROOM_GROUPS`, the cosmetic pieces, as a centre and a half extent, m:

| Role | Pieces | Where | Half extent |
|---|---|---|---|
| beam | 8, two a wall | 4.1 up, 12.82 from the centre, 5.0 either side of the wall's middle | 2.1 along, 0.12, 0.12 |
| banner | 8, two a wall | 2.55 up, 12.96 from the centre, 7.2 either side | 0.6 across, 0.9 up |
| rack | 4, one a corner | on the floor (0.006 up) at 11.0 by 7 | 0.8 by 0.2 |
| debris | 8, two a wall | on the floor (0.006 up) at 7.5 by 10.8 | 0.4 by 0.13, turned 0.3, -0.4, -0.2, 0.5, 1.2, 1.7, 1.4 and 1.9 rad |

## Forge

What `dressForgeRoom` adds to the room (`src/arena/forge-room.ts`).

`FORGE_MASONRY`: each wall is 9 courses of 26 blocks, every other course shifted half a block,
with a joint of 0.008 m across, 0.006 m up and 0.008 m through the wall left round each block.
The blocks fill the wall's collider and stand nowhere outside it.

`FORGE_FIRE`:

| Field | Value |
|---|---|
| `every`, `lit` | a flame on every 2nd post; a light as well on posts 2 and 10 |
| `width`, `height`, `lift` | a flame is a plane 0.38 m by 0.72 m, 1.07 m above its post's centre |
| `colour`, `range` | a light is 1, 0.42, 0.12, reaching 16 m |
| `intensity` | 14 as it is made; the flicker replaces it at the first frame |
| `mean`, `swing`, `rate` | the flicker: 13, by 0.8 either way, at 8 rad/s |
| `frameCap` | one frame advances the flames by at most 50 ms |

The flames go on flickering while a bout is paused. Whether they should is the owner's to say.

## Sound

Everything a page plays is synthesized by `GameAudio` (`src/audio/game-audio.ts`); nothing is a
recording.

`MIX`, set by ear. A gain is a share of full scale:

| Field | Value |
|---|---|
| `volume` | the slider starts at 0.5 |
| `master`, `masterSeconds` | the master's gain at a full slider is 0.65, reached with a time constant of 0.025 s |
| `compressor` | a limiter on the master: threshold -12 dB, ratio 8 |
| `reverb` | the crypt's: 0.7 s of noise decaying at 9 a second, at level 0.25, mixed in at 0.13 |
| `air` | the crypt's air loop, 0.06 |
| `fires`, `fire`, `ambienceSeconds` | the 3 nearest torches' fire, each at 0.12 of its placement's gain, followed with a time constant of 0.3 s |
| `drip` | a drip at 0.065; the first after 4000 ms and up to 5000 more, then one every 5000 ms and up to 8000 more |
| `audible` | a blow placed quieter than 0.001 plays nothing |
| `impact` | a blow plays at 0.08 and 0.5 of its strength; what a severed part scatters, at 0.18 of the strength |
| `rate` | a loop plays at 0.94 to 1.06 of its pitch (0.94 and a draw of 0.12), a one-shot at 0.9 to 1.1 (0.9 and a draw of 0.2) |
| `fade`, `stop` | a stopped voice fades with a time constant of 0.008 s and stops after 0.04 s |

`SOUND_SECONDS`: a blow on bone, on a body or on wood lasts 0.26 s, as a drip does; debris 0.4 s;
the air's and the fire's loops are 6 s long.

`CUE` (`src/audio/cues.ts`): a blow's strength is the square root of its energy over 60 J, capped
at 1, and a blow weaker than 0.035 makes no sound. **Set, not measured**: no bout's blows were
read to choose the 60. The club blow that sets the damage unit carries 138 J (`core-club-unit`),
so a blow of that kind plays at full strength, and so does one of less than half its energy; what
energies a bout's blows carry, and so how much of the range from quiet to loud a bout uses, is a
measurement to make ([roadmap](../roadmap.md)).

`PLACEMENT`: a sound's pan is how far it is to the listener's side over 10 m, held within 0.85
either way; in the crypt its gain is the square of the share of 18 m it has left to go, and
nothing from there on. The arena plays every blow at full gain.

Each sound's own formula (`GameAudio.buffer`) is written where it is computed: its partials,
their decays and the noise under them are the sound, and no number of them is shared.

The inbox's bounds (`INBOX`) and the 12 voices at once (`VOICES`) are numeric settings: they bound
the work, and what they drop is what a person would not have heard apart.

## Crypt camera

`CAMERA_PITCH` (`src/dungeon/camera.ts`) is pi / 6, 30 degrees above the ground. The concept art
looks down at about 40 to 45 degrees, and the reference chamber's own camera at 42. **Which the
crypt takes is the owner's to choose** ([roadmap](../roadmap.md)); `?pitch=` on the page shows
another, in degrees.

`CAMERA`: the camera stands sqrt(800) m, 28.3 m, across the ground from the point it looks at,
which is 1 m above the floor under the hero. The camera is orthographic, so the distance decides
what is clipped, and not how large anything is drawn.

`REFERENCE_CAMERA` (`src/dungeon/reference.ts`), the reference chamber's
([the crypt's art](../art/crypt.md#the-rootbound-crypt)): 42 degrees up, at a bearing of 135
degrees, zoom 6.5.

## Crypt light

`DUNGEON_LOOK` (`src/dungeon/lighting.ts`), what `lightDungeon` gives a generated level:

| Field | Value |
|---|---|
| `ambient` | a fill of strength 0.18, `#7d8fb3` from above and `#1a1614` from the ground |
| `environmentIntensity` | 0.22 of the arena's reflected image |
| `lantern` | the carried light: `#ffcf8f`, strength 9, 2.6 m up and 0.8 m from the hero toward the camera |
| `torch` | `#ff8a3d`, strength 6, flickering by 0.6 either way |
| `ssao` | contact shadow at a ratio of 0.5: radius 0.35, strength 1.1, 8 samples |
| `clearColor` | 0.008, 0.010, 0.016 |
| `fallbackLights` | 2 torch lights stay on where clustered lights are not supported |
| `cutoff` | a light's range is drawn where it adds 0.03, a sixth of the ambient |

`REFERENCE_LIGHT`, the reference chamber's own: a fill of 0.30 in `#9aaecf`, the reflected image
at 0.58, and a lantern of strength 5 in `#dce5f5`.

`REFERENCE_TORCHES` (`src/dungeon/reference.ts`), the chamber's two torches: one on the wall cell
(3, 8) facing +x, its flame at (3.65, 2.05, 8) and its light at (4, 2.05, 8); one on (12, 14)
facing -z, its flame at (12, 2.05, 13.35) and its light at (12, 2.05, 13).

The crypt's flames go on flickering while a run is paused, as the forge's do.

## Crypt fog

`FOG_LOOK` (`src/dungeon/fog-plugin.ts`): ground seen before and not in sight now is drawn as
0.035, 0.04, 0.05 in linear light and 0.18 of the surface's own brightness. The shader's text
(`FRAGMENT`) fades to that between a mask value of 0.5 and 1.0, and to black between a known
coverage of 0.50 and 0.90.

`CUT_AWAY` (`src/dungeon/fog.ts`), how a wall between the hero and the camera ghosts away:

| Field | Value |
|---|---|
| `centre` | the oval's centre is 0.9 m above the hero's feet |
| `across`, `up` | its half-width and half-height on screen, 3.6 m and 3.2 m at the hero |
| `soft` | the drop is full out to 0.2 of the radius, and falls to none at the rim |
| `most` | 0.5 of the wall's pixels are dropped at the heart: a checkerboard |
| `ahead` | the drop rises from none to full over 0.32 m toward the camera |
| `foot` | a wall is whole below 0.1 m and fully in the cut above 0.5 m |

## Crypt stone

The crypt's walls, floor and doors. `WALL_HEIGHT` (`src/dungeon/fog.ts`) is 2.8 m, the wall's
collider and its drawn skin alike; a door's leaf fills its collider. Everything else here is
drawn inside those colliders ([the crypt's art](../art/crypt.md#the-rule-every-piece-keeps)).

`MASONRY` (`src/dungeon/masonry.ts`), m:

| Field | Value |
|---|---|
| `courses` | 5 courses under the coping |
| `coping`, `copingBevel` | the coping is 0.36 high, with a bevel of 0.07 |
| `length` | a block is 0.5 to 1.05 long |
| `quoin` | a corner's quoins are 0.74 and 0.4 |
| `bevel`, `relief` | a block's bevel is 0.035; its face is set back by up to 0.025 |
| `backing`, `cap` | the backing skin stands 0.08 behind the face and 0.12 below the top |
| `mortar` | the backing's albedo is 0.15 of the stone's |

`STONE_LOOK` (`src/dungeon/fog-plugin.ts`), what a textured wall or floor does to its own albedo:

| Field | Value |
|---|---|
| `vary`, `spans` | the albedo is multiplied by 0.78 to 1.08, by noise at spans of 7 m and 2.3 m |
| `foot`, `footRise` | a wall's foot is 0.55 of its albedo, rising to all of it over 0.9 m |
| `grime`, `grimeHeight`, `grimeStrength` | grime of 0.018, 0.024, 0.012 up to 0.6 m, at strength 0.7 |
| `top`, `topFacing` | a fragment facing more than 0.9 up is 0.6 of its albedo |
| `copingDepth`, `coping` | the top 0.06 m of a flat wall's face, or the coping's bevel, is lit 1.6 times |

The shader's text (`FRAGMENT`) writes a few numbers of its own: the two spans weigh 0.65 and
0.35, the second offset by 17; grime's height varies between 0.4 and 1 of `grimeHeight` with the
same noise, in patches where a third noise, at a span of 1.3 m and offset by 5, passes from 0.35
to 0.75; a face counts as a bevel above a normal of 0.3 up and as square to an axis above 0.99;
and the coping's bevel is read from 0.005 m below where it starts.

`TILE` (`src/dungeon/world.ts`): a flat floor's tile is 0.49 m to its edge, leaving 2 cm joints; a
textured one 0.5 m; both stand `FLOOR_TOP` high.

`DOOR_LEAF`: 6 planks with 0.02 m between them, 2.42 m tall and 0.2 m or 0.24 m deep; two iron
bands at 0.55 m and 1.85 m up, 0.12 m high, 0.28 m deep and 2.9 m wide; and a ring on each
face, 0.55 m to one side of the middle and 1.2 m up, 0.18 m across and 0.03 m thick.

`SCONCE`: nothing of it stands more than 0.08 m off the wall; its plate is 0.12 m by 0.3 m by
0.02 m, centred 1.82 m up, and its cup is 1.9 m up.

## Crypt dressing

What `dressingPlacements` and `torchPlacements` scatter on a generated level, none of it with a
body (`src/dungeon/dressing.ts`). Density is judged in play.

`DRESSING`:

| Field | Value |
|---|---|
| `torchSpacing` | no two torches within 7 m |
| `torchHeight`, `torchProud`, `torchLightProud` | a flame is 2.05 m up and 0.12 m off the wall; its light 0.4 m off |
| `decalsPerRoom`, `corridorDecalsPerCell` | 7 to 12 floor markings a room; a chance of 0.06 for each corridor cell |
| `keepClear` | no marking within 1.2 m of the start or the exit |
| `rootsPerLevel`, `rootSpacing`, `rootWidth`, `rootDrop` | at most 12 roots a level, 4 m apart, 0.5 to 0.9 m wide, hanging 0.9 to 1.7 m |
| `hungProud` | a hung piece stands 0.01 m off the wall |
| `cobwebsPerRoomCorner`, `cobwebSpan`, `cobwebDrop` | a chance of 0.28 for each corner facing the camera; 0.35 to 0.55 m along each wall, hanging 0.45 to 0.7 m |
| `muralsPerRoom` | 2 to 4 wall pieces a room |

`DRESSING.decals`, each kind's share of the draws and the side of its square, m:

| Kind | Weight | Side |
|---|---|---|
| blood | 0.14 | 0.8 to 1.5 |
| crack | 0.14 | 1 to 1.8 |
| moss | 0.12 | 0.9 to 1.8 |
| puddle | 0.08 | 0.9 to 1.6 |
| bones | 0.12 | 0.6 to 1 |
| rubble | 0.14 | 0.7 to 1.3 |
| scorch | 0.06 | 0.9 to 1.6 |
| straw | 0.1 | 0.8 to 1.4 |
| grime | 0.1 | 1.4 to 2.4 |

`DRESSING.murals`, each wall piece's share, its width and the height of its middle, m:

| Piece | Weight | Width | Middle |
|---|---|---|---|
| stain | 0.25 | 0.5 to 0.9 | hung from the top |
| lichen | 0.25 | 0.5 to 0.9 | 0.6 to 1.1 |
| fissure | 0.2 | 0.4 to 0.7 | 0.9 to 1.6 |
| chains | 0.15 | 0.3 to 0.45 | 1.5 to 1.9 |
| banner | 0.15 | 0.6 to 0.85 | 1.6 to 1.9 |

The constants beside the table:

- `HUNG_TOP`: a hung piece's top is 0.01 m under the wall's.
- `MURAL_FLOOR`: no wall piece comes lower than 0.1 m.
- `FACING_MIN`: a piece hangs only on a face that looks toward the camera by 0.35 or more on the
  ground, which is 0.3 of the camera's view at a pitch of 30 degrees (0.3 over that pitch's
  cosine). It is a number and does not follow `?pitch=`.
- `FLOOR_TOP`: the floor's tiles stand 0.015 m high, and every marking lies on them.
- `DECAL_LAYERS`: overlapping markings are lifted apart over 3 layers.
- `ROOT_TORCH_CLEARANCE`, `WEB_TORCH_CLEARANCE`: no root within 1.5 m of a flame, no web within
  1.2 m.

`ATLAS` (`src/dungeon/decals.ts`): the markings are painted into one image of 4 by 4 tiles, each
256 px a side with a clear rim of 6 px. `MURAL_ASPECT`, each wall piece's width over its height:
stain 0.45, lichen 1, fissure 0.45, chains 0.3, banner 0.55. `PAINT` holds each kind's painting,
its colours and strokes written where they are drawn.

## Crypt rooms

The Random Crypt's chambers ([the crypt's art](../art/crypt.md#random-crypt);
`src/dungeon/crypt-archetypes.ts`).

`CRYPT_FURNITURE`, each solid piece's width, depth and height, m, which its obstacle in the map
shares:

| Piece | Width | Depth | Height |
|---|---|---|---|
| tomb | 2.5 | 1.15 | 1.1 |
| column | 0.8 | 0.8 | 2.65 |
| altar | 2.4 | 1.1 | 1.05 |
| bench | 1.7 | 0.55 | 0.65 |
| rack | 1.8 | 0.6 | 1.9 |
| cluster | 1.8 | 1.5 | 0.55 |

`CRYPT_ROOM_LOOK`, each kind of chamber:

| Kind | Niches | Roots | Scatter | Damp | Torch colour | Strength | Shadow |
|---|---|---|---|---|---|---|---|
| guard | 0.08 | 0 | 0.05 | no | `#ffc077` | 6 | 85 |
| burial | 0.85 | 0.12 | 0.3 | no | `#ff9c4b` | 4 | 60 |
| chapel | 0.35 | 0.05 | 0.15 | no | `#ffe2ad` | 8 | 95 |
| rootbound | 0.5 | 1 | 1 | yes | `#e7ba78` | 5 | 70 |

## Materials

`BASE` (`src/render/materials.ts`), each plain surface's colour in linear light, with no
metalness:

| Surface | Colour | Roughness | Whose |
|---|---|---|---|
| `wood` | 0.34, 0.20, 0.09 | 0.72 | kept as found |
| `room.timber` | 0.20, 0.12, 0.065 | 0.88 | kept as found |
| `dungeon.floor` | 0.184, 0.177, 0.194 | 1 | the owner's choice of two candidates |
| `dungeon.wall` | 0.066, 0.070, 0.090 | 1 | the owner's choice of two candidates |

The dungeon's two are the flat colours shown until their texture maps decode; the owner chose the
texture each stands for, of two candidates each. Which textures ship is still the owner's to
judge in play ([roadmap](../roadmap.md)).

## Bodies

`SHAPE_TINT` (`src/render/body-shapes.ts`), for a body drawn as its plain shapes: every shape
shines a faint grey of 0.08, and the right side is drawn 0.35 of the way toward 0.85, 0.45, 0.25,
so that the two sides tell apart. `WOOD`, what a hand holds: 0.45, 0.3, 0.17.

The skeleton's skin (`src/render/skeleton-skin.ts`): `BONE` is an ivory of 0.80, 0.74, 0.62 and
`RUNE` an amber of 0.72, 0.35, 0.12; `EYE`, an eye's diameter, is 0.16 m by 0.2 by 0.7, a fifth of
the head's width scaled by 0.7: 0.0224 m.
