import type { BodySpec } from "../../core/spec/body.ts";
import type { LabAddress } from "../scenarios.ts";

/**
 * **The lab's HUD**: sections over the canvas, each a `<details>` of the screen's markup that the
 * shell and the scenario fill. A section closed stays closed in the next scenario.
 */

/** Every section, by the name its `data-section` carries. */
export const SECTIONS = ["scenario", "view", "character", "readout", "controls"] as const;
export type SectionName = (typeof SECTIONS)[number];

/** What the shell offers a section's controls. */
export interface LabPage {
  /** What the page shows now. */
  readonly shown: LabAddress;
  /** The loaded body's spec; until one is loaded, the spec `shown` makes. */
  readonly spec: BodySpec;
  /** Start the scenario on a new body in a new world, as `next` says. */
  load(next: LabAddress): void;
  /** Show the body under way as `next` says. */
  show(next: LabAddress): void;
}

/** Where the closed sections are kept. */
const STORED = "lab.sections";

/** The sections `text` says are closed, among `names`. */
export function collapsedFrom(text: string | null, names: readonly string[]): string[] {
  const stored = new Set((text ?? "").split(" "));
  return names.filter((name) => stored.has(name));
}

/** What `collapsedFrom` reads `collapsed` back from. */
export function collapsedText(collapsed: readonly string[]): string {
  return collapsed.join(" ");
}

/** The screen's sections by name, each closed if it was left so; storage is optional. */
export function labSections(root: ParentNode): Readonly<Record<SectionName, HTMLDetailsElement>> {
  const sections = Object.fromEntries(SECTIONS.map((name) => {
    const section = root.querySelector<HTMLDetailsElement>(`details[data-section="${name}"]`);
    if (!section) throw new Error(`missing the ${name} section`);
    return [name, section];
  })) as Record<SectionName, HTMLDetailsElement>;
  let stored: string | null = null;
  try { stored = localStorage.getItem(STORED); } catch { /* Left open. */ }
  for (const name of collapsedFrom(stored, SECTIONS)) sections[name as SectionName].open = false;
  for (const section of Object.values(sections)) {
    // A summary clicked gives the keys back to the page, as a button does.
    const summary = section.querySelector("summary");
    summary?.addEventListener("click", () => summary.blur());
    section.addEventListener("toggle", () => {
      const collapsed = SECTIONS.filter((name) => !sections[name].open);
      try { localStorage.setItem(STORED, collapsedText(collapsed)); } catch { /* Not kept. */ }
    });
  }
  return sections;
}
