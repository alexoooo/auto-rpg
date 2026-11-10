import { HELD, heldName, loadoutKey, readLoadout, type Held, type Loadout } from "../../../core/bodies/items/held.ts";
import { modelHolds, type BodyModel } from "../../../core/bodies/models.ts";
import { MODEL_DISPLAY } from "../../../game/appearance/models.ts";
import { modelLoadout } from "../../../game/model-loadouts.ts";
import type { Participant } from "../../../game/dungeon/run.ts";

/** The party's slots, by participant id: the hero, then up to three companions. */
const SLOTS = ["hero", "ally-0", "ally-1", "ally-2"] as const;

/** The link's key for a slot's loadout: `<slot>.loadout=left,right` (`loadoutKey`). */
const linkKey = (slot: string): string => `${slot}.loadout`;

/**
 * **What each party member holds**, on the start panel, into `holder`: a row for the hero and each
 * companion, with a picker for each hand. A choice belongs to its slot and is kept when the
 * roster changes. A slot with no choice holds its model's loadout (`modelLoadout`). A body that
 * cannot hold anything holds nothing. The link carries each choice that differs from its model's.
 */
export function runLoadouts(holder: HTMLElement, search: string) {
  const query = new URLSearchParams(search), chosen = new Map<string, Loadout>();
  for (const slot of SLOTS) {
    const text = query.get(linkKey(slot)), linked = text === null ? undefined : readLoadout(text);
    if (linked) chosen.set(slot, linked);
  }
  let rows: { readonly slot: string; readonly model: BodyModel }[] = [];
  /** What `slot` holds as a body of `model`: the person's choice, else its model's; nothing where it cannot hold. */
  const loadoutOf = (slot: string, model: BodyModel): Loadout => !modelHolds(model) ? modelLoadout(model) : chosen.get(slot) ?? modelLoadout(model);
  return {
    /** Shows a row for `hero` and each of `companions`. */
    update(hero: BodyModel, companions: readonly BodyModel[]): void {
      rows = [{ slot: "hero", model: hero }, ...companions.map((model, i) => ({ slot: `ally-${i}`, model }))];
      holder.replaceChildren(...rows.map(({ slot, model }, i) => {
        const row = document.createElement("div"), name = document.createElement("span"), holds = modelHolds(model);
        row.className = "loadout-row";
        name.className = "loadout-who";
        name.textContent = `${i === 0 ? "Hero" : `Companion ${i}`} · ${MODEL_DISPLAY[model].label}`;
        row.append(name);
        for (const hand of ["left", "right"] as const) {
          const field = document.createElement("label"), picker = document.createElement("select");
          field.className = "field"; field.textContent = `${hand === "left" ? "Left" : "Right"} hand`;
          picker.setAttribute("aria-label", `${name.textContent}: ${hand} hand`);
          picker.append(...HELD.map((value) => Object.assign(document.createElement("option"), { value, textContent: heldName(value) })));
          picker.value = loadoutOf(slot, model)[hand];
          picker.disabled = !holds;
          picker.addEventListener("change", () => {
            picker.blur();
            chosen.set(slot, { ...loadoutOf(slot, model), [hand]: picker.value as Held });
          });
          field.append(picker); row.append(field);
        }
        return row;
      }));
    },
    /** What each participant holds: a party member's row's; none for an enemy, which holds its model's. */
    read(): (participant: Participant) => Loadout | null {
      const snapshot = new Map(rows.map(({ slot, model }) => [slot, loadoutOf(slot, model)] as const));
      return (participant) => participant.side === "party" ? snapshot.get(participant.id) ?? null : null;
    },
    /** `url` with each row's loadout, and none where it is its model's. */
    write(url: URL): void {
      for (const slot of SLOTS) url.searchParams.delete(linkKey(slot));
      for (const { slot, model } of rows) {
        const loadout = loadoutOf(slot, model), own = modelLoadout(model);
        if (loadout.left !== own.left || loadout.right !== own.right) url.searchParams.set(linkKey(slot), loadoutKey(loadout));
      }
    },
  };
}
