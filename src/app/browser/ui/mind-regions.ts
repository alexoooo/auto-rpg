import { editorRow as row, editorInput } from "./editor-inputs.ts";
import { buttonInput, selectInput } from "./inputs.ts";
import { isRegionMark, REGION_MARKS, type Region } from "../../../skills/framework/action.ts";

/**
 * **An editor of the regions a strike aims at** (`Region`), in order: each a mark of the target or
 * a segment by name, changed, removed, or added at the target's high mark; `write` takes the list
 * once changed.
 */
export function regionsEditor(regions: readonly Region[], write: (regions: readonly Region[]) => void, readOnly: boolean): HTMLElement {
  const root = document.createElement("div"); root.className = "mind-slot"; root.dataset.slot = "regions";
  const select = (label: string, values: readonly string[], value: string, changed: (value: string) => void) =>
    row(label, selectInput(values.map(value => ({ value, text: value })), value, changed, { disabled: readOnly }));
  const button = (label: string, run: () => void) => buttonInput(label, run, { title: label, ariaLabel: label, disabled: readOnly });
  const heading = document.createElement("span"); heading.className = "mind-slot-name"; heading.textContent = "Regions"; root.append(heading);
  regions.forEach((region, i) => {
    const replace = (next: Region) => write(regions.map((other, j) => j === i ? next : other));
    root.append(select("Region", [...REGION_MARKS, "segment"], region.kind === "mark" ? region.mark : "segment", value =>
      replace(isRegionMark(value) ? { kind: "mark", mark: value } : { kind: "segment", segment: "head" })));
    if (region.kind === "segment") root.append(row("Segment", editorInput(region.segment, segment => replace({ kind: "segment", segment }), { disabled: readOnly, numeric: false })));
    root.append(button(`Remove region ${i + 1}`, () => write(regions.filter((_, j) => j !== i))));
  });
  root.append(button("Add region", () => write([...regions, { kind: "mark", mark: "high" }])));
  return root;
}
