# Dungeon look 06: a pixel look (experiment)

The concept images are pixel art. This session tests whether rendering at low resolution and
upscaling without filtering moves the dungeon toward them, or away. It sits behind a switch,
because neither look is chosen before the owner has seen both.

## `src/dungeon/pixel-look.ts` (new, page-only)

`export function pixelLook(scene, camera, factor: number): { dispose(): void }`

- **Pixelation:** one `PassPostProcess`, with `ratio = 1 / factor` and `samplingMode` NEAREST.
  - A post process's ratio and sampling mode describe the texture it *reads*. So the stage before
    it renders into a 1/factor texture, and this pass, as the last stage, samples that texture
    NEAREST onto the screen. A second full-size pass adds nothing.
  - Confirm it on the page: the pass's `inputTexture` should be about 1/factor of the canvas.
  - It goes after `forgePost`'s pipeline, so bloom and tone mapping happen at full resolution
    before the pixelation.
  - Measure the other order too, and keep whichever reads better. Name it in "What landed".
- **Posterise** (optional, `?look=pixel-poster`): a small `PostProcess` fragment that quantises
  each channel to 24 levels after tone mapping. It uses the `Effect.ShadersStore` registration
  pattern of `src/forge-fire.ts`.
- **Fine lines:** the route line (`"movement route"` in `main.ts`) and the HUD are DOM or thin
  lines. The DOM is untouched, and the line pixelates with the scene. That is acceptable, and the
  checklist asks.

`main.ts` reads `?look=pixel` (factor 3), `?look=pixel2` (factor 2) and `?look=pixel-poster`, and
hands the factor to `lightDungeon`. The pass is built **inside `buildPost`, as its last stage**,
not once after it:
- `setLook` rebuilds SSAO and `forgePost`, and a rebuilt pipeline attaches at the end of the
  camera's list.
- So a pixel pass attached once would run *first* after any switch. The scene would then render
  into a 1/factor texture while the clustered lights look up tiles against the full render width.
- The probe paste flips switches, so it would measure exactly that broken order.

## Tests

- **`the_pixel_look_is_opt_in`** reads `src/dungeon/main.ts` as text: `pixelLook(` is reached only
  under a `look` query branch. See the text-scanning caveat in memory, and walk it with a real
  spelling: mutate the guard to always-on and see it go red.
- There are no numeric tests. This is a look, and the owner judges it.

## Verification

- `npm test`, `npm run check`, `npm run build`.
- **Owner's checklist:**
  1. `?look=pixel` against `?look=pixel2`, against the default, at the pitch chosen in 01.
  2. Does the pixelation shimmer as the camera follows the hero? An orthographic camera moving by
     sub-pixel amounts crawls. If it does, the repair is to snap the camera target to the
     low-resolution pixel grid, which is a small change in `frameDungeon`. Build it only if the
     crawl shows.
  3. The probe paste. Low resolution should make SSAO and post-processing cheaper.
