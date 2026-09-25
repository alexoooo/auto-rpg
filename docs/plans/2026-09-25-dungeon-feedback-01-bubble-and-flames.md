# Dungeon feedback 01: a wider bubble, and flames that fade with it

The owner: "the see-through-walls area is too small, please expand it somewhat -- it should be possible to see the
character and a bit around them, in a sort of oval, but there should be some fading (it should be obvious that this
is a transparency bubble, perhaps with some lower alpha value)". And: "the flames just kinda float in the transparency
bubble -- would be nice if the also were somewhat-transaprent".

Nothing here moves a collider, a route or a fight. The sweep must match to the hundredth.

## 1. The bubble: `CUT_AWAY` in `src/dungeon/fog.ts`

The rule already has the shape the owner describes:
- an oval on screen around the body's middle;
- a 4x4 ordered dither that drops `most` of a wall's pixels at the heart;
- a smooth fall to none at the rim.

It is too small, and the fall is too narrow to read as a fade. Starting values, set by eye and judged on the owner's
machine:

| field | was | now | why |
|---|---|---|---|
| `across` | 2.4 | 3.6 | half-width on screen: the body plus about a body-length either side |
| `up` | 2.2 | 3.2 | half-height: the whole of a wall in front of the hero at pitch 30, and the floor just past it |
| `soft` | 0.3 | 0.2 | the full drop covers only the inner fifth of the radius, so four fifths are a visible fade |
| `most` | 0.8 | 0.8 | unchanged: the heart keeps 3 of 16 pixels, so the wall still reads as a ghost ("lower alpha") and not as a hole |

Rewrite the doc comment on `CUT_AWAY` to say what the table says, and drop the sentence about the square hole it
replaced: that belongs to history.

The shader in `src/dungeon/fog-plugin.ts` interpolates `CUT_AWAY`'s fields, so it follows without an edit.
`the_cut_away_shader_is_cutAway_and_is_handed_the_pitch` in `tests/dungeon-fog.test.mjs` checks that it does.

**Tests that read the old size.** Three assertions in `a_wall_in_front_ghosts_around_the_hero_and_the_opening_has_no_edge`
assumed the old oval (found by review, confirmed by running it):
- **The line-of-sight check** ("every point on one line of sight ... drops the same share"). Its first sample, at
  t = 1.5, now lies at y = 0.26 m, inside the `foot` ramp, and read 0.0894 against 0.2432. Its line now starts above
  the foot: `t >= (foot[1] - centre + 0.5 * up * cos(pitch)) / sin(pitch)`.
- **The lateral samples of the "partial" loop** were `[-3, -2.4, -1, 0, 1, 2.4, 3]` metres, all inside a 3.6 m oval.
  So its `|across| >= CUT_AWAY.across` clause asserted nothing. They are now multiples of `CUT_AWAY.across`:
  `[-1.25, -1, -0.4, 0, 0.4, 1, 1.25]`.
- **The pitch comparison:**
- `cutAway(hero, wall(1, 0, WALL_HEIGHT), Math.PI / 4) > cutAway(hero, wall(1, 0, WALL_HEIGHT), CAMERA_PITCH) + 0.1`.
- With the bigger oval, both pitches put that point near the heart, and the gap closes to about 0.08 (hand-computed
  from the formula).
- The claim is "a steeper camera cuts more of a tall wall just ahead". Move the probe to a point where pitch 30 lies
  in the soft ring: wall top, 0.5 m ahead, gives about 0.63 against 0.76 (also hand-computed).
- Assert on the computed shares, and state them in the comment.

## 2. Flames fade with the wall behind them

`src/dungeon/fire.ts` (new, Node-loadable, `.ts` imports):

