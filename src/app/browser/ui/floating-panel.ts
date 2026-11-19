/**
 * **A panel that floats by its button**: `button` opens and closes `panel`, a popover, which lies
 * over the page and moves nothing in it. It opens under its button, or over it where it has no
 * room under, its middle on the button's, and stays inside the window. A click elsewhere or
 * Escape closes it. While it is open, Escape goes no further, and neither do Space and Enter on
 * its button, so a screen's own keys (a pause) do not act too. Its style sheet gives the panel
 * `position: fixed`, `inset: auto` and no margin. Returns what places it again, for a panel whose
 * size changes while it is open.
 */
export function floatingPanel(button: HTMLButtonElement, panel: HTMLElement, signal: AbortSignal): () => void {
  panel.popover = "auto"; button.popoverTargetElement = panel; button.setAttribute("aria-expanded", "false");
  const open = () => panel.matches(":popover-open");
  const place = () => {
    if (!open()) return;
    const box = button.getBoundingClientRect(), below = box.bottom + 6;
    panel.style.top = `${below + panel.offsetHeight <= innerHeight - 8 ? below : Math.max(8, box.top - panel.offsetHeight - 6)}px`;
    panel.style.left = `${Math.max(8, Math.min(box.left + (box.width - panel.offsetWidth) / 2, innerWidth - panel.offsetWidth - 8))}px`;
  };
  panel.addEventListener("toggle", () => { button.setAttribute("aria-expanded", String(open())); place(); }, { signal });
  window.addEventListener("resize", place, { signal });
  document.addEventListener("scroll", place, { signal, capture: true });
  button.addEventListener("keydown", event => { if (event.key === " " || event.key === "Enter") event.stopPropagation(); }, { signal });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && open()) event.stopPropagation(); }, { signal, capture: true });
  return place;
}
