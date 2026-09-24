# Session 01: one document, a main menu, and the two modes behind it

## Goal

`/` opens a main menu with **New Game** and **Arena**. New Game opens the dungeon (today's
`/dungeon.html`); Arena opens the duel (today's `/`). Both lead back to the menu. It is one
document, `index.html`, with each screen held in a `<template>` and mounted by one entry,
`src/app.ts`.

Every screen change is a navigation inside that document: `./` is the menu, `?play=arena` the arena,
`?play=dungeon` the dungeon. The overview gives the reason (decision 1 to reverse): the arena's `boot` has no
teardown, and a navigation is the one teardown guaranteed complete. Because only one screen exists
per document, the arena and the dungeon can both keep their `#help` and `#resume`, and their
stylesheets never meet.

## Files

| File | Change |
|---|---|
| `src/app-route.ts` | New. Pure, Node-loadable. Which screen an address opens. |
| `src/app.ts` | New. The document's one module entry. Mounts a screen and its stylesheets. |
| `src/menu.css` | New. The menu, scoped under `#title-screen`, and `app.ts`'s failure panel. |
| `index.html` | Three `<template>`s, one entry, no `<link rel="stylesheet">`, an inline dark background. |
| `dungeon.html` | A redirect to `./?play=dungeon`. |
| `src/main.ts` | `boot()` no longer runs on import; `bootArena` is exported. Pause gains Main menu. |
| `src/dungeon/main.ts` | `boot()` no longer runs on import; `bootDungeon` is exported. |
| `src/dungeon/style.css` | One rule for the start panel's Main menu link. |
| `src/style.css` | `.pause-actions` wraps, for the fifth pause button. |
| `vite.config.ts` | Warm-up list; the input comment. |
| `research/preview.mjs`, `research/lab/cli.mjs` | Follow the entry to `src/app.ts`. |
| `tests/app.test.mjs` | New. |
| `tests/research.test.mjs` | The preview test follows the entry. |
| `AGENTS.md`, `README.md` | The pages paragraph; the dungeon section. |

## `src/app-route.ts`

```ts
/**
 * Which screen an address opens: the main menu, the arena or the dungeon.
 *
 * Pure and free of the DOM so `tests/app.test.mjs` can argue with it. `src/app.ts` reads it once
 * per document, because every screen change is a navigation.
 */

export type Route = "menu" | "arena" | "dungeon";

export const PLAY_PARAM = "play";

/**
 * The arena's link parameter, `MATCHUP_PARAM` in `src/bout.ts`, copied rather than imported so the
 * menu does not load the arena's module graph. `the_arena_link_parameter_is_the_one_bout_writes`
 * pins the two together.
 */
export const ARENA_LINK_PARAM = "matchup";

/** The menu: the directory the game is served from, which is `/auto-rpg/` on GitHub Pages. */
export const MENU_HREF = "./";

/**
 * An explicit `?play=` wins. Without one, an arena link from before the menu (`?matchup=...`)
 * still opens the arena, because those links are shared and bookmarked; anything else is the menu.
 */
export function routeFor(search: string): Route {
  const query = new URLSearchParams(search);
  const play = query.get(PLAY_PARAM);
  if (play === "arena" || play === "dungeon") return play;
  return query.has(ARENA_LINK_PARAM) ? "arena" : "menu";
}

/**
 * A relative address, so it keeps the path it is resolved against. It keeps the rest of `search`
 * too: `?drawFraction=` and `?tactic=` are arena dials that open the menu on their own, and
 * choosing Arena from there must not throw them away, or the arena would run the shipped physics
 * while the address said otherwise.
 */
export function playHref(route: Exclude<Route, "menu">, search = ""): string {
  const query = new URLSearchParams(search);
  query.set(PLAY_PARAM, route);
  return `?${query}`;
}
```

The review found the dials: the first draft's `playHref` wrote `?play=arena` alone, so
`/?tactic=...` (the example link in `src/main.ts`'s own doc) opened the menu and Arena dropped it.

The arena keeps `play=arena` when it writes a matchup into the address bar: `linkFor` in
`src/main.ts` carries every non-matchup parameter along (`bootExtras`). Nothing needs changing
there, and a reload after Fight still opens the arena either way.

## `src/app.ts`

```ts
/**
 * The game's one document. `index.html` holds each screen as a `<template>`; this mounts the one
 * the address asks for (the menu, the arena or the dungeon) with its own stylesheets.
 *
 * Only one screen ever exists in a document. Moving between them is a navigation (`MENU_HREF`,
 * `playHref`), because the arena host has no teardown and a navigation is the one teardown
 * guaranteed complete. So the screens' ids and stylesheets never meet.
 */
import "./menu.css";
import { MENU_HREF, playHref, routeFor, type Route } from "./app-route.ts";

const need = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
};

const mount = (templateId: string): void => {
  const template = document.getElementById(templateId);
  if (!(template instanceof HTMLTemplateElement)) throw new Error(`missing template #${templateId}`);
  document.body.prepend(template.content.cloneNode(true));
};

// The dungeon disposes its engine on `pagehide`, so a page the back-forward cache restores has no
// engine. Load it afresh instead.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});

async function open(route: Route): Promise<void> {
  switch (route) {
    // Each case names the document before its first `await`. The research preview sets its own
    // title after `await import("/src/app.ts")`, which resolves at that first `await`, so the
    // preview's title is written last and stands.
    case "menu": {
      document.title = "Auto-RPG";
      mount("menu-screen");
      const go = (to: "arena" | "dungeon") => () => window.location.assign(playHref(to, window.location.search));
      need("menu-new-game").addEventListener("click", go("dungeon"));
      need("menu-arena").addEventListener("click", go("arena"));
      need<HTMLButtonElement>("menu-new-game").focus();
      return;
    }
    case "arena": {
      document.title = "Golem Duel · Auto-RPG";
      // Stylesheets first, so the screen is never shown unstyled, and one after the other:
      // forge-ui.css overrides style.css at equal specificity (`.action`, `#pause-menu`, the
      // `:root` colours), and in dev each sheet is inserted when its module runs, so two imports in
      // one `Promise.all` would cascade in whichever order their fetches finished.
      await import("./style.css");
      await import("./forge-ui.css");
      mount("arena-screen");
      const { bootArena } = await import("./main.ts");
      return bootArena();
    }
    case "dungeon": {
      document.title = "The Depths · Auto-RPG";
      await import("./dungeon/style.css");
      // Before the module: `src/dungeon/main.ts` finds its elements as it is evaluated.
      mount("dungeon-screen");
      const { bootDungeon } = await import("./dungeon/main.ts");
      return bootDungeon();
    }
    default: {
      const unknown: never = route;
      throw new Error(`no screen for ${String(unknown)}`);
    }
  }
}

open(routeFor(window.location.search)).catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  // Over everything: a screen's full-window canvas and curtain are already mounted by now. The
  // realistic cause is a stale chunk after a redeploy, which going back to the menu fixes.
  const panel = document.createElement("div");
  panel.className = "app-error";
  const note = document.createElement("p");
  note.textContent = `The game could not start: ${error instanceof Error ? error.message : String(error)}`;
  const back = document.createElement("a");
  back.href = MENU_HREF;
  back.textContent = "Main menu";
  panel.append(note, back);
  document.body.append(panel);
});
```

`bootArena` and `bootDungeon` catch and report their own boot failures, as their `boot().catch`
tails do today. The catch above is for a screen whose module failed to load.

## `index.html`

The whole file becomes this. `<head>` loses both `<link rel="stylesheet">` lines, because
`src/app.ts` loads each screen's own stylesheets. It gains a small inline `<style>`, because
nothing else now holds back the first paint: without it every screen change, which is a page load,
flashes a white body before the dark one arrives.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Auto-RPG</title>
    <!-- Before any stylesheet arrives: every screen change is a page load, and this keeps it dark. -->
    <style>
      html, body { margin: 0; background: #0a0b0e; color-scheme: dark; }
    </style>
  </head>
  <body>
    <!-- One document, three screens. src/app.ts mounts exactly one of these per page load, so
         the arena and the dungeon may share ids (#help, #resume) and never meet. -->
    <template id="menu-screen">
      <main id="title-screen">
        <h1>Auto-RPG</h1>
        <nav aria-label="Main menu">
          <button id="menu-new-game" type="button">New Game</button>
          <button id="menu-arena" type="button">Arena</button>
        </nav>
      </main>
    </template>
    <template id="arena-screen">
      <!-- today's <body> children from <canvas id="stage"> through the #help block, verbatim,
           with the two changes below -->
    </template>
    <template id="dungeon-screen">
      <!-- dungeon.html's <body> children from <canvas id="dungeon"> through its #help section,
           verbatim, with the three changes below -->
    </template>
    <script type="module" src="/src/app.ts"></script>
  </body>
</html>
```

