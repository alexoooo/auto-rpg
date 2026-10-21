# The look and the sound

What the screens draw and play, and the numbers they do it with. Each section names its constants
and where they live. A value is **set by eye** (or by ear) while the thing was built, and kept as
found for the owner to confirm, unless the section says the owner chose it; only how loud a touch
is and how fast a body's air begins are measured ([Sound](#sound)). None of it decides a fight,
except that a drawn wall, post or door is also a collider of the same size.

## Arena light

`ARENA_LIGHT` (`src/arena/scene.ts`), the light `buildArena` sets. Colours are red, green and
blue from 0 to 1.

| Field | Value |
|---|---|
| `clear` | 0.026, 0.017, 0.021, alpha 1: what shows where nothing is drawn |
| `ambient` | 0.14, 0.15, 0.18 |
| `camera` | made at (0, 2, -4) before the orbit places it; field of view 0.95 rad; near plane 0.05 m, far 220 m |
| `environment` | the reflected image, a cube of 256 px, at strength 0.85 |
| `sky` | a fill from (0.2, 1, 0.1) at strength 0.45: 0.72, 0.78, 0.92 from above, 0.24, 0.2, 0.16 from the ground |
| `sun` | along (-0.45, -1, 0.62) from (9, 16, -12) at strength 2.6: 1, 0.85, 0.66 |
| `shadow` | the sun's map, 2048 px; bias 0.0015, normal bias 0.012 |

## Grade

`GRADE` (`src/render/post.ts`), which the arena and the crypt share (`postPipeline`): contrast
1.12, exposure 1.15, vignette weight 1.35, and a bloom from brightness 1.1 at weight 0.16. FXAA and
ACES tone mapping go with it, as switches.

## Arena camera

`ORBIT` (`src/arena/orbit.ts`): the camera starts at bearing 0, raised 0.32 rad, 7 m from what it
looks at, and a person moves it between 2.5 m and 16 m away and between 0.05 rad and 1.35 rad up.
Setup shows an overview at bearing 0, pitch 0.78 rad and distance max(39, 31 / viewport aspect) m,
so the whole ring fits between the previews.

`CAMERA_INPUT` (`src/arena/camera.ts`): 0.006 rad per horizontal pointer pixel and 0.004 rad per
vertical one; the wheel scales distance by exp(deltaY × 0.001); the overview's pitch, distance and
width are the 0.78, 39 and 31 above.

## View cameras

The Arena and Lab share `src/render/camera-math.ts`, authored for inspecting a body:

- `ISO_ALPHA`, −3π/4: behind and to the left of a body facing +z.
- `ISO_BETA`, acos(1/√3): equal foreshortening on all three axes.
- `CHASE_BETA`, 1.2 rad from vertical: about 21 degrees above the floor.
- `VIEW_CAMERA`: `turnSeconds` 0.3 smooths pelvis twists, `lookHeight` 1 m looks at chest height,
  and `follow` takes 0.05 of the remaining target displacement per render frame.

Orthographic extents match the perspective field at the target. The arena's Free view orbits with
the spare pointer buttons, Isometric and Chase hold their rotation, and all three zoom with the
wheel; none advances the world.

## Arena room

The room `buildArenaWorld` builds (`src/arena/room.ts`) is a circular floor, after the owner's
arena concepts. The floor slab, twenty-four parapet sections and eight brazier pedestals are
colliders (`arenaSolids`), the same on the page and the headless stand, so their sizes affect
bouts.

`ROOM`, m:

| Field | Value |
|---|---|
| `groundHalfExtent`, `floorSize` | 30, 60: the supporting collision slab is 60 m square; the drawn floor is a disc of radius 13.5 |
| `maxReachHeight` | 3.6: a solid piece below this must name a collider |
| `wallHalfExtent`, `wallCount` | 13, 24: the inner apothem and number of sides |
| `wallWidth`, `wallHeight`, `wallThickness` | width is twice 13 times tan(pi/24), plus 0.08 m joint overlap; height 1.25, depth 0.5 |
| `floorMetresPerRepeat`, `wallMetresPerRepeat`, `bannerMetresPerRepeat` | 2.4, 2.1, 0.4 |

