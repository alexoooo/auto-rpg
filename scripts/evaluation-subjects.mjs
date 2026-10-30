/** Resolve CLI subject names and configs, keeping an ablation within its source's entrants, calibration and character. */
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { CONTROLLERS, MINDS } from "../src/core/mind/controllers.ts";
import { replacedAt } from "../src/core/mind/catalog.ts";
import { recordingKey } from "../src/core/recording.ts";
import { sha256Text } from "../src/evaluation/sha256.ts";

/** The subject `text` names: a JSON file or JSON as given whole, else a name for the catalogue. */
export function subjectOf(text) {
  if (existsSync(text)) return { id: basename(text).replace(/\.json$/, ""), label: text, value: JSON.parse(readFileSync(text, "utf8")) };
  if (text.trim().startsWith("{")) {
    const value = JSON.parse(text);
    return { id: `json:${sha256Text(recordingKey(value)).slice(0, 8)}`, label: "given as JSON", value };
  }
  return text;
}

/** Whether subject `id` is mind `prefix`'s: the mind itself, or one of its entrants (`prefix/...`). */
export const belongsTo = (id, prefix) => id === prefix || id.startsWith(`${prefix}/`);

/** The source choice and its changed config, named by the source's id and the replaced paths. */
function ablated(previous, ablations) {
  const source = subjectOf(previous);
  const [id, label, config] = typeof source !== "string" ? [source.id, source.label, source.value]
    : Object.hasOwn(MINDS, source) ? [source, MINDS[source].label, MINDS[source].config]
    : Object.hasOwn(CONTROLLERS, source) ? [source, CONTROLLERS[source].label, CONTROLLERS[source].defaults]
    : (() => { throw new Error(`--ablate needs --previous to name a mind, a kind or a config: ${previous} is none`); })();
  let value = JSON.parse(JSON.stringify(config));
  const slots = [];
  for (const ablation of ablations) {
    const at = ablation.indexOf("=");
    if (at <= 0) throw new Error(`--ablate is <path>=<JSON>, the path a slot or setting of the mind's parts (subs.0, tactics.list.attack, actions.thrust): ${ablation}`);
    const slot = ablation.slice(0, at);
    value = replacedAt(value, slot, JSON.parse(ablation.slice(at + 1)));
    slots.push(slot);
  }
  return { source, subject: { id: `${id}~${slots.join("~")}`, label: `${label} with ${ablations.join(", ")}`, value } };
}

/** The CLI's choices and their expanded subjects, before scheduling or recording. */
export function resolveSubjects(evaluation, names, previous, ablations) {
  if (ablations && !previous) throw new Error("--ablate builds its subject from --previous");
  const given = names.map(subjectOf);
  if (!ablations) return { choice: given, subjects: evaluation.subjects(given) };
  const { source, subject } = ablated(previous, ablations), choice = [subject, ...given];
  const prefix = typeof source === "string" ? source : source.id;
  const inherited = new Map(evaluation.subjects([source, ...given]).filter(one => belongsTo(one.id, prefix))
    .map(one => [one.id.slice(prefix.length), one]));
  const subjects = evaluation.subjects(choice).flatMap(one => {
    if (!belongsTo(one.id, subject.id)) return [one];
    const before = inherited.get(one.id.slice(subject.id.length));
    return !before ? [] : [{ ...one, ...(before.models === undefined ? {} : { models: before.models }),
      ...(before.character === undefined ? {} : { character: before.character, parts: [...one.parts, ...before.parts.filter(part => part.id.startsWith("character:"))] }) }];
  });
  return { choice, subjects };
}
