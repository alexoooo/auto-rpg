import { appearancesFor, wearsClothing } from "../../render/appearance.ts";
import { isBalance } from "../../core/rules/rulebook.ts";
import { balanceAddress, loadoutBalance, strikesOf } from "../loadout.ts";
import { LAB_DOWN, LAB_MINDS } from "../minds.ts";
import { LAB_DOWN_IDS, LAB_HANDS, LAB_MIND_IDS, LAB_WORN, MODELS } from "../scenarios.ts";
import { HELD as HOLDS, type Held } from "../../core/items/held.ts";
import { choice, entries, following, group, quantity, switches, when, type Control, type Named } from "../../ui/controls.ts";
import type { LabPage } from "./sections.ts";

const HANDS: Readonly<Record<(typeof LAB_HANDS)[number], string>> = { right: "Right hand", left: "Left hand" };
const HELD: Named<Held> = { empty: { name: "Empty" }, club: { name: "Club" } };
const WORN: Named<(typeof LAB_WORN)[number]> = {
  boots: { name: "Boots", title: "Appearance only" },
  armour: { name: "Armour", title: "Appearance only" },
};

/** What a press moves the balance by, per cent of the body's weight. */
const BALANCE_STEP = 5;

/** The character, in the order each part depends on the last: its body, what the body holds and wears, and the mind that drives them. */
export function characterSection(page: LabPage): readonly Control[] {
  return [
    group("Body", [
      choice("Type", MODELS.map(({ id, name }) => ({ value: id, name })), () => page.shown.model, (model) => page.load({ ...page.shown, model, appearance: "default" })),
      when(() => appearancesFor(page.shown.model).length > 1,
        following(() => page.shown.model, model => choice("Appearance", appearancesFor(model).map(row => ({ value: row.id, name: row.name })),
          () => page.shown.appearance, appearance => page.show({ ...page.shown, appearance })))),
      quantity("Balance, %", BALANCE_STEP, isBalance, () => loadoutBalance(page.shown.balance, page.spec),
        (balance) => page.load({ ...page.shown, balance: balanceAddress(balance, page.spec) })),
    ]),
    group("Items", [
      ...LAB_HANDS.map((hand) =>
        choice(HANDS[hand], entries(HOLDS, HELD), () => page.shown[hand], (held) => page.load({ ...page.shown, [hand]: held }))),
      when(() => wearsClothing(page.shown.model, page.shown.appearance),
        switches("Wears", entries(LAB_WORN, WORN), (part) => page.shown[part], (part) => page.show({ ...page.shown, [part]: !page.shown[part] }))),
    ]),
    group("Mind", [
      choice("Type", LAB_MIND_IDS.map((id) => ({ value: id, name: LAB_MINDS[id].name })), () => page.shown.mind, (mind) => page.load({ ...page.shown, mind })),
      choice("Down", LAB_DOWN_IDS.map((id) => ({ value: id, name: LAB_DOWN[id].name })), () => page.shown.down, (down) => page.load({ ...page.shown, down })),
      // The strikes are the loaded body's, offered to a mind that may throw one.
      when(() => LAB_MINDS[page.shown.mind].strikes, following(() => page.spec, (spec) => switches("Actions",
        strikesOf(spec).map(({ held, name }) => ({ value: held, name })),
        (held) => !page.shown.barred.includes(held),
        (held) => page.load({ ...page.shown, barred: HOLDS.filter((h) => (h === held) !== page.shown.barred.includes(h)) })))),
    ]),
  ];
}
