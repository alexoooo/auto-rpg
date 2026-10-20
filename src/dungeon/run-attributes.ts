import { attributeEditor } from "../ui/attribute-editor.ts";
import { readAttributes, writeAttributes } from "../ui/attribute-link.ts";
import type { AttributeOverrides } from "../core/character-attributes.ts";
import type { BodyModel } from "../core/models.ts";
import { MODEL_DISPLAY } from "../render/models.ts";
import type { Participant } from "./run.ts";
import { ENCOUNTER_MODELS } from "./encounters.ts";

/** Party overrides belong to a slot; enemy overrides belong to a model's encounter template. */
export function attributeScope(participant: Participant): string {
  return participant.side === "enemy" ? `enemy.${participant.model}` : participant.id;
}

/** Shared attribute editors for the selected roster and enemy types, held only by this setup. */
export function runAttributes(holder: HTMLElement, search: string) {
  const query = new URLSearchParams(search), drafts = new Map<string, AttributeOverrides>();
  const editors = new Map<string, ReturnType<typeof attributeEditor>>();
  let rows: { scope: string; model: BodyModel; label: string }[] = [];
  const scopes = ["hero", "ally-0", "ally-1", "ally-2", ...ENCOUNTER_MODELS.map(m => `enemy.${m}`)];
  for (const scope of scopes) drafts.set(scope, readAttributes(query, scope));
  return {
    update(hero: BodyModel, companions: readonly BodyModel[]) {
      rows = [{ scope: "hero", model: hero, label: "Hero" },
        ...companions.map((model, i) => ({ scope: `ally-${i}`, model, label: `Companion ${i + 1}` })),
        ...ENCOUNTER_MODELS.map(model => ({ scope: `enemy.${model}`, model, label: "Enemies" }))];
      editors.clear();
      holder.replaceChildren(...rows.map(row => {
        const section = document.createElement("section"), heading = document.createElement("h3");
        heading.textContent = `${row.label} · ${MODEL_DISPLAY[row.model].label}`;
        const editor = attributeEditor({ model: row.model, attributes: drafts.get(row.scope) }, {
          change: values => drafts.set(row.scope, values),
        });
        editors.set(row.scope, editor); section.append(heading, editor.element); return section;
      }));
    },
    read(): (participant: Participant) => AttributeOverrides {
      const snapshot = new Map(rows.map(row => [row.scope, editors.get(row.scope)!.read()]));
      return participant => snapshot.get(attributeScope(participant)) ?? Object.freeze({});
    },
    write(url: URL): void {
      const attributes = this.read();
      for (const scope of scopes) writeAttributes(url.searchParams, scope, {});
      for (const row of rows) writeAttributes(url.searchParams, row.scope, attributes({ id: row.scope, model: row.model, side: row.scope.startsWith("enemy.") ? "enemy" : "party" }));
    },
  };
}
