import type { MindConfig } from "./config.ts";
import type { Controller } from "./controller.ts";
import { MIND_KINDS } from "./kinds.ts";

/**
 * **Every controller, by its mind's kind** (its defaults' `kind`), in the order a picker offers
 * them: the one place a kind is made, matched to a body and offered by name. A mind's module
 * writes its controller (`controller`); a line in `MIND_KINDS` (`kinds.ts`) registers it. A kind
 * twice is refused.
 */
export const CONTROLLERS: Readonly<Record<string, Controller>> = registry(MIND_KINDS);

/** `controllers` by their kinds; a thrown error for a kind twice. */
function registry(controllers: readonly Controller[]): Readonly<Record<string, Controller>> {
  const byKind: Record<string, Controller> = {};
  for (const entry of controllers) {
    if (Object.hasOwn(byKind, entry.defaults.kind)) throw new Error(`two minds of kind ${JSON.stringify(entry.defaults.kind)}`);
    byKind[entry.defaults.kind] = entry;
  }
  return Object.freeze(byKind);
}

/** Every controller's presets by id (`Controller.presets`), in the controllers' order. */
export const PRESETS: Readonly<Record<string, { readonly label: string; readonly config: MindConfig }>> =
  Object.freeze(Object.assign({}, ...Object.values(CONTROLLERS).map((entry) => entry.presets)));

/**
 * **Every mind a person may pick**, by id: each preset (`PRESETS`), then each controller that has
 * none, under its kind with its defaults, so that a Mind registered without a preset is still
 * played. An id a preset and a kind share is refused.
 */
export const MINDS: Readonly<Record<string, { readonly label: string; readonly config: MindConfig }>> = (() => {
  const minds: Record<string, { readonly label: string; readonly config: MindConfig }> = { ...PRESETS };
  for (const [kind, entry] of Object.entries(CONTROLLERS)) {
    if (Object.keys(entry.presets).length > 0) continue;
    if (Object.hasOwn(minds, kind)) throw new Error(`a preset is called ${JSON.stringify(kind)}, a kind with no preset`);
    minds[kind] = { label: entry.label, config: entry.defaults };
  }
  return Object.freeze(minds);
})();

/** The controller of `config`'s kind; a thrown error for a kind no controller has, read from a save or a link. */
export function controllerOf(config: MindConfig): Controller {
  const found = Object.hasOwn(CONTROLLERS, config.kind) ? CONTROLLERS[config.kind] : undefined;
  if (!found) throw new Error(`no mind of kind ${JSON.stringify(config.kind)}`);
  return found;
}
