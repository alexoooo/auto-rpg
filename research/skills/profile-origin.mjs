/**
 * **Where a profile came from** (`Origin`, `src/skills/framework/profile/profile.ts`), as the tools that
 * measure profiles write it: the digests of its body's spec (`specDigest`) and of its skill
 * (`skillDigest` for a strike, `techniqueDigest` for a ground technique), and the Minds that
 * played its trials (`playedBy`). A digest labels a profile and finds none.
 */
import { treeData } from "../../src/app/catalog.ts";
import { dataIdentity, dataOf } from "../../src/core/data/store.ts";
import { chosenVariation } from "../../src/skills/framework/variations.ts";

/** Each object's digest, found once: what is digested is frozen. */
const DIGESTS = new WeakMap();

/**
 * **A digest of `value`'s values**, 16 hex digits (two FNV-1a words): its numbers, strings and
 * flags, an object's by its keys in order, leaving out functions, what is undefined and each
 * `provenance` (where a number came from, not what it is).
 */
export function digestOf(value) {
  const known = typeof value === "object" && value !== null ? DIGESTS.get(value) : undefined;
  if (known !== undefined) return known;
  let a = 2166136261, b = 3735928559;
  const text = (piece) => {
    for (let i = 0; i < piece.length; i++) {
      const c = piece.charCodeAt(i);
      a = Math.imul(a ^ c, 16777619) >>> 0;
      b = Math.imul(b ^ c, 16777619) >>> 0;
    }
  };
  const walk = (one) => {
    if (one === null || typeof one === "boolean" || typeof one === "string") { text(JSON.stringify(one)); return; }
    if (typeof one === "number") { text(Number.isFinite(one) ? JSON.stringify(one) : String(one)); return; }
    if (Array.isArray(one) || ArrayBuffer.isView(one)) {
      text("[");
      for (const item of Array.from(one)) { walk(item); text(","); }
      text("]");
      return;
    }
    if (one instanceof Map) { walk([...one.entries()]); return; }
    if (typeof one === "object") {
      text("{");
      for (const key of Object.keys(one).sort()) {
        const item = one[key];
        if (key === "provenance" || item === undefined || typeof item === "function") continue;
        text(JSON.stringify(key)); text(":"); walk(item); text(",");
      }
      text("}");
      return;
    }
    text(String(one));
  };
  walk(value);
  const digest = a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
  if (typeof value === "object" && value !== null) DIGESTS.set(value, digest);
  return digest;
}

/** Each spec's digest (`specDigest`), found once a spec. */
const SPEC_DIGESTS = new WeakMap();

/**
 * **A body's spec's digest** (`digestOf`): where a profile measured on it came from
 * (`Origin.spec`). Its wounds are left out: they are how the rules read a blow on it
 * (`src/combat/pool.ts`), not how it moves; its skills: a strike's digest names the variation
 * it runs (`skillDigest`); and what it holds, which each trial records (`Start.held`).
 */
export const specDigest = (spec) => {
  let digest = SPEC_DIGESTS.get(spec);
  if (digest === undefined) SPEC_DIGESTS.set(spec, digest = digestOf({ ...spec, wounds: undefined, skills: undefined, held: undefined }));
  return digest;
};

/** Each record's digest (`recordDigest`), by its key: a record is loaded once and frozen. */
const RECORD_DIGESTS = new Map();

/**
 * **A whole record's digest**, by its data key (`dataOf`). It is the whole record, not one
 * body's rows of it: a Mind reads other bodies' rows too, its foe's and those it borrows.
 */
export function recordDigest(key) {
  let digest = RECORD_DIGESTS.get(key);
  if (digest === undefined) RECORD_DIGESTS.set(key, digest = digestOf(dataOf(key)));
  return digest;
}

/** Each Mind that played (`playedBy`), by its body's digest and its config's: the same object for the same two. */
const PLAYED = new Map();

