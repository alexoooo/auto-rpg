# Dungeon look: a pixel look (experiment)

The owner's concept images for the dungeon are pixel art of a dark isometric action RPG, in the
line of Diablo (see [the crypt's art](../art/crypt.md) for how the dungeon is drawn today). This
plan tests whether rendering at low resolution and upscaling without filtering moves the dungeon
toward them, or away. It sits behind a switch, because neither look is chosen before the owner has
seen both in play.

## `src/dungeon/pixel-look.ts` (new, page-only)

`export function pixelLook(scene, camera, factor: number): { dispose(): void }`

- **Pixelation:** one `PassPostProcess`, with `ratio = 1 / factor` and `samplingMode` NEAREST.
  - A post process's ratio and sampling mode describe the texture it *reads*. So the stage before
    it renders into a 1/factor texture, and this pass, as the last stage, samples that texture
    NEAREST onto the screen. A second full-size pass adds nothing.
  - Confirm it on the page: the pass's `inputTexture` should be about 1/factor of the canvas.
  - It goes after `postPipeline` (`src/render/post.ts`), so bloom and tone mapping happen
    at full resolution before the pixelation.
  - Measure the other order too, and keep whichever reads better. Say which in the commit.
- **Posterise** (optional, `?look=pixel-poster`): a small `PostProcess` fragment that quantises
  each channel to 24 levels after tone mapping. It uses the `Effect.ShadersStore` registration
  pattern of `src/render/fire.ts`.
- **Fine lines:** the route line (`"movement route"` in `main.ts`) and the HUD are DOM or thin
  lines. The DOM is untouched, and the line pixelates with the scene. That is acceptable, and the
  checklist asks.

`main.ts` reads `?look=pixel` (factor 3), `?look=pixel2` (factor 2) and `?look=pixel-poster`, the
way it already reads `pitch`, `azimuth`, `scene` and `quality`, and hands the factor to
`lightDungeon` (`src/dungeon/lighting.ts`), which gains a factor parameter. The pass is built
**inside `buildPost`, as its last stage**, not once after it:
- `setLook` rebuilds SSAO and `postPipeline`, and a rebuilt pipeline attaches at the end of the
  camera's list.
- So a pixel pass attached once would run *first* after any switch. The scene would then render
  into a 1/factor texture while the clustered lights look up tiles against the full render width.
- The console probe (`window.__dungeon.look`, `src/dungeon/look-probe.ts`) flips switches, so it
  would measure exactly that broken order.

Two interactions to account for:
- Every dungeon already sets the hardware scaling (`setHardwareScalingLevel` in
  `src/dungeon/main.ts`: Generated depths at `1 / min(devicePixelRatio, 1.5)`, the Rootbound and
  Random Crypts at 1, or 1.4 on Reduced), so the pixel factor compounds with it.
- The enemy hover highlight (`src/dungeon/hover.ts`) pixelates with the scene.

## Tests

- **`the_pixel_look_is_opt_in`** reads `src/dungeon/main.ts` as text: `pixelLook(` is reached only
  under a `look` query branch. A text-scanning guard passes while broken, so walk it with a real
  spelling: mutate the guard to always-on and see it go red.
- There are no numeric tests. This is a look, and the owner judges it.

## Verification

- `npm test`, `npm run check`, `npm run build`.
- **Owner's checklist:**
  1. `?look=pixel` against `?look=pixel2`, against the default, at the current pitch
     (`CAMERA_PITCH`).
  2. Does the pixelation shimmer as the camera follows the hero? An orthographic camera moving by
     sub-pixel amounts crawls. If it does, the repair is to snap the camera target to the
     low-resolution pixel grid, which is a small change in `frameDungeon`
     (`src/dungeon/camera.ts`). Build it only if the crawl shows.
  3. The console probe's frame cost. Low resolution should make SSAO and post-processing cheaper.