Move the arena markup verbatim, comments included. `tests/host-run.test.mjs` finds
`<div id="curtain">`, `<aside id="pause-menu"` and `<aside id="bout-end"` by text and counts the
`<div>`s between them, and all of that is unchanged inside the template.

**Arena changes (two):**

1. The setup footer's `<a href="./dungeon.html">Enter the Depths &rarr;</a>` becomes
   `<a href="./">&larr; Main menu</a>`. `#curtain .duel-footer a` already styles it.
2. `#pause-menu`'s `.pause-actions` gains a fifth button after `#leave`:
   `<button id="to-menu" class="action quiet" type="button">Main menu</button>`.

**Dungeon changes (three):**

1. The top bar's brand link `<a href="./index.html" class="brand">THE FORGE <span>/ THE DEPTHS</span></a>`
   becomes `<a href="./" class="brand">AUTO-RPG <span>/ THE DEPTHS</span></a>`: it leads to the
   game's menu now, so it carries the game's name.
2. `#pause-panel`'s `<a href="./index.html">Return to arena →</a>` becomes
   `<a href="./">Main menu</a>`.
3. `#start-panel` gains `<a class="back" href="./">← Main menu</a>` as its last child, after the
   `<small>`.

## `dungeon.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <!-- The dungeon is a screen of the one game document now. Old links and bookmarks land here. -->
  <meta http-equiv="refresh" content="0; url=./?play=dungeon" />
  <title>The Depths · Auto-RPG</title>
