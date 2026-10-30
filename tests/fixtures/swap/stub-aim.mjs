/**
 * **A stub aim**: the surface aim, its aims counted. An aim keeps no state between calls, so the
 * count is this module's (`AIMED`): a test reads that the aim a config names is the one asked.
 */
import { SURFACE_AIM } from "../../../src/core/mind/aims.ts";

/** How often a stub aim was asked, in every mind that holds one. */
export const AIMED = { stub: "swap:stub-aim", steps: 0 };

export const STUB_AIM = Object.freeze({
  ...SURFACE_AIM, label: "Counted surface (stub)", stage: "experimental", fields: [],
  defaults: Object.freeze({ kind: "swap:stub-aim", tuning: Object.freeze({}) }),
  make(spec, config, blow) {
    const aim = SURFACE_AIM.make(spec, { ...config, kind: "surface" }, blow);
    return (...asked) => { AIMED.steps++; return aim(...asked); };
  },
});