`ARENA_POSTS`: 8 pedestals on a ring of 12.3 m, each 1.7 m tall, 1.1 m across, with 8 sides; their
bronze bands and bowls stay within their collision envelopes. `ROOM_GROUPS` places the parapet and
eight banners, cloth planes on radius 13.55 m hanging down the outside, with no collider. The
core's sine and cosine place the solids.

## Forge

`dressForgeRoom` (`src/arena/forge-room.ts`) fills each parapet collider with three courses of
four masonry blocks, alternating a half-block offset. `FORGE_MASONRY` leaves joints of 0.008 m
across, 0.006 m up and 0.008 m in depth. A parapet between the camera and a fighter is hidden.

`FORGE_FIRE` burns on all eight braziers. Each flame is 1.05 by 1.6 m, its centre 1.35 m above the
pedestal centre. Posts 1 and 5 carry lights of colour (1, 0.42, 0.12), range 16 m and mean
intensity 13. Flicker varies by 0.8 at 8 rad/s; `burn` caps one frame at 50 ms, and a paused frame
burns nothing. The art is in [the arena's art](../art/arena.md).

## Sound

Everything a page plays is synthesized by `GameAudio` (`src/audio/game-audio.ts`). What a body
sounds of is read from the world by two rules (`src/audio/body-sounds.ts`); no stance, strike or
scenario says when a sound is due.

- **A touch** (`hearTouches`): a segment meeting another body, or something fixed, that it was not
  in contact with, while closing on it (`watchTouches`, `src/core/touches.ts`). It is as loud as
  the energy it carries (`impactCue`, `CUE`), in the voice of the softer surface. A pair of bodies
  is heard once, and a body's touch with itself is not heard.
- **Air** (`airOf`): the speed of the body's fastest point, among the ends and corners of the
  shapes of its extremities and what they hold. A body has one looping voice that follows it
  (`GameAudio.swish`, `SWISH`).

A blow is a touch and is heard as one. What it takes off a side is a cue of its own
(`debrisCues`): the kind `debris`, as loud as that side's share of the blow's energy, in a pair of
its own so it plays beside the blow.

Every screen plays both: the lab from a log at the mind's time ([lab.md](lab.md#sound)); the arena
as it happens, until the verdict (`src/arena/main.ts`); the crypt every built body's while the party
sees its cell (`hearRun`, `src/dungeon/hearing.ts`), fading with distance from the leader
(`PLACEMENT.reach`). A screen that stops playing drops its unplayed cues (`GameAudio.setActive`), and
a cue waits 60 ms for a louder one of its pair (`INBOX.coalesce`): what decides a bout, or ends a
run, is not heard.

**What things are made of** (`BodySpec.substance`, `ItemSpec.substance`, `src/core/spec/body.ts`):
the workshop's bodies are flesh, the skeleton bone, the club wood, everything fixed stone. A hand
sounds as what it holds (`substanceOf`). The softer of the two decides the voice (`voiceOf`),
softest first: flesh, the thump `body`; bone, the tick `bone`; wood, the knock `shield`; stone has
no voice. The order is set, not heard; how stiff a surface is under a blow is the spec's `surface`
([wounds.md](wounds.md)), which a sound does not read.

`MIX`, set by ear but for `swish`, which is set and not heard yet. A gain is a share of full scale:

| Field | Value |
|---|---|
| `volume` | the slider starts at 0.5 |
| `master`, `masterSeconds` | the master's gain at a full slider is 0.65, reached with a time constant of 0.025 s |
| `compressor` | a limiter on the master: threshold -12 dB, ratio 8 |
| `reverb` | the crypt's: 0.7 s of noise decaying at 9 a second, at level 0.25, mixed in at 0.13 |
| `air` | the crypt's air loop, 0.06 |
| `fires`, `fire`, `ambienceSeconds` | the 3 nearest torches' fire, each at 0.12 of its placement's gain, followed with a time constant of 0.3 s |
| `drip` | a drip at 0.065; the first after 4000 ms and up to 5000 more, then one every 5000 ms and up to 8000 more |
| `swish` | a body's air at full strength plays at 0.3, and at 0.7 to 1.5 of its buffer's pitch (0.7 and 0.8 of the strength); gain, pitch and pan follow with a time constant of 0.04 s |
| `audible` | a cue placed quieter than 0.001 plays nothing |
| `impact` | a touch plays at 0.08 and 0.5 of its strength; what a severed part scatters, at 0.18 of the strength |
| `rate` | a loop plays at 0.94 to 1.06 of its pitch (0.94 and a draw of 0.12), a one-shot at 0.9 to 1.1 (0.9 and a draw of 0.2) |
| `fade`, `stop` | a stopped voice fades with a time constant of 0.008 s and stops after 0.04 s |

So a footfall of strength 0.02 plays at 0.09 and a blow of strength 0.5 at 0.33: `impact`'s 0.08
is how loud a footfall is beside a blow.

`SOUND_SECONDS`: a touch in bone's, a body's or wood's voice lasts 0.26 s, as a drip does; debris
0.4 s; the crypt's air and the fire are loops 6 s long, and a body's air a loop 3 s long.

`CUE` (`src/audio/cues.ts`): a touch's strength is the square root of its energy over 60 J, capped
at 1, and a touch weaker than 0.0125 (0.0094 J) makes no sound. Both are read from
[the touches measured](#touches-measured):

- **60 J** is a hard fall's landing, the top of the range (to 59 J). A club blow that lands is past
  it: the Blow scenario's club blows land 48 to 137 J, and 2 of 8 body-on-body touches in three
  bouts are over 60 J. A fist on a Routine target carries 4.6 to 37 J where a recipe is thrown and
  1 J or less where the blow is placed.
- **0.0125** lies between a sole set down and the quietest footfall but two. Of 1061 footfalls of
  a body on its feet, 7 are under 0.0094 J: five soles laid flat at 0.06 to 0.08 m/s (0.0083 J or
  less), two toe edges set down in the Routine. The quietest of the rest is 0.0099 J, strength
  0.0128, so the gap is narrow. A sole landing flat meets 2 kg at about 0.5 m/s, 0.2 to 0.3 J; one
  landing on its toe's edge meets 0.2 kg, 0.01 to 0.09 J, as the skeleton's walk does at nearly
  every step (median 0.023 J).

`SWISH`: a body's air is nothing while its fastest point moves at 5 m/s or slower, all of it at
20 m/s, and in proportion between (`swishStrength`).

- **5 m/s** is over the fastest point of a body walking (1.0 to 2.5 m/s) or running (to
  4.38 m/s). A foot catching a hard shove passes it for 0.03 s or less (to 6.3 m/s); a foot going
  out from under a falling body (7.0 to 8.4 m/s) and a hand of a body going down (10 to 16 m/s)
  pass it.
- **20 m/s** is the Warrior's club's end in the Blow scenario, 19.9 to 20.3 m/s; the Rogue's
  reaches 12.9 to 13.6 m/s, the skeleton's 14.5 to 18.6, a fist in the Routine 13.4 to 14.5.

`PLACEMENT`: a sound's pan is how far it is to the listener's side over 10 m, held within 0.85
either way; in the crypt its gain is the square of the share of 18 m it has left to go, and nothing
from there on. The arena plays every sound at full gain.

Each sound's own formula (`GameAudio.buffer`) is written where it is computed; the air's (`swish`)
is noise between two low-passes. A cue (`SoundCue`) names its pair, and the inbox (`CueInbox`)
plays the loudest of a pair's cues in 60 ms, which makes one sound of the several parts a landing
body touches the ground with. The inbox's bounds (`INBOX`) and the 12 one-shot voices (`VOICES`)
are numeric settings that bound the work; with every voice playing, a louder cue takes the
quietest voice's place.

Not heard: a step that never leaves the ground's 2 cm contact margin (a low catching step after a
shove: of 24 recoveries, 14 footfalls were heard), and what a hand holds set down beside it (one
rigid body, in contact once).

### Touches measured

`node research/touches.mjs`: Node core stand (`tests/harness/core-stand.mjs`), Rapier, 120 Hz, a
20 m ground, one body, balance 0 %; the bouts are the Node core world's, each side's balance 0 %.
Every segment is read; a body's air leaves out its first second, in which it takes its guard. The
script prints every part's row; these are the feet's, the landings' and the bouts'. Standing 10 s,
no body touches the ground anew and its fastest point moves at 0.02 to 0.03 m/s.

A foot on the ground, by a body on its feet (Routine: a loop of 10 targets):

| Model | Case | Footfalls | Energy, J: least / median / most | Under 0.0094 J | Fastest point, m/s |
|---|---|---:|---|---:|---|
| workshop-fighter | walk, 0.5 m/s, 10 s | 25 | 0.0241 / 0.294 / 0.318 | 0 | 2.47, a foot |
| workshop-fighter | Run, shuttle, 30 s | 75 | 0.00403 / 0.277 / 0.32 | 2 | 4.38, a foot |
| workshop-fighter | Routine, 81.3 s | 95 | 0.0143 / 0.272 / 0.331 | 0 | 14.5, a hand |
| workshop-rogue | walk, 0.5 m/s, 10 s | 25 | 0.0184 / 0.26 / 0.296 | 0 | 2.48, a foot |
| workshop-rogue | Run, shuttle, 30 s | 76 | 0.0199 / 0.262 / 0.293 | 0 | 4.00, a foot |
| workshop-rogue | Routine, 71.2 s | 85 | 0.00878 / 0.234 / 0.325 | 1 | 13.4, a hand |
| crypt-skeleton | walk, 0.2 m/s, 10 s | 25 | 0.0196 / 0.0229 / 0.084 | 0 | 1.23, a foot |
| crypt-skeleton | Run, shuttle, 30 s | 78 | 0.0204 / 0.0228 / 0.276 | 0 | 1.87, a foot |
| crypt-skeleton | Routine, 93.2 s | 135 | 0.00396 / 0.0234 / 0.615 | 1 | 14.3, a hand |

The Routine's targets (`src/lab/targets.ts`) touched the striking body 12 times in the Warrior's
loop (0.19 to 36.9 J), 11 in the Rogue's (0.15 to 15.1 J) and 8 in the skeleton's (0.15 to
17.6 J), on the hand or the forearm.

The Blow's stored blows (`LAB_BLOWS`), each thrown by its own body at a target body's head (high)
or upper trunk (middle), to 1.5 s after its pushes begin. Every one lands and its body stays up:

| Model | Blow | Its hardest landing, J | Fastest point, m/s |
|---|---|---:|---|
| workshop-fighter | the unit club blow | 98.1 | 19.9, the club |
| workshop-fighter | club, high / middle | 119 / 137 | 20.1 / 20.3, the club |
| workshop-fighter | fist, high / middle | 21.6 / 36.6 | 10.1 / 13.5, a hand |
| workshop-rogue | club, high / middle | 47.7 / 56.8 | 12.9 / 13.6, the club |
| workshop-rogue | fist, high / middle | 7.86 / 15.5 | 10.0 / 11.6, a hand |
| crypt-skeleton | club, high / middle | 72.0 / 107 | 14.5 / 18.6, the club |
| crypt-skeleton | fist, high / middle | 32.1 / 47.7 | 12.3 / 14.1, a hand |

A shove from the front on a standing body, 20 to 60 N s: 13 of 15 caught, in 24 recoveries with
14 footfalls heard (0.066 to 1.13 J); a catching foot reaches 6.1 m/s, over 5 m/s for at most
0.03 s.

A fall, 80 N s from the front, read for 6 s:

| Model | Touches while down | Loudest, J | Fastest point going down / while down, m/s |
|---|---:|---|---|
| workshop-fighter | 13 | 32.3, a shank | 6.96, a foot / 10.4, a hand |
| workshop-rogue | 20 | 26.8, the head | 6.95, a foot / 13.6, a hand |
| crypt-skeleton | 19 | 59, the lower trunk | 8.41, a foot / 11.8, a hand |

Three bouts (`scripts/fingerprint.mjs`'s, both bodies heard; their digests unchanged by hearing):

| Bout | Seconds | Body on body: touches, J least / median / most | Fastest point, m/s: left, right |
|---|---:|---|---|
| workshop-fighter v workshop-rogue | 9.54 | 5: 0.22 / 10.2 / 112 | 20.2, the club; 7.66, a hand |
| crypt-skeleton v workshop-fighter | 13.09 | 1: 72.1 | 2.49, a foot; 20.7, the club |
| workshop-rogue v crypt-skeleton | 11.82 | 2: 8.35 / 9.79 / 11.2 | 11.8, the club; 3.6, a foot |

A club's end is over 5 m/s for 0.18 to 0.5 s of a bout.

## Crypt camera

`CAMERA_PITCH` (`src/dungeon/camera.ts`) is pi / 6, 30 degrees above the ground: **the owner's
choice**, where the concept art looks down at about 40 to 45 degrees and the reference chamber's
camera at 42. `?pitch=` on the page shows another, in degrees.

`CAMERA`: the camera stands sqrt(800) m, 28.3 m, across the ground from the point it looks at, 1 m
above the floor under the hero. It is orthographic, so the distance decides what is clipped, not
how large anything is drawn.

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

`REFERENCE_LIGHT`, the reference chamber's own: a fill of 0.30 in `#9aaecf`, the reflected image at
0.58, and a lantern of strength 5 in `#dce5f5`.

`REFERENCE_TORCHES` (`src/dungeon/reference.ts`), the chamber's two torches: one on the wall cell
(3, 8) facing +x, its flame at (3.65, 2.05, 8) and its light at (4, 2.05, 8); one on (12, 14)
facing -z, its flame at (12, 2.05, 13.35) and its light at (12, 2.05, 13).

The torches burn on a time of their own, which only the page moves (`DungeonLighting.burn`), by at
most 50 ms a frame; a paused run's flames stand still, as the forge's do, as the owner chose.

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

`SCENERY` (`src/dungeon/scenery-visibility.ts`), what the scenery remembers having been seen (the
look's own memory, never the run's):

| Field | Value |
|---|---|
| `reach` | the hero sees scenery to 12 m, which is as far as `canSee` sees by default |
| `corner` | a floor cell is seen when any of four points 0.35 m from its middle, toward its corners, is in sight |
| `gap` | an unseen pocket inside a room is filled when it is enclosed and no larger than 4 cells |

## Crypt cut-away

The Rootbound Crypt and the Random Crypt are drawn with the walls on the camera's side cut down to
a low sill (`src/dungeon/reference-look.ts`; `cutawayCondition`).

`CUTAWAY`:

| Field | Value |
|---|---|
| `sill` | a cut wall is drawn up to 0.85 m |
| `facing` | a wall piece, or a torch, has its back to the camera when the cosine between its facing and the camera's bearing is below -0.1: 5.7 degrees past side-on |
| `along`, `through` | the box cut about a piece of the Random Crypt is 1.55 m either way along its wall, which reaches over its neighbours, and 0.55 m through it |

`REFERENCE_CHAMBER`: the Rootbound Crypt's walls lie beyond x = 3.55 and 15.45 and z = 4.55 and
13.45, m: 0.45 m beyond the middles of the floor's outer cells. The two on the camera's side are
cut, and a torch whose rock cell lies beyond one is hidden with its wall.

`REFERENCE_DAMP`: the Rootbound Crypt's floor is wet about (6.1, 7), (11.6, 11.3) and (13.5, 8.2),
m. The Random Crypt's is wet under the torches of its damp chambers (`CRYPT_TORCH`).

A torch's shadow map is 2048 px a side at high quality and 1024 px at reduced (`shadowMapSize`;
[the crypt's art](../art/crypt.md#random-crypt)).

## Crypt stone

The crypt's walls, floor and doors. `WALL_HEIGHT` (`src/dungeon/fog.ts`) is 2.8 m, the wall's
collider and its drawn skin alike; a door's leaf fills its collider. Everything else here is drawn
inside those colliders ([the crypt's art](../art/crypt.md#the-rule-every-piece-keeps)).

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

The shader's text (`FRAGMENT`) writes a few numbers of its own: the two spans weigh 0.65 and 0.35,
the second offset by 17; grime's height varies between 0.4 and 1 of `grimeHeight` with the same
noise, in patches where a third noise, at a span of 1.3 m and offset by 5, passes from 0.35 to
0.75; a face counts as a bevel above a normal of 0.3 up and as square to an axis above 0.99; and
the coping's bevel is read from 0.005 m below where it starts.

`TILE` (`src/dungeon/world.ts`): a flat floor's tile is 0.49 m to its edge, leaving 2 cm joints; a
textured one 0.5 m; both stand `FLOOR_TOP` high.

`DOOR_LEAF`: 6 planks with 0.02 m between them, 2.42 m tall and 0.2 m or 0.24 m deep; two iron
bands at 0.55 m and 1.85 m up, 0.12 m high, 0.28 m deep and 2.9 m wide; and a ring on each face,
0.55 m to one side of the middle and 1.2 m up, 0.18 m across and 0.03 m thick.

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

`CRYPT_ARRANGEMENT`, where each kind of chamber stands its furniture: offsets from the chamber's
centre, m, which a chamber turned half round mirrors. A chamber has one of three variants, and a
variant moves some pieces by a `shift` of 0.3 m either way of the middle one.

| Kind | Piece | x | z |
|---|---|---|---|
| guard | two racks | ±2.7 | -3.5 |
| guard | two benches, variant 0 | ±2.7 | 3.2 |
| guard | two benches, the other variants, the first turned and the second too in variant 1 | ±3.5 | 2.3, shifted |
| burial | two tombs, either turned by a variant | ±2.7 | -2.5, shifted |
| burial | a third tomb | 2.7 on one side or the other | 2.5 |
| chapel | the altar | 2.2 on one side or the other | 1 short of the chamber's last row of cells |
| chapel | four columns | ±3 | ±3 |
| chapel | four benches | ±2.6 | ±1.5, shifted |
| rootbound | a cluster | -2.7 | -2, shifted |
| rootbound | a cluster, turned | 2.5 | 2.4, shifted |

`CRYPT_ROOM_LOOK`, each kind of chamber:

| Kind | Niches | Roots | Scatter | Large slab | Damp | Torch colour | Strength | Shadow | Soil | Stain |
|---|---|---|---|---|---|---|---|---|---|---|
| guard | 0.08 | 0 | 0.05 | 0.3 | no | `#ffc077` | 6 | 85 | 0.43, 0.35, 0.23 | 0.36 |
| burial | 0.85 | 0.12 | 0.3 | 0.3 | no | `#ff9c4b` | 4 | 60 | 0.32, 0.23, 0.18 | 0.55 |
| chapel | 0.35 | 0.05 | 0.15 | 0.58 | no | `#ffe2ad` | 8 | 95 | 0.43, 0.35, 0.23 | 0.36 |
| rootbound | 0.5 | 1 | 1 | 0.3 | yes | `#e7ba78` | 5 | 70 | 0.27, 0.33, 0.15 | 0.7 |

Soil is the colour the paving's stains take in a chamber of that kind, and Stain how strong they
are (`CryptWeathering`, `src/dungeon/crypt-weathering.ts`). Paving outside every chamber takes
0.4, 0.32, 0.21 at 0.35, written in the shader.

The dressing of a crypt's map (`dressCryptMap`, `src/dungeon/crypt-plan.ts`) draws from a stream
of its own, one draw against each of these odds where a chamber's kind gives none.

`CRYPT_ODDS`:

| Field | Value |
|---|---|
| `largeSlab` | outside every chamber, a cell's paving is first tried as a large slab below a draw of 0.3 |
| `brokenSlab` | not a large slab, it is tried as a broken slab below 0.63 and a long one above |
| `fractured` | a slab that does not fit gives way to one cell: a fractured slab at 0.4, else one of the plain pavings |
| `dampScatter` | scatter on a floor cell of a damp chamber, 0.18 |
| `corridorNiche` | a niche in a run of three straight wall cells outside every chamber, 0.12 |
| `panel` | a wall cell with no pier takes a panel at 0.55, else a repair |
| `detail` | a straight wall cell is dressed with its pier, panel or repair at 0.78, else left plain |
| `corridorRoots` | roots on a wall cell outside every chamber, 0.15 |
| `floorRoots` | roots on the floor before a wall cell of a damp chamber, 0.75 |
| `rootboundRoots` | roots again on each wall cell of a rootbound chamber, 0.55 |

`CRYPT_DRESS`:

| Field | Value |
|---|---|
| `pavings` | the kit has 4 plain pavings |
| `pierEvery` | a pier stands on every 3rd cell along a wall |
| `scatterOut` | scatter lies 0.85 m before its niche |
| `bannerAside` | a guard chamber's two banners hang 2.7 m either side of its middle |

`CRYPT_TORCH`:

| Field | Value |
|---|---|
| `count` | 2 torches a chamber, on its -x and +z walls, nearest its middle |
| `spacing` | the two stand no nearer than 0.65 of the chamber's shorter side |
| `alongX` | of two wall cells as far from the middle, the one on the wall along z is taken first: the other counts as 0.1 cell farther |
| `flameOut`, `height` | the flame stands 0.65 m out from its rock cell's centre, 2.05 m up; the light a whole cell out at the same height |
| `dampOut` | the damp under a torch of a damp chamber lies 1.4 m beyond its light |

## Workshop

The character workshop page (`src/character-lab/main.ts`) shows a model in a studio of its own,
apart from the game's scenes. Its values were set with the page; none was swept.

`STAGE`:

| Field | Value |
|---|---|
| `pixelRatio` | the page draws one pixel for every 1.5 of the device's, and never finer than the page's own |
| `backdrop` | the clear colour and the fog's, (0.155, 0.202, 0.198) |
| `fog` | linear, from 5 m to 15 m |
| `environmentSize` | `assets/env.hdr` at 256 px a face |
| `ambient` | (0.24, 0.27, 0.25) |
| `exposure`, `contrast` | 1.05, 1.12 |
| `fill` | a hemisphere toward (0, 1, -0.6), intensity 0.85, sky (0.75, 0.85, 0.86), ground (0.26, 0.28, 0.24) |
| `key` | a sun at (-3, 5, 4) shining along (0.7, -1, -0.65), intensity 1.7, colour (1, 0.88, 0.70); its shadow reads from 0.1 m to 12 m of depth, and its frustum's sides follow the casters |
| `rim` | a sun shining along (-0.6, -0.4, 0.8), intensity 1.4, colour (0.6, 0.78, 0.85); it casts no shadow |
| `shadow` | the key's map, 2048 px, a blurred exponential map with a kernel of 24 and a darkness of 0.25 |
| `floor` | 200 m a side, (0.065, 0.088, 0.08), no gloss |
| `plinth` | a disc 1.55 m across and 0.055 m thick, its top at the floor (centre at y = -0.028 m), of the floor's material, 96 sides |
| `inlay` | a ring 1.46 m across and 0.004 m thick at y = 0.002 m, (0.53, 0.45, 0.29), 96 sides |

`VIEW`:

| Field | Value |
|---|---|
| `home` | where the camera starts and **Reset view** returns it: bearing π/2 + 0.22, pitch 1.39, 5.7 m from (0, 1.02, 0.65) |
| `fov`, `near` | 0.57 rad; 0.01 m |
| `radius`, `beta` | the camera may stand from 0.2 m to 9 m off, at a pitch from 0.45 to 1.65 |
| `wheel`, `pinch`, `panning` | Babylon's `wheelDeltaPercentage` 0.015, `pinchDeltaPercentage` 0.008 and `panningSensibility` 1200 |
| `grip` | **Inspect grip** stands 0.85 m from the holding hand's middle knuckle, at a bearing of π/2 + 0.3 and a pitch of 1.1; a shield's grip is behind its board, and is seen from a bearing of 0.4 and a pitch of 0.45 |
| `keys` | an arrow turns the camera 0.12 rad or raises its target 0.08 m, between 0.15 m and 1.9 m; `+` and `-` move it 0.15 m, no nearer than `radius`'s least and no farther by key than 5 m |

`MOTION`: the authored loop is 12 s long, its clips are keyed at 60 frames a second
(`scripts/character-lab/realistic/motion.py`), and a drawn frame advances it by 100 ms at most, so
that a stalled page does not jump.

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
texture each stands for, of two candidates each.

## Bodies

`SHAPE_TINT` (`src/render/body-shapes.ts`), for a body drawn as its plain shapes: every shape
shines a faint grey of 0.08, and the right side is drawn 0.35 of the way toward 0.85, 0.45, 0.25,
so that the two sides tell apart. `WOOD`, what a hand holds: 0.45, 0.3, 0.17.

The skeleton's skin (`src/render/skeleton-skin.ts`): `BONE` is an ivory of 0.80, 0.74, 0.62 and
`RUNE` an amber of 0.72, 0.35, 0.12; `EYE`, an eye's diameter, is 0.16 m by 0.2 by 0.7, a fifth of
the head's width scaled by 0.7: 0.0224 m.
