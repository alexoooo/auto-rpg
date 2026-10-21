# Main menu and setup screens

The title screen's painting, and the character previews on the Dungeon and Arena setup screens.

## The painting

`public/assets/menu/cathedral.jpg` is the background of `#title-screen` (`src/menu.css`) and, under
an opaque charcoal treatment, of the shared loading screen. The title, the Dungeon and Arena
buttons and the Tools group are HTML over it. On wide screens the CSS keeps the menu in the
painting's dark left side; on narrow ones it darkens the backdrop.

**Source.** Generated with the built-in image-generation tool from the prompt below, after the
owner's villain concepts: faded crimson cloth, antique ivory, bronze and gothic stone. The PNG is
encoded as JPEG at quality 90 with System.Drawing, at its own dimensions. The committed JPEG is
all the game needs; regenerating it is optional.

```text
Create a finished widescreen 16:9 atmospheric gothic fantasy background painting for a browser game's main menu, ideally 2560x1440. A quiet ancient cathedral of weathered stone and towering pointed arches, faded burgundy banners, cool light through a tall rose window at the far right. At the right third stands a mysterious antique articulated ivory mannequin in a dusty burgundy hood and tattered medieval robes with tarnished bronze shoulder plates. Its pale porcelain face is still and expressionless, like an abandoned theatrical puppet. Show from the hood through the waist, head around 74% across and 33% down, lower robes fading into shadows. Restrained red reflected light along its right shoulder; dusty atmospheric haze. Sophisticated textured painterly realism, inspired by the supplied concept art's old fabrics, patinated metals, and gothic architecture. Charcoal blacks, antique ivory, faded crimson and bronze. The entire left 48 percent MUST be quiet nearly black negative space with only faint stone arches, to hold the application's live title and three menu buttons. Art only, no writing, no lettering, no logos, no interface, no borders, no watermark. No action or combat; a still atmospheric portrait within architecture.
```

## The setup screens

The Dungeon setup lays the same painting under dark charcoal overlays, with crimson light, ivory
type and bronze borders; `src/dungeon/style.css` draws the niches and selection marks, with no
further raster art. Text on either setup screen is limited to names, choices and actions.

## The character previews

`src/render/character-preview.ts` draws the Warrior, Rogue and Skeleton in their game skins on
bodies built from `modelSpec`, in their default boots and armour, in a preview world that never
steps and never enters a fight's world. The Dungeon lineup uses three orthographic cameras with
their own layer masks in equal-width viewports under the three radio labels; each Arena contender
canvas has one full-body camera. A canvas renders when its assets are ready, on a selection and on
resize, with no animation loop; teardown disposes its skins, bodies, world, scene and engine.

The art choices:

- **Light:** the environment at 0.65, a hemispheric fill at 0.85, a warm ivory key at 2.2 and a
  crimson rim at 1.4.
- **Plinth:** stone, 1.15 m across and 0.06 m tall.
- **Framing:** the camera holds at least 2.24 m vertically and 1.24 m horizontally, a full body
  with headroom and the arms inside narrow columns.
