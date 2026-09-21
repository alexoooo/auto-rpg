/** Specialists and broad upgrades are distinct claims; neither is inferred from parameter distance. */
export function behaviorCell({ attackRate, retreatFraction, nearFraction }) {
  if (![attackRate, retreatFraction, nearFraction].every(Number.isFinite)) throw new Error("missing behavior measurements");
  return [attackRate < 0.4 ? "slow" : attackRate < 0.9 ? "medium" : "fast",
    retreatFraction < 0.2 ? "forward" : retreatFraction < 0.5 ? "mixed" : "retreat",
    nearFraction < 0.3 ? "far" : nearFraction < 0.7 ? "mixed" : "near"].join("/");
}
export function updateArchive(archive, entry) {
  if (entry.split !== "selection" || !Number.isFinite(entry.score) || !entry.bouts) throw new Error("archive needs measured selection outcomes");
  const cell = behaviorCell(entry.behavior), prior = archive[cell];
  if (!prior || entry.score > prior.score) archive[cell] = structuredClone(entry);
  return archive;
}
