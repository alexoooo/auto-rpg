import type { MindConfig } from "../core/mind/config.ts";
import { offered } from "../core/mind/controller.ts";
import { modelInfo, modelHolding, type BodyModel } from "../core/models.ts";
import { FIGHT_ENTRY, MINDS, modelRefusal, defaultMind } from "../entrants/game.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { MODEL_DISPLAY } from "../render/models.ts";
import { mindEditor } from "../ui/mind-editor.ts";
import { mindFaults, mindText, readMind } from "../ui/mind-link.ts";
import type { Participant } from "./run.ts";
import type { AttributeOverrides } from "../core/character-attributes.ts";

/** The id of a body's own mind, its model's (`modelInfo`), among the minds offered it. */
const OWN = "own";

/** A row of the panel: the bodies of one model on one side, which play the mind chosen in it. */
interface Row { readonly side: Participant["side"]; readonly model: BodyModel }

/** The minds the start panel offers a body of `model`, by id: its model's own first, then each offered (`offered`) that fits it holding what its model holds (`MINDS`). */
function presetsFor(model: BodyModel): Readonly<Record<string, { readonly label: string; readonly config: MindConfig }>> {
  return { [OWN]: { label: "Its own", config: defaultMind(model) },
    ...Object.fromEntries(Object.entries(MINDS).filter(([, mind]) => offered(mind) && modelRefusal(model, mind.config, { left: "empty", right: modelInfo(model).held }, FIGHT_ENTRY) === null)) };
}

/** A body of `model`, holding what its model holds (`DungeonRun`): what its mind must fit. */
const bodySpec = (model: BodyModel, attributes?: AttributeOverrides): BodySpec => modelHolding(model, { left: "empty", right: modelInfo(model).held }, attributes);

/** The address's key for the mind of `row`: `<model>.mind` for the party's, `enemy.<model>.mind` for the enemies'. */
const mindKey = (row: Row): string => `${row.side === "enemy" ? "enemy." : ""}${row.model}.mind`;

/**
 * **The run's minds on the start panel**, into `holder`: a row for each of `rows`, the party's
 * by model and the enemies' by model, each with the minds offered it (`presetsFor`) and its tree
 * (`mindEditor`), as `search` carries it (`readMind`), its model's own unless it carries another.
 */
export function runMinds(holder: HTMLElement, rows: readonly Row[], search: string): {
  /** The mind a participant plays (`DungeonRunOptions.mind`): its row's, or its model's own where that has a fault (`mindFaults`) or it has no row. */
  mind(attributes?: (participant: Participant) => AttributeOverrides): (participant: Participant) => MindConfig | null;
  /** `url` with each row's mind (`mindText`), and none where it is its model's own. */
  write(url: URL): void;
} {
  const query = new URLSearchParams(search), shown = new Map<string, MindConfig>();
  holder.replaceChildren(...rows.map((row) => {
    const presets = presetsFor(row.model), key = mindKey(row);
    shown.set(key, readMind(query.get(key), presets) ?? presets[OWN]!.config);
    const label = `${MODEL_DISPLAY[row.model].label}${row.side === "enemy" ? " (enemy)" : ""}`;
    const section = document.createElement("section"), name = document.createElement("h3"), select = document.createElement("select");
    section.className = "party-mind"; name.textContent = label;
    select.setAttribute("aria-label", `${label}'s mind`);
    select.append(...Object.entries(presets).map(([id, { label }]) => Object.assign(document.createElement("option"), { value: id, textContent: label })),
      Object.assign(document.createElement("option"), { value: "", textContent: "Changed", disabled: true }));
    const chosen = () => { const text = mindText(shown.get(key)!, presets); select.value = Object.hasOwn(presets, text) ? text : ""; };
    const editor = mindEditor(shown.get(key)!, { spec: bodySpec(row.model), entry: FIGHT_ENTRY, onFault: "its own mind is used",
      onChange: (config) => { shown.set(key, config); chosen(); } });
    select.addEventListener("change", () => { select.blur(); shown.set(key, presets[select.value]!.config); editor.set(shown.get(key)!); });
    chosen();
    section.append(name, select, editor.element);
    return section;
  }));
  return {
    mind(attributes) {
      const chosen = new Map(rows.map((row) => {
        const config = shown.get(mindKey(row))!;
        return [mindKey(row), config] as const;
      }));
      return participant => {
        const config = chosen.get(mindKey(participant));
        return config && mindFaults(config, bodySpec(participant.model, attributes?.(participant)), { entry: FIGHT_ENTRY }).length === 0 ? config : null;
      };
    },
    write(url) {
      for (const row of rows) {
        const text = mindText(shown.get(mindKey(row))!, presetsFor(row.model));
        if (text === OWN) url.searchParams.delete(mindKey(row));
        else url.searchParams.set(mindKey(row), text);
      }
    },
  };
}
