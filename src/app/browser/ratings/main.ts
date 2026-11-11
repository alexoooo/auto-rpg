/**
 * **The Ratings screen** (`?play=ratings`): each evaluation's results (`src/evaluation/results.ts`).
 * The address names what is shown: `&evaluation=`, then `&subject=` and `&protocol=` (a subject's
 * reading: its figures, and a drill's trials). Nothing is played here: a trial is watched in the
 * Arena, played again from its subject and condition as this build makes them (`reelHash`).
 */
import { reelHash } from "../arena/case-link.ts";
import { need as find } from "../dom.ts";
import { EVALUATIONS } from "../evaluation.ts";
import type { Evaluation, Json } from "../../../evaluation/evaluation.ts";
import { resultOf, type Outcome, type Result, type Results, type Standings } from "../../../evaluation/results.ts";
import type { Estimate } from "../../../evaluation/stats.ts";
import { sha256Text } from "../../../evaluation/sha256.ts";
import type { ScreenContext } from "../ui/screen.ts";
import { commonGround, conditionText, fieldText } from "./analysis.ts";
import { casesNow, hasResults, resultsOf, type CaseNow } from "./results.ts";

/** The groups evaluations are listed in, as the screen names them. */
const GROUPS: Readonly<Record<Evaluation["group"], string>> = Object.freeze({ fighters: "Fighters", skills: "Skills", decisions: "Decisions" });

/** What the address may name, in the order it is written. */
const PARAMS = ["evaluation", "protocol", "subject"] as const;
type Address = Partial<Record<typeof PARAMS[number], string>>;

/** The screen's address for `address`. */
function ratingsHref(address: Address): string {
  const query = new URLSearchParams({ play: "ratings" });
  for (const key of PARAMS) if (address[key] !== undefined) query.set(key, address[key]!);
  return `?${query}`;
}

type Child = Node | string | null | undefined | false;
/** An element of `tag` with `props` and `children`. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children.filter((child): child is Node | string => child !== null && child !== undefined && child !== false));
  return element;
}
const link = (href: string, text: string, title?: string) => el("a", { href, textContent: text, ...(title ? { title } : {}) });
/** A table of `head` over `rows`; a cell given as a number is right-aligned. */
function table(head: readonly string[], rows: readonly (readonly Child[])[], className = ""): HTMLTableElement {
  const cell = (tag: "td" | "th", value: Child) => {
    const node = el(tag, {}, value);
    if (typeof value === "string" && /^[-+]?[\d.]+( %)?$|^[\d.]+–[\d.]+$/.test(value)) node.className = "number";
    return node;
  };
  return el("table", { className }, el("thead", {}, el("tr", {}, ...head.map((text) => cell("th", text)))),
    el("tbody", {}, ...rows.map((row) => el("tr", {}, ...row.map((value) => cell("td", value))))));
}
const fixed = (value: number, digits = 0) => value.toFixed(digits);
const percent = (share: number) => `${(100 * share).toFixed(0)} %`;
const estimateText = (estimate: Estimate | undefined, digits = 3) => estimate === undefined ? "none" : `${estimate.value.toFixed(digits)} (${estimate.low.toFixed(digits)}–${estimate.high.toFixed(digits)})`;
/** Where and when a result or a contest's standings were read. */
const readText = (read: { readonly commit: string; readonly date: string }) => `${read.commit} ${read.date}`;

/** How many of a drill's passed trials its reel plays after the failures. */
const PASSES_SHOWN = 5;

