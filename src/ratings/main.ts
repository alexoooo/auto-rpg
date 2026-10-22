/**
 * **The Ratings screen** (`?play=ratings`): each evaluation's records as their task's units. The
 * address names what is shown: `&evaluation=`, `&pool=` (the newest unless named), `&subject=` and
 * `&version=` (a subject's history and cases), `&by=` (a battery's condition field), `&case=` (one
 * case). Everything is derived from the records in the page (`analysis.ts`); nothing is played here.
 */
import { caseHash } from "../arena/case-link.ts";
import { need as find } from "../dom.ts";
import { EVALUATIONS } from "../evaluation/evaluations.ts";
import type { Evaluation, Json } from "../evaluation/evaluation.ts";
import { poolsOf, versionsOf, type Kept, type NamedVersion, type Pool, type PoolCase } from "../evaluation/history.ts";
import type { Estimate } from "../evaluation/stats.ts";
import { sha256Text } from "../evaluation/sha256.ts";
import type { ScreenContext } from "../ui/screen.ts";
import { batteryRows, casesBy, commonGround, conditionFields, entrantParts, fieldText, findCase, historyOf, isContest, matchupGrid, standingsOf, type Standing } from "./analysis.ts";
import { recordNames, recordsOf } from "./records.ts";

/** The groups evaluations are listed in, as the screen names them. */
const GROUPS: Readonly<Record<Evaluation["group"], string>> = Object.freeze({ fighters: "Fighters", skills: "Skills", decisions: "Decisions" });

/** What the address may name, in the order it is written. */
const PARAMS = ["evaluation", "pool", "subject", "version", "by", "case"] as const;
type Address = Partial<Record<typeof PARAMS[number], string>>;

/** The screen's address for `address`. */
function ratingsHref(address: Address): string {
  const query = new URLSearchParams({ play: "ratings" });
  for (const key of PARAMS) if (address[key] !== undefined) query.set(key, address[key]!);
  return `?${query}`;
}

/** A pool's name in the address: the start of its key's digest. */
const poolId = (pool: Pool): string => sha256Text(pool.key).slice(0, 8);

/** Contest standings by pool key, with intervals: seconds to fit, kept for the tab. */
const rated = new Map<string, Standing[]>();

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
const estimateText = (estimate: Estimate | null, digits = 3) => estimate === null ? "none" : `${estimate.value.toFixed(digits)} (${estimate.low.toFixed(digits)}–${estimate.high.toFixed(digits)})`;
/**
 * Where a case is watched: a bout case opens in the Arena, returning to `back`; an imported case
 * has no world and is not opened.
 */
const watchHref = (line: Kept["lines"][number], record: Kept, back: string): string | null =>
  line.world?.kind === "bout" ? `?play=arena${caseHash(line.world, { commit: record.header.commit, back })}` : null;

