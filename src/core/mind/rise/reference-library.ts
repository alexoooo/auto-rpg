import type { BodyObservation } from "../../observation.ts";
import type { ReferenceArguments, ReferenceAction } from "./reference-types.ts";
import { pathPolicy } from './reference-path.ts';
import { phaseFeatures } from './reference-features.ts';
import { responsePolicy, responseFeatures } from './reference-response.ts';
/** Select a reference by measured posture, support and motion; every reference has its own phase. */
export function libraryPolicy({ channels, reference, parameters: p }: ReferenceArguments) {
    const references = reference.references, policies = references.map((reference, i) => {
        const controller = p.controllers?.[i], parameters = { ...p, ...controller?.parameters };
        switch (controller?.kind ?? 'path') {
            case 'path': return pathPolicy({ channels, reference, parameters });
            case 'response': return responsePolicy({ channels, reference, parameters });
            default: throw new Error('unknown reference controller');
        }
    });
    const state = { phase: 0, reference: null as number | null, released: false, switches: 0, errors: [] as number[], policies: policies.map(p => p.state) };
    const policy = (o: BodyObservation): ReferenceAction => {
        if (state.released)
            return { kind: 'host' };
        const features = phaseFeatures(o), actions = policies.map(policy => policy(o));
        const motion = p.rootMotionWeight! > 0 ? responseFeatures(o, true).slice(-6) : null;
        const errors = references.map((ref, i) => {
            const f = ref.frames[Math.max(0, Math.min(ref.frames.length - 1, Math.round(policies[i].state.phase)))];
            return (p.poseWeight ?? 1) * o.joints.reduce((sum, j, k) => sum + ((j.angle - f.angles[k]) * (j.angle - f.angles[k])) / channels.length, 0)
                + (p.rootWeight ?? 1) * features.gravity.reduce((sum, v, k) => sum + ((v - f.gravity[k]) * (v - f.gravity[k])), 0)
                + (p.phaseHeightWeight ?? 4) * ((features.height - f.height) * (features.height - f.height))
                + (p.phaseLoadWeight ?? .2) * Object.entries(f.loads).reduce((sum, [name, v]) => sum + ((v - (features.loads[name] ?? 0)) * (v - (features.loads[name] ?? 0))), 0)
                + (p.velocityWeight ?? 0) * o.joints.reduce((sum, j, k) => sum + ((j.speed - f.speeds[k]) * (j.speed - f.speeds[k])) / channels.length, 0)
                + (motion ? p.rootMotionWeight! * motion.reduce((sum, v, k) => sum + ((v - f.rootMotion[k]) * (v - f.rootMotion[k])), 0) : 0)
                + (state.reference !== null && state.reference !== i ? (p.switchCost ?? 0) : 0);
        });
        const selected = p.initialOnly && state.reference !== null ? state.reference : errors.indexOf(Math.min(...errors));
        if (state.reference !== null && selected !== state.reference)
            state.switches++;
        state.reference = selected;
        state.phase = policies[selected].state.phase;
        state.errors = errors;
        state.released = policies[selected].state.released;
        if (p.blend! > 0 && !state.released && errors[selected] > 1e-12 &&
            actions.every(a => a.kind === 'muscles' && a.velocity.every(Number.isFinite))) {
            const muscles = actions as Extract<ReferenceAction, { kind: "muscles" }>[];
            const weights = errors.map(error => {
                const inverse = 1 / Math.max(1e-12, error);
                let weight = 1;
                for (let i = 0; i < p.blend!; i++)
                    weight *= inverse;
                return weight;
            });
            const total = weights.reduce((sum, v) => sum + v, 0);
            weights.forEach((v, i) => weights[i] = v / total);
            return { kind: 'muscles', handPoses: { ...muscles[selected].handPoses },
                velocity: channels.map((_, j) => muscles.reduce((sum, a, i) => sum + weights[i] * (a.velocity[j] as number), 0)),
                activation: channels.map((_, j) => Math.max(0, Math.min(1, muscles.reduce((sum, a, i) => sum + weights[i] * a.activation[j], 0)))) };
        }
        return actions[selected];
    };
    policy.state = state;
    return policy;
}
