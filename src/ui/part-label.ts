/** Anatomical identifiers become readable labels without losing their side. */
export function partLabel(name: string): string {
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[.\s_-]+/);
  const side = words.find(word => word === "left" || word === "right");
  const label = [...side ? [side] : [], ...words.filter(word => word !== side)].join(" ").replace("shank", "shin");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