/** A record's name as a short label: its date and commit. */
const recordLabel = (name: string) => name.replace(/\.jsonl$/, "").split("-").slice(0, 4).join("-");

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
          : el("nav", { className: "cards" }, ...members.map((one) => {
            const names = recordNames(one.id);
            return el("a", { href: ratingsHref({ evaluation: one.id }) }, el("strong", { textContent: one.title }), el("span", { textContent: one.question }),
              el("small", { textContent: names.length ? `${names.length} record${names.length > 1 ? "s" : ""}, the newest ${recordLabel(names.at(-1)!)}` : "No record yet" }));
          })));
    }));
    return;
  }

  const id = evaluation.id;
  crumbs.push(link(ratingsHref({ evaluation: id }), evaluation.title));
  const records = await recordsOf(id);
  context.signal.throwIfAborted();
  const heading = el("header", { className: "evaluation" }, el("h2", { textContent: evaluation.title }), el("p", { textContent: evaluation.question }));
  if (records.length === 0) {
    show(heading, el("p", { className: "note" }, "No record yet. ", el("code", { textContent: `npm run evaluate -- ${id} --write` }), " keeps one."));
    return;
  }
  const pools = poolsOf(records), versions = versionsOf(records);
  const newestPool = pools.find((one) => one.records.includes(records.at(-1)!))!;
  const pool = pools.find((one) => poolId(one) === address.pool) ?? newestPool;
  const here = (more: Address): string => ratingsHref({ evaluation: id, ...(pool !== newestPool ? { pool: poolId(pool) } : {}), ...more });
  const labelOf = (name: string) => versions.get(name)?.label ?? name;
  const contest = isContest(evaluation, pool);

  if (address.case !== undefined) {
    crumbs.push(el("span", { textContent: `case ${address.case.slice(0, 12)}` }));
    show(heading, caseView(findCase(records, address.case), versions, evaluation.figures, context.address.search));
    return;
  }

  const poolList = poolsView(pools, pool, newestPool, (one) => ratingsHref({ evaluation: id, ...(one !== newestPool ? { pool: poolId(one) } : {}), ...(address.subject ? { subject: address.subject } : {}) }));
  if (address.subject !== undefined) {
    const subject = address.subject;
    crumbs.push(el("span", { textContent: subject }));
    const history = historyOf(evaluation, subject, pools, versions);
    const chosen = history.find((row) => row.version.subject.version.version === address.version)?.version
      ?? versions.get(pool.newest.get(subject) ?? "") ?? history.at(-1)?.version ?? null;
    show(heading, poolList, subjectView(subject, history, pools, chosen, pool, contest, evaluation.figures, here, labelOf, context.address.search));
    return;
  }

  if (contest) {
    let standings = rated.get(pool.key);
    if (!standings) {
      const count = new Set(pool.cases.flatMap(({ subjects }) => subjects)).size;
      standings = await context.loading(`Rating ${count} versions over ${pool.cases.length} bouts`, async () => standingsOf(pool, { intervals: true }));
      context.signal.throwIfAborted();
      rated.set(pool.key, standings);
    }
    show(heading, poolList, contestView(pool, standings, here, labelOf));
  } else show(heading, poolList, batteryView(evaluation, pool, address.by ?? null, here, labelOf));
}

/** The evaluation's pools, the one shown marked, each older one with what differs from the newest. */
function poolsView(pools: readonly Pool[], shown: Pool, newest: Pool, href: (pool: Pool) => string): HTMLElement {
  const describe = (pool: Pool) => {
    const header = pool.records[0]!.header, differs = [pool.protocol !== newest.protocol && "protocol", pool.environment !== newest.environment && "environment"].filter(Boolean);
    return `${pool.records.length} record${pool.records.length > 1 ? "s" : ""} (${pool.records.map(({ name }) => recordLabel(name)).join(", ")}); protocol ${pool.protocol}, ${header.harness}`
      + (pool === newest ? "; the newest" : `; older: its ${differs.join(" and ")} differs from the newest`);
  };
  return el("section", { className: "pools" }, el("h3", { textContent: pools.length > 1 ? "Pools" : "Pool" }),
    el("ul", {}, ...pools.map((pool) => el("li", { className: pool === shown ? "shown" : "" },
      pool === shown ? el("strong", { textContent: poolId(pool) }) : link(href(pool), poolId(pool)), ` ${describe(pool)}`))),
    el("p", { className: "note", textContent: "Versions in one pool share a protocol and code and are compared directly; no strength is carried across pools." }));
}