```ts
import { Effect } from "@babylonjs/core/Materials/effect.js";
import "../forge-fire.ts";
import { cutAway } from "./fog.ts";
import type { Point } from "./map.ts";

/**
 * The forge's flame (`proofFire` in `src/forge-fire.ts`) times a `fade`, so a torch inside the cut-away ghosts with
 * the wall and sconce behind it rather than floating in front of a hole. Derived from the forge's text rather than
 * copied, and refused at load if that text has moved, so the arena's fire stays the one source of the flame.
 */
const HEAD = "varying vec2 vUV; uniform float time;", TAIL = "gl_FragColor=vec4(c,a*.82);}";
const forge = Effect.ShadersStore.proofFireFragmentShader;
if (!forge.includes(HEAD) || !forge.endsWith(TAIL)) throw new Error("dungeon fire: proofFire has changed; derive the fade again");
Effect.ShadersStore.dungeonFireFragmentShader = forge.replace(HEAD, `${HEAD} uniform float fade;`)
  .slice(0, -TAIL.length) + "gl_FragColor=vec4(c,a*.82*fade);}";

/** Which shaders a dungeon flame draws with: the forge's vertex, the fading fragment. */
export const DUNGEON_FIRE = Object.freeze({ vertex: "proofFire", fragment: "dungeonFire" });

/** How much of a flame at `at` is drawn: what the cut-away leaves of a wall there. */
export const flameFade = (hero: Point, at: { x: number; y: number; z: number }, pitch: number): number =>
  1 - cutAway(hero, at, pitch);
```

**`src/dungeon/lighting.ts`, `lightDungeon`:**
- Import `DUNGEON_FIRE` and `flameFade` from `./fire.ts`, in place of the side-effect import `../forge-fire.ts`
  (`fire.ts` carries it).
- Build the material from `DUNGEON_FIRE`, with `uniforms: ["worldViewProjection", "time", "fade"]`.
- One material serves every flame, so the fade is set per mesh as it binds. `ShaderMaterial.bind` always ends in
  `_afterBind`, which notifies `onBindObservable` with the mesh, even when it skipped re-uploading the material's own
  uniforms:

```ts
const fades = new Map<AbstractMesh, number>();
fire.onBindObservable.add(mesh => fire.getEffect()?.setFloat("fade", fades.get(mesh) ?? 1));
```

- In `update(hero, nextZoom, nextPitch)`:

```ts
for (const { flame } of flames) fades.set(flame, flameFade(hero, flame.position, nextPitch));
```

- Never write `fade` through `fire.setFloat`: a material-level value would be re-bound over the per-mesh one
  whenever the material rebinds.
- `dispose` clears the observer.
- Torch **lights** do not fade. A torch still lights the room behind a ghosted wall, as it does now.

## 3. Tests (`tests/dungeon-fog.test.mjs`)

- `a_dungeon_flame_is_the_forge_flame_times_its_fade`:
  - import `../src/dungeon/fire.ts`;
  - assert that `Effect.ShadersStore.dungeonFireFragmentShader` equals the forge's fragment with exactly the two
    replacements above: rebuild the expected text in the test from `proofFireFragmentShader`, and compare strings;
  - assert that it contains `uniform float fade;` and `a*.82*fade`.
- `a_flame_in_the_bubble_ghosts_as_the_wall_does`, with the hero at (10, 10) and the flame at `DRESSING.torchHeight`:
  - 1 m toward the camera, over the body: `flameFade` is `1 - CUT_AWAY.most`, to 1e-9;
  - 1 m behind the hero: exactly 1;
  - as far to the side as `CUT_AWAY.across`: exactly 1;
  - at both `CAMERA_PITCH` and pi/4.

## 4. Verify

- `npm test`, `npm run check`, `npm run build`.
- `node scripts/dungeon/sweep.mjs` and `--visuals`: identical to the baseline taken before the session.
- **Mutations**, each going red:
  - the fragment without `*fade`;
  - `flameFade` returning 1;
  - `across` back to 2.4 in the shader only: hand-edit the shader string, and the shader test must catch it;
  - the moved pitch probe put back.
- **Review:** an adversarial reviewer reads the diff, with the question "what draws wrongly, or the same as before?".

## 5. Owner's checklist (`http://localhost:5180/?play=dungeon`)

- Walk up to a wall between the hero and the camera, and along it:
  - the bubble should show the body and about a body-length around it;
  - the fade should read as a gradient of dither, not an edge;
  - the ghost at the heart should still read as wall.
- Stand beside a torch on a wall that is in the bubble: the flame should ghost with its sconce, and the light on the
  floor should stay.
- If the bubble is now too big, or the ghost too faint: `across`, `up`, `soft` and `most` are the four numbers.

## What landed

(filled in when it lands)
