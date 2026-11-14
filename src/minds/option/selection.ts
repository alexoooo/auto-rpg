import { GUARD_RESOURCE, type Resource } from "../../skills/framework/action.ts";
import { skillName, type Varied } from "../../skills/framework/variations.ts";
import type { PartConfig } from "../../parts/parts.ts";
import type { Option } from "./option.ts";

/** An ordinary Option whose step explicitly names the enabled service it uses. */
export function choosingSkill(option: Option, config: PartConfig & Varied, label: string, field: "guardSkill" | "navigationSkill" | "supportSkill"): Option {
  const name = skillName(config);
  const resting = [GUARD_RESOURCE], claims = new WeakMap<readonly Resource[], readonly Resource[]>();
  return { ...option, get name() { return `${option.name}: ${label} (${name})`; },
    ...(option.sites ? { sites: option.sites.map(site => ({ ...site, name: `${site.name} (${name})` })) } : {}),
    get claims() {
      if (field !== "guardSkill") return option.claims;
      if (option.rest) return resting;
      const original = option.claims;
      let held = claims.get(original);
      if (!held) claims.set(original, held = [...original, GUARD_RESOURCE]);
      return held;
    },
    step(now, dt) { const { asked, holds } = option.step(now, dt); return { asked: { ...asked, [field]: name }, holds }; },
  };
}
