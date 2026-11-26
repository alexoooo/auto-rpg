/**
 * **The inventory**: what each body's Mind reads to price a fight, and where each reading comes
 * from. It plays no bout. It stands each body in front of a foe as a bout begins, takes its
 * Mind's first decision (one step), and lists what that decision read:
 *
 * - each reading its Options and its foe's pressure look up (`Engagement.reads`), with whose rows
 *   it found, how far off they are in the numbers, and which settings it was measured at differ;
 * - each kind of Option on offer there, with where each of its price's six answers comes from
 *   (`OfferSources`);
 * - each skill its Mind's config names that the body is not given, and why.
 *
 * Then each record those Minds read (`treeData`), with what it recorded of where it came from
 * beside the same today.
 *
 *   node scripts/inventory.mjs [--bodies man,rat] [--foe woman,rat] [--mind option-tail] [--json <file>] [--compare <file>]
 *
 * Each body is listed empty-handed and as the game arms it (`modelLoadout`), under its default
 * Mind (`defaultMind`) unless `--mind` names a preset for all of them. Each stands in front of
 * the empty-handed man, and then the empty-handed man stands in front of each, so every body is
 * listed once as the one that prices and once as the foe that is priced. `--foe` names other
 * bodies instead, each body listed in front of each. A made-up body and a made-up item are
 * listed beside them: a body of a name, stature and mass the game has not got, and an item of a
 * name, mass and reach no trial held. Both are made here and no file is added for them. They
 * show what a new thing meets.
 *
 * A row **fails** where it is by hand, not priced, found by a name or by a rule, or measured for
 * the pairing (each way it fails is a row); where a Mind cannot be made; and where a standing
 * with a made-up thing, on either side, lacks a skill, a reading or an Option that the same
 * standing has with the body it copies. A made-up thing plays the Mind of the body it copies,
 * so the two differ in the body or the item alone. Each guess in the registry (`handSet`) is a failing row of its own, whether or
 * not a first decision reads it. The whole listing (no `--bodies`, `--foe` or `--mind`) is
 * checked against the list of rows known to fail today, each with the standings it fails for
 * (`inventory-known.json`). It exits with an error where a failing row is not on the list, where
 * a row on the list no longer fails, and where a row fails for other standings than the list
 * says. So the list is exactly what fails today, in those standings. A row is taken off it when
 * it is mended, and one joins it only with the change that says why. Staleness never fails: it
 * is listed, the stalest first.
 *
 * What it cannot show:
 *
 * - the price of an Option that is not on offer as a bout begins, such as a strike, a way up or
 *   a back step. Its lookups are listed here (each Option's reads are made when its Mind is),
 *   and the six answers of its price are counted over decisions that were played
 *   (`research/skills/strikes/strike-bouts.mjs`);
 * - a foe other than the empty-handed man in front of a body other than him, unless `--foe`
 *   asks for it. Nothing checks those standings against a list;
 * - every way a price's answer fails. An answer names one source for the several it reads, the
 *   weakest (`weaker`). Where two are as weak, the other can fail in a way the one named does
 *   not, and of two by hand only one's registry entries are named;
 * - what has changed since a reading was measured, beyond the settings it was measured at. Each
 *   record's rows say what they recorded of their body, their skill and the Minds that played
 *   them, and that is listed by record, not by reading.
 *
 * `--json` writes the listing, and `--compare` names every row that differs from one written
 * before, as the fingerprint does for what the game computes.
 */
