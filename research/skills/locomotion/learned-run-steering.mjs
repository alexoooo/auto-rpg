/** A learned cycle controller's layout, its readings of the current body and its bounded offsets. */
import { hasteOver } from '../../../src/core/bodies/human/attributes.ts';
import { sin, cos } from '../../../src/core/math/real.ts';
import { wrap } from '../../../src/core/math/turn.ts';
import { footOn } from '../../../src/control/support.ts';

const ranges = Object.freeze({ swingHip: .3, swingOut: .15, swingKnee: .4, swingAnkle: .3,
  stanceKnee: .3, stanceAnkle: .3, stanceRoll: .15, lean: .2, bank: .1, cadence: .3, pace: 1.5, effort: .5 });
const joints = ['hip.%s flexion', 'hip.%s abduction', 'hip.%s internal rotation', 'knee.%s flexion', 'ankle.%s dorsiflexion', 'ankle.%s inversion'];

export const STEERING_LAYOUT = Object.freeze({ interval: 1 / 30, inputs: Object.freeze(['phase sin', 'phase cos', 'command', 'playback',
  'forward speed', 'mirrored side speed', 'vertical speed', 'height', 'centre from bearing forward', 'centre from bearing side',
  'swing from centre forward', 'swing from centre side', 'swing over bearing', 'up forward', 'mirrored up side', 'facing error',
  'momentum right', 'momentum up', 'momentum forward', 'bearing contact', 'swing contact', 'haste', 'turning',
  ...['angle', 'speed'].flatMap(kind => ['bearing', 'swing'].flatMap(role => joints.map(joint => `${role} ${joint} ${kind}`)))]),
  outputs: Object.freeze(Object.keys(ranges)) });

/** Convert squashed actor outputs to the cycle controller's bounded physical offsets. */
export function steeringFrom(actions) {
  return Object.fromEntries(Object.entries(ranges).map(([key, range], i) => [key, Math.max(-1, Math.min(1, actions[i])) * range]));
}

/** The 47 raw observations of a learned cycle actor, in its training's mirrored bearing-leg convention. */
export function learnedRunFeatures(body) {
  const features = [];
  const ends = Object.fromEntries(['left', 'right'].map(side => [side, footOn(body.built.spec, side)]));
  const channels = Object.fromEntries(['left', 'right'].map(side => [side, joints.map(name => body.muscles.channel(name.replace('%s', side)))]));
  return (view, heading, asked, turning, run) => {
    const s = view.stance, c = s.centre, v = s.velocity, m = s.momentum;
    const bearing = run.phase < .5 ? 'left' : 'right', swinging = bearing === 'left' ? 'right' : 'left', side = bearing === 'left' ? 1 : -1;
    const own = bearing === 'left' ? run.phase : run.phase - .5;
    const fx = sin(heading), fz = cos(heading), rx = cos(heading), rz = -sin(heading);
    const along = (x, z) => x * fx + z * fz, across = (x, z) => -(x * rx + z * rz) * side;
    const q = view.root.rotation, ux = 2 * (q.x * q.y - q.w * q.z), uz = 2 * (q.y * q.z + q.w * q.x);
    const b = s.ends[ends[bearing]].middle, w = s.ends[ends[swinging]].middle;
    features.length = 0;
    features.push(sin(4 * Math.PI * own), cos(4 * Math.PI * own), asked, run.pace,
      along(v.x, v.z), across(v.x, v.z), v.y, c.y - Math.min(b.y, w.y),
      along(c.x - b.x, c.z - b.z), across(c.x - b.x, c.z - b.z),
      along(w.x - c.x, w.z - c.z), across(w.x - c.x, w.z - c.z), w.y - b.y,
      along(ux, uz), across(ux, uz), wrap(heading - s.facing) * side,
      m.x * rx + m.z * rz, m.y * side, along(m.x, m.z) * side,
      s.ends[ends[bearing]].touching ? 1 : 0, s.ends[ends[swinging]].touching ? 1 : 0,
      hasteOver(body.built.spec) - 1, turning * side);
    for (const leg of [bearing, swinging]) for (const channel of channels[leg]) features.push(body.muscles.angle(channel));
    for (const leg of [bearing, swinging]) for (const channel of channels[leg]) features.push(body.muscles.speed(channel));
    return features;
  };
}
