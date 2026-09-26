/**
 * Can every body defeat an idle dummy of every family?
 *
 *     node research/idle-dummy.mjs --blocks 12 --dir research/runs/pc01/idle
 *     node research/idle-dummy.mjs --attackers roster --naive --trace --dir research/runs/idle-roster
 *
 * The owner's floor for the physical-contact set (2026-09-23): lopsided cross-family fights are fine,
 * but every attacker must be able to beat every idle dummy. A cell is an attacker -- a named build,
 * optionally with an attribute preset, and the minds that play it -- against a dummy under the
 * `idle` policy. A block is one attacker mind and a seed pair, played once from each side, so arena
 * side cancels inside it. `docs/plans/2026-09-23-physical-contact-01-measure.md` (in git at 30dcb8c) section 7.
 *
 * The question is whether a win is reachable, not how often, so a cell is small. A cell that falls to
 * zero wins where session 01 had some is a red gate for the session that did it.
 *
 * **An outright win is one before `CONFIG.bout.overtimeSeconds`.** Past it the clock drains both bars
 * at one rate, so an attacker that landed a single scratch beats a dummy that never moves -- a win the
 * drain decided, not the attacker. The gate is on outright wins; the drained ones are reported beside.
 *
 * Runs `research/census-worker.mjs`, so each row also carries the knockdown census.
 */
import { join, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ATTRIBUTE_PRESETS, HARNESS } from "./stat-sweep.mjs";
import { PROTOCOL, seed } from "./schedule.mjs";
import { CONFIG } from "../src/config.ts";

const PROBE = ["golem-champion", "golem-miser", "golem-brawler", "golem-duelist"];

export const IDLE_BODIES = Object.freeze({
  stone: { build: "default", minds: PROBE },
  skeleton: { build: "skeleton-warrior", minds: ["skeleton-duelist"] },
  human: { build: "human-warrior", minds: ["humanoid-duelist"] },
  giant: { build: "default", preset: "max", minds: PROBE },
});

/**
 * An attacker by name: one of `IDLE_BODIES`, or any playable build (`PLAYABLE_BUILDS` in
 * `src/golem/roster.ts`, handed in as `builds`) played by its family's naive mind. With `naive`, an
 * `IDLE_BODIES` row is played by that mind too, instead of its own list.
 *
 * The naive mind is `FAMILY_POLICY` in `src/golem/family.ts`: each family's duelist, the top rung of
 * the naive ladder (`LADDER` in `tests/harness/drills.mjs`) for stone, and the only fighting mind a
 * human or a skeleton has.
 */
export function idleAttacker(name, { builds, naive = false, familyPolicy, familyOf }) {
  const listed = IDLE_BODIES[name];
  const build = builds.find((b) => b.name === (listed ? listed.build : name));
  if (!build) throw new Error(`there is no idle-matrix body or playable build "${name}"`);
  const mind = familyPolicy[familyOf(build.setup)];
  if (listed) return naive ? { ...listed, minds: [mind] } : listed;
  return { build: name, minds: [mind] };
}

/** Every job of the matrix: attacker x dummy x block x side. `bodies` maps an attacker to its row. */
export function idleJobs({ attackers, dummies, blocks, runSeed, bodies = IDLE_BODIES }) {
  const jobs = [];
  for (const a of attackers) for (const d of dummies) {
    const cell = `${a}>${d}`;
    for (let k = 0; k < blocks; k++) {
      const mind = bodies[a].minds[k % bodies[a].minds.length];
      const pair = `${cell}/${mind}/${k}`;
      const seeds = [seed(runSeed, pair, "attacker"), seed(runSeed, pair, "dummy")];
      for (const attackerSide of ["left", "right"]) {
        const onLeft = attackerSide === "left";
        jobs.push({ id: `${pair}/${attackerSide}`, round: 0, block: pair, pair, cell, attacker: a, dummy: d,
          attackerSide, left: onLeft ? mind : "idle", right: onLeft ? "idle" : mind,
          leftBuild: onLeft ? `attacker:${a}` : `dummy:${d}`, rightBuild: onLeft ? `dummy:${d}` : `attacker:${a}`,
          seeds: onLeft ? seeds : [seeds[1], seeds[0]] });
      }
    }
  }
  return jobs;
}

export function summarizeIdle(rows) {
  const cells = new Map();
  for (const row of rows) {
    if (row.status !== "ok") continue;
    const cell = cells.get(row.cell) ?? { attacker: row.attacker, dummy: row.dummy, bouts: 0, wins: 0, outright: 0, capped: 0, winSeconds: [] };
    cell.bouts += 1;
    if (row.winner === row.attackerSide) {
      cell.wins += 1; cell.winSeconds.push(row.seconds);
      if (row.seconds < CONFIG.bout.overtimeSeconds) cell.outright += 1;
    }
    if (row.ending === "time") cell.capped += 1;
    cells.set(row.cell, cell);
  }
  return [...cells.values()].map((c) => {
    const sorted = c.winSeconds.sort((a, b) => a - b);
    return { attacker: c.attacker, dummy: c.dummy, bouts: c.bouts, winRate: c.wins / c.bouts, outrightRate: c.outright / c.bouts,
      medianWinSeconds: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null, cappedShare: c.capped / c.bouts };
  });
}

