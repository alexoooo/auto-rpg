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