/** A contest pool: each version's rating, minds on common ground, the matchup grid. */
function contestView(pool: Pool, standings: readonly Standing[], here: (address: Address) => string, labelOf: (name: string) => string): HTMLElement {
  const imported = pool.records.every(({ header }) => header.imported !== undefined);
  const ratings = table(["", "Subject", "Version", "Rating", "95 %", "Bouts", "Won", "Drawn", "Lost", "Score", "Margin", "Stalemates", "Last record"],
    standings.map((one, k) => [String(k + 1), link(here({ subject: one.id }), one.id), labelOf(one.name).slice(one.id.length + 1) + (one.newest ? "" : " (older)"),
      fixed(one.rating), one.interval ? `${fixed(one.interval[0])}–${fixed(one.interval[1])}` : "", String(one.bouts), String(one.wins), String(one.draws), String(one.losses),
      fixed(one.score, 3), fixed(one.margin, 3), percent(one.bouts ? one.stalemates / one.bouts : 0), recordLabel(one.last)]), "ratings");
  const ground = commonGround(standings);
  const groundTable = ground.minds.length < 2 ? null : table(["", ...ground.minds],
    ground.cells.map((row, i) => [ground.minds[i]!, ...row.map((cell) => cell ? `${cell.difference > 0 ? "+" : ""}${fixed(cell.difference)} (${cell.kits})` : "")]), "ground");
  const grid = el("details", { className: "grid" }, el("summary", { textContent: "The matchup grid" }));
  grid.addEventListener("toggle", () => {
    if (!grid.open || grid.querySelector("table")) return;
    const names = standings.filter((one) => one.newest).map((one) => one.name), scores = matchupGrid(pool, names);
    const head = el("tr", {}, el("th"), ...names.map((name, j) => el("th", { textContent: String(j + 1), title: labelOf(name) })));
    const rows = names.map((name, i) => el("tr", {}, el("th", { textContent: `${i + 1} ${name.slice(0, name.lastIndexOf(" "))}` }), ...scores[i]!.map((score, j) => {
      const cell = el("td", { title: `${labelOf(name)} against ${labelOf(names[j]!)}: ${score === null ? "did not meet" : `mean score ${score.toFixed(2)}`}` });
      if (score !== null) cell.style.setProperty("--score", String(score));
      return cell;
    })));
    grid.append(el("p", { className: "note", textContent: "Each row's mean score against each column, from the row's side: brighter is better, dark red worse; blank where they did not meet." }),
      el("div", { className: "scroll" }, el("table", {}, el("thead", {}, head), el("tbody", {}, ...rows))));
  });
  return el("section", { className: "contest" },
    el("h3", { textContent: "Ratings" }),
    el("p", { className: "note", textContent: `Bradley-Terry on the Elo scale over the pool's ${pool.cases.length} distinct bouts, the mean 1500, with 95 % intervals from refits to the pairs resampled whole. `
      + `Score: a win 1, a draw a half. Margin: own bar less the other's at the end. Stalemates: at the cap with both bars full.${imported ? " Its cases are an imported run's: they have no world and are not opened." : ""}` }),
    el("div", { className: "scroll" }, ratings),
    groundTable && el("h3", { textContent: "Minds on common ground" }),
    groundTable && el("p", { className: "note", textContent: "Each row mind's entrants' ratings less the column mind's, the mean over the kits (character and hands) both have, and how many kits; the rest are not averaged in." }),
    groundTable && el("div", { className: "scroll" }, groundTable),
    grid);
}

/** A battery pool: each figure by version, and by one condition field where the address names it. */
function batteryView(evaluation: Evaluation, pool: Pool, by: string | null, here: (address: Address) => string, labelOf: (name: string) => string): HTMLElement {
  const fields = conditionFields(pool), field = by !== null && fields.includes(by) ? by : null;
  const rows = batteryRows(evaluation, pool, field);
  const choose = el("p", { className: "by" }, "By: ", ...[null, ...fields].flatMap((one, k) => [k ? " · " : "",
    one === field ? el("strong", { textContent: one ?? "subject" }) : link(here(one === null ? {} : { by: one }), one ?? "subject")]));
  return el("section", { className: "battery" }, el("h3", { textContent: "Figures" }), choose,
    el("p", { className: "note", textContent: evaluation.figures.map((figure) => `${figure.name}: ${figure.unit}, ${figure.better} is better`).join("; ") + ". 95 % intervals: Wilson for a rate, cases resampled for a mean or median." }),
    el("div", { className: "scroll" }, table(["Subject", "Version", ...(field ? [field] : []), "Cases", ...evaluation.figures.map((figure) => figure.name), "Last record"],
      rows.map((row) => {
        const id = row.name.includes(" ") ? row.name.slice(0, row.name.lastIndexOf(" ")) : row.name;
        return [link(here({ subject: id }), id), labelOf(row.name).slice(id.length + 1), ...(field ? [row.value ?? ""] : []), String(row.cases),
          ...row.figures.map((estimate) => estimateText(estimate)), recordLabel(row.last)];
      }), "figures")));
}