export function idleMarkdown(cells, header) {
  const attackers = [...new Set(cells.map((c) => c.attacker))];
  const dummies = [...new Set(cells.map((c) => c.dummy))];
  const at = (a, d) => cells.find((c) => c.attacker === a && c.dummy === d);
  const show = (c) => (!c ? "--" : `${(100 * c.outrightRate).toFixed(0)} % (${(100 * c.winRate).toFixed(0)}) / ${c.medianWinSeconds === null ? "--" : c.medianWinSeconds.toFixed(1)} s / ${(100 * c.cappedShare).toFixed(0)} %`);
  const zero = cells.filter((c) => c.outrightRate === 0);
  return [`# Idle-dummy matrix`, "",
    `${HARNESS}; cap ${header.protocol.maxSeconds} s; ${header.blocks} blocks a cell, each played from both sides; seed ${header.seed}; fingerprint ${header.fingerprint}.`,
    `Each cell: the attacker's outright win rate, before the ${CONFIG.bout.overtimeSeconds} s overtime drain (with the drain) / median time of a win / share of bouts that reached the cap.`, "",
    `| Attacker \\ idle dummy | ${dummies.join(" | ")} |`, `| --- |${dummies.map(() => " ---: |").join("")}`,
    ...attackers.map((a) => `| ${a} | ${dummies.map((d) => show(at(a, d))).join(" | ")} |`), "",
    zero.length ? `**Cells at zero outright wins:** ${zero.map((c) => `${c.attacker} > ${c.dummy}`).join(", ")}.` : "No cell is at zero outright wins.", ""].join("\n");
}

async function main() {
  const { values } = parseArgs({ options: {
    attackers: { type: "string", default: "stone,skeleton,human,giant" },
    dummies: { type: "string", default: "stone,skeleton,human,giant" },
    blocks: { type: "string", default: "12" }, workers: { type: "string", default: "24" },
    seed: { type: "string", default: "20260923" }, dir: { type: "string", default: "research/runs/idle-dummy" },
    naive: { type: "boolean", default: false }, trace: { type: "boolean", default: false },
  } });
  const [{ PLAYABLE_BUILDS }, { FAMILY_POLICY, bodyFamily }, { runJobs }, { fingerprint }] = await Promise.all([
    import("../src/golem/roster.ts"), import("../src/golem/family.ts"), import("./runner.mjs"), import("./fingerprint.mjs")]);
  // `roster` is the four rows above and every other playable build: the named stone builds and
  // every human and skeleton build, each by its family's naive mind.
  const covered = new Set(Object.values(IDLE_BODIES).map((body) => body.build));
  const expand = (list) => list.split(",").flatMap((name) => (name !== "roster" ? [name]
    : [...Object.keys(IDLE_BODIES), ...PLAYABLE_BUILDS.map((b) => b.name).filter((b) => !covered.has(b))]));
  const attackers = expand(values.attackers), dummies = values.dummies.split(",");
  const bodies = Object.fromEntries(attackers.map((name) => [name, idleAttacker(name,
    { builds: PLAYABLE_BUILDS, naive: values.naive, familyPolicy: FAMILY_POLICY, familyOf: bodyFamily })]));
  const setupOf = (body) => {
    const found = PLAYABLE_BUILDS.find((build) => build.name === body.build);
    return { ...found.setup, ...(body.preset ? { attributes: ATTRIBUTE_PRESETS[body.preset]() } : {}) };
  };
  const dummyOf = (name) => {
    if (!IDLE_BODIES[name]) throw new Error(`there is no idle-matrix dummy "${name}"; they are ${Object.keys(IDLE_BODIES).join(", ")}`);
    return IDLE_BODIES[name];
  };
  const blocks = Number(values.blocks), runSeed = Number(values.seed);
  const jobs = idleJobs({ attackers, dummies, blocks, runSeed, bodies });
  const hash = fingerprint().hash;
  const manifest = { version: 1, kind: "idle-dummy", fingerprint: hash, protocol: PROTOCOL, attackers, dummies,
    blocks, seed: runSeed, candidates: [],
    builds: [...attackers.map((a) => ({ name: `attacker:${a}`, setup: setupOf(bodies[a]) })),
      ...dummies.map((d) => ({ name: `dummy:${d}`, setup: setupOf(dummyOf(d)) }))],
    // Absent unless asked for, so an earlier run's manifest reads as it did.
    ...(values.naive ? { naive: true } : {}), ...(values.trace ? { trace: true } : {}) };
  const directory = resolve(values.dir);
  console.log(`${jobs.length} bouts into ${directory}`);
  const started = Date.now();
  const rows = await runJobs(directory, manifest, jobs, { workers: Number(values.workers),
    workerUrl: new URL("./census-worker.mjs", import.meta.url),
    onProgress: ({ done, total, failures }) => console.log(`  ${done}/${total}, ${failures} failed, ${((Date.now() - started) / 1000).toFixed(0)} s`) });
  const failed = rows.filter((row) => row.status !== "ok");
  if (failed.length) throw new Error(`${failed.length} bouts failed; first: ${failed[0].error}`);
  const cells = summarizeIdle(rows);
  const markdown = idleMarkdown(cells, { protocol: PROTOCOL, blocks, seed: runSeed, fingerprint: hash.slice(0, 12) });
  writeFileSync(join(directory, "idle.json"), `${JSON.stringify(cells, null, 2)}\n`);
  writeFileSync(join(directory, "idle.md"), markdown);
  console.log(markdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
