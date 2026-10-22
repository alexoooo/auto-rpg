import type { StandUpConfig } from "../core/mind/ground/stand-up.ts";
import { TECHNIQUES, type TechniqueName } from "../core/mind/ground/techniques.ts";
import type { BodySpec } from "../core/spec/body.ts";

/** The player's ranked contracts show availability and their declared transition edges. */
export function techniqueEditor(config: StandUpConfig, spec: BodySpec, write: (config: StandUpConfig) => void, readOnly: boolean): HTMLElement {
  const root = document.createElement("div"); root.className = "mind-slot";
  const title = document.createElement("strong"); title.textContent = "Recovery techniques, in preference order"; root.append(title);
  const names = [...config.techniques, ...(Object.keys(TECHNIQUES) as TechniqueName[]).filter(name => !config.techniques.includes(name))];
  for (const name of names) {
    const technique = TECHNIQUES[name]; if (!technique) continue;
    const index = config.techniques.indexOf(name), line = document.createElement("div"), label = document.createElement("label");
    const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = index >= 0;
    enabled.disabled = readOnly || !technique.fits(spec);
    enabled.addEventListener("change", () => { enabled.blur(); write({ ...config, techniques: enabled.checked ? [...config.techniques, name] : config.techniques.filter(item => item !== name) }); });
    label.append(enabled, `${technique.label}${technique.stage === "experimental" ? " (experimental)" : ""}`); line.append(label);
    for (const [text, delta] of [["Up", -1], ["Down", 1]] as const) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = text;
      button.disabled = readOnly || index < 0 || index + delta < 0 || index + delta >= config.techniques.length;
      button.addEventListener("click", () => { button.blur(); const techniques = [...config.techniques];
        [techniques[index], techniques[index + delta]] = [techniques[index + delta]!, techniques[index]!]; write({ ...config, techniques }); });
      line.append(button);
    }
    const detail = document.createElement("small"); detail.textContent = technique.fits(spec)
      ? technique.edges.map(edge => `${edge.from} to ${edge.to}`).join(", ") : "This body cannot use this technique";
    line.append(detail); root.append(line);
  }
  return root;
}
