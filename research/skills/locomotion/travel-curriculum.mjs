/** Travel curriculum as weighted order scripts; the environment only executes the resulting data. */
import { sin, cos } from '../../../src/core/math/real.ts';
import { TRAVEL } from '../../../src/evaluation/travel/protocol.ts';

/** Seconds a slowing episode holds the forward run before its slower order. */
export const SLOW_AFTER = 2;
/** Seconds a slowing episode lasts after its order: a pace's reach and hold, or a stop and its quiet. */
export const SLOW_FOR = 6;

/**
 * Stage 3's `slow` lists the orders after a held forward run, smallest drop first, 0 for a stop.
 * Its newest order takes half the slowing episodes; the seed's entry and hold stay in the mix.
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
      if (!slow.length || !slow.every(pace => Number.isFinite(pace) && pace >= 0 && pace < TRAVEL.forward))
        throw Error('The slowing stage names its orders below the forward pace, 0 for a stop');
      const share = slow.length === 1 ? [.5] : slow.map((_, i) => i === slow.length - 1 ? .25 : .25 / (slow.length - 1));
      return [
        { start: 'rest', seconds: TRAVEL.entry + TRAVEL.hold, weight: .3, cues: [{ at: 0, orders: go(TRAVEL.forward) }] },
        { start: 'moving', seconds: TRAVEL.hold, weight: .2, cues: [{ at: 0, orders: go(TRAVEL.forward) }] },
        ...slow.map((pace, i) => ({ start: 'moving', seconds: SLOW_AFTER + SLOW_FOR, weight: share[i],
          cues: [{ at: 0, orders: go(TRAVEL.forward) }, { at: SLOW_AFTER, orders: pace > 0 ? go(pace) : stop }] })),
      ];
    }
    case 4: case 5:
      if (!variations.length) throw Error('Direction and loadout stages need their order scripts');
      current = variations;
      break;
    default: throw Error(`Unknown travel curriculum stage ${stage}`);
  }
  const weight = stage === 1 ? 1 : .5;
  const total = current.reduce((sum, p) => sum + (p.weight ?? 1), 0);
  return [...(stage === 1 ? [] : travelCurriculum(stage - 1, { seconds, heading, variations, slow }).map(p => ({ ...p, weight: p.weight * .5 }))),
    ...current.map(p => ({ ...p, weight: weight * (p.weight ?? 1) / total }))];
}
