import type { Offered } from "../entrants/game.ts";
import type { TechniquePart } from "../core/recovery/ground/technique.ts";
import type { PartConfig } from "../core/parts/parts.ts";

/**
 * A list slot of techniques (`TechniquePart`) as a person ranks them: each technique `offered`,
 * chosen or not, with its declared transition edges, those the body cannot use disabled.
 */
export function techniqueEditor(chosen: readonly PartConfig[], offered: readonly Offered[], write: (techniques: readonly PartConfig[]) => void, readOnly: boolean): HTMLElement {
  const root = document.createElement("div"); root.className = "mind-slot";
  const title = document.createElement("strong"); title.textContent = "Recovery techniques, in preference order"; root.append(title);
  const kinds = chosen.map((technique) => technique.kind);
  const shown = [...kinds.flatMap((kind) => offered.filter((one) => one.kind === kind)), ...offered.filter((one) => !kinds.includes(one.kind))];
  for (const { kind, part, reason } of shown) {
    const technique = part as TechniquePart, index = kinds.indexOf(kind), line = document.createElement("div"), label = document.createElement("label");
    const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = index >= 0;
    enabled.disabled = readOnly || reason !== null;
    enabled.addEventListener("change", () => { enabled.blur(); write(enabled.checked ? [...chosen, technique.defaults] : chosen.filter((item) => item.kind !== kind)); });
    label.append(enabled, `${technique.label}${technique.stage === "experimental" ? " (experimental)" : ""}`); line.append(label);
    for (const [text, delta] of [["Up", -1], ["Down", 1]] as const) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = text;
      button.disabled = readOnly || index < 0 || index + delta < 0 || index + delta >= chosen.length;
      button.addEventListener("click", () => { button.blur(); const techniques = [...chosen];
        [techniques[index], techniques[index + delta]] = [techniques[index + delta]!, techniques[index]!]; write(techniques); });
      line.append(button);
    }
    const detail = document.createElement("small"); detail.textContent = reason === null
      ? technique.edges.map((edge) => `${edge.from} to ${edge.to}`).join(", ") : "This body cannot use this technique";
    line.append(detail); root.append(line);
  }
  return root;
}
