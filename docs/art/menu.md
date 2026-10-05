# Main menu art

`public/assets/menu/cathedral.jpg` is the decorative background of `#title-screen`, loaded by
`src/menu.css`. It is a static painting; the title and three buttons are HTML. The CSS keeps the
menu in the painting's dark left side on wide screens and darkens the backdrop on narrow screens.

The painting is generated with the built-in image-generation tool, using the owner's villain
concepts as the visual direction: faded crimson cloth, antique ivory, bronze and gothic stone.
The generated PNG is encoded as JPEG at quality 90 with System.Drawing, preserving its dimensions.
The committed JPEG is sufficient to run and build the game; regeneration is optional.

## Dungeon character selection

The Dungeon setup uses the same painting under dark charcoal overlays, with crimson light,
ivory type and bronze borders. Its text is limited to the character names, choices and actions.
`src/dungeon/style.css` draws the niches and the selection marks; no additional raster art is used.

`src/render/character-preview.ts` renders the Warrior, Rogue and Skeleton with the game's own skins,
on bodies built from `modelSpec`. The preview world never steps. Three orthographic cameras
have separate layer masks and equal-width viewports, aligned with the three native radio labels.
The models wear their default boots and armour; equipment has no setup control.

The preview lighting is an art direction choice: the existing environment at 0.65 intensity,
hemispheric fill at 0.85, warm ivory key at 2.2, and crimson rim at 1.4. Each stone plinth is
1.15 m across and 0.06 m tall. The camera holds at least 2.24 m vertically and 1.24 m horizontally
to leave headroom and keep the arms within narrow columns. It renders after assets load and
when resized, without a running animation loop. Page teardown disposes its skins, bodies, world,
scene and engine. This view does not run combat or change the playable bodies.

The setup and gameplay elements occupy separate containers. Gameplay, including sound controls,
is hidden until a run has loaded; failed launches return to setup with a visible error.

## Generation prompt

Create a finished widescreen 16:9 atmospheric gothic fantasy background painting for a browser game's main menu, ideally 2560x1440. A quiet ancient cathedral of weathered stone and towering pointed arches, faded burgundy banners, cool light through a tall rose window at the far right. At the right third stands a mysterious antique articulated ivory mannequin in a dusty burgundy hood and tattered medieval robes with tarnished bronze shoulder plates. Its pale porcelain face is still and expressionless, like an abandoned theatrical puppet. Show from the hood through the waist, head around 74% across and 33% down, lower robes fading into shadows. Restrained red reflected light along its right shoulder; dusty atmospheric haze. Sophisticated textured painterly realism, inspired by the supplied concept art's old fabrics, patinated metals, and gothic architecture. Charcoal blacks, antique ivory, faded crimson and bronze. The entire left 48 percent MUST be quiet nearly black negative space with only faint stone arches, to hold the application's live title and three menu buttons. Art only, no writing, no lettering, no logos, no interface, no borders, no watermark. No action or combat; a still atmospheric portrait within architecture.
