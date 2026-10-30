import type { BuiltBody } from "../build/build-body.ts";
import type { ContactIdentity } from "../control/effector-feedback.ts";
import type { AssistCeiling } from "../control/assist.ts";
import { poseAngles } from "../control/kinematics.ts";
import type { Rulebook } from "../rules/rulebook.ts";
import type { Skills } from "../skills/framework/skills.ts";
import type { ActionStatus, Ended } from "../skills/framework/action.ts";
import type { KitEntry, MenuEntry } from "../skills/framework/menu.ts";
import type { BodySpec } from "../spec/body.ts";
import type { World } from "../world.ts";
import type { MindConfig } from "./config.ts";
import type { Engagement, Tactics } from "../tactics/tactics.ts";
import type { NavigationReport } from "../navigation/navigator.ts";
import type { GaitLimits } from "../intent/travel.ts";
import type { Catalog } from "../parts/catalog.ts";
import { bodyHost, type BodyHost, type HostGrants } from "./host.ts";
import type { Orders } from "../intent/orders.ts";
import type { Senses } from "./senses.ts";
import type { PhysicalBody } from "../physical-body.ts";
import type { SheetLog } from "./sheets.ts";

/** **What a fight gives the mind it makes**, beside the body and the config. */
export interface MindWiring {
  readonly name: string;
  /** Trusted body adapter for permitted contact labels. */
  readonly contactIdentity?: ContactIdentity;
  /** Its orders this step, or null when it is left to itself. `senses` are its own, this step's. */
  orders(senses: Senses): Orders | null;
  /** What it senses (`SensesHub.add`); the clock alone unless given. */
  readonly senses?: () => Senses;
  /** The most its assist gives it; none unless given. */
  readonly assist?: AssistCeiling;
  /** The seed its mind's chances are drawn from (`BodyHost.seed`): the fight's for this body (`seedOf`); 0 unless given. */
  readonly seed?: number;
  /** The rules its fight is played by (`BodyHost.rules`); the arena's unless given. */
  readonly rules?: Rulebook;
  /** The screen's script, which tactics of kind `script` carry out: the Lab's scenario. None unless given. */
  readonly script?: Tactics;
}

/**
 * **What a mind publishes of itself** (`MindMade.report`), for a screen and its Commander, never
 * for the rules: what it reports doing (`Engagement`), and where it walks, its heading, its gait's
 * limits (`GaitLimits`) and its navigation's report; the actions its body has (`KitEntry`), those
 * under way and those ended, and its choices now (`MenuEntry`), read when asked and changing
 * nothing; null for what it does not say. A mind that runs the game's skills publishes theirs
 * (`skillsReport`); any other may publish its own.
 */
export interface MindReport {
  readonly engagement: Engagement | null;
  readonly heading: number | null;
  readonly gait: GaitLimits | null;
  readonly navigation: NavigationReport | null;
  readonly kit: readonly KitEntry[] | null;
  readonly actions: readonly ActionStatus[] | null;
  readonly ended: readonly Ended[] | null;
  readonly menu: readonly MenuEntry[] | null;
}

/** What `skills` say of their mind, live (`MindReport`). */
function skillsReport(skills: Skills): MindReport {
  return { get engagement() { return skills.report.engagement ?? null; }, get heading() { return skills.report.heading; }, gait: skills.gait,
    get navigation() { return skills.report.navigation ?? null; }, kit: skills.kit, get actions() { return skills.report.actions; },
    get ended() { return skills.report.ledger; }, get menu() { return skills.menu(); } };
}

/** **A mind as its controller makes it** (`Controller.create`): what every kind gives the fight that made it, but the body, which the fight holds from its host (`bodyHost`). */
export interface MindMade {
  /** The mind's memory above its body's (`src/core/state.ts`), saved and loaded with it. */
  readonly state: object;
  /**
   * Its skills, where it runs the game's (`Skills`): their report is what a screen or a test reads
   * of what it is doing and what holds each part of the body, and the rules never read it.
   */
  readonly skills?: Skills;
  /** What it publishes of itself (`MindReport`): its skills' where it runs them and says nothing of its own (`createMind`). */
  readonly report?: MindReport;
}

/**
 * **A body under a mind.** A fight holds one and reads what every kind gives, the body and the
 * memory, and never which kind it is: `kind` is its config's (`MindConfig.kind`), or `replay`
 * for a body played from its order sheets with no mind (`replayedBody`), for a screen to name.
 */
export interface Minded extends MindMade {
  readonly kind: string;
  readonly body: PhysicalBody;
}

/** The posture a body of `spec` is built in under the mind `config` names in `catalog` (`Controller.builtIn`), as a placement's angles (`poseAngles`). */
export function builtAngles(catalog: Catalog, spec: BodySpec, config: MindConfig): Record<string, number[]> {
  return poseAngles(spec, catalog.controllerOf(config).builtIn(spec, config, catalog.partLookup));
}

/**
 * `built` under the mind `config` names, wired to its fight, made by its controller in `catalog`
 * (`Catalog.controllers`) through a host of the body (`bodyHost`) that finds only the parts its tree names
 * (`treeLookup`); a config with a fault anywhere in its
 * tree (`treeFaults`, with the script if the wiring gives one) is refused. Given a `log`, its order
 * sheets are written in it (`SheetLog`).
 */
export function createMind(catalog: Catalog, built: BuiltBody, world: World, config: MindConfig, wiring: MindWiring, log?: SheetLog): Minded {
  const fault = catalog.treeFaults(config, wiring.script ? ["script"] : [])[0];
  if (fault) throw new Error(fault);
  const { host, made } = bodyHost(built, world, wiring, catalog.treeLookup(config), log);
  const mind = catalog.controllerOf(config).create(host, config, wiring), report = mind.report ?? (mind.skills ? skillsReport(mind.skills) : undefined);
  return { ...mind, ...(report ? { report } : {}), kind: config.kind, body: made() };
}

/**
 * A mind `make` makes through a host of `built` (`bodyHost`) under `wiring`'s grants, its parts
 * looked up in `catalog` (`Catalog.partLookup`), with the body it took: how a test or a study makes
 * one mind of its own.
 */
export function hostedMind<W extends HostGrants, M extends object>(catalog: Catalog, built: BuiltBody, world: World, wiring: W, make: (host: BodyHost, wiring: W) => M): M & { readonly body: PhysicalBody } {
  const { host, made } = bodyHost(built, world, wiring, catalog.partLookup), mind = make(host, wiring);
  return { ...mind, body: made() };
}
