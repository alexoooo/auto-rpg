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
export function policyRatingLabel(name: string, label: string, artifact: RatingArtifact, current: string,
  policyVersion = name): string {
  const row = artifact.policies[name];
  if (name === "idle" || !row) return `${label} — unrated`;
  if (artifact.version !== 1 || artifact.fingerprint !== current || (row.policyVersion ?? name) !== policyVersion) return `${label} — needs evaluation`;
  return `${label} — ${Math.round(row.rating)}${row.provisional ? " (provisional)" : ""}`;
}
export function policyRatingNote(name: string, artifact: RatingArtifact, current: string, policyVersion = name): string {
  if (name === "idle") return "Idle is a diagnostic control, outside the rated league.";
  const row = artifact.policies[name];
  if (!row) return "Unrated: no completed cross-build league evaluation for this policy.";
  if (artifact.version !== 1 || artifact.fingerprint !== current || (row.policyVersion ?? name) !== policyVersion) return "The game has changed since this rating. A new evaluation is needed.";
  return `Cross-build Glicko-2 league · ${artifact.evaluatedAt.slice(0, 10)} · ${row.bouts} bouts · `
    + `rating deviation ${Math.round(row.deviation)}${row.provisional ? " · provisional" : ""}. `
    + "This is an overall policy rating, not a prediction for this particular build.";
}
