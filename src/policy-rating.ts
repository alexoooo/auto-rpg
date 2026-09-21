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
export function policyRatingLabel(name: string, label: string, artifact: RatingArtifact): string {
  const row = artifact.policies[name];
  if (name === "idle" || !row || artifact.version !== 1) return `${label} — unrated`;
  return `${label} — ${Math.round(row.rating)} · ${artifact.evaluatedAt.slice(0, 10)}${row.provisional ? " (provisional)" : ""}`;
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
