import { appearancesFor, wearsClothing } from "../../render/appearance.ts";
import { loadoutAttributes, strikesOf } from "../loadout.ts";
import { attributeEditor } from "../../ui/attribute-editor.ts";
import { LAB_HANDS, LAB_PRESETS, LAB_PROVIDES, LAB_WORN, MODELS } from "../scenarios.ts";
import { HELD as HOLDS, heldItem, type Held } from "../../core/items/held.ts";
import { choice, entries, fold, following, group, menu, switches, toggle, when, type Control, type Named } from "../../ui/controls.ts";
import { mindEditor } from "../../ui/mind-editor.ts";
import { writeMind } from "../../ui/mind-link.ts";
import type { LabPage } from "./sections.ts";

const HANDS: Readonly<Record<(typeof LAB_HANDS)[number], string>> = { right: "Right hand", left: "Left hand" };
const HELD = Object.fromEntries(HOLDS.map((held) => [held, { name: heldItem(held)?.name ?? "Empty" }])) as Named<Held>;
const WORN: Named<(typeof LAB_WORN)[number]> = {
  boots: { name: "Boots", title: "Appearance only" },
  armour: { name: "Armour", title: "Appearance only" },
};

/** The Lab's presets, in their order. */
const PRESET_IDS = Object.keys(LAB_PRESETS) as (keyof typeof LAB_PRESETS)[];

/** The preset whose tree `page` shows, or none once a person has changed a part of it. */
const presetOf = (page: LabPage): string => PRESET_IDS.find((id) => writeMind(LAB_PRESETS[id].config) === writeMind(page.shown.mind)) ?? "";

/**
 * The character, in the order each part depends on the last: its body, what the body holds and
 * wears, and the mind that drives them, its tree folded away until opened.
 */
export function characterSection(page: LabPage): readonly Control[] {
  const attributes = attributeEditor({ model: page.shown.model, attributes: loadoutAttributes(page.shown) }, {
    apply: values => page.load({ ...page.shown, attributes: values, balance: null, haste: null }),
  });
  let key = JSON.stringify([page.shown.model, loadoutAttributes(page.shown)]);
  const attributeControl: Control = { element: attributes.element, refresh() {
    const next = JSON.stringify([page.shown.model, loadoutAttributes(page.shown)]);
    if (next !== key) { key = next; attributes.set({ model: page.shown.model, attributes: loadoutAttributes(page.shown) }); }
  } };
  return [
    group("Body", [
      choice("Type", MODELS.map(({ id, name }) => ({ value: id, name })), () => page.shown.model, (model) => page.load({ ...page.shown, model, appearance: "default" })),
      when(() => appearancesFor(page.shown.model).length > 1,
        following(() => page.shown.model, model => menu("Appearance", appearancesFor(model).map(row => ({ value: row.id, name: row.name })),
          () => page.shown.appearance, appearance => page.show({ ...page.shown, appearance })))),
      attributeControl,
      toggle("Compliant soles", () => page.shown.sole, () => page.load({ ...page.shown, sole: !page.shown.sole })),
    ]),
    group("Items", [
      ...LAB_HANDS.map((hand) =>
        choice(HANDS[hand], entries(HOLDS, HELD), () => page.shown[hand], (held) => page.load({ ...page.shown, [hand]: held }))),
      when(() => wearsClothing(page.shown.model, page.shown.appearance),
        switches("Wears", entries(LAB_WORN, WORN), (part) => page.shown[part], (part) => page.show({ ...page.shown, [part]: !page.shown[part] }))),
    ]),
    group("Mind", [
      choice("Preset", PRESET_IDS.filter(id => page.shown.scenario === "attack" ? id !== "script" : id === "script" || id === "guard").map((id) => ({ value: id as string, name: LAB_PRESETS[id].label })), () => presetOf(page),
        (id) => page.load({ ...page.shown, mind: LAB_PRESETS[id as keyof typeof LAB_PRESETS].config })),
      // The strikes are the loaded body's; a hand whose strike is barred guards, whatever its mind asks.
      following(() => page.spec, (spec) => switches("Strikes",
        strikesOf(spec).map(({ held, name }) => ({ value: held, name })),
        (held) => !page.shown.barred.includes(held),
        (held) => page.load({ ...page.shown, barred: HOLDS.filter((h) => (h === held) !== page.shown.barred.includes(h)) }))),
      // Its tree, drawn again for each body loaded; a change loads a body under the mind changed.
      fold("Edit the mind", [following(() => page.spec, (spec) => {
        const editor = mindEditor(page.shown.mind, { spec, provides: page.shown.scenario === "attack" ? [] : LAB_PROVIDES, onFault: page.shown.scenario === "attack" ? "the Puncher preset is used" : "the Script preset is used",
          onChange: (mind) => page.load({ ...page.shown, mind }) });
        return { element: editor.element, refresh() {} };
      })]),
    ]),
  ];
}
