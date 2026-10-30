import { LOADOUTS } from "../../core/items/held.ts";
import { partOf } from "../../core/mind/catalog.ts";
import { offered } from "../../core/mind/controller.ts";
import { MINDS } from "../../core/mind/controllers.ts";
import { CONTEST_FIGURES, type BoutReading } from "../contest.ts";
import type { Evaluation, Json } from "../evaluation.ts";
import { wilson } from "../stats.ts";
import type { Entrant, TournamentCondition } from "../tournament/cases.ts";
import { entrantSubjects } from "../tournament/entrants.ts";
import { SKELETON_COMBAT_CASES } from "./cases.ts";

/** Arena minds outside the candidate: game minds, legacy ones included, and offered experiments. */
export const skeletonOpponents = (): readonly string[] => Object.entries(MINDS)
  .filter(([, preset]) => preset.config.kind !== "option-skeleton" && (partOf(preset.config).stage === "game" || offered(preset)))
  .map(([id]) => id);

/** The unarmed Skeleton against the explicit Arena field, with strict wins reported per opponent. */
export const SKELETON_COMBAT: Evaluation<TournamentCondition, BoutReading> = {
  id: "skeleton-combat", title: "The Skeleton's combat field", group: "fighters",
  question: "Does the empty-handed Skeleton beat each existing Arena entrant, including every legal armed loadout?",
  protocols: SKELETON_COMBAT_CASES, defaultProtocol: "standard", schedule: "versus",
  analysis: { get panel() { return skeletonOpponents(); } },
  subjects: (choice) => entrantSubjects(choice, { loadouts: LOADOUTS }),
  figures: CONTEST_FIGURES,
  summary({ subjects, cases }) {
    const candidates = subjects.filter((subject) => ((subject.value as unknown as Entrant).mind as { readonly kind?: string }).kind === "option-skeleton");
    const rows = candidates.flatMap((subject) => subjects.filter((foe) => foe.id !== subject.id).map((foe) => {
      const bouts = cases.filter((one) => one.subjects.includes(subject.id) && one.subjects.includes(foe.id));
      let won = 0, drawn = 0, margin = 0;
      for (const bout of bouts) {
        const side = bout.subjects[0] === subject.id ? "left" : "right";
        if (bout.reading.winner === side) won++;
        else if (bout.reading.winner === null) drawn++;
        margin += side === "left" ? bout.reading.margin : -bout.reading.margin;
      }
      return { subject: subject.id, foe: foe.id, bouts: bouts.length, won, drawn, lost: bouts.length - won - drawn,
        win: wilson(won, bouts.length), margin: bouts.length ? margin / bouts.length : null };
    })).sort((a, b) => (a.win?.value ?? -1) - (b.win?.value ?? -1) || (a.margin ?? -1) - (b.margin ?? -1));
    return {
      lines: ["Strict wins per opponent; draws are separate. Each interval is that row's Wilson 95% interval.", "",
        "| Subject | Opponent | Bouts | Won | Drawn | Lost | Win rate | 95% | Mean life margin |",
        "|---|---|---|---|---|---|---|---|---|",
        ...rows.map((row) => `| ${row.subject} | ${row.foe} | ${row.bouts} | ${row.won} | ${row.drawn} | ${row.lost} | ${row.win?.value.toFixed(3) ?? "unplayed"} | ${row.win ? `${row.win.low.toFixed(3)} to ${row.win.high.toFixed(3)}` : ""} | ${row.margin?.toFixed(3) ?? ""} |`)],
      json: rows as unknown as Json,
    };
  },
};
