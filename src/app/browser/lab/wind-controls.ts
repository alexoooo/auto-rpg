import { gustText, type WindSettings } from "../../../game/lab/wind.ts";
import { slider, type Control } from "../ui/controls.ts";

/**
 * **A scenario's wind sliders**: how often a gust comes, a second, and its force, N, said beside
 * the body's `weight` (`gustText`). Each change is the settings `read` gives, changed, handed to `write`.
 */
export function windControls(read: () => WindSettings, write: (settings: WindSettings) => void, weight: () => number): Control[] {
  return [
    slider("Gusts", 0, 2, 0.1, () => read().rate, (rate) => write({ ...read(), rate }), (rate) => `${rate.toFixed(1)} /s`),
    slider("Gust force", 0, 200, 1, () => read().strength, (strength) => write({ ...read(), strength }), (strength) => gustText(strength, weight())),
  ];
}
