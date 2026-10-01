/**
 * Which screen an address opens: the main menu, the arena, the dungeon or the lab.
 *
 * Pure and free of the DOM so `tests/app.test.mjs` can argue with it. `src/app.ts` reads it once
 * per document, because every screen change is a navigation.
 */

export type Route = "menu" | "arena" | "dungeon" | "lab";

const PLAY_PARAM = "play";

/** The menu: the directory the game is served from, which is `/auto-rpg/` on GitHub Pages. */
export const MENU_HREF = "./";

/** The screen `?play=` names; without one, the menu. */
export function routeFor(search: string): Route {
  const play = new URLSearchParams(search).get(PLAY_PARAM);
  return play === "arena" || play === "dungeon" || play === "lab" ? play : "menu";
}

/**
 * The address of a screen, relative so it keeps the path it is resolved against. The rest of
 * `search` is kept: a screen's own settings (the crypt's `?quality=`, say) survive a trip through
 * the menu.
 */
export function playHref(route: Exclude<Route, "menu">, search = ""): string {
  const query = new URLSearchParams(search);
  query.set(PLAY_PARAM, route);
  return `?${query}`;
}
