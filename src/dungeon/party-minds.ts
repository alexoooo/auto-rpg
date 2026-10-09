import { armedWith } from "../core/items/held.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { PRESETS } from "../core/mind/controllers.ts";
import { modelInfo, modelSpec, modelSupportsMind, type BodyModel } from "../core/models.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { MODEL_DISPLAY } from "../render/models.ts";
import { mindEditor } from "../ui/mind-editor.ts";
import { mindFaults, mindText, readMind } from "../ui/mind-link.ts";

/** The id of a party member's own mind, its model's (`modelInfo`), among the minds offered it. */
const OWN = "own";

/** The minds the start panel offers a party member of `model`, by id: its model's own first, then each preset that fits it (`PRESETS`). */
function presetsFor(model: BodyModel): Readonly<Record<string, { readonly label: string; readonly config: MindConfig }>> {
  return { [OWN]: { label: "Its own", config: modelInfo(model).mind },
    ...Object.fromEntries(Object.entries(PRESETS).filter(([, preset]) => modelSupportsMind(model, preset.config))) };
}

/** A party member's body of `model`, holding what its model holds (`DungeonRun`): what its mind must fit. */
const memberSpec = (model: BodyModel): BodySpec => armedWith(modelSpec(model), "right", modelInfo(model).held);

/** The address's key for a party member's mind of `model`. */
const mindKey = (model: BodyModel): string => `${model}.mind`;

/**
 * **The party's minds on the start panel**, into `holder`: for each of `models`, the mind offered
 * it (`presetsFor`) and its tree (`mindEditor`), as `search` carries it (`readMind`), its model's
 * own unless it carries another. A party member's mind is configured here; an enemy's is its
 * model's, shown in the run's inspector.
 */
export function partyMinds(holder: HTMLElement, models: readonly BodyModel[], search: string): {
  /** Each model's mind as a run plays it: the one shown, or its model's own where that has a fault (`mindFaults`). */
  minds(): Readonly<Partial<Record<BodyModel, MindConfig>>>;
  /** `url` with each model's mind (`mindText`), and none where it is its model's own. */
  write(url: URL): void;
} {
  const query = new URLSearchParams(search), shown = {} as Record<BodyModel, MindConfig>;
  holder.replaceChildren(...models.map((model) => {
    const presets = presetsFor(model);
    shown[model] = readMind(query.get(mindKey(model)), presets) ?? presets[OWN]!.config;
    const row = document.createElement("section"), name = document.createElement("h3"), select = document.createElement("select");
    row.className = "party-mind"; name.textContent = MODEL_DISPLAY[model].label;
    select.setAttribute("aria-label", `${MODEL_DISPLAY[model].label}'s mind`);
    select.append(...Object.entries(presets).map(([id, { label }]) => Object.assign(document.createElement("option"), { value: id, textContent: label })),
      Object.assign(document.createElement("option"), { value: "", textContent: "Changed", disabled: true }));
    const chosen = () => { const text = mindText(shown[model], presets); select.value = Object.hasOwn(presets, text) ? text : ""; };
    const editor = mindEditor(shown[model], { spec: memberSpec(model), onFault: "its own mind is used",
      onChange: (config) => { shown[model] = config; chosen(); } });
    select.addEventListener("change", () => { select.blur(); shown[model] = presets[select.value]!.config; editor.set(shown[model]); });
    chosen();
    row.append(name, select, editor.element);
    return row;
  }));
  return {
    minds: () => Object.fromEntries(models.map((model) => [model, mindFaults(shown[model], memberSpec(model)).length > 0 ? modelInfo(model).mind : shown[model]])),
    write(url) {
      for (const model of models) {
        const text = mindText(shown[model], presetsFor(model));
        if (text === OWN) url.searchParams.delete(mindKey(model));
        else url.searchParams.set(mindKey(model), text);
      }
    },
  };
}
