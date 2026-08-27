/** Exact persisted shape of the five tournament safety observations. */
export const TOURNAMENT_SAFETY_NAMES = Object.freeze([
  "finiteAnatomical", "capabilities", "postVerdict", "stuckActions", "lifecycle",
] as const);

export type TournamentSafety = Readonly<Record<(typeof TOURNAMENT_SAFETY_NAMES)[number], boolean>>;
