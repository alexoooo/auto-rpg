import type { Controller } from "../minds/catalog/controller.ts";
import { OPTION_MIND } from "./option-controller.ts";

/**
 * **The toolkit's kinds of mind**: a line here registers one; an entrant brings its own in its
 * manifest (`Entrant.minds`).
 */
export const MIND_KINDS: readonly Controller[] = [OPTION_MIND];
