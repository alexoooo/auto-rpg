/**
 * The attribute rows, for the arena's setup corners and the dungeon's hero dialog alike.
 *
 * **Markup and value-writing only.** Both pages build their panels from strings and route every
 * control through one delegated listener, so this file hands them a string and a way to write
 * values back into it, and reads an event back into what it asks for. The rules -- what a stat at
 * 1 means, what range is legal, how a setting is stored -- are `src/golem/attributes.ts` and
 * `withGolemAttribute` in `src/bout.ts`, because the Node runner has no DOM and a rule written here
 * is a rule no test can reach.
 *
 * **Every stat is shown, live or not.** A row nothing reads yet is a disabled line saying so, so the
 * whole list and its order are on screen from the first session and nothing pretends to work.
 *
 * **Open by default, and a person's to close.** It is setup, not diagnostics: nothing but the
 * person's own click on its summary opens or closes it.
 *
 * `scope` is the `data-side` every control carries: `left` and `right` in the arena, `hero` in the
 * dungeon. The arena's delegated handler already refuses anything whose side is not a corner.
 */

import {
  ATTRIBUTES,
  ATTRIBUTE_IDS,
  isAttributeId,
  type AttributeId,
  type AttributeSetting,
} from "./golem/attributes.ts";

/** The multiplier as the owner asked for it: x1.20. */
export const attributeLabel = (value: number): string => `x${value.toFixed(2)}`;

export function attributesPanel(scope: string): string {
  const rows = ATTRIBUTE_IDS.map((id) => {
    const row = ATTRIBUTES[id];
    if (!row.live) {
      return `
        <div class="attribute-row pending" title="not measured yet, so every body is built at x1">
          <span class="attribute-name">${row.label}</span>
          <span class="attribute-pending">not yet available</span>
        </div>`;
    }
    return `
        <div class="attribute-row">
          <label class="attribute-name" for="attribute-${scope}-${id}">${row.label}</label>
          <input type="range" id="attribute-${scope}-${id}" min="${row.min}" max="${row.max}" step="${row.step}"
            value="1" data-side="${scope}" data-field="attribute" data-attribute="${id}" />
          <output class="attribute-value" data-side="${scope}" data-attribute-value="${id}">${attributeLabel(1)}</output>
          <button type="button" class="attribute-reset" data-side="${scope}" data-field="attributeReset"
            data-attribute="${id}" title="back to x1">reset</button>
        </div>`;
  }).join("");
  return `
      <details class="attributes" data-side="${scope}" data-wrap="attributes" open>
        <summary class="field-name">Attributes</summary>${rows}
        <button type="button" class="attribute-reset all" data-side="${scope}" data-field="attributesReset">reset all</button>
      </details>`;
}

/**
 * Write a setting into a panel built by `attributesPanel`: every slider, its readout, and whether
 * anything can be touched.
 *
 * A reset button is disabled when there is nothing to reset, so the row says at a glance which stats
 * are off their default. `fixed` is what the body's family builds at x1 whatever is asked, with the
 * reason (`FAMILY_FIXED_ATTRIBUTES` in `src/golem/family.ts`): its row is disabled and says why.
 */
export function renderAttributes(
  host: ParentNode, scope: string, setting: AttributeSetting | undefined, disabled: boolean,
  fixed: Readonly<Partial<Record<AttributeId, string>>> = {},
): void {
  for (const id of ATTRIBUTE_IDS) {
    if (!ATTRIBUTES[id].live) continue;
    const value = setting?.[id] ?? 1;
    const slider = host.querySelector<HTMLInputElement>(`input[data-side="${scope}"][data-attribute="${id}"]`);
    const readout = host.querySelector<HTMLElement>(`[data-side="${scope}"][data-attribute-value="${id}"]`);
    const reset = host.querySelector<HTMLButtonElement>(
      `[data-side="${scope}"][data-field="attributeReset"][data-attribute="${id}"]`);
    if (!slider || !readout || !reset) throw new Error(`the ${scope} attribute panel is missing ${id}`);
    if (slider.value !== String(value)) slider.value = String(value);
    const reason = fixed[id];
    readout.textContent = reason ? `${attributeLabel(value)}, fixed` : attributeLabel(value);
    const row = slider.closest<HTMLElement>(".attribute-row");
    if (row) row.title = reason ? `Fixed at x1 on this body: ${reason}` : "";
    slider.disabled = disabled || reason !== undefined;
    reset.disabled = disabled || reason !== undefined || value === 1;
  }
  const all = host.querySelector<HTMLButtonElement>(`[data-side="${scope}"][data-field="attributesReset"]`);
  if (!all) throw new Error(`the ${scope} attribute panel is missing its reset`);
  all.disabled = disabled || !setting || Object.keys(setting).length === 0;
}

/**
 * The readout follows a slider while it is being dragged, before the `change` that commits it.
 *
 * Wired once per host with the page's own `input` listener. Only the readout moves: the setting,
 * the link and the body wait for the release, because rebuilding two golems per pixel of drag is a
 * flicker and not a preview.
 */
export function followAttributeSlider(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.field !== "attribute") return;
  const readout = target.closest(".attribute-row")?.querySelector<HTMLElement>(".attribute-value");
  if (readout) readout.textContent = attributeLabel(Number(target.value));
}

/** What a control in the panel asks for, or null for a control that is not one of its own. */
export type AttributeAction =
  | { readonly kind: "set"; readonly id: AttributeId; readonly value: number }
  | { readonly kind: "resetAll" };

export function attributeAction(target: EventTarget | null): AttributeAction | null {
  if (!(target instanceof HTMLElement)) return null;
  const field = target.dataset.field;
  if (field === "attributesReset") return { kind: "resetAll" };
  const id = target.dataset.attribute;
  if (!isAttributeId(id)) return null;
  if (field === "attributeReset") return { kind: "set", id, value: 1 };
  if (field === "attribute" && target instanceof HTMLInputElement) {
    const value = Number(target.value);
    return Number.isFinite(value) ? { kind: "set", id, value } : null;
  }
  return null;
}
