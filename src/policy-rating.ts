export interface PolicyRating {
  rating: number;
  deviation: number;
  bouts: number;
  provisional: boolean;
  policyVersion?: string;
}
export interface RatingArtifact {
  version: number;
  fingerprint: string;
  evaluatedAt: string;
  rounds: number;
  policies: Record<string, PolicyRating>;
}
/** The league's row for a policy, or null for one it does not rate. */
const ratedRow = (name: string, artifact: RatingArtifact): PolicyRating | null => {
  const row = artifact.policies[name];
  return name === "idle" || !row || artifact.version !== 1 ? null : row;
};
export function policyRatingLabel(name: string, label: string, artifact: RatingArtifact): string {
  const row = ratedRow(name, artifact);
  if (!row) return `${label} — unrated`;
  return `${label} — ${Math.round(row.rating)} · ${artifact.evaluatedAt.slice(0, 10)}${row.provisional ? " (provisional)" : ""}`;
}
/** The rating alone, for a badge beside the picker; the date and the rest are `policyRatingNote`'s. */
export function policyRatingBadge(name: string, artifact: RatingArtifact): string {
  const row = ratedRow(name, artifact);
  if (!row) return "unrated";
  return `${Math.round(row.rating)}${row.provisional ? " provisional" : ""}`;
}
export function policyRatingNote(name: string, artifact: RatingArtifact, current: string, policyVersion = name): string {
  if (name === "idle") return "Idle is a diagnostic control, outside the rated league.";
  const row = artifact.policies[name];
  if (!row || artifact.version !== 1) return "Unrated: no completed cross-build league evaluation for this policy.";
  const changed = artifact.fingerprint !== current || (row.policyVersion ?? name) !== policyVersion;
  return `Last evaluated ${artifact.evaluatedAt.slice(0, 10)} · Cross-build Glicko-2 league · ${row.bouts} bouts · `
    + `rating deviation ${Math.round(row.deviation)}${row.provisional ? " · provisional" : ""}. `
    + "This is an overall policy rating, not a prediction for this particular build."
    + (changed ? " The game or policy has changed since this evaluation; the last measured rating is shown." : "");
}
