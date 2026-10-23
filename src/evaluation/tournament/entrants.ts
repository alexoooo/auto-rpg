/**
 * **Entrants**: a mind on a character with a loadout, the tournament's subjects. A mind, by its id
 * (`MINDS`) or given whole, enters on each character and representative loadout it fits.
 */
import { heldItem, loadoutKey, type Loadout } from "../../core/items/held.ts";
import { MINDS } from "../../core/mind/controllers.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import { BODY_MODELS, modelRefusal, modelSpec, type BodyModel } from "../../core/models.ts";
import { FIGHT_ENTRY, partOf } from "../../core/mind/catalog.ts";
import type { Json, Subject, SubjectChoice } from "../evaluation.ts";
import { TOURNAMENT, type Entrant } from "./cases.ts";

/** `value` as plain JSON: what a part's version digests. */
const plain = (value: unknown): Json => JSON.parse(JSON.stringify(value ?? null)) as Json;

/** Each character's spec as plain JSON, made once. */
const specs = new Map<BodyModel, Json>();
const specOf = (model: BodyModel): Json => specs.get(model) ?? specs.set(model, plain(modelSpec(model))).get(model)!;

/** Whether `config` can play `model` carrying `loadout` in a fight (`modelRefusal`). */
const fits = (model: BodyModel, config: Json, loadout: Loadout): boolean => modelRefusal(model, config as unknown as MindConfig, loadout, FIGHT_ENTRY) === null;

/** The entrant of mind `id` (`config`, shown as `label`) on `model` with `loadout`. */
function entrant(id: string, label: string, config: Json, model: BodyModel, loadout: Loadout): Subject {
  const value: Entrant = { mind: config, model, loadout };
  return {
    id: `${id}/${model}/${loadoutKey(loadout)}`, label: `${label}, ${model}, ${loadoutKey(loadout)}`, value: value as unknown as Json,
    parts: [{ id: `mind:${id}`, value: config }, { id: `model:${model}`, value: specOf(model) },
      { id: `left:${loadout.left}`, value: plain(heldItem(loadout.left)) }, { id: `right:${loadout.right}`, value: plain(heldItem(loadout.right)) }],
  };
}

/** Mind `id`'s entrants: one for each character and representative loadout it fits. */
export const entrantsOf = (id: string, label: string, config: Json, models: readonly BodyModel[] = BODY_MODELS): Subject[] =>
  models.flatMap((model) => TOURNAMENT.loadouts.filter((loadout) => fits(model, config, loadout)).map((loadout) => entrant(id, label, config, model, loadout)));

/**
 * The entrants `choice` names, in order: a mind's id gives its entrants, an entrant's id
 * (`mind/character/left,right`) that one, a mind given whole its entrants. None names the field:
 * every game mind a person may pick (`Part.stage`); an experimental one enters when it is named.
 */
export function entrantSubjects(choice: SubjectChoice): Subject[] {
  const mind = (id: string) => MINDS[id] ?? (() => { throw new Error(`no mind ${id}: ${Object.keys(MINDS).join(", ")}`); })();
  const named = choice.length > 0 ? choice : Object.keys(MINDS).filter((id) => partOf(MINDS[id]!.config).stage === "game");
  return named.flatMap((one) => {
    if (typeof one !== "string") return entrantsOf(one.id, one.label, one.value);
    if (!one.includes("/")) {
      const preset = mind(one);
      return entrantsOf(one, preset.label, preset.config as unknown as Json, BODY_MODELS.filter(model => presetFitsModel(preset, model)));
    }
    const [id, model, held] = one.split("/"), loadout = TOURNAMENT.loadouts.find((each) => loadoutKey(each) === held);
    const { label, config } = mind(id);
    if (!BODY_MODELS.includes(model as BodyModel) || !presetFitsModel(mind(id), model!) || !loadout || !fits(model as BodyModel, config as unknown as Json, loadout)) throw new Error(`${one} is no entrant`);
    return [entrant(id, label, config as unknown as Json, model as BodyModel, loadout)];
  });
}
