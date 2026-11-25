import { skillName, type Varied } from "../../../skills/framework/variations.ts";
import type { Service } from "../../../skills/framework/intent.ts";
import type { PartConfig } from "../../../parts/parts.ts";
import type { Option } from "../contract/option.ts";

/**
 * **`option` by the skill of `service` that `config` names**: each step asks that skill of its
 * service (`Intent.skills`), and it and its sites are named after it, so the same Option by two of
 * a service's skills is two Options at two sites.
 */
export function choosingSkill(option: Option, config: PartConfig & Varied, service: Service): Option {
  const name = skillName(config);
  return { ...option, get name() { return `${option.name} (${name})`; }, get claims() { return option.claims; },
    ...(option.sites ? { sites: option.sites.map(site => ({ ...site, name: `${site.name} (${name})` })) } : {}),
    step(now, dt) { const { asked, holds } = option.step(now, dt); return { asked: { ...asked, skills: { ...asked.skills, [service]: name } }, holds }; },
  };
}
