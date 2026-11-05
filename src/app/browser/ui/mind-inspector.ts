import type { Inspected } from "../../worker/inspection.ts";
import { GAME, partOf } from "../../catalog.ts";
import { describeMind } from "../../../minds/description.ts";
import { commandsBody } from "../../../control/body.ts";
import type { MindConfig } from "../../../minds/config.ts";
import type { Staging } from "../../../minds/config-link.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { mindEditor } from "./mind-editor.ts";
import { actionReadout } from "./action-readout.ts";

/** Live owners and configured component paths come from the runtime and its controller. */
export function mindInspector(config: MindConfig, spec: BodySpec, inspected: () => Inspected | null,
  staging: Staging = {}): { readonly element: HTMLElement; refresh(): void } {
  const element = document.createElement("div"), live = document.createElement("dl");
  element.className = "mind-inspector"; live.className = "mind-live";
  const tree = mindEditor(config, { spec, ...staging, readOnly: true }), actions = actionReadout();
  const described = describeMind(GAME, spec, config);
  element.append(live, actions.element, tree.element);
  const row = (term: string): HTMLElement => {
    const name = document.createElement("dt"), value = document.createElement("dd");
    name.textContent = term; live.append(name, value); return value;
  };
  const has = row("Has the body"), held = new Map<string, HTMLElement>();
  if (described) row("Configured services").textContent = described.components.filter(component => component.role !== "option")
    .map(component => partOf(component.config).label).join(", ") || "None";
  return { element, refresh() {
    const now = inspected(), report = now?.skills?.report;
    has.textContent = !now ? "no body" : commandsBody(now.body) ? "its mind" : now.body.has;
    const holding = new Set<string>();
    for (const key of Object.keys(report?.holders ?? {})) if (!held.has(key)) held.set(key, row(key));
    for (const [key, value] of held) {
      const holder = report?.holders?.[key];
      if (holder === undefined) { value.textContent = "—"; continue; }
      if (typeof holder === "number") {
        const action = report?.actions?.find(action => action.id === holder);
        value.textContent = action ? `${action.action} #${holder} · ${action.phase}` : `instance #${holder}`;
        for (const source of described?.actions ?? []) if (source.action.name === action?.action && source.path !== null) holding.add(JSON.stringify(source.path));
      } else {
        const owner = report?.defaultOwners?.[key], component = described?.components.find(component => component.owner === owner);
        value.textContent = component ? `${partOf(component.config).label}${component.path === null ? " (implicit)" : ""}` : owner ?? "Default control";
        if (component?.path) holding.add(JSON.stringify(component.path));
      }
    }
    for (const block of tree.element.querySelectorAll<HTMLElement>(".mind-part[data-path]")) block.classList.toggle("live", holding.has(block.dataset.path!));
    actions.refresh(now?.report ?? null);
  } };
}
