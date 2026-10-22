/**
 * The recovery search's fall: two chest shoves, the first after 2 s standing and the second
 * `separation` seconds later. Each shove's impulse is in N s, its direction in degrees from
 * the body's heading. The search and its replay use the same disturbance.
 */
export const SEARCH_FALL = Object.freeze({ impulse: 80, degrees: 0, separation: 0.2 });