import "../tests/harness/preload-data.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { GAME, MINDS, defaultMind, partLookup, treeData } from "../src/app/catalog.ts";
import { ANSWERS } from "../src/minds/engagement.ts";
import { handSetEntries } from "../src/core/hand-set.ts";
import { BODY_MODELS, modelSpec } from "../src/core/bodies/models.ts";
import { armed, canHold } from "../src/core/bodies/human/grip.ts";
import { shortSword } from "../src/core/bodies/items/sword.ts";
import { EMPTY_LOADOUT, HELD } from "../src/core/bodies/items/held.ts";
import { solidSenses } from "../src/core/bodies/object-senses.ts";
import { DEFAULT_ENGINE, loadEngine } from "../src/core/physics/engines.ts";
import { createWorld } from "../src/core/world/world.ts";
import { createSenses } from "../src/core/world/senses.ts";
import { seedOf } from "../src/core/math/random.ts";
import { rulebook } from "../src/combat/rulebook.ts";
import { enlist } from "../src/game/combatant.ts";
import { duelSpec, SIDES } from "../src/game/arena/duel.ts";
import { levelSpawn } from "../src/game/arena/levels.ts";
import { modelLoadout } from "../src/game/model-loadouts.ts";
import { addArenaSolids, arenaSolids } from "../src/game/arena/solids.ts";
import { optionsOf } from "../src/minds/option/assembly/config.ts";
import { skillsOf } from "../src/minds/option/assembly/skills.ts";
import { phaseOf } from "../src/minds/seat/host.ts";
import { reportNow } from "../src/minds/seat/apart.ts";
import { techniqueSkill } from "../src/skills/framework/profile/lookup.ts";
import { sourceWords, standingOf, STANDING_WORDS } from "../src/skills/framework/profile/source.ts";
import { digestOf, recordDigest, specDigest, techniqueDigest } from "../research/skills/profile-origin.mjs";
import { dataOf } from "../src/core/data/store.ts";
import { strikeKey, strikesOf } from "../research/skills/strikes/strike-keys.mjs";

const KNOWN = new URL("./inventory-known.json", import.meta.url);

/** Each way a reading fails: none where it is the body's own, borrowed by its numbers, or given. */
export function failing(source) {
  if (source.kind === "hand") return ["by hand"];
  if (source.kind === "none") return ["not priced"];
  if (source.kind !== "measured") return [];
  const sides = [source.body, ...source.target ? [source.target] : []];
  return [...source.pairing ? ["measured for the pairing"] : [], ...sides.some((side) => side.by === "name") ? ["found by a name"] : [], ...sides.some((side) => side.by === "rule") ? ["found by a rule"] : []];
}

/** The registry's entries, by name (`handSet`). */
const ENTRIES = new Map(handSetEntries().map((entry) => [entry.name, entry]));
/** Whom a guess in the registry fails for: it is a row of its own, whichever body reads it. */
const WHEREVER = "wherever it is read";
/** A Mind stood with its stance's envelope taken as not yet measured (`Experiment.measuring`). */
const MEASURING = Object.freeze({ measuring: true });
/** An error's first line. */
const said = (error) => String(error?.message ?? error).split("\n")[0];

/** The registry entries a source by hand reads, in brackets; nothing of any other source. A source names its entries in words, so each is checked here to be a guess in the registry. One that names none is a rule written by hand, and not a number. */
function entriesOf(source) {
  if (source.kind !== "hand" || !source.entries.length) return "";
  for (const name of source.entries) if (ENTRIES.get(name)?.sort !== "guess") throw new Error(`a source by hand names ${name}, which is no guess in the registry`);
  return ` (${source.entries.join(", ")})`;
}

/** What a body holds, for a listing. */
const holding = (loadout) => loadout.left === "empty" && loadout.right === "empty" ? "empty-handed" : `holding ${[loadout.left, loadout.right].filter((held) => held !== "empty").join(" and ")}`;

/** The name of the preset a config is (`MINDS`), or "a config of its own" where it is none. */
const presetOf = (config) => Object.entries(MINDS).find(([, preset]) => preset.config === config)?.[0] ?? "a config of its own";

/** One of the game's bodies holding `loadout`, as a bout builds it (`duelSpec`), with the Mind `mind` configures: the one the game gives it (`defaultMind`) where none is named. */
const gameBody = (model, loadout, mind = defaultMind(model, loadout)) => ({ label: `${model}, ${holding(loadout)}`, model, spec: duelSpec({ left: model, right: model, loadouts: { left: loadout, right: loadout } }, "left"), mind });

/**
 * **The made-up body and the made-up item**, each with the game's body it copies (`like`). The
 * body is the man's build at 1.2 times his height and 1.1 times as heavy as that height makes
 * him (1.9 times the man's mass), under a name the game has not got. The item is the short sword with every length 1.4 times as long, at 1.6 kg,
 * under a name the game has not got, in the man's right hand. Each plays `mind`, or with none
 * named the Mind of the body it copies, so that the two differ in the body or the item alone.
 */