/** A subject: each version in its history with its parent and standing, and the chosen version's cases in the pool shown. */
function subjectView(id: string, history: ReturnType<typeof historyOf>, pools: readonly Pool[], chosen: NamedVersion | null, pool: Pool, contest: boolean,
  figures: Evaluation["figures"], here: (address: Address) => string, labelOf: (name: string) => string, back: string): HTMLElement {
  const section = el("section", { className: "subject" }, el("h3", { textContent: `${id}: history` }));
  if (history.length === 0) { section.append(el("p", { className: "note", textContent: "No record names this subject." })); return section; }
  const parts = entrantParts(id);
  if (parts) section.append(el("p", { className: "note", textContent: `Mind ${parts.mind}, character and hands ${parts.kit}.` }));
  section.append(el("div", { className: "scroll" }, table(["Version", "First record", "Parent", "Changed", "Pools"], history.map(({ version, parent, pools: standing }) => [
    version === chosen ? el("strong", { textContent: version.label }) : link(here({ subject: id, version: version.subject.version.version }), version.label),
    recordLabel(version.first.name), parent ? parent.label : "none", version.subject.changes.join(", ") || (parent ? "nothing" : ""),
    standing.map((one) => `${poolId(pools[one.pool]!)}: ${one.rank !== null ? `${one.rank} of ${one.of}, ${fixed(one.rating!)}` : `${one.cases} cases`}`).join("; "),
  ]))));
  if (!chosen) return section;
  const name = chosen.name, other = (one: PoolCase, seat: number) => one.subjects[1 - seat] ?? "";
  const mine = pool.cases.filter(({ subjects }) => subjects.includes(name));
  section.append(el("h3", { textContent: `${chosen.label}: cases in pool ${poolId(pool)}` }));
  if (mine.length === 0) { section.append(el("p", { className: "note", textContent: "It has no case in this pool." })); return section; }
  // A contest's groups list the hardest first: the worst matchups.
  const grouped = (title: string, groups: ReturnType<typeof casesBy>) => [el("h4", { textContent: title }), el("div", { className: "scroll" },
    table([title.replace(/^By /, ""), "Bouts", "Won", "Drawn", "Lost", "Score", "Margin", "Stalemates"], groups.map(({ key, tally }) => [key,
      ...(tally ? [String(tally.bouts), String(tally.wins), String(tally.draws), String(tally.losses), fixed(tally.score, 3), fixed(tally.margin, 3), String(tally.stalemates)] : [])])))];
  if (contest) {
    const hardest = (groups: ReturnType<typeof casesBy>) => [...groups].sort((x, y) => (x.tally?.score ?? 0) - (y.tally?.score ?? 0));
    section.append(...grouped("By opponent", hardest(casesBy(pool, name, (one, seat) => labelOf(other(one, seat))))),
      ...grouped("By condition", casesBy(pool, name, (one) => conditionText(one.line.condition))));
  }
  section.append(el("h4", { textContent: "Each case" }), el("div", { className: "scroll" }, table(contest
    ? ["Opponent", "Side", "Condition", "Outcome", "Ending", "Seconds", "Margin", ""] : ["Condition", ...figures.map((figure) => figure.name), ""],
  mine.map((one) => {
    const watch = watchHref(one.line, pool.records.find((record) => record.name === one.record)!, back);
    const seat = one.subjects.indexOf(name), open = el("span", {}, link(here({ case: one.line.key }), "case"), watch && " · ", watch && link(watch, "watch"));
    if (one.line.fault) return contest ? [labelOf(other(one, seat)), seat ? "right" : "left", conditionText(one.line.condition), `fault: ${one.line.fault.message}`, "", "", "", open]
      : [conditionText(one.line.condition), `fault: ${one.line.fault.message}`, ...figures.slice(1).map(() => ""), open];
    if (!contest) return [conditionText(one.line.condition), ...figures.map((figure) => figureText(figure.of(one.line.reading!, "left"))), open];
    const reading = one.line.reading as { score: number; margin: number; ending?: string; seconds?: number }, score = seat ? 1 - reading.score : reading.score;
    return [labelOf(other(one, seat)), seat ? "right" : "left", conditionText(one.line.condition), score === 1 ? "won" : score === 0 ? "lost" : "drawn",
      reading.ending ?? "", reading.seconds !== undefined ? fixed(reading.seconds, 1) : "", fixed(seat ? -reading.margin : reading.margin, 3), open];
  }), "cases")));
  return section;
}