export async function bootRatings(context: ScreenContext): Promise<void> {
  const need = <T extends HTMLElement>(id: string): T => find<T>(id, context.root);
  const body = need("ratings-body"), trail = need("ratings-trail");
  const query = new URLSearchParams(context.address.search);
  const address: Address = Object.fromEntries(PARAMS.flatMap((key) => query.has(key) ? [[key, query.get(key)!]] : []));
  const crumbs: Child[] = [link(ratingsHref({}), "Ratings")];
  const show = (...children: Child[]) => {
    trail.replaceChildren(...crumbs.flatMap((crumb, k): (Node | string)[] => !crumb ? [] : k ? [" › ", crumb] : [crumb]));
    body.replaceChildren(...children.filter((child): child is Node | string => !!child));
  };

  const evaluation = address.evaluation !== undefined && Object.hasOwn(EVALUATIONS, address.evaluation) ? EVALUATIONS[address.evaluation]! : null;
  if (!evaluation) {
    show(...(Object.keys(GROUPS) as Evaluation["group"][]).map((group) => {
      const members = Object.values(EVALUATIONS).filter((one) => one.group === group);
      return el("section", { className: "group" }, el("h2", { textContent: GROUPS[group] }),
        members.length === 0 ? el("p", { className: "note", textContent: "None yet." })
          : el("nav", { className: "cards" }, ...members.map((one) => el("a", { href: ratingsHref({ evaluation: one.id }) },
            el("strong", { textContent: one.title }), el("span", { textContent: one.question }), !hasResults(one.id) && el("small", { textContent: "No result yet" })))));
    }));
    return;
  }

  const id = evaluation.id;
  crumbs.push(link(ratingsHref({ evaluation: id }), evaluation.title));
  const results = await resultsOf(id);
  context.signal.throwIfAborted();
  const heading = el("header", { className: "evaluation" }, el("h2", { textContent: evaluation.title }), el("p", { textContent: evaluation.question }));
  // Each subject's newest reading on each protocol: an earlier one is kept only as a table baseline.
  const newest = results.results.filter((one) => resultOf(results, one.protocol, one.subject) === one);
  if (newest.length === 0 && results.standings.length === 0) {
    show(heading, el("p", { className: "note" }, "No result yet. ", el("code", { textContent: `npm run evaluate -- ${id} --write` }), " keeps one."));
    return;
  }
  if (address.subject !== undefined) {
    crumbs.push(el("span", { textContent: address.subject }));
    show(heading, subjectView(evaluation, results, newest.filter((one) => one.subject === address.subject), address.protocol ?? null));
    return;
  }
  show(heading, ...results.standings.map(contestView), newest.length > 0 && figuresView(evaluation, newest));
}

/** A contest's standings: each entrant's rating, and minds on common ground. */
function contestView(standings: Standings): HTMLElement {
  const ratings = table(["", "Entrant", "Rating", "95 %", "Bouts", "Won", "Drawn", "Lost", "Score", "Margin", "Stalemates"],
    standings.rows.map((one, k) => [String(k + 1), one.id, fixed(one.rating), `${fixed(one.low)}–${fixed(one.high)}`, String(one.bouts), String(one.wins), String(one.draws), String(one.losses),
      fixed(one.score, 3), fixed(one.margin, 3), percent(one.bouts ? one.stalemates / one.bouts : 0)]), "ratings");
  const ground = commonGround(standings.rows);
  const groundTable = ground.minds.length < 2 ? null : table(["", ...ground.minds],
    ground.cells.map((row, i) => [ground.minds[i]!, ...row.map((cell) => cell ? `${cell.difference > 0 ? "+" : ""}${fixed(cell.difference)} (${cell.kits})` : "")]), "ground");
  return el("section", { className: "contest" },
    el("h3", { textContent: `Ratings: ${standings.protocol}` }),
    el("p", { className: "note", textContent: `Bradley-Terry on the Elo scale over the ${standings.bouts} bouts of one run of every pair (${readText(standings)}; ${standings.harness}), the mean 1500, `
      + "with 95 % intervals from refits to the pairs resampled whole. Score: a win 1, a draw a half. Margin: own bar less the other's at the end. Stalemates: at the cap with both bars full." }),
    el("div", { className: "scroll" }, ratings),
    groundTable && el("h3", { textContent: "Minds on common ground" }),
    groundTable && el("p", { className: "note", textContent: "Each row mind's entrants' ratings less the column mind's, the mean over the kits (character and hands) both have, and how many kits; the rest are not averaged in." }),
    groundTable && el("div", { className: "scroll" }, groundTable));
}