/**
 * **One Mind that played a measurement's trials** (`Played`): the Mind `mind` configures, on a
 * body of `spec`. It keeps the body's name and digest, the config's digest, and the digest of
 * each whole record the Mind's parts read (`treeData`, `recordDigest`). So the inventory can
 * say which of them has changed since, without playing anything.
 */
export function playedBy(spec, mind) {
  const body = specDigest(spec), config = digestOf(mind), key = `${body} ${config}`;
  let played = PLAYED.get(key);
  if (!played) PLAYED.set(key, played = Object.freeze({ body: spec.model, spec: body, mind: config,
    read: Object.freeze(Object.fromEntries([...new Set(treeData(mind))].sort().map((data) => [data, recordDigest(data)]))) }));
  return played;
}

/** The Minds among `played`, each once, in an order that does not depend on the order they came in. */
export function playedOnce(played) {
  const once = new Map();
  for (const one of played) once.set(JSON.stringify(one), one);
  return [...once.keys()].sort().map((key) => once.get(key));
}

/** Each strike's digest (`skillDigest`), by its action, its executor, its body's spec and its parts: each is frozen data, read once. */
const SKILL_DIGESTS = new WeakMap();
/** The keys of an action whose executor is none of those given. */
const NO_EXECUTOR = Object.freeze({});

/**
 * **A strike's digest** on a body of `spec`, where its profile came from (`Origin.skill`): what it
 * does, not what it is called: its action's config and its executor's (the one among `executors`
 * the action names), each without its name, the variation of the executor's skill it runs
 * (`chosenVariation`), and the body's own row of each record the executor and the action's aim
 * read (`Part.reads`: an executor's data is its skills' records by model, `SkillRecord`), as the
 * mind holds them, so another body's row moves no digest.
 */
export function skillDigest(parts, spec, executors, action) {
  const executor = executors.find((entry) => entry.name === action.executor) ?? NO_EXECUTOR;
  let byExecutor = SKILL_DIGESTS.get(action);
  if (!byExecutor) SKILL_DIGESTS.set(action, byExecutor = new WeakMap());
  let bySpec = byExecutor.get(executor);
  if (!bySpec) byExecutor.set(executor, bySpec = new WeakMap());
  let byParts = bySpec.get(spec);
  if (!byParts) bySpec.set(spec, byParts = new WeakMap());
  let digest = byParts.get(parts);
  if (digest === undefined) byParts.set(parts, digest = readSkillDigest(parts, spec, executor === NO_EXECUTOR ? null : executor, action));
  return digest;
}

function readSkillDigest(parts, spec, executor, action) {
  const body = spec.model, part = executor ? parts.of("executor", executor) : null;
  const aim = action.aim ? parts.of("aim", action.aim) : null;
  const variation = executor ? chosenVariation(spec, executor.kind, executor) : undefined;
  // The executor's records are asked with the variation its body runs: another variation's record moves no digest.
  const asked = executor && variation !== undefined ? { ...executor, variation } : executor;
  const keys = [...new Set([...(asked && part ? part.reads?.(asked) ?? [] : []), ...(action.aim ? aim?.reads?.(action.aim) ?? [] : [])])];
  const data = keys.map((key) => digestOf(dataIdentity(key, body)));
  const { name: _action, executor: _executor, ...does } = action;
  const kept = executor && (({ name: _, variation: _variation, ...rest }) => rest)(executor);
  return digestOf({ action: does, executor: kept, ...(variation === undefined ? {} : { variation }), data });
}

/** A ground technique's digest, where its profile came from (`Origin.skill`): its config and the body's records its part reads. */
export function techniqueDigest(parts, spec, technique) {
  const keys = parts.of("technique", technique).reads?.(technique) ?? [];
  const body = spec.model, data = keys.map((key) => digestOf(dataIdentity(key, body)));
  return data.length ? digestOf({ technique, data }) : digestOf(technique);
}
