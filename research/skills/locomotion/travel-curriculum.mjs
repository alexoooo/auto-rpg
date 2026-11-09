/** Travel curriculum as weighted order scripts; the environment only executes the resulting data. */
import { sin, cos } from '../../../src/core/math/real.ts';
import { TRAVEL } from '../../../src/evaluation/travel/protocol.ts';

/** Seconds a slowing episode holds the forward run before its slower order. */
export const SLOW_AFTER = 2;
/** Seconds a slowing episode lasts after its last order: a pace's reach and hold, or a stop and its quiet. */
export const SLOW_FOR = 6;
/** Seconds between the orders of a slowing sequence. */
export const SLOW_STEP = 3;

/** The cues after a held forward run: one order, or a sequence `SLOW_STEP` s apart; 0 is a stop. */
export function slowingCues(item, go, stop) {
  const orders = Array.isArray(item) ? item : [item];
  return [{ at: 0, orders: go(TRAVEL.forward) }, ...orders.map((pace, i) => ({ at: SLOW_AFTER + i * SLOW_STEP, orders: pace > 0 ? go(pace) : stop }))];
}

/** Seconds a slowing episode lasts. */
export const slowingSeconds = item => SLOW_AFTER + ((Array.isArray(item) ? item.length : 1) - 1) * SLOW_STEP + SLOW_FOR;

/** How near a place an episode's body stands once there, m: the game's arrival (`ARRIVED`). */
export const PLACE_NEAR = .3;
/** Seconds an episode to a place lasts past the time it takes at 1 m/s: a start, a stop and its quiet. */
export const PLACE_SPARE = 6;

/** A way's points from (0, 0), each leg [metres, degrees] turned from the leg before it, the first from `heading`. */
export function wayOf(heading, legs) {
  let way = heading, x = 0, z = 0;
  return legs.map(([metres, degrees]) => { way += degrees * Math.PI / 180; x += metres * sin(way); z += metres * cos(way); return { x, z }; });
}
/** A way's length from (0, 0) through its points, m. */
export const lengthOf = points => points.reduce((sum, p, i) => sum + Math.hypot(p.x - (i ? points[i - 1].x : 0), p.z - (i ? points[i - 1].z : 0)), 0);

/**
 * **The game's place orders** as episodes, in the frame of `heading` (each point relative to where
 * the body is when the episode begins): from rest, one place at each distance and angle round the
 * body; routes as the navigator plans them through rooms (one to four corners, mostly of 20 to 55
 * degrees, legs of 2 to 15 m) and a sharp corner; and a place changed on the way. The navigator
 * asks the paces its stops and corners allow (`Locomotion.stopping`), so a place is run to at the
 * paces a room gives, never from the forward run's.
 */
export function placeScripts(heading = 0) {
  const place = points => ({ move: { kind: 'place', points, near: PLACE_NEAR }, gait: 'run', face: null });
  const episode = (legs, later = null) => {
    const points = wayOf(heading, legs), then = later ? wayOf(heading, later.legs) : null;
    return { start: 'rest', seconds: PLACE_SPARE + lengthOf(points) + (later ? later.at + lengthOf(then) : 0),
      cues: [{ at: 0, orders: place(points) }, ...(later ? [{ at: later.at, orders: place(then) }] : [])] };
  };
  return [
    ...[2, 4, 8, 15].flatMap(metres => [0, 45, -45, 90, -90, 180].map(degrees => episode([[metres, degrees]]))),
    ...[[[4, 0], [4, 90]], [[8, 0], [4, -90]], [[6, 0], [6, 45]], [[8, 0], [8, -45]],
      [[3, 0], [7, 30]], [[7, 0], [7, -30]], [[2.5, 0], [12, 25]], [[4, 0], [12, -20]], [[6, 0], [5, 55]], [[6, 0], [5, -55]],
      [[3, 0], [7, 30], [4, -30]], [[6, 10], [5, -55], [6, 30]], [[6, 0], [5, 30], [7, 30], [5, -30]],
      [[5, 0], [5, -30], [7, -25], [5, 30], [4, 40]], [[10, 0], [10, 20], [12, -35]], [[2.5, 0], [15, -30], [12, 40]]].map(legs => episode(legs)),
    ...[90, -90].map(degrees => episode([[8, 0]], { at: 3, legs: [[6, degrees]] })),
  ];
}

/**
 * **The travel curriculum's scripts at `stage`**: each stage's own episodes, and every earlier
 * stage's kept in the mix, half the episodes theirs, so what an earlier stage taught holds.
 * Stage 1 holds the run from reached starts, beside the forward entry from rest; stage 2 enters
 * from rest and changes pace; stage 3 slows (`slow`: the orders after a held forward run, smallest
 * drop first, 0 for a stop; an item may be a sequence), its newest order half its episodes;
 * stage 4 goes as the game orders it, to places (`placeScripts`), and by `variations`; stage 5
 * by `variations`, the loadouts and gusts.
 */
export function travelCurriculum(stage, { seconds = 12, heading = 0, variations = [], slow = [] } = {}) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 5) throw Error('Travel curriculum stage is 1 to 5');
  const direction = { x: sin(heading), z: cos(heading) };
  const go = pace => ({ move: { kind: 'direct', direction }, gait: 'run', pace, face: null });
  const stop = { move: null, face: direction };
  const sustainedPaces = [1.4, 2, 3, 4, 4.5, 5.5, 6.5], entryPaces = [.9, 1, ...sustainedPaces];
  let current;
  switch (stage) {
    case 1:
      current = [
        ...sustainedPaces.map(pace => ({ start: 'moving', seconds, weight: .5 / sustainedPaces.length, cues: [{ at: 0, orders: go(pace) }] })),
        { start: 'rest', seconds: Math.max(seconds, TRAVEL.entry + TRAVEL.hold), weight: .5, cues: [{ at: 0, orders: go(TRAVEL.forward) }] },
      ];
      break;
    case 2:
      current = entryPaces.flatMap(pace => entryPaces.flatMap(changed => ['rest', 'moving'].map(start => ({ start, seconds,
        cues: [{ at: 0, orders: go(pace) }, { at: seconds / 2, orders: go(changed) }] }))));
      break;
    case 3: {
      const valid = pace => Number.isFinite(pace) && pace >= 0 && pace < TRAVEL.forward;
      if (!slow.length || !slow.every(item => Array.isArray(item) ? item.length > 0 && item.every(valid) : valid(item)))
        throw Error('The slowing stage names its orders below the forward pace, 0 for a stop');
      const share = slow.length === 1 ? [1] : slow.map((_, i) => i === slow.length - 1 ? .5 : .5 / (slow.length - 1));
      current = slow.map((item, i) => ({ start: 'moving', seconds: slowingSeconds(item), weight: share[i], cues: slowingCues(item, go, stop) }));
      break;
    }
    case 4: current = [...placeScripts(heading), ...variations]; break;
    case 5:
      if (!variations.length) throw Error('The loadout stage needs its order scripts');
      current = variations;
      break;
    default: throw Error(`Unknown travel curriculum stage ${stage}`);
  }
  const weight = stage === 1 ? 1 : .5;
  const total = current.reduce((sum, p) => sum + (p.weight ?? 1), 0);
  return [...(stage === 1 ? [] : travelCurriculum(stage - 1, { seconds, heading, variations, slow }).map(p => ({ ...p, weight: p.weight * .5 }))),
    ...current.map(p => ({ ...p, weight: weight * (p.weight ?? 1) / total }))];
}
