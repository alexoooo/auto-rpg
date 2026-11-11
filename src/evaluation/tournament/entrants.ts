/**
 * **Entrants**: a mind on a character with a loadout, the tournament's subjects. A mind, by its id
 * (`MINDS`) or given whole, enters on each character and representative loadout it fits.
 */
import type { AttributeOverrides } from "../../core/bodies/character-attributes.ts";
import { loadoutKey, type Loadout } from "../../core/bodies/items/held.ts";
import { presetFitsModel } from "../../minds/catalog/controller.ts";
import type { MindConfig } from "../../minds/catalog/config.ts";
import { BODY_MODELS, type BodyModel } from "../../core/bodies/models.ts";
import { mindSubject, type Json, type Subject, type SubjectChoice } from "../evaluation.ts";
import { TOURNAMENT, type Entrant } from "./cases.ts";
import { FIGHT_ENTRY } from "../../minds/catalog/catalog.ts";
import { type GameContext } from "../../game/arena/context.ts";

/** The entrant of mind `id` (`config`, shown as `label`) on `model` with `loadout`, its body taking `character` (`MindPreset.character`). */
function entrant(id: string, label: string, config: Json, model: BodyModel, loadout: Loadout, character: AttributeOverrides): Subject {
  const value: Entrant = { mind: config, model, loadout }, own = Object.keys(character).length > 0;
  return {
    id: `${id}/${model}/${loadoutKey(loadout)}`, label: `${label}, ${model}, ${loadoutKey(loadout)}`, models: [model], value: value as unknown as Json,
    ...(own ? { character } : {}),
  };
}

export function createTournamentEntrants(context: GameContext) {
  const { modelRefusal } = context;
  const { partOf, minds: MINDS } = context.catalog;

  /** Whether `config` can play `model` with `character`'s attributes carrying `loadout` in a fight (`modelRefusal`). */
  const fits = (model: BodyModel, config: Json, loadout: Loadout, character: AttributeOverrides): boolean =>
    modelRefusal(model, config as unknown as MindConfig, loadout, FIGHT_ENTRY, character) === null;

  /** Mind `id`'s entrants: one for each character and representative loadout it fits. */
  const entrantsOf = (id: string, label: string, config: Json, models: readonly BodyModel[] = BODY_MODELS, character: AttributeOverrides = {}): Subject[] =>
    models.flatMap((model) => TOURNAMENT.loadouts.filter((loadout) => fits(model, config, loadout, character)).map((loadout) => entrant(id, label, config, model, loadout, character)));

  /**
   * The entrants `choice` names, in order: a mind's id gives its entrants, an entrant's id
   * (`mind/character/left,right`) that one, a mind given whole its entrants. None names the field:
   * every game mind a person may pick (`Part.stage`); an experimental one enters when it is named.
   */
  function entrantSubjects(choice: SubjectChoice): Subject[] {
    const mind = (id: string) => MINDS[id] ?? (() => { throw new Error(`no mind ${id}: ${Object.keys(MINDS).join(", ")}`); })();
    const named = choice.length > 0 ? choice : Object.keys(MINDS).filter((id) => partOf(MINDS[id]!.config).stage === "game");
    return named.flatMap((one) => {
      if (typeof one !== "string") {
        const subject = mindSubject(one.id, one.label, one.value, one);
        return entrantsOf(subject.id, subject.label, subject.value, BODY_MODELS.filter(model => presetFitsModel(subject, model)), subject.character);
      }
      if (!one.includes("/")) {
        const preset = mind(one);
        return entrantsOf(one, preset.label, preset.config as unknown as Json, BODY_MODELS.filter(model => presetFitsModel(preset, model)), preset.character);
      }
      const [id, model, held] = one.split("/"), loadout = TOURNAMENT.loadouts.find((each) => loadoutKey(each) === held);
      const { label, config, character = {} } = mind(id);
      if (!BODY_MODELS.includes(model as BodyModel) || !presetFitsModel(mind(id), model!) || !loadout || !fits(model as BodyModel, config as unknown as Json, loadout, character)) throw new Error(`${one} is no entrant`);
      return [entrant(id, label, config as unknown as Json, model as BodyModel, loadout, character)];
    });
  }

  return { entrantSubjects };
}
