/** Travel curriculum as weighted order scripts; the environment only executes the resulting data. */
import { sin, cos } from '../../../src/core/math/real.ts';

export function travelCurriculum(stage, { seconds = 12, heading = 0, variations = [] } = {}) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 5) throw Error('Travel curriculum stage is 1 to 5');
  const direction = { x: sin(heading), z: cos(heading) };
  const go = pace => ({ move: { kind: 'direct', direction }, gait: 'run', pace, face: null });
  const stop = { move: null, face: direction };
  const sustainedPaces = [1.4, 2, 3, 4, 4.5, 5.5, 6.5], entryPaces = [.9, 1, ...sustainedPaces];
  let current;
  switch (stage) {
    case 1:
      current = sustainedPaces.map(pace => ({ start: 'moving', seconds, cues: [{ at: 0, orders: go(pace) }] }));
      break;
    case 2:
      current = entryPaces.flatMap(pace => entryPaces.flatMap(changed => ['rest', 'moving'].map(start => ({ start, seconds,
        cues: [{ at: 0, orders: go(pace) }, { at: seconds / 2, orders: go(changed) }] }))));
      break;
    case 3:
      current = [{ start: 'moving', seconds: 4, weight: .5, cues: [{ at: 0, orders: stop }] },
        ...entryPaces.flatMap(pace => entryPaces.map(changed => ({ start: 'rest', seconds: seconds + 4, weight: .5 / (entryPaces.length * entryPaces.length),
          cues: [{ at: 0, orders: go(pace) }, { at: seconds / 2, orders: go(changed) }, { at: seconds, orders: stop }] })))];
      break;
    case 4: case 5:
      if (!variations.length) throw Error('Direction and loadout stages need their order scripts');
      current = variations;
      break;
    default: throw Error(`Unknown travel curriculum stage ${stage}`);
  }
  const weight = stage === 1 ? 1 : .5;
  const total = current.reduce((sum, p) => sum + (p.weight ?? 1), 0);
  return [...(stage === 1 ? [] : travelCurriculum(stage - 1, { seconds, heading, variations }).map(p => ({ ...p, weight: p.weight * .5 }))),
    ...current.map(p => ({ ...p, weight: weight * (p.weight ?? 1) / total }))];
}
