# The menu painting

`public/assets/menu/cathedral.jpg` is the background of every `.directory-screen` (its
`::before`, `src/app/browser/menu.css`): the title screen (`src/app/browser/menu.html`) and the Tools screen
(`src/app/browser/tools.html`); and, under dark overlays, of the shared loading screen (`src/app/browser/app.css`) and the Dungeon setup
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

## Hero portraits

`public/assets/menu/warrior.webp` and `public/assets/menu/rogue.webp` are the Dungeon's
hero selection art (`src/app/browser/dungeon/setup.ts`). The radio labels remain HTML.
The roster offers Warrior and Rogue; companions use the same roster. Skeleton remains an
enemy with its own attributes and mind settings.

**Source.** Generated with the built-in image generation tool from the base prompts below;
the Rogue's bow uses the edit prompt after its base prompt.
Each image is resized to 512 × 768 and encoded with Sharp as WebP at quality 80, effort 6.
The committed WebPs are the delivery assets; regenerating them is optional.

### Warrior prompt

```text
Use case: stylized-concept. Asset type: portrait illustration for a dark medieval fantasy game's Warrior hero selection card, vertical 2:3. Primary request: original hand-painted Warrior character art. Subject: one adult human male warrior, strong build, short dark hair, weathered face, practical dark steel breastplate and pauldrons over charcoal leather, muted bronze trim, sword held low. Composition: single character centered, head to knees, head fully visible with generous headroom, calm confident ready stance facing viewer at slight three-quarter angle. Scene: shadowy gothic crypt suggested with loose painterly shapes. Lighting: warm ivory light on face and steel, restrained ember rim light, near-black brown edges. Style: rich detailed painterly fantasy book cover illustration, visible brush texture, grounded anatomy, atmospheric and elegant. Constraints: readable silhouette at small size, no text, no logos, no border, no UI, no skeletons, no 3D render, no photographic look.
```

### Rogue base prompt

```text
Use case: stylized-concept. Asset type: portrait illustration for a dark medieval fantasy game's Rogue hero selection card, vertical 2:3. Primary request: original hand-painted Rogue character art. Subject: one adult human female rogue, athletic build, dark hair partly tucked into a charcoal hood, alert self-assured face clearly visible, practical fitted dark leather armour with subtle steel shoulder and forearm protection, worn leather straps, dagger held low. Composition: single character centered, head to knees, head fully visible with generous headroom, poised ready stance facing viewer at slight three-quarter angle. Scene: shadowy gothic crypt suggested with loose painterly shapes. Lighting: warm ivory light on face and leather, restrained ember rim light, near-black brown edges. Style: rich detailed painterly fantasy book cover illustration, visible brush texture, grounded anatomy, atmospheric and elegant. Palette: charcoal, weathered brown leather, muted bronze, faded burgundy accents. Constraints: readable silhouette at small size, no text, no logos, no border, no UI, no skeletons, no 3D render, no photographic look.
```

### Rogue bow edit prompt

```text
Use case: precise-object-edit. Input image: edit target, the existing Rogue hero portrait. Replace the dagger in her hand with a clearly recognizable medieval wooden recurve bow held naturally at rest, rising alongside her body so the bow and its taut bowstring are visible in the upper two thirds of this selection-card portrait. Adjust only the hand grip and arm position as needed for a believable bow hold. Keep the same woman, face, hood, dark leather armour, burgundy cloth, anatomy, gothic crypt background, warm lighting, painterly brushwork, framing, and vertical 2:3 composition. Preserve her face unobstructed. The bow should read clearly at small UI size. Remove the dagger entirely. No arrows being fired, no drawn-bow combat pose. No text, UI, labels, border, logo, or watermark.
```
