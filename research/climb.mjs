/**
 * **Stand up's steady, for research**: the steady as `standUp` runs it (`src/core/mind/ground/stand-up.ts`:
 * its own motor, the locomotion resumed, the stance's goal), handed back once `standReady` holds
 * `READY` s, with the variants `research/crouch-steady.mjs` names. `research/crouch-steady.mjs` runs it
 * from the placed squat, `research/rise-witness.mjs` from a witness's hand-over.
 */
import { SERVO_SECONDS } from "../src/core/body.ts";
import { carrying } from "../src/core/control/motor.ts";
import { locomotion } from "../src/core/skills/locomotion.ts";
import { kitOf } from "../src/core/mind/kit.ts";
import { partLookup } from "../src/core/mind/catalog.ts";
import { PUNCHER } from "../src/core/mind/config.ts";
import { standReady } from "../src/core/mind/ground/reading.ts";

/** How long the steady waits on a ready body before it hands it back, s. */
export const READY = .1;
/** The combat fold's lowering, m, and the stance's own, m. */
const FOLD = .5, LOWER = .03;
const smooth = u => u * u * (3 - 2 * u), jerk = u => u * u * u * (10 - 15 * u + 6 * u * u);

/**
 * The steady of `own` as `variant` changes it: `step(dt)` each control step from its first; `control.on`
 * false once handed back, at `control.handBack` s of the world's clock; `control` the trace's readings.
 */
