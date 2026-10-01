import { isBalance } from "../../core/rules/rulebook.ts";
import { balanceAddress, loadoutBalance } from "../loadout.ts";
import { LAB_HANDS, LAB_HELD, LAB_WORN, MODELS, type LabHeld } from "../scenarios.ts";
import { choice, entries, group, quantity, switches, type Control, type Named } from "./controls.ts";
import type { LabPage } from "./sections.ts";

const HANDS: Readonly<Record<(typeof LAB_HANDS)[number], string>> = { right: "Right hand", left: "Left hand" };
const HELD: Named<LabHeld> = { empty: { name: "Empty" }, club: { name: "Club" } };
const WORN: Named<(typeof LAB_WORN)[number]> = {
  boots: { name: "Boots", title: "Appearance only" },
  armour: { name: "Armour", title: "Appearance only" },
};

/** The character, in the order each part depends on the last: its body, then what the body holds and wears. */
export function characterSection(page: LabPage): readonly Control[] {
  return [
    group("Body", [
      choice("Type", MODELS.map(({ id, name }) => ({ value: id, name })), () => page.shown.model, (model) => page.load({ ...page.shown, model })),
      quantity("Balance", 1, isBalance, () => loadoutBalance(page.shown.balance, page.spec),
        (points) => page.load({ ...page.shown, balance: balanceAddress(points, page.spec) })),
    ]),
    group("Items", [
      ...LAB_HANDS.map((hand) =>
        choice(HANDS[hand], entries(LAB_HELD, HELD), () => page.shown[hand], (held) => page.load({ ...page.shown, [hand]: held }))),
      switches("Wears", entries(LAB_WORN, WORN), (part) => page.shown[part], (part) => page.show({ ...page.shown, [part]: !page.shown[part] })),
    ]),
  ];
}