function madeUp(mind) {
  const armed_ = modelLoadout("man");
  const sword = shortSword();
  const LONGER = 1.4, HEAVIER = 1.6 / sword.mass.value, by = { m: LONGER, kg: HEAVIER, "kg m2": HEAVIER * LONGER * LONGER };
  const grown = (one) => Array.isArray(one) ? one.map(grown) : typeof one !== "object" || one === null ? one
    : "unit" in one && "value" in one ? { ...one, value: !(one.unit in by) ? one.value : Array.isArray(one.value) ? one.value.map((x) => x * by[one.unit]) : one.value * by[one.unit] }
      : Object.fromEntries(Object.entries(one).map(([key, value]) => [key, grown(value)]));
  return [
    { label: "a made-up body, empty-handed", like: "man, empty-handed", spec: { ...modelSpec("man", { size: 1.2, weight: 1.1 }), model: "made-up" }, mind: mind ?? defaultMind("man", EMPTY_LOADOUT) },
    { label: "the man holding a made-up item", like: `man, ${holding(armed_)}`, spec: armed(modelSpec("man"), "right", { ...grown(sword), name: "made-up item" }), mind: mind ?? defaultMind("man", armed_) },
  ];
}

/**
 * **One body in front of a foe, and what its Mind's first decision read.** The two are enlisted
 * as a bout enlists them (`enlist`): on the arena's open floor at its opening gap, under its
 * rulebook and its senses. `body` and `foe` are each a spec with the Mind it plays, and its
 * Mind's experiment where it has one (`MindWiring.experiment`).
 */
function standing(engine, body, foe) {
  const world = createWorld(engine), rules = rulebook("arena"), solids = arenaSolids("open");
  try {
    addArenaSolids(world.physics, solids);
    const senses = createSenses(world, { begins: 0, ends: 60 }), made = {};
    for (const side of SIDES) {
      const one = side === "left" ? body : foe, spawn = levelSpawn("open", side);
      made[side] = enlist(world, { id: side, side, name: `inventory ${side}`, spec: one.spec, at: spawn.position, heading: spawn.heading, rules, senses, solids: solidSenses(solids),
        out: () => false, mind: one.mind, catalog: GAME, seed: seedOf(0, side), phase: phaseOf(SIDES.indexOf(side)), orders: () => null,
        ...(one.experiment ? { experiment: one.experiment } : {}) });
    }
    world.step(1);
    const engagement = reportNow(made.left.minded.report).engagement;
    return { reads: engagement?.reads ?? [], offers: (engagement?.offers ?? []).filter((offer) => offer.terms).map((offer) => ({ name: offer.name, kind: offer.kind, from: offer.terms.from })) };
  } finally { world.dispose(); }
}

/** The skills `mind`'s Options name that a body of `spec` is not given, each with why (its part's `fits`): each Option that names skills on some body and none on this one. */
function notGiven(spec, mind) {
  const options = optionsOf(mind, partLookup), out = {};
  for (const option of options) {
    const part = partLookup.of("option", option);
    if (!part.skills || part.skills(option, spec, partLookup, options)) continue;
    out[option.skill?.kind ?? option.skill?.name ?? option.kind] = (option.skill && partLookup.any(option.skill)?.fits(spec, option.skill, partLookup)) ?? "its Option names no limb or skill on this body";
  }
  return out;
}

/**
 * **One body's rows.** Where its Mind cannot be made as the game makes it, the row says why
 * (`built`), and the body is stood again with its stance's envelope taken as not yet measured,
 * as a Mind that measures it is (`Experiment.measuring`), to list what else a new body meets.
 */
function rowOf(engine, subject, foe) {
  const row = { mind: presetOf(subject.mind), built: null, given: notGiven(subject.spec, subject.mind) };
  try { return { ...row, ...standing(engine, subject, foe) }; }
  catch (error) { return { ...row, built: said(error), ...standing(engine, { ...subject, experiment: MEASURING }, foe) }; }
}

