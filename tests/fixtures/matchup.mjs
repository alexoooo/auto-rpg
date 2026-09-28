/**
 * A matchup with no golem in it, for the pure reducers in `src/bout.ts`.
 *
 * Those reducers read no registry, so the unit and policy ids are opaque strings. This was
 * `defaultMatchup` in `src/bout.ts`, the retired Warrior's opening; nothing on the page read it,
 * so it moved here in stage 0 of the core foundation. The page opens on `golemMatchup`.
 */
export function plainMatchup() {
  return {
    left: { unit: "plain-unit", policy: "idle", control: "you", handA: "sword", handB: "empty" },
    right: { unit: "plain-unit", policy: "idle", control: "mind", handA: "sword", handB: "empty" },
  };
}
