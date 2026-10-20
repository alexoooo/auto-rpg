import { lowsOf } from "../core/control/ground.ts";
import { modelSpec, type BodyModel } from "../core/models.ts";
import { deepFreeze } from "../core/state.ts";
import { frameOf } from "../core/spec/body.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { shapeBounds } from "../core/spec/shape-bounds.ts";

/** **What the crypt needs of a model** beyond its body and mind: how it walks the map and when it is out. */
interface CryptModel {
  /** Its footprint's radius on the map, m: what its paths keep clear by and how far apart it is placed. */
  readonly radius: number;
  /** How near its target it stands to fight, m. */
  readonly attackMetres: number;
  /** How long it may go without progress along its route before it plans the route again, s. */
  readonly progressSeconds: number;
  /** Whether a fall ends its fight, as a wound that ends its pool does. */
  readonly fallEndsFight: boolean;
}

/** Every humanoid's footprint, spacing and recovery: `docs/reference/reptile.md#encounters`. */
const HUMANOID: CryptModel = deepFreeze({ radius: .35, attackMetres: 1.8, progressSeconds: 1, fallEndsFight: false });

let reptileModel: CryptModel | undefined;
/** The reptile's collider footprint, bite spacing and continued recovery: `docs/reference/reptile.md#encounters`. */
function readReptile(): CryptModel {
  const anatomy = modelSpec("reptile");
  const radius = Math.max(...anatomy.segments.flatMap(s => lowsOf(s.shape, frameOf(s)).map(p => Math.sqrt(p.at[0] * p.at[0] + p.at[2] * p.at[2]) + p.radius)));
  return deepFreeze({ radius, attackMetres: .52, progressSeconds: 8, fallEndsFight: false });
}

/** What the crypt needs of `model` (`CryptModel`). */
export function cryptModel(model: BodyModel, spec?: BodySpec): CryptModel {
  if (spec) {
    const base = modelSpec(model), own = cryptModel(model);
    const footprint = (body: BodySpec) => Math.max(...body.segments.map(segment => {
      const b = shapeBounds(segment), x = Math.max(Math.abs(b.min[0]), Math.abs(b.max[0])), z = Math.max(Math.abs(b.min[2]), Math.abs(b.max[2]));
      return Math.sqrt(x * x + z * z);
    }));
    return { ...own, radius: own.radius * (footprint(spec) / footprint(base)), attackMetres: own.attackMetres * (spec.stature.value / base.stature.value) };
  }
  switch (model) {
    case "workshop-fighter": case "workshop-rogue": case "crypt-skeleton": return HUMANOID;
    case "reptile": return reptileModel ??= readReptile();
    default: { const never: never = model; throw new Error(`unknown model ${never}`); }
  }
}