/** How far off a measured source's rows are from what was asked: the largest of its gaps, each counted in the spans its lookup compares rows over (`Gap.spans`). 0 of any other source. */
const farOff = (source) => source.kind !== "measured" ? 0 : Math.max(0, ...[source.body, ...source.target ? [source.target] : []].flatMap((side) => side.gaps).map((gap) => gap.spans));

/**
 * **Each record the Minds `minds` configure read** (`treeData`), with what it recorded of where
 * it came from (`Origin`) beside the same today: its body's digest, its skill's, and each Mind
 * that played its trials with what that Mind read (`Played`). Today's are found as the measuring
 * tools find them, for the game's bodies under each preset (`MINDS`). A record of measured rows
 * is listed row by row. Where a row recorded none of one, it says so: nothing is guessed for it.
 * Any other record is one line, which says so where it holds nothing of where it came from.
 */
function assets(minds) {
  const presets = new Map(Object.entries(MINDS).map(([id, preset]) => [digestOf(preset.config), id])), bodies = new Map(), skills = new Map(), NO_BODY = "is no body of the game today";
  // Each body holding each thing, under each preset of Options: a profile may be of a strike only some preset throws, or only with something in the hand.
  for (const model of BODY_MODELS) for (const item of HELD.filter((one) => one === "empty" || canHold(modelSpec(model), "right"))) for (const preset of Object.values(MINDS).filter((one) => one.config.kind === "option")) {
    const { spec, mind } = gameBody(model, { left: "empty", right: item }, preset.config), { executors, actions } = strikesOf(spec, mind);
    bodies.set(model, specDigest(spec));
    for (const action of actions) for (const limb of action.effectors) {
      const key = strikeKey(spec, mind, executors, action, limb, 120, null, 0);
      skills.set(`${model} ${key.measured.skill} ${limb}`, key.digests.skill);
    }
    for (const technique of skillsOf(partLookup, spec, optionsOf(mind, partLookup)).techniques) skills.set(`${model} ${techniqueSkill(spec, technique)}`, techniqueDigest(partLookup, spec, technique));
  }
  /** A recorded digest beside today's: `gone` says what it means that today has none. */
  const same = (what, was, is, gone) => was === undefined ? `${what} not recorded` : is === undefined ? `${what} ${gone}` : was === is ? `${what} as it was` : `${what} changed since`;
  /** One Mind that played, beside today: its body, whether its config is a preset's today, and which of the records it read have changed. */
  const playedWords = (played) => {
    const changed = Object.entries(played.read).filter(([key, digest]) => recordDigest(key) !== digest).map(([key]) => key);
    return `${presets.get(played.mind) ?? "a Mind that is no preset today"} on ${played.body} (${same("its body", played.spec, bodies.get(played.body), NO_BODY)}; `
      + `${changed.length ? `of the ${Object.keys(played.read).length} records it read, changed since: ${changed.join(", ")}` : `the ${Object.keys(played.read).length} records it read as they were`})`;
  };
  const mindsWords = (from) => from?.minds === undefined ? "the Minds that played not recorded" : `played by ${from.minds.map(playedWords).join(" and ")}`;
  /** A measured row's name: its body and its skill, or the two bodies it was measured between. */
  const nameOf = ({ measured, target }) => measured.skill ? `${measured.body} ${measured.skill}${measured.limb ? ` ${measured.limb}` : ""}`
    : `a body of ${measured.stature} m and ${measured.mass} kg against one of ${target.stature} m and ${target.mass} kg`;
  const out = {};
  for (const key of [...new Set(minds.flatMap((mind) => treeData(mind)))].sort()) {
    const record = dataOf(key), rows = out[key] = {};
    if (Array.isArray(record) && record.every((row) => row.measured)) for (const row of record) {
      const name = nameOf(row), from = row.from ?? {};
      rows[name] = [same("its body", from.spec, bodies.get(row.measured.body), NO_BODY), same("its skill", from.skill, skills.get(name), "is one no preset has this body do today"), mindsWords(from),
        from.commit ? `played on ${from.commit.slice(0, 9)}${from.changed ? " with a build input changed" : ""}` : "its commit not recorded", from.date ?? "its day not recorded"].join("; ");
    } else rows["the whole record"] = record.from === undefined && typeof record.origin !== "string" ? "holds nothing of where it came from"
      : [mindsWords(record.from), ...typeof record.origin === "string" ? [record.origin] : []].join("; ");
  }
  return out;
}

