import { sourced } from "../spec/quantity.ts";
import type { HumanFigure } from "./figure.ts";

/**
 * **A human foot's toes**, at x1: the last `length` of the foot, back from the boot's toe, and their
 * slab's thickness up from the sole (`ToesSpec`, `src/core/build/toes.ts`). Measured:
 * `docs/reference/toes.md`.
 */
export const TOES = Object.freeze({
  length: sourced(0.06, "m", "owner-toes", "the toes' length back from the boot's toe"),
  thickness: sourced(0.025, "m", "owner-toes", "the toes' slab thickness"),
});

/** **`figure` with toes** (`HumanFigure.toes`), a setting its character chooses. */
export const toedFigure = (figure: HumanFigure): HumanFigure => ({ ...figure, toes: TOES });