</head>
<body><a href="./?play=dungeon">The Depths has moved into the game.</a></body>
</html>
```

It stays in `vite.config.ts`'s `rollupOptions.input`, because `dist` would lose it otherwise.

## `src/main.ts`

- The tail becomes:

  ```ts
  /** Called by `src/app.ts` once the arena's screen is mounted. Importing this module boots nothing. */
  export function bootArena(): Promise<void> {
    return boot().catch((error: unknown) => {
      // the body of today's `boot().catch(...)`, unchanged
    });
  }
  ```

- In `boot`, beside the other `need` calls, wire the pause menu's new button. It needs no pause
  or teardown work, because the navigation discards the document:

  ```ts
  need<HTMLButtonElement>("to-menu").addEventListener("click", () => window.location.assign(MENU_HREF));
  ```

  with `import { MENU_HREF } from "./app-route";` (this file omits extensions).

- `boutEnd.classList` and the `ArenaPresentation` wiring are untouched. Two tests pin them by text.

## `src/dungeon/main.ts`

- The last line `boot().catch(error => { ... });` becomes:

  ```ts
  /** Called by `src/app.ts` after the dungeon's screen is mounted: this module's top level reads it. */
  export function bootDungeon(): Promise<void> {
    return boot().catch(error => { /* today's handler, unchanged */ });
  }
  ```

- The module keeps its top-level `need` calls. They are why `src/app.ts` mounts the dungeon's
  template **before** importing this module, and the comment there says so.

## `src/dungeon/style.css`

Append:

```css
.dialog > a.back { display: block; text-align: center; font-size: 12px; margin-top: 16px; }
```

## `src/menu.css`

Georgia and gold on dark stone, the look of the arena's setup screen. `src/app.ts` loads this file
on every screen, so every rule is under `#title-screen`, except `.app-error`, which is `app.ts`'s
own failure panel and must show over any screen.

```css
#title-screen {
  position: fixed; inset: 0; display: grid; place-content: center; justify-items: center; gap: 48px;
  margin: 0; color: #e8dcc0; font-family: Georgia, serif;
  background: radial-gradient(ellipse at 50% 38%, #221e18 0%, #0c0b0a 72%);
}
#title-screen h1 {
  margin: 0; font-size: 76px; font-weight: 400; letter-spacing: .14em; font-variant: small-caps;
  color: #d9bb80; text-shadow: 0 2px 28px #000;
}
#title-screen nav { display: grid; gap: 14px; width: 270px; }
#title-screen button {
  font: 22px Georgia, serif; letter-spacing: .08em; padding: 14px 0; cursor: pointer;
  color: #e8dcc0; background: #1a1714; border: 1px solid #6b5a3a; border-radius: 2px;
}
#title-screen button:hover, #title-screen button:focus-visible {
  color: #fff3d6; background: #27211a; border-color: #d9bb80; outline: none;
}
.app-error {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 1000; padding: 18px 24px; text-align: center;
  color: #f0d6c8; background: #2a1210ee; font: 14px Georgia, serif;
}
.app-error a { color: #d9bb80; }
```