/** The settings in which the listed bodies' default configs differ: each path in a config whose value is not the same under every body, with the bodies under each value. */
function configDifferences(bodies) {
  const leaves = (value, path, out) => {
    if (typeof value !== "object" || value === null) { out.set(path, JSON.stringify(value)); return out; }
    for (const [key, item] of Object.entries(value)) leaves(item, path ? `${path}.${key}` : key, out);
    return out;
  };
  const flat = bodies.map((body) => [body.label, leaves(body.mind, "", new Map())]), differing = {};
  for (const path of new Set(flat.flatMap(([, config]) => [...config.keys()])).values()) {
    const values = new Map();
    for (const [label, config] of flat) { const value = config.get(path) ?? "not set"; values.set(value, [...values.get(value) ?? [], label]); }
    if (values.size > 1) differing[path] = [...values].map(([value, labels]) => `${value} (${labels.join("; ")})`).join(" | ");
  }
  return differing;
}

/**
 * **The listing.** `bodies` names the game's bodies listed (all of them, with the made-up two,
 * where null). `foes` names the bodies each stands in front of, empty-handed. Where it is null,
 * each stands in front of the empty-handed man, and then the empty-handed man stands in front of
 * each, so every body is listed once as the one that prices and once as the foe that is priced.
 * `mind` names the preset every body plays (`MINDS`), each its own default where null.
 */