/** A figure's value in one case: a rate's as yes or no, a number to three figures. */
const figureText = (value: number | boolean | null): string =>
  value === null ? "none" : typeof value === "boolean" ? (value ? "yes" : "no") : String(Number(value.toPrecision(3)));

/** A case's condition as text, field by field. */
const conditionText = (condition: Json): string => condition !== null && typeof condition === "object" && !Array.isArray(condition)
  ? Object.entries(condition).map(([key, value]) => `${key} ${fieldText(value)}`).join(", ") : fieldText(condition);

/** One case as its record keeps it. */
function caseView(found: { record: Kept; line: Kept["lines"][number] } | null, versions: ReadonlyMap<string, NamedVersion>, figures: Evaluation["figures"],
  back: string): HTMLElement {
  const section = el("section", { className: "case" });
  if (!found) { section.append(el("p", { className: "note", textContent: "No record of this evaluation holds that case." })); return section; }
  const { record, line } = found, header = record.header;
  const subjects = line.subjects.map((subjectId) => {
    const recorded = header.subjects.find((one) => one.id === subjectId);
    return recorded ? versions.get(`${subjectId} ${recorded.version.version}`)?.label ?? subjectId : subjectId;
  });
  const fields: [string, Child][] = [
    ["Record", `${record.name} (commit ${header.commit.slice(0, 8)}, ${header.harness})`],
    ["Subjects", subjects.length ? subjects.join(" against ") : "none"],
    ["Condition", conditionText(line.condition)],
    ...(line.fault ? [] : [["Figures", figures.map((figure) => `${figure.name} ${figureText(figure.of(line.reading!, "left"))}`).join(", ")] as [string, Child]]),
    [line.fault ? "Fault" : "Reading", el("pre", { textContent: line.fault ? `${line.fault.kind}: ${line.fault.message}` : JSON.stringify(line.reading, null, 1) })],
    ["Digest", line.digest ?? "none"], ["Key", line.key], ["Code", line.code],
    ["World", line.world === null ? "none kept: an imported run's case, which is not opened"
      : line.world.kind === "fall" ? `a fall on ${line.world.engine}; not opened, as a fall is not yet the same in every JavaScript engine`
      : `${line.world.kind} on ${line.world.engine}`],
  ];
  const watch = watchHref(line, record, back);
  if (watch) fields.push(["Watch", el("span", {}, link(watch, "Open in the Arena"), " (it plays as this build's code builds it)")]);
  section.append(el("dl", {}, ...fields.flatMap(([term, value]) => [el("dt", { textContent: term }), el("dd", {}, value)])));
  return section;
}