## `vite.config.ts`

- `server.warmup.clientFiles` becomes
  `["./src/app.ts", "./src/main.ts", "./src/dungeon/main.ts", "./src/bench/main.ts", "./src/art-proof/main.ts"]`.
- The comment on `rollupOptions.input` gains: "`dungeon.html` only forwards to `./?play=dungeon`;
  it is kept so old links do not 404."

## Research preview

The preview writes a copy of `index.html` with the entry replaced by a script that registers
candidate policies and then imports the entry. The entry is `src/app.ts` now.

- `research/preview.mjs`, `previewHtml`: `entry` becomes
  `'<script type="module" src="/src/app.ts"></script>'`, and the injected `await import('/src/main.ts')`
  becomes `await import('/src/app.ts')`. `writePreview` returns the URL with `?play=arena`
  appended, so the preview opens on the arena rather than the menu.
- `research/lab/cli.mjs`, the `preview` case: the same two strings, and the printed path gains
  `?play=arena`.
- `tests/research.test.mjs`,
  `candidate previews preserve the real arena document and refuse a missing entry`: the template's
  entry and the `await import` pattern follow.

The preview's titles ("AI candidate review", "Experimental policy lab -- not promoted") survive,
because `open` names the document before its first `await` and the preview writes its title after
`await import('/src/app.ts')` resolves.

The preview's Main menu leads to `./`, its own directory. Vite's HTML fallback serves the real
`index.html` for a directory with none, so it opens the real game's menu at a preview-looking
address, and Arena from there is the real arena **without** the candidate policies. Say so in one
line of `previewHtml`'s doc in `research/preview.mjs`: "Leaving the arena leaves the preview; its
Main menu opens the real game, whatever the address bar says." Removing the way out would need the
preview to wait for the mount, which is more machinery than a review tool is worth.

## `.pause-actions` in `src/style.css`

Five labels at 10.5 px need about 400 px of the pause bar's 402. Give the row
`flex-wrap: wrap;` so a narrow window wraps whole buttons rather than squeezing their labels, and
check the bar at 1366x768 in the browser step.