/** Each subject's figures on each protocol it was read on. */
function figuresView(evaluation: Evaluation, newest: readonly Result[]): HTMLElement {
  const rows = [...newest].sort((a, b) => a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : a.protocol < b.protocol ? -1 : 1);
  // Only the figures some reading has: an evaluation of every protocol reads each on its own protocol alone.
  const shown = evaluation.figures.filter((figure) => rows.some((row) => row.figures[figure.name] !== undefined));
  return el("section", { className: "battery" }, el("h3", { textContent: "Figures" }),
    el("p", { className: "note", textContent: shown.map((figure) => `${figure.name}: ${figure.unit}, ${figure.better} is better`).join("; ") + ". 95 % intervals: Wilson for a rate, cases resampled for a mean or median." }),
    el("div", { className: "scroll" }, table(["Subject", "Protocol", "Cases", ...shown.map((figure) => figure.name), "Read"],
      rows.map((row) => [link(ratingsHref({ evaluation: evaluation.id, protocol: row.protocol, subject: row.subject }), row.subject), row.protocol, String(row.count),
        ...shown.map((figure) => estimateText(row.figures[figure.name])), readText(row)]), "figures")));
}

/** A subject: its reading on the protocol named (its first where none is), with its figures and, for a drill, its trials. */
function subjectView(evaluation: Evaluation, results: Results, mine: readonly Result[], protocol: string | null): HTMLElement {
  const section = el("section", { className: "subject" });
  const chosen = mine.find((one) => one.protocol === protocol) ?? mine[0];
  if (!chosen) { section.append(el("p", { className: "note", textContent: "No result names this subject." })); return section; }
  const here = (other: string) => ratingsHref({ evaluation: evaluation.id, protocol: other, subject: chosen.subject });
  section.append(el("h3", { textContent: chosen.label }));
  if (mine.length > 1) section.append(el("p", { className: "protocols" }, "Protocol: ", ...mine.flatMap((one, k) => [k ? " · " : "",
    one === chosen ? el("strong", { textContent: one.protocol }) : link(here(one.protocol), one.protocol)])));
  const shown = evaluation.figures.filter((figure) => chosen.figures[figure.name] !== undefined);
  section.append(el("p", { className: "note", textContent: `Protocol ${chosen.protocol}, ${chosen.count} cases read at commit ${readText(chosen)}; ${chosen.harness}.` }),
    el("div", { className: "scroll" }, table(["Figure", "Unit", "Better", "Value (95 %)"], shown.map((figure) => [figure.name, figure.unit, figure.better, estimateText(chosen.figures[figure.name])]), "figures")));
  if (chosen.trials && chosen.outcomes?.length) section.append(trialsView(evaluation, chosen, results.cases[chosen.cases!] ?? [], here(chosen.protocol)));
  return section;
}

/** The colours outcomes take: a pass the first, each failure label the next in the order labels are met. */
const OUTCOME_COLOURS = ["#7fb069", "#d9a441", "#c0604a", "#6c6672", "#8a6fb0", "#4f86a8", "#e04848", "#a8744f"];

/** A trial of a result: its condition's name, its outcome, and its case as this build makes it, or null where it makes none. */
interface Trial {
  readonly name: string;
  readonly outcome: Outcome;
  readonly now: CaseNow | null;
}

/**
 * A drill's trials (`Result.trials`, on the conditions `names`): the reel to play (every failed
 * trial, the rarest outcome's first and each outcome's in the order given, then a few passed ones,
 * chosen by their names' digests so that nobody picks what is shown), a reel of each outcome's
 * trials, and the strip, a square a trial coloured by its outcome, a row for each condition but its
 * last field, a column for each value of the last; a square plays the strip's trials in the Arena
 * from its own. Each returns to `here`. Only a bout plays in the Arena.
 */
