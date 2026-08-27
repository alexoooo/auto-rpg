/** The shipped specialist for a research cell, shared by page and bench callers. */
export function specialistPolicyName(job: { readonly unit: string; readonly loadout: string }): string {
  return job.unit === "centipede" ? "crawler" : job.loadout === "bow+empty" ? "archer" : "duelist";
}