## `tests/app.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ARENA_LINK_PARAM, MENU_HREF, playHref, routeFor } from "../src/app-route.ts";
import { MATCHUP_PARAM } from "../src/bout.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const template = (html, id) => {
  const found = html.match(new RegExp(`<template id="${id}">([\\s\\S]*?)</template>`));
  assert.ok(found, `index.html has a #${id} template`);
  return found[1];
};
const ids = (text) => [...text.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

test("an_address_opens_the_menu_the_arena_or_the_dungeon", () => {
  assert.equal(routeFor(""), "menu");
  assert.equal(routeFor("?play=arena"), "arena");
  assert.equal(routeFor("?play=dungeon"), "dungeon");
  assert.equal(routeFor("?play=elsewhere"), "menu");
  assert.equal(routeFor("?drawFraction=0.5"), "menu", "a dial alone is not an arena link");
  assert.equal(routeFor(`?${MATCHUP_PARAM}=%7B%7D`), "arena", "a link from before the menu opens the arena");
  assert.equal(routeFor(`?play=dungeon&${MATCHUP_PARAM}=%7B%7D`), "dungeon", "an explicit screen wins");
  for (const to of ["arena", "dungeon"]) assert.equal(routeFor(playHref(to)), to);
  // A dial opens the menu, and choosing a screen from there keeps it.
  assert.equal(playHref("arena", "?drawFraction=0.5"), "?drawFraction=0.5&play=arena");
  assert.equal(playHref("dungeon", "?play=arena"), "?play=dungeon", "the screen is replaced, not repeated");
  assert.equal(MENU_HREF, "./");
});

test("the_arena_link_parameter_is_the_one_bout_writes", () => {
  assert.equal(ARENA_LINK_PARAM, MATCHUP_PARAM);
});

test("index_html_is_one_document_holding_three_screens", async () => {
  const html = await read("../index.html");
  const entries = [...html.matchAll(/<script\b[^>]*type="module"[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(entries, ['<script type="module" src="/src/app.ts">'], "one module entry, the app");
  assert.doesNotMatch(html, /<link\b[^>]*stylesheet/, "each screen's stylesheets are loaded by src/app.ts");
  const menu = template(html, "menu-screen"), arena = template(html, "arena-screen");
  const dungeon = template(html, "dungeon-screen");
  assert.match(menu, /id="menu-new-game"/); assert.match(menu, /id="menu-arena"/);
  assert.match(arena, /<canvas id="stage">/); assert.match(dungeon, /<canvas id="dungeon"/);
  for (const [name, text] of [["menu", menu], ["arena", arena], ["dungeon", dungeon]]) {
    const seen = ids(text);
    assert.equal(new Set(seen).size, seen.length, `no id repeats within the ${name} screen`);
  }
  // The control: the two modes may share ids only because a document never holds both.
  assert.ok(ids(arena).includes("help") && ids(dungeon).includes("help"));
});

test("no_screen_boots_itself_when_it_is_imported", async () => {
  // A statement at column 0 that calls a boot function, however spelt: `boot()`, `void boot();`,
  // `bootArena();`. Calls inside `bootArena`'s body are indented and do not match.
  const selfBoot = /^(?:void\s+|await\s+)?boot\w*\(/m;
  for (const [path, name] of [["../src/main.ts", "bootArena"], ["../src/dungeon/main.ts", "bootDungeon"]]) {
    const source = await read(path);
    assert.doesNotMatch(source, selfBoot, `${path} boots on import`);
    assert.match(source, new RegExp(`export function ${name}\\(\\): Promise<void>`));
  }
  assert.match("void boot();", selfBoot, "the control: the pattern finds a self-boot when there is one");
});

test("the_app_mounts_the_templates_index_html_holds_and_the_buttons_go_where_they_say", async () => {
  const [html, app] = await Promise.all([read("../index.html"), read("../src/app.ts")]);
  for (const id of ["menu-screen", "arena-screen", "dungeon-screen"]) {
    assert.match(app, new RegExp(`mount\\("${id}"\\)`), `app.ts mounts #${id}`);
    assert.match(html, new RegExp(`<template id="${id}">`));
  }
  assert.match(app, /need\("menu-new-game"\)\.addEventListener\("click", go\("dungeon"\)\)/);
  assert.match(app, /need\("menu-arena"\)\.addEventListener\("click", go\("arena"\)\)/);
  assert.match(app, /window\.location\.assign\(playHref\(to, window\.location\.search\)\)/, "the menu keeps the address's dials");
  // Each screen: its sheets, then its markup, then its module. The arena's sheets in cascade order and
  // one after the other; the dungeon's module finds its elements as it is evaluated.
  const order = (...marks) => marks.map((mark) => {
    const at = app.indexOf(mark);
    assert.ok(at >= 0, `app.ts has ${mark}`);
    return at;
  }).every((at, i, all) => i === 0 || at > all[i - 1]);
  assert.ok(order('await import("./style.css");', 'await import("./forge-ui.css");', 'mount("arena-screen");', 'await import("./main.ts");'),
    "arena: style.css, forge-ui.css, mount, module");
  assert.ok(order('await import("./dungeon/style.css");', 'mount("dungeon-screen");', 'await import("./dungeon/main.ts");'),
    "dungeon: stylesheet, mount, module");
});

test("both_modes_lead_back_to_the_menu_and_the_old_address_forwards", async () => {
  const [html, main, redirect] = await Promise.all([read("../index.html"), read("../src/main.ts"), read("../dungeon.html")]);
  const arena = template(html, "arena-screen"), dungeon = template(html, "dungeon-screen");
  assert.match(arena, /id="to-menu"/);
  assert.match(main, /need<HTMLButtonElement>\("to-menu"\)\.addEventListener\("click", \(\) => window\.location\.assign\(MENU_HREF\)\)/);
  assert.match(arena, /<a href="\.\/">&larr; Main menu<\/a>/);
  assert.ok((dungeon.match(/href="\.\/"/g) ?? []).length >= 3, "brand, pause and start panel");
  assert.doesNotMatch(html, /href="\.\/(index|dungeon)\.html"/, "no link to the old pages");
  assert.match(redirect, /url=\.\/\?play=dungeon/);
});
```

**Mutations, each must go red:**

- Drop the `ARENA_LINK_PARAM` fallback in `routeFor`: `an_address_opens...`.
- Set `ARENA_LINK_PARAM` to `"match"`: `the_arena_link_parameter...`.
- Restore `<script type="module" src="/src/dungeon/main.ts">` inside the dungeon template:
  `index_html_is_one_document...`.
- Duplicate `id="resume"` inside the arena template: the same test.
- Restore `boot().catch(...)` at the bottom of `src/dungeon/main.ts`, or add `void boot();` or
  `bootArena();` at the bottom of either module: `no_screen_boots...`.
- Swap `go("dungeon")` and `go("arena")`, mistype a template id in `app.ts`, put the two
  stylesheet imports back in one `Promise.all`, mount the dungeon after importing its module, load
  the arena's sheets after its mount, or drop `window.location.search` from `go`:
  `the_app_mounts...`.
- `playHref` ignores `search`: `an_address_opens...`.
- Point `dungeon.html` at `./dungeon.html`: `both_modes_lead_back...`.

## `AGENTS.md` and `README.md`

- AGENTS.md, Commands: the paragraph beginning "The five scripts after `npm ci`" says four pages
  come up and `/` is the arena. Rewrite it: `/` is the game, one document (`index.html`, entry
  `src/app.ts`) holding the main menu, the arena at `?play=arena` (an arena link, `?matchup=`,
  opens it directly) and the dungeon at `?play=dungeon`. `/dungeon.html` only forwards there.
  `/bench.html` and `/art-proof.html` are unchanged. Keep the sentence about naming every page in
  `rollupOptions.input`.
- README, "Dungeon mode -- The Depths": "Choose **Enter the Depths** from arena setup, or open
  `/dungeon.html`" becomes "Choose **New Game** from the main menu". "Play online" says the link
  opens the main menu, and "Then open <http://localhost:5180/>, pick a matchup" gains "choose
  **Arena**".
- `bench.html`'s title "The Forge · Module Bench" becomes "Module Bench · Auto-RPG".

## Verification

- `npm test`, `npm run check`, `npm run build`. Check that `dist/` contains `index.html`,
  `dungeon.html`, `bench.html` and `art-proof.html`, and that the arena and dungeon CSS are
  separate chunks from the entry.
- The mutation list above.
- Owner's server, `http://localhost:5180/`, navigating each time:
  1. `/` shows the menu, with New Game focused. Enter opens the dungeon.
  2. In the dungeon, the start panel's Main menu goes back. Enter a run, pause, Main menu.
  3. Arena: the setup screen looks exactly as before (compare a screenshot taken before the change).
     Fight, pause, Main menu. Browser Back returns to the arena.
  4. Open an old link: copy the address after Fight, which is `?matchup=...&play=arena`, and
     **delete `&play=arena`** so the fallback is what routes it. It opens the arena.
  5. Pause mid-bout at 1366x768. All five pause buttons are readable; the row wraps whole buttons
     if it wraps at all.
  6. `/dungeon.html` lands on the dungeon screen.
  7. The console has no errors on any screen.
- No white flash between screens, on the owner's machine.
- My tab gets no frames (see memory), so the owner confirms the menu's look on their own machine.

## Behaviour changes to name in the commit message

- The game is named Auto-RPG (the owner, 2026-09-24). The arena's document title changes from
  "Golem Duel · The Forge" to "Golem Duel · Auto-RPG", the dungeon's from "The Depths · Golem
  Dungeon" to "The Depths · Auto-RPG", and the dungeon's top bar from "THE FORGE" to "AUTO-RPG".
  "The Forge" stays what it is in the code: the arena's room (`src/forge-room.ts`,
  `src/forge-style.ts`, `src/forge-ui.css`).
- A page the back-forward cache restores is reloaded. For the arena that means Back and Forward
  land on the setup screen rather than on a bout in progress, which the cache used to keep. The
  dungeon could never be restored anyway, because it disposes its engine on `pagehide`.
