/**
 * **How a walk must go to have held**, shares of the pace asked: its pace along the way asked at
 * least `along`, and across that way at most `across`. A walk that stands, or goes another way, has
 * not walked at the pace asked however long it stays up. At these shares the stance's walk holds
 * the speeds it held by its falls alone.
 */
export const WENT = Object.freeze({ along: 0.7, across: 0.35 });

/** Whether a walk asked `asked` m/s that made `along` m/s along the way asked and `across` across it went as asked (`WENT`). */
export function wentAsAsked(along: number, across: number, asked: number): boolean {
  return along >= WENT.along * asked && Math.abs(across) <= WENT.across * asked;
}

/**
 * **How a turn must go to have held**: the body's facing no further than `TURNED` rad behind the
 * heading asked as the turn asked ends. A turn the legs take slower than asked has not turned at
 * the rate asked however long the body stays up: a half turn at a rate the legs take at 0.85 of it
 * lags half a radian.
 */
export const TURNED = 0.5;

/** Whether a turn whose facing lagged the heading asked by `lag` rad as it ended turned as asked (`TURNED`). */
export function turnedAsAsked(lag: number): boolean {
  return lag <= TURNED;
}