export async function inventory({ bodies = null, foes = null, mind = null } = {}) {
  if (mind !== null && !MINDS[mind]) throw new Error(`no Mind preset ${mind}: ${Object.keys(MINDS).join(", ")}`);
  const engine = await loadEngine(DEFAULT_ENGINE), config = mind === null ? undefined : MINDS[mind].config, game = [];
  for (const model of bodies ?? BODY_MODELS) {
    game.push(gameBody(model, EMPTY_LOADOUT, config));
    const arms = modelLoadout(model);
    if (arms.left !== "empty" || arms.right !== "empty") game.push(gameBody(model, arms, config));
  }
  const subjects = [...game, ...bodies ? [] : madeUp(config)], man = gameBody("man", EMPTY_LOADOUT, config);
  // Each body as the one that prices comes before any body as a foe: a body whose Mind is not made as the game makes it is found there (`unmade`), and is stood as a foe the way it could be stood.
  const stood = foes ? subjects.flatMap((subject) => foes.map((foe) => [subject, gameBody(foe, EMPTY_LOADOUT)]))
    : [...subjects.map((subject) => [subject, man]), ...subjects.filter((subject) => subject.label !== man.label).map((subject) => [man, subject])];
  const rows = {}, fails = new Map(), borrowed = [], stale = [], unmade = new Set();
  const fail = (line, row) => fails.set(line, [...new Set([...fails.get(line) ?? [], row])]);
  for (const [subject, foe] of stood) {
    const name = `${subject.label}, in front of ${foe.label}`, row = rowOf(engine, subject, unmade.has(foe.label) ? { ...foe, experiment: MEASURING } : foe);
    const listed = rows[name] = { mind: row.mind, built: row.built, given: row.given, reads: {}, offers: {} };
    if (row.built) { unmade.add(subject.label); fail(`its Mind is not made: ${row.built}`, name); }
    for (const { what, source } of row.reads) {
      listed.reads[what] = `${STANDING_WORDS[standingOf(source)]}. ${sourceWords(source)}`;
      for (const how of failing(source)) fail(`${how}: reading ${what}${entriesOf(source)}`, name);
      if (standingOf(source) === "borrowed") borrowed.push({ far: farOff(source), line: `${name}: ${what}. ${sourceWords(source)}` });
      if (source.kind === "measured" && source.stale.length) stale.push({ count: source.stale.length, line: `${name}: ${what}. ${sourceWords(source)}` });
    }
    // The offers are listed by kind, a strike by its name: a body is offered a walk to each strike's window by each gait and each way of finding a route. Each different line of sources among a kind's offers is kept, with how many offers read so.
    const lines = new Map();
    for (const offer of row.offers) {
      const key = offer.kind === "strike" ? offer.name : `a ${offer.kind}`, line = Object.keys(ANSWERS).map((answer) => STANDING_WORDS[standingOf(offer.from[answer])]).join(" | ");
      if (!lines.has(key)) lines.set(key, new Map());
      lines.get(key).set(line, (lines.get(key).get(line) ?? 0) + 1);
      for (const [answer, words] of Object.entries(ANSWERS)) for (const how of failing(offer.from[answer])) fail(`${how}: ${words}, of ${key}${entriesOf(offer.from[answer])}`, name);
    }
    for (const [key, counted] of lines) listed.offers[key] = [...counted].map(([line, count]) => `${count} on offer: ${line}`).join("; and ");
    // A made-up thing has the build and the hands of the body it copies, and plays its Mind. So a standing with one, on either side, fails where the same standing with the body copied is given a skill, reads a record or is offered an Option, and this one is not.
    if (!subject.like && !foe.like) continue;
    const copied = rows[`${subject.like ?? subject.label}, in front of ${foe.like ?? foe.label}`], who = subject.like ? "a made-up thing" : "a body in front of a made-up thing", there = subject.like ? "the body it copies" : "it in front of the body copied";
    for (const [what, why] of Object.entries(row.given)) if (!(what in copied.given)) fail(`${who} is not given ${what}: ${why}`, name);
    for (const what of Object.keys(copied.reads)) if (!(what in listed.reads)) fail(`${who} does not read ${what}, which ${there} reads`, name);
    for (const key of Object.keys(copied.offers)) if (!(key in listed.offers)) fail(`${who} is not offered ${key}, which ${there} is offered`, name);
  }
  // A guess is a row that fails whether or not a first decision reads it: most are read only once a fight is on.
  const sorts = {};
  for (const entry of ENTRIES.values()) {
    sorts[entry.sort] = (sorts[entry.sort] ?? 0) + 1;
    if (entry.sort === "guess") fail(`a guess in the registry: ${entry.name}`, WHEREVER);
  }
  return { bodies: rows, assets: assets(stood.flat().map((one) => one.mind)), fails: Object.fromEntries([...fails].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
    borrowed: borrowed.sort((a, b) => b.far - a.far).map((one) => `${Number(one.far.toFixed(2))} spans off. ${one.line}`), stale: stale.sort((a, b) => b.count - a.count).map((one) => one.line),
    counts: { "numbers set by hand, by sort": sorts, "rows that fail": fails.size, "settings in which the default configs differ": configDifferences(game) } };
}

/**
 * **What is wrong between the rows that fail and the list of those known** (`inventory-known.json`).
 * Each is a row with whom it fails for. A failing row not on the list is wrong, a row on the list
 * that no longer fails is wrong, and so is a row that fails for others than the list says.
 */
export function inventoryFaults(fails, known) {
  const faults = [];
  for (const [line, rows] of Object.entries(fails)) {
    const listed = known[line];
    if (!listed) { faults.push(`fails and is not on the list of rows known to fail: ${line} [${rows.join("; ")}]`); continue; }
    const more = rows.filter((row) => !listed.includes(row)), fewer = listed.filter((row) => !rows.includes(row));
    if (more.length) faults.push(`fails for more than the list of rows known to fail says: ${line} [${more.join("; ")}]`);
    if (fewer.length) faults.push(`no longer fails for some the list of rows known to fail names, so take them off: ${line} [${fewer.join("; ")}]`);
  }
  for (const line of Object.keys(known)) if (!fails[line]) faults.push(`is on the list of rows known to fail and no longer fails, so take it off: ${line}`);
  return faults;
}

/** The rows known to fail today, each with whom it fails for. */
export const knownFails = () => JSON.parse(readFileSync(KNOWN, "utf8"));

/** Every leaf of a listing by its path, for a comparison. */
function leavesOf(value, path = "", out = new Map()) {
  if (typeof value !== "object" || value === null) { out.set(path, JSON.stringify(value)); return out; }
  for (const [key, item] of Object.entries(value)) leavesOf(item, path ? `${path} / ${key}` : key, out);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { bodies: { type: "string" }, foe: { type: "string" }, mind: { type: "string" }, json: { type: "string" }, compare: { type: "string" } } });
  const whole = !values.bodies && !values.foe && !values.mind;
  const listed = await inventory({ bodies: values.bodies?.split(",") ?? null, ...(values.foe ? { foes: values.foe.split(",") } : {}), mind: values.mind ?? null });
  for (const [body, row] of Object.entries(listed.bodies)) {
    console.log(`\n== ${body}, under ${row.mind}`);
    if (row.built) console.log(`  its Mind is not made as the game makes it: ${row.built}`);
    if (Object.keys(row.given).length) console.log(`  its config names these and the body is not given them: ${Object.entries(row.given).map(([what, why]) => `${what} (${why})`).join("; ")}`);
    console.log("  what it reads:");
    for (const [what, words] of Object.entries(row.reads)) console.log(`    ${what}: ${words}`);
    console.log(`  what is on offer as the bout begins (${Object.values(ANSWERS).join(" | ")}):`);
    for (const [key, line] of Object.entries(row.offers)) console.log(`    ${key}: ${line}`);
  }
  console.log("\n== The records these Minds read, and what each recorded of where it came from beside the same today");
  for (const [key, rows] of Object.entries(listed.assets)) { console.log(`  ${key}`); for (const [what, words] of Object.entries(rows)) console.log(`    ${what}: ${words}`); }
  console.log(`\n== Borrowed readings, the farthest off first: ${listed.borrowed.length}`);
  for (const line of listed.borrowed) console.log(`  ${line}`);
  console.log(`\n== Readings stale by the settings they were measured at, the stalest first: ${listed.stale.length}`);
  for (const line of listed.stale) console.log(`  ${line}`);
  const all = Object.keys(listed.bodies).length;
  console.log(`\n== The rows that fail, each with how many of the ${all} standings listed it fails for: ${Object.keys(listed.fails).length}`);
  for (const [line, rows] of Object.entries(listed.fails)) console.log(`  ${line} [${rows.includes(WHEREVER) ? WHEREVER : rows.length}]`);
  console.log("\n== Counts");
  const { "numbers set by hand, by sort": sorts, "settings in which the default configs differ": differing } = listed.counts;
  console.log(`  numbers set by hand: ${Object.values(sorts).reduce((a, b) => a + b, 0)} (${Object.entries(sorts).map(([sort, count]) => `${sort} ${count}`).join(", ")})`);
  console.log(`  rows that fail: ${Object.keys(listed.fails).length}`);
  console.log(`  settings in which the bodies' default configs differ: ${Object.keys(differing).length}`);
  for (const [path, words] of Object.entries(differing)) console.log(`    ${path}: ${words}`);
  if (values.json) writeFileSync(values.json, `${JSON.stringify(listed, null, 1)}\n`);
  if (values.compare) {
    const before = leavesOf(JSON.parse(readFileSync(values.compare, "utf8"))), after = leavesOf(listed), moved = [];
    for (const [path, value] of after) if (before.get(path) !== value) moved.push(`${before.has(path) ? "changed" : "new"}: ${path}: ${before.has(path) ? `${before.get(path)} before, ` : ""}${value} now`);
    for (const [path, value] of before) if (!after.has(path)) moved.push(`gone: ${path}: ${value} before`);
    console.log(`\n== Compared with ${values.compare}: ${moved.length ? `${moved.length} rows differ` : "no row differs"}`);
    for (const line of moved) console.log(`  ${line}`);
  }
  if (whole) {
    const faults = inventoryFaults(listed.fails, knownFails());
    if (faults.length) { console.error(`\nThe inventory's check fails:\n${faults.map((fault) => `  ${fault}`).join("\n")}`); process.exitCode = 1; }
    else console.log("\nThe inventory's check holds: the rows that fail are exactly those known to fail today, each for the same standings.");
  }
}
