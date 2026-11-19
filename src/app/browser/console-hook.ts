/**
 * **A page's console handle taken off** (`__arena`, `__crowd`, `__dungeon`, `__lab`): `window`'s
 * `name`, where the handle there is still the one of the page drawn by `engine`; a page that
 * followed it keeps its own.
 */
export function unhookConsole(name: string, engine: unknown): void {
  const held: unknown = Reflect.get(window, name);
  if (typeof held === "object" && held !== null && "engine" in held && held.engine === engine) Reflect.deleteProperty(window, name);
}
