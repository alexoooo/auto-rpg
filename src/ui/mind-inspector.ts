import { partOf } from "../core/mind/catalog.ts";
import type { MindConfig } from "../core/mind/config.ts";
import type { PartConfig, Provision } from "../core/mind/parts.ts";
import type { SkillReport } from "../core/skills/skills.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { mindEditor } from "./mind-editor.ts";
import { actionReadout } from "./action-readout.ts";

/** A mind's public ownership and execution facts, with no executor-specific state. */
interface Inspected {
  readonly body: { readonly has: string };
  readonly skills?: { readonly report: Partial<SkillReport> } | null;
}

/** Representative controls for the body's continuous services and hand endpoints. */
const HELD = [["stance", "Legs"], ["channel:lumbar flexion", "Trunk"], ["effector:hand.left", "Left hand"], ["effector:hand.right", "Right hand"]] as const;

/** The configured mind and its current owners, commitments and short-term execution history. */
export function mindInspector(config: MindConfig, spec: BodySpec, inspected: () => Inspected | null,
  provides: readonly Provision[] = []): { readonly element: HTMLElement; refresh(): void } {
  const element = document.createElement("div"), live = document.createElement("dl");
  element.className = "mind-inspector"; live.className = "mind-live";
  const tree = mindEditor(config, { spec, provides, readOnly: true }), actions = actionReadout();
  element.append(live, actions.element, tree.element);
  const row = (term: string): HTMLElement => {
    const name = document.createElement("dt"), value = document.createElement("dd");
    name.textContent = term; live.append(name, value); return value;
  };
  const has = row("Has the body"), held = HELD.map(([key, label]) => [key, row(label)] as const);
  const slots = (key: string) => tree.element.querySelectorAll<HTMLElement>(`.mind-editor > div > .mind-part > .mind-slot[data-slot="${key}"]`);
  return { element, refresh() {
    const now = inspected(), report = now?.skills?.report;
    has.textContent = !now ? "no body" : now.body.has === "command" ? "its mind" : now.body.has;
    const holding = new Set<string>();
    for (const [key, value] of held) {
      const holder = report?.holders?.[key];
      if (holder === undefined) { value.textContent = "—"; continue; }
      if (typeof holder === "number") {
        const action = report?.actions?.find(action => action.id === holder);
        value.textContent = action ? `${action.action} #${holder} · ${action.phase}` : `instance #${holder}`;
        holding.add("executors");
      } else {
        const slot = key === "stance" ? "locomotion" : "guard", part = (config as unknown as Readonly<Record<string, PartConfig | undefined>>)[slot];
        value.textContent = part ? partOf(part).label : holder; holding.add(slot);
      }
    }
    if (now && now.body.has !== "command" && now.body.has !== "nobody") holding.add("subs");
    for (const holder of tree.element.querySelectorAll<HTMLElement>(".mind-slot[data-slot]")) holder.classList.remove("live");
    for (const key of holding) for (const holder of slots(key)) holder.classList.add("live");
    actions.refresh(report ?? null);
  } };
}
