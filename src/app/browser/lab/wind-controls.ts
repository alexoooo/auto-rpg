import { gustText, type WindSettings } from "../../../game/lab/wind.ts";
import { slider, type Control } from "../ui/controls.ts";

/**
 * **A scenario's wind sliders**: how often a gust comes, a second, and its force, N, said beside
 * the body's `weight` (`gustText`). Each change is the settings `read` gives, changed, handed to `write`.
 */
export function windControls(read: () => WindSettings, write: (settings: WindSettings) => void, weight: () => number): Control[] {
  return [
    slider("Gusts", { least: 0, most: 2, step: 0.1, value: () => read().rate, set: (rate) => write({ ...read(), rate }), shown: (rate) => `${rate.toFixed(1)} /s` }),
    slider("Gust force", { least: 0, most: 200, step: 1, value: () => read().strength, set: (strength) => write({ ...read(), strength }), shown: (strength) => gustText(strength, weight()) }),
  ];
}
