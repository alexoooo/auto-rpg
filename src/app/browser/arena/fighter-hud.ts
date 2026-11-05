import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { damageDiagram, type FighterReading } from "../../../game/arena/fighter-readout.ts";

const SVG = "http://www.w3.org/2000/svg";

/** Damage moves from a neutral body through amber to red, independently of side colours. */
function damageColour(remaining: number): string {
  const loss = 1 - remaining, neutral = [102, 121, 137], amber = [225, 161, 63], red = [220, 59, 61];
  const from = loss < .5 ? neutral : amber, to = loss < .5 ? amber : red, amount = loss < .5 ? loss * 2 : (loss - .5) * 2;
  return `rgb(${from.map((value, i) => Math.round(value + (to[i]! - value) * amount)).join(" ")})`;
}

/** What a part's line says: off, its limb crippled, or what is left of its limb's bar or of the body's life. */
function partText(label: string, part: FighterReading["parts"][number]): string {
  return `${label}: ${!part.attached ? "severed" : part.crippled ? "crippled" : `${Math.round(part.remaining * 100)}% ${part.limb === null ? "life" : "limb"}`}`;
}

/** One fighter's diagram and feed own DOM only: what they show is read where the bout steps (`fighterReading`). */
export function fighterHud(side: string) {
  const element = document.createElement("section"), damage = document.createElement("div"), feed = document.createElement("ol");
  const diagram = document.createElementNS(SVG, "svg"), caption = document.createElement("output");
  const details = document.createElement("details"), summary = document.createElement("summary"), list = document.createElement("ul");
  const unavailable = document.createElement("small");
  element.className = "fighter-readout"; element.setAttribute("aria-label", `${side} fighter condition and actions`);
  damage.className = "fighter-damage"; diagram.classList.add("damage-diagram");
  diagram.setAttribute("viewBox", "0 0 100 204"); diagram.setAttribute("role", "group"); diagram.setAttribute("aria-label", `${side} fighter body damage`);
  caption.className = "damage-caption"; caption.textContent = "No damage";
  details.className = "damage-details"; summary.textContent = "Damage details"; details.append(summary, list);
  feed.className = "fighter-feed"; feed.setAttribute("aria-label", `${side} fighter recent actions`); feed.setAttribute("aria-live", "off");
  unavailable.className = "feed-unavailable"; unavailable.textContent = "Action reporting unavailable"; unavailable.hidden = true;
  damage.append(diagram, caption, details); element.append(damage, feed, unavailable);
  for (const type of ["pointerdown", "pointermove", "wheel"]) element.addEventListener(type, event => event.stopPropagation());
  element.addEventListener("keydown", event => { if (event.key !== "Escape") event.stopPropagation(); });
  summary.addEventListener("click", () => summary.blur());
  const nodes = new Map<string, { path: SVGPathElement; text: HTMLLIElement; previous: string }>();
  const entries = new Map<string, HTMLLIElement>();
  let parts: readonly { readonly name: string; readonly label: string; readonly path: string }[] | null = null, reading: FighterReading | null = null;
  let selected: string | null = null, pinned: string | null = null, description = "";
  const reset = () => {
    parts = null; reading = null; selected = null; pinned = null; description = "";
    nodes.clear(); entries.clear(); diagram.replaceChildren(); list.replaceChildren(); feed.replaceChildren();
    details.open = false; unavailable.hidden = true; caption.textContent = "No damage";
  };
  const labelOf = (name: string) => parts?.find(part => part.name === name)?.label ?? name;
  const describe = () => {
    const part = reading?.parts.find(part => part.name === (selected ?? pinned));
    const text = part ? partText(labelOf(part.name), part) : description;
    if (caption.textContent !== text) caption.textContent = text;
  };
  return { element, reset,
    /** Draw `spec`'s diagram, every part whole. */
    bind(spec: BodySpec): void {
      reset(); parts = damageDiagram(spec);
      for (const [x, label] of [[9, "R"], [91, "L"]] as const) {
        const text = document.createElementNS(SVG, "text");
        text.setAttribute("x", String(x)); text.setAttribute("y", "11"); text.setAttribute("aria-hidden", "true"); text.textContent = label;
        diagram.append(text);
      }
      for (const part of parts) {
        const path = document.createElementNS(SVG, "path"), text = document.createElement("li");
        path.setAttribute("d", part.path); path.dataset.part = part.name;
        path.setAttribute("tabindex", "0"); path.setAttribute("role", "button");
        const show = () => { selected = part.name; describe(); };
        path.addEventListener("pointerenter", show); path.addEventListener("focus", show);
        path.addEventListener("pointerleave", () => { selected = null; describe(); });
        path.addEventListener("blur", () => { selected = null; describe(); });
        const pin = () => { pinned = pinned === part.name ? null : part.name; selected = null; path.blur(); describe(); };
        path.addEventListener("click", pin);
        path.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pin(); } });
        diagram.append(path); list.append(text); nodes.set(part.name, { path, text, previous: "" });
      }
    },
    /** Show `next`, read at `time`, the bout's s. */
    render(next: FighterReading, time: number): void {
      if (!parts) return;
      reading = next;
      unavailable.hidden = next.reports;
      const crippled = new Set<string>(), severed = new Set<string>();
      let wounded = false;
      for (const part of reading.parts) {
        if (part.limb !== null && !part.attached) severed.add(part.limb); else if (part.limb !== null && part.crippled) crippled.add(part.limb);
        wounded ||= part.remaining < 1;
        const node = nodes.get(part.name)!, flash = part.flashUntil > time, signature = `${part.remaining}/${part.attached}/${part.crippled}/${flash}`;
        if (signature === node.previous) continue;
        node.previous = signature;
        const text = partText(labelOf(part.name), part);
        node.path.setAttribute("fill", damageColour(part.remaining)); node.path.setAttribute("aria-label", text);
        node.path.dataset.remaining = part.remaining.toFixed(4); node.path.dataset.attached = String(part.attached);
        node.path.classList.toggle("is-missing", !part.attached); node.path.classList.toggle("is-crippled", part.attached && part.crippled);
        node.path.classList.toggle("is-flashing", flash);
        node.text.textContent = text;
      }
      for (const limb of severed) crippled.delete(limb);
      description = crippled.size || severed.size
        ? [crippled.size ? `${crippled.size} crippled` : "", severed.size ? `${severed.size} severed` : ""].filter(Boolean).join(" · ")
        : wounded ? "Wounded" : "No damage";
      describe();
      const visible = next.feed, keys = new Set(visible.map(entry => entry.key));
      for (const [key, node] of entries) if (!keys.has(key)) { node.remove(); entries.delete(key); }
      visible.forEach((entry, i) => {
        let node = entries.get(entry.key);
        if (!node) { node = document.createElement("li"); node.dataset.kind = entry.kind; node.dataset.key = entry.key; entries.set(entry.key, node); }
        const text = `${entry.label}${entry.detail ? ` — ${entry.detail}` : ""}`;
        if (node.textContent !== text) node.textContent = text;
        const opacity = String(Number(entry.opacity.toFixed(3)));
        if (node.style.opacity !== opacity) node.style.opacity = opacity;
        if (feed.children[i] !== node) feed.insertBefore(node, feed.children[i] ?? null);
      });
    },
  };
}
