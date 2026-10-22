/**
 * **An old tournament run as records**: rows of the format `arena-tournament/1` (`scripts/tournament.mjs@d06fb568`)
 * with their provenance, made into a `tournament` and an `unseen` record in a pool of their own.
 * The cases have no world: they are history, never opened, played again or reused.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { scoreOf } from "../src/evaluation/contest.ts";
import { importedSubject, recordIdentity, versionOf } from "../src/evaluation/record.ts";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

/** Refuse unless `ok`. */
const need = (ok, why) => { if (!ok) throw new Error(`the import is refused: ${why}`); };

/** A loadout from its key, `left,right`. */
const loadoutOf = (key) => { const [left, right] = key.split(","); return { left, right }; };

/**
 * The records of the run `provenance` (a JSON file beside its rows) describes: refused unless the
 * rows' bytes are the ones named, every row is the run's, each ordered pair of its entrants meets
 * once at each gap, and each unseen entrant once on each side at each gap.
 */
export function importRun(provenance, root) {
  const about = JSON.parse(readFileSync(provenance, "utf8")), file = join(dirname(provenance), about.file);
  const bytes = readFileSync(file);
  need(bytes.length === about.bytes && createHash("sha256").update(bytes).digest("hex") === about.sha256, `${about.file} is not the file its provenance names`);
  const rows = bytes.toString("utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const configuration = rows[0]?.identity?.configuration;
  for (const row of rows) need(row.identity?.build === about.build && row.identity?.protocol === about.protocol.name && row.identity?.configuration === configuration, "a row is another run's");
  const { harness, protocol, unseen } = JSON.parse(configuration);
  need(harness === about.harness, "the rows name another harness");

  const rated = rows.filter((row) => !row.key.startsWith("unseen|")), others = rows.filter((row) => row.key.startsWith("unseen|"));
  const parsed = rated.map((row) => { const [left, right, gap] = row.key.split("|"); return { row, left, right, gap: Number(gap) }; });
  const ids = [...new Set(parsed.flatMap(({ left, right }) => [left, right]))].sort();
  need(ids.length === about.entrants, `${ids.length} entrants where the run had ${about.entrants}`);
  const met = new Set(parsed.map(({ left, right, gap }) => `${left}|${right}|${gap}`));
  need(met.size === parsed.length && parsed.every(({ left, right }) => left !== right), "a pair meets twice on one side, or an entrant meets itself");
  need(parsed.length === ids.length * (ids.length - 1) * protocol.gaps.length && rated.length === about.rows.tournament, "a pair does not meet on each side at each gap");

  const minds = new Set(ids.map((id) => id.split("/")[0]));
  const seen = others.map((row) => { const [, id, , gap, side] = row.key.split("|"); return { row, id, gap: Number(gap), side }; });
  need(new Set(seen.map(({ id, gap, side }) => `${id}|${gap}|${side}`)).size === seen.length && others.length === about.rows.unseen, "an unseen entrant plays a side twice, or a row is missing");
  need(seen.every(({ id, side }) => minds.has(id.split("/")[0]) && (side === "left" || side === "right")), "an unseen row names a mind outside the field");
  need(seen.every(({ id, gap }) => ["left", "right"].every((side) => seen.some((one) => one.id === id && one.gap === gap && one.side === side))), "an unseen entrant is missing a side");
  need(rows.filter((row) => row.ending === "time").length === about.rows.atCap, "the bouts at the cap are not the run's");

  const commit = git("rev-parse", about.commits.run), date = git("show", "-s", "--format=%cs", about.commits.table);
  const environment = `import:${about.build}`, provenancePath = relative(root, provenance).replaceAll("\\", "/");
  const reading = (row) => ({ winner: row.winner, ending: row.ending, seconds: row.seconds, blows: row.blows, bars: row.bars, score: scoreOf(row.winner), margin: row.bars[0] - row.bars[1] });
  const headerOf = (evaluation, play, subjects) => ({
    identity: recordIdentity(about.build, about.engine, harness, play), evaluation, protocol: "standard", play, engine: about.engine, harness,
    commit, date, schedule: "all", pool: { protocol: versionOf(null, play, environment).protocol, environment },
    subjects: subjects.map((id) => importedSubject(id, commit, play, environment)), imported: { provenance: provenancePath, sha256: about.sha256 },
  });
  const unseenPlay = { ...protocol, unseen };
  return [
    { header: headerOf("tournament", protocol, ids), lines: parsed.map(({ row, left, right, gap }) =>
      ({ subjects: [left, right], condition: { gap }, key: row.key, code: environment, world: null, reading: reading(row), digest: row.digest, fault: null })) },
    { header: headerOf("unseen", unseenPlay, [...new Set(seen.map(({ id }) => id.split("/")[0]))].sort()), lines: seen.map(({ row, id, gap, side }) => {
      const [mind, model, held] = id.split("/");
      return { subjects: [mind], condition: { model, loadout: loadoutOf(held), gap, side }, key: row.key, code: environment, world: null, reading: { ...reading(row), side }, digest: row.digest, fault: null };
    }) },
  ];
}