function trialsView(evaluation: Evaluation, result: Result, names: readonly string[], here: string): HTMLElement {
  const section = el("section", { className: "trials" }, el("h4", { textContent: "Trials" }));
  const made = casesNow(evaluation, result.protocol, result.subject), cases = "fault" in made ? null : made;
  if (!cases) section.append(el("p", { className: "note", textContent: `This build makes none of its cases, so none is placed or played: ${(made as { fault: string }).fault}` }));
  const trials: Trial[] = result.trials!.flatMap((row, k) => row === null ? [] : [{ name: names[k]!, outcome: result.outcomes![row[1]!]!, now: cases?.get(names[k]!) ?? null }]);
  const faults = result.trials!.length - trials.length, placed = trials.filter((one) => one.now !== null);
  const playable = (list: readonly Trial[]) => list.filter((one) => one.now?.world.kind === "bout");
  /** Where `list` is watched: the Arena plays its bouts as a reel from the one at `at` of them; null where none is a bout. */
  const watch = (list: readonly Trial[], at = 0): string | null => list.length === 0 ? null
    : `?play=arena${reelHash({ evaluation: evaluation.id, protocol: result.protocol, subject: result.subject, cases: list.map((one) => one.name), at, auto: true, back: here })}`;

  const labels = new Map<string, { passed: boolean; count: number }>();
  for (const { outcome } of trials) {
    const seen = labels.get(outcome.label) ?? { passed: outcome.passed, count: 0 };
    seen.count++;
    labels.set(outcome.label, seen);
  }
  const ordered = [...labels].sort(([, a], [, b]) => Number(b.passed) - Number(a.passed));
  let failures = 0;
  const colour = new Map(ordered.map(([label, { passed }]) => [label, passed ? OUTCOME_COLOURS[0]! : OUTCOME_COLOURS[1 + failures++ % (OUTCOME_COLOURS.length - 1)]!]));

  const bouts = playable(trials), failed = bouts.filter((one) => !one.outcome.passed), rarity = (one: Trial) => labels.get(one.outcome.label)!.count;
  const passed = bouts.filter((one) => one.outcome.passed).map((one) => ({ one, order: sha256Text(one.name) })).sort((a, b) => a.order < b.order ? -1 : 1).slice(0, PASSES_SHOWN).map(({ one }) => one);
  const reel = [...failed.map((one, k) => ({ one, k })).sort((a, b) => rarity(a.one) - rarity(b.one) || a.k - b.k).map(({ one }) => one), ...passed], start = watch(reel);
  section.append(el("p", { className: "reel" },
    start ? link(start, `Play the reel: ${failed.length} failed trial${failed.length === 1 ? "" : "s"}, the rarest outcome first, then ${passed.length} passed`) : "No trial to play: the Arena plays bouts only."),
  el("p", { className: "legend" }, ...ordered.flatMap(([label, { count }]) => {
    const some = watch(playable(trials.filter((one) => one.outcome.label === label)));
    return [Object.assign(el("span", { className: "swatch" }), { style: `background: ${colour.get(label)}` }), " ",
      some ? link(some, `${label} ${count}`, `Play the trials ${label}`) : `${label} ${count}`, "   "];
  })));
  const apart = [faults > 0 && `${faults} ended in a fault`, cases && placed.length < trials.length && `${trials.length - placed.length} are on conditions this build does not make`].filter(Boolean);
  if (apart.length) section.append(el("p", { className: "note", textContent: `Not shown below: ${apart.join("; ")}.` }));

  const conditions = placed.map((one) => one.now!.condition as Record<string, Json>), keys = conditions[0] ? Object.keys(conditions[0]) : [];
  const last = keys.at(-1), cellOf = (condition: Record<string, Json>) => last === undefined ? "" : fieldText(condition[last]);
  const rowOf = (condition: Record<string, Json>) => keys.slice(0, -1).map((key) => `${key} ${fieldText(condition[key])}`).join(", ");
  const columns = [...new Set(conditions.map(cellOf))], rows = new Map<string, Map<string, Trial>>();
  placed.forEach((one, k) => {
    const row = rowOf(conditions[k]!);
    if (!rows.has(row)) rows.set(row, new Map());
    rows.get(row)!.set(cellOf(conditions[k]!), one);
  });
  // The strip's bouts as it shows them, row by row: what a square plays from its own.
  const strip = playable([...rows.values()].flatMap((cells) => columns.flatMap((column) => cells.get(column) ?? [])));
  const square = (one: Trial | undefined) => {
    if (!one) return el("td");
    const at = strip.indexOf(one), title = `${conditionText(one.now!.condition)}: ${one.outcome.label}`;
    const mark = at < 0 ? el("span", { className: "trial", title }) : el("a", { className: "trial", title, href: watch(strip, at)! });
    mark.style.background = colour.get(one.outcome.label)!;
    return el("td", {}, mark);
  };
  section.append(el("div", { className: "scroll" }, el("table", { className: "strip" },
    el("thead", {}, el("tr", {}, el("th", { textContent: last ?? "" }), ...columns.map((column) => el("th", { textContent: column })))),
    el("tbody", {}, ...[...rows].map(([row, cells]) => el("tr", {}, el("th", { textContent: row }), ...columns.map((column) => square(cells.get(column)))))))));
  return section;
}
