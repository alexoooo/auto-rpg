# The menu painting

`public/assets/menu/cathedral.jpg` is the background of every `.directory-screen` (its
`::before`, `src/app/browser/menu.css`): the title screen (`#title-screen`) and the Tools screen (`#tools`,
`index.html`); and, under dark overlays, of the shared loading screen (`src/app/browser/app.css`) and the Dungeon setup
(`src/app/browser/dungeon/style.css`). The title and the menu's buttons are HTML over it; the left of the
painting is kept dark to hold them.

**Source.** Generated with an image-generation model from the prompt below, then encoded as JPEG
at quality 90 with System.Drawing, at its own dimensions. The committed JPEG is all the game
needs; regenerating it is optional.

```text
Create a finished widescreen 16:9 atmospheric gothic fantasy background painting for a browser game's main menu, ideally 2560x1440. A quiet ancient cathedral of weathered stone and towering pointed arches, faded burgundy banners, cool light through a tall rose window at the far right. At the right third stands a mysterious antique articulated ivory mannequin in a dusty burgundy hood and tattered medieval robes with tarnished bronze shoulder plates. Its pale porcelain face is still and expressionless, like an abandoned theatrical puppet. Show from the hood through the waist, head around 74% across and 33% down, lower robes fading into shadows. Restrained red reflected light along its right shoulder; dusty atmospheric haze. Sophisticated textured painterly realism, inspired by the supplied concept art's old fabrics, patinated metals, and gothic architecture. Charcoal blacks, antique ivory, faded crimson and bronze. The entire left 48 percent MUST be quiet nearly black negative space with only faint stone arches, to hold the application's live title and three menu buttons. Art only, no writing, no lettering, no logos, no interface, no borders, no watermark. No action or combat; a still atmospheric portrait within architecture.
```

The prompt names "the supplied concept art": villain concepts in faded crimson cloth, antique
ivory, bronze and gothic stone, given with it.