export function crouchSteady(own, view, variant = {}) {
  const control = { on: true, t0: null, from: null, mid: null, depth: null, height: null, c0: null, climbed: false, ready: 0, handBack: null,
    lead: 0, steps: 0, asked: null, at: 0, short: 0 };
  const kit = kitOf(partLookup, own.spec, PUNCHER), legs = locomotion(null);
  const motor = carrying(kit.motor(own.built, variant.servo ?? SERVO_SECONDS, kit.posture, variant.tuning, own.assist), ["stance"], "the crouch steady");
  const channels = own.muscles.channels;
  const blend = k => Object.fromEntries(channels.map((c, i) => [c.name, control.from[i] + ((kit.posture[c.name] ?? 0) - control.from[i]) * k]));
  const resume = () => { motor.stance.read(); legs.resume({ ...view, stance: motor.stance.reading }); };
  return { control, state: { motor: motor.state, legs: legs.state, control },
    step(dt) {
      if (control.t0 === null) { control.t0 = view.time; control.from = channels.map((_, i) => own.muscles.angle(i)); resume(); }
      const t = view.time - control.t0;
      motor.stance.read();
      const r = motor.stance.reading, h = legs.heading, fx = Math.sin(h), fz = Math.cos(h);
      control.mid ??= [r.support.x, r.support.z];
      if (variant.ease) motor.setPosture(blend(smooth(Math.min(1, t / variant.ease))));
      let goal = legs.goal({ ...view, stance: r }, null, h, dt);
      if (goal && variant.ahead && t < variant.ahead.T)
        goal = { ...goal, centre: [control.mid[0] + variant.ahead.d * fx, control.mid[1] + variant.ahead.d * fz] };
      if (goal && variant.fold) {
        const f = variant.fold, span = FOLD - LOWER;
        control.depth ??= Math.max(0, Math.min(1, (legs.reference - LOWER - (r.centre.y - r.support.y)) / span));
        const u = Math.min(1, t / f.T), depth = control.depth * (1 - smooth(u));
        if (u < 1) {
          const pose = { ...kit.posture };
          pose["lumbar flexion"] = (pose["lumbar flexion"] ?? 0) + (f.lumbar ?? .89) * depth;
          pose["thoracic flexion"] = (pose["thoracic flexion"] ?? 0) + (f.thoracic ?? .368) * depth;
          motor.setPosture(pose);
          goal = { feet: ["left", "right"], centre: null, heading: h, height: legs.reference - LOWER - span * depth, pose: { pitch: (f.pitch ?? .9) * depth, seconds: f.response ?? .5 } };
        } else motor.setPosture(kit.posture);
      }
      if (goal && variant.lift) {
        const f = variant.lift, top = legs.reference - LOWER, u = Math.min(1, t / f.T), k = smooth(u);
        control.height ??= r.centre.y - r.support.y;
        if (u < 1) {
          motor.setPosture(blend(0));
          goal = { feet: ["left", "right"], centre: null, heading: h, height: control.height + (top - control.height) * k, pose: { pitch: f.pitch * (1 - k), seconds: f.response ?? .3 } };
        } else motor.setPosture(kit.posture);
      }
      if (goal && variant.ramp) {
        // The shift, `delay` s: the height held, the centre of mass asked `d` m ahead of the feet's middle, the trunk's
        // flexion and the shoulders' raised by `lean` and `reach`; then the rise, `T` s: the height to standing on a
        // minimum-jerk path, the lead and the lean let go on it; the posture from the hand-over's to the guard's over `Tp` s.
        const f = variant.ramp, top = legs.reference - LOWER, D = f.delay ?? 0;
        control.height ??= r.centre.y - r.support.y;
        const uh = Math.min(1, Math.max(0, (t - D) / f.T)), up = Math.min(1, t / (f.Tp ?? D + f.T));
        const b = t < D ? jerk(Math.min(1, t / Math.max(D, .05))) : 1 - jerk(uh), lead = (f.d ?? 0) * b;
        goal = { ...goal, height: control.height + (top - control.height) * jerk(uh), centre: [r.support.x + lead * fx, r.support.z + lead * fz] };
        const pose = blend(jerk(up));
        for (const c of channels) {
          if (c.name === "lumbar flexion") pose[c.name] += (f.lean ?? 0) * b;
          if (c.name === "thoracic flexion") pose[c.name] += .4 * (f.lean ?? 0) * b;
          if (/^shoulder.(left|right) flexion$/.test(c.name)) pose[c.name] += (f.reach ?? 0) * b;
          const d = c.dof.spec; pose[c.name] = Math.max(d.min.value, Math.min(d.max.value, pose[c.name]));
        }
        motor.setPosture(pose);
      }
      if (variant.climb) {
        const f = variant.climb;
        if (t < f.T) {
          const lead = (r.centre.x - control.mid[0]) * fx + (r.centre.z - control.mid[1]) * fz + .1 * (r.velocity.x * fx + r.velocity.z * fz);
          const pose = blend(jerk(t / f.T));
          for (const c of channels) {
            if (/^hip\.(left|right) flexion$/.test(c.name)) pose[c.name] -= (f.kh ?? 0) * lead;
            if (/^ankle\.(left|right) dorsiflexion$/.test(c.name)) pose[c.name] -= (f.ka ?? 0) * lead;
            const d = c.dof.spec; pose[c.name] = Math.max(d.min.value, Math.min(d.max.value, pose[c.name]));
          }
          motor.setPosture(pose); goal = null;
        } else if (!control.climbed) {
          control.climbed = true; motor.setPosture(kit.posture); resume(); motor.stance.read();
          goal = legs.goal({ ...view, stance: motor.stance.reading }, null, legs.heading, dt);
        }
      }
      control.lead = (r.centre.x - r.support.x) * fx + (r.centre.z - r.support.z) * fz; control.steps = r.recoveries + r.strides;
      control.asked = goal ? goal.height : null; control.at = r.centre.y - r.support.y; control.short = r.shortfall.force.length();
      motor.setStance(goal);
      motor.control(own.muscles, dt);
      control.ready = standReady(view) ? control.ready + dt : 0;
      if (control.ready + 1e-9 >= READY + (variant.keep ?? 0)) { control.on = false; control.handBack = view.time; }
    } };
}

/** A trace's row: the time, the centre of mass's height's share of standing, the pelvis's uprightness, the fastest arm, trunk and leg segments, m/s; the steady's readings while it runs. */
export function traceRow(m, body, control, world) {
  const o = m.observation, fastest = re => Math.max(0, ...o.segments.filter(s => re.test(s.name)).map(s => Math.hypot(...s.velocity)));
  return { t: +world.time.toFixed(2), height: +(o.centre[1] / body.view.standing).toFixed(2), pelvisUp: +m.rootUp.toFixed(2), arms: +fastest(/arm|hand/i).toFixed(2),
    trunk: +fastest(/trunk|head|neck/i).toFixed(2), legs: +fastest(/thigh|shank|foot/).toFixed(2), position: body.view.ground?.position ?? "-",
    ready: m.ready, handed: !control.on, lead: control.on ? +control.lead.toFixed(3) : "-", steps: control.steps,
    asked: control.on && control.asked !== null ? +control.asked.toFixed(2) : "-", h: +control.at.toFixed(2), short: control.on ? Math.round(control.short) : "-" };
}
