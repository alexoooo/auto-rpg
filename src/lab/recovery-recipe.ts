import { RISE, stageFaults, type Recipe, type PoseStage, type BearStage } from "../core/mind/rise/stages.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { deepFreeze } from "../core/state.ts";

/** Bounded controller parameters; the independent final-standing predicate is not a parameter. */
export const FEEDBACK_PARAMETERS = deepFreeze<readonly (readonly [string, number, number, number])[]>([
  ['roll', .1, 1, 1], ['prepare', .1, 1, 1], ['poses', .1, 1, 1], ['bearing', .15, 1, 1],
  ['response', .1, 1, 1], ['speed', 1, 4, 1], ['progressSpeed', .1, 1.2, .1],
  ['settleSpeed', .1, 1, .1], ['settleSeconds', .025, .5, .5], ['near', .05, .1, .05], ['turn', .15, .45, .15],
  ['hip', -.2, .2, 0], ['knee', -.2, .2, 0], ['shoulder', -.25, .25, 0], ['wrist', -.4, .4, 0],
  ['height', -.05, .05, 0], ['pitch', -.1, .1, 0],
]);
const initial = FEEDBACK_PARAMETERS.map(([, lo, hi, value]) => (value - lo) / (hi - lo));
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Preserve the feedback/contact policy while varying its entire supported movement recipe. */
export function feedbackRecipe(spec: BodySpec, u: readonly number[] = initial): Recipe {
  if (u.length !== FEEDBACK_PARAMETERS.length || Array.from(u).some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error('invalid recovery feedback candidate');
  const p = Object.fromEntries(FEEDBACK_PARAMETERS.map(([name, lo, hi], i) => [name, lo + (hi - lo) * u[i]]));
  const shift = (name: string) => name.startsWith('hip.') && name.endsWith(' flexion') ? p.hip
    : name.startsWith('knee.') ? p.knee : name.startsWith('shoulder.') && name.endsWith(' flexion') ? p.shoulder
      : name.startsWith('wrist.') && name.endsWith(' pronation') ? p.wrist : 0;
  const posture = (value: BearStage['posture']): BearStage['posture'] => value === 'reference' ? value : Object.fromEntries(spec.joints.flatMap(j => j.dofs.map(d => {
    const name = `${j.name} ${d.positive}`;
    return [name, clamp((value[name] ?? 0) + shift(name), d.min.value + d.bind.value, d.max.value + d.bind.value)];
  })));
  const pose = (stage: PoseStage, factor: number, changePosture: boolean): PoseStage => ({ ...stage, posture: changePosture ? posture(stage.posture) as PoseStage["posture"] : stage.posture,
    seconds: stage.seconds * factor, drive: { within: (stage.drive?.within ?? .2) * p.response, speed: (stage.drive?.speed ?? 3) * p.speed } });
  const recipe: Recipe = deepFreeze({ ...RISE,
    roll: Object.fromEntries(Object.entries(RISE.roll).map(([lie, stages]) => [lie, stages.map(s => pose(s, p.roll, false))])) as unknown as Recipe["roll"],
    rise: RISE.rise.map((s, i) => {
      switch (s.kind) {
        case 'pose': return pose(s, i < 3 ? p.prepare : p.poses, true);
        case 'bear': return { ...s, seconds: s.seconds * p.bearing, posture: posture(s.posture),
          ...(s.postureSeconds !== undefined ? { postureSeconds: s.postureSeconds * p.response } : {}),
          height: s.height === null ? null : clamp(s.height + p.height, .1, 1.1), pitch: s.pitch === null ? null : s.pitch + p.pitch };
        default: { const never: never = s; throw new Error(`unknown recovery stage ${never}`); }
      }
    }), progress: { speed: p.progressSpeed, near: p.near, turn: p.turn, settleSpeed: p.settleSpeed, settleSeconds: p.settleSeconds } });
  const faults = stageFaults(recipe, spec); if (faults.length) throw new Error(faults.join('; '));
  return recipe;
}
