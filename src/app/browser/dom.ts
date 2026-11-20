export const SVG = "http://www.w3.org/2000/svg";

/** A decorative 24 × 24 icon, with its label supplied by the surrounding control or readout. */
export function svgIcon(path: string): SVGSVGElement {
  const icon = document.createElementNS(SVG, "svg"), shape = document.createElementNS(SVG, "path");
  icon.setAttribute("viewBox", "0 0 24 24"); icon.setAttribute("aria-hidden", "true");
  shape.setAttribute("d", path); icon.append(shape);
  return icon;
}

/** The element with id `id`, which the page's markup must hold. */
export function need<T extends HTMLElement>(id: string, root: ParentNode = document): T {
  const element = root.querySelector(`[id="${id}"]`);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
}
