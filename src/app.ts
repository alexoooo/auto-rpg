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
