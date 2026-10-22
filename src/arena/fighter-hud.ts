import type { Combatant } from "../core/combatant.ts";
import { phaseLabels } from "../core/mind/catalog.ts";
import { actionFeed, damageReadout } from "./fighter-readout.ts";

const SVG = "http://www.w3.org/2000/svg";

/** Damage moves from a neutral body through amber to red, independently of side colours. */
function damageColour(remaining: number): string {
  const loss = 1 - remaining, neutral = [102, 121, 137], amber = [225, 161, 63], red = [220, 59, 61];
  const from = loss < .5 ? neutral : amber, to = loss < .5 ? amber : red, amount = loss < .5 ? loss * 2 : (loss - .5) * 2;
  return `rgb(${from.map((value, i) => Math.round(value + (to[i]! - value) * amount)).join(" ")})`;
}

/** One fighter's diagram and feed own DOM only; the Arena owns their sampling hook. */
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
  const history = actionFeed(), nodes = new Map<string, { path: SVGPathElement; text: HTMLLIElement; previous: string }>();
  const entries = new Map<string, HTMLLIElement>();
  let fighter: Combatant | null = null, reading: ReturnType<typeof damageReadout> | null = null;
  let selected: string | null = null, pinned: string | null = null, description = "";
  const reset = () => {
    fighter = null; reading = null; selected = null; pinned = null; description = "";
    history.reset(); nodes.clear(); entries.clear(); diagram.replaceChildren(); list.replaceChildren(); feed.replaceChildren();
    details.open = false; unavailable.hidden = true; caption.textContent = "No damage";
  };
  const describe = () => {
    const part = reading?.parts.find(part => part.name === (selected ?? pinned));
    const text = part ? `${part.label}: ${part.attached ? `${Math.round(part.remaining * 100)}% health` : "Severed"}` : description;
    if (caption.textContent !== text) caption.textContent = text;
  };
  return { element, reset,
    bind(next: Combatant): void {
      reset(); fighter = next; reading = damageReadout(next.built.spec, next.pool); history.label(phaseLabels(next.mind));
      unavailable.hidden = !!next.minded.skills;
      for (const [x, label] of [[9, "R"], [91, "L"]] as const) {
        const text = document.createElementNS(SVG, "text");
        text.setAttribute("x", String(x)); text.setAttribute("y", "11"); text.setAttribute("aria-hidden", "true"); text.textContent = label;
        diagram.append(text);
      }
      for (const part of reading.parts) {
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
    sample(time: number, actions = true): void {
      if (!fighter) return;
      reading!.sample(time);
      if (actions) history.sample(fighter.minded.skills?.report, fighter.body, time);
    },
    render(time: number): void {
      if (!reading) return;
      let damaged = 0, missing = 0;
      for (const part of reading.parts) {
        if (!part.attached) missing++; else if (part.remaining < 1) damaged++;
        const node = nodes.get(part.name)!, flash = part.flashUntil > time, signature = `${part.remaining}/${part.attached}/${flash}`;
        if (signature === node.previous) continue;
        node.previous = signature;
        const text = `${part.label}: ${part.attached ? `${Math.round(part.remaining * 100)}% health` : "Severed"}`;
        node.path.setAttribute("fill", damageColour(part.remaining)); node.path.setAttribute("aria-label", text);
        node.path.dataset.remaining = part.remaining.toFixed(4); node.path.dataset.attached = String(part.attached);
        node.path.classList.toggle("is-missing", !part.attached); node.path.classList.toggle("is-flashing", flash);
        node.text.textContent = text;
      }
      description = damaged || missing ? [damaged ? `${damaged} damaged` : "", missing ? `${missing} missing` : ""].filter(Boolean).join(" · ") : "No damage";
      describe();
      const visible = history.read(time), keys = new Set(visible.map(entry => entry.key));
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
