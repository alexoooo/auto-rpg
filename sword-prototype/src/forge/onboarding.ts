import { canonicalControlJson, type ConstructCommand, type ConstructControlGraph } from "../construct/actions.ts";
import type { ConstructBlueprint } from "../construct/blueprint.ts";
import { canonicalBlueprintJson } from "../construct/canonical.ts";
import { CONSTRUCT_PLAYTEST_PROTOCOL, CONSTRUCT_PLAYTEST_PROTOCOL_DIGEST } from "../construct/playtest.ts";
import type { ConstructProgram, Expression } from "../construct/program.ts";
import type { SavedConstruct } from "../construct/codec.ts";
import type { ForgeCommand } from "./model.ts";

export const CONSTRUCT_ONBOARDING_STORAGE_KEY = "sword-prototype.construct-forge-onboarding.v3";

export interface ConstructOnboardingOptions {
  readonly initialBlueprint: ConstructBlueprint;
  readonly initialControl: ConstructControlGraph;
  readonly onSection: (section: "body" | "actions" | "mind" | "lab") => void;
  /** Opens the ordinary saved-construct visible Lab; the guide owns no arena or motor handle. */
  readonly onVisibleLab: (savedId: string) => boolean;
}

interface OnboardingState {
  readonly version: 3;
  readonly protocolDigest: string;
  readonly inspectedBody: boolean;
  readonly builtFrontLeft: boolean;
  readonly builtFrontRight: boolean;
  readonly builtRearLeft: boolean;
  readonly builtRearRight: boolean;
  readonly sawFourLimbs: boolean;
  readonly changedBody: boolean;
  readonly sawLauncher: boolean;
  readonly swappedToSword: boolean;
  readonly hasLocomotion: boolean;
  readonly hasAttack: boolean;
  readonly changedControl: boolean;
  readonly probedLocomotion: boolean;
  readonly probedAttack: boolean;
  readonly sawWeakMind: boolean;
  readonly launchedWeakLab: boolean;
  readonly sawDiagnostic: boolean;
  readonly repairedMind: boolean;
  readonly launchedLab: boolean;
  readonly weakSavedId: string | null;
  readonly weakLabSide: "left" | "right" | null;
  readonly diagnosedWeakId: string | null;
  readonly repairedSavedId: string | null;
}

export interface ConstructOnboardingCheckpoint {
  readonly stateJson: string;
  readonly currentProgramWeak: boolean;
  readonly issue: string | null;
  readonly persisted: string | null;
}

const freshState = (): OnboardingState => ({
  version: 3, protocolDigest: CONSTRUCT_PLAYTEST_PROTOCOL_DIGEST, inspectedBody: false, sawFourLimbs: false,
  builtFrontLeft: false, builtFrontRight: false, builtRearLeft: false, builtRearRight: false,
  changedBody: false, sawLauncher: false, swappedToSword: false, hasLocomotion: false, hasAttack: false,
  changedControl: false, probedLocomotion: false, probedAttack: false, sawWeakMind: false, sawDiagnostic: false,
  launchedWeakLab: false, repairedMind: false, launchedLab: false,
  weakSavedId: null, weakLabSide: null, diagnosedWeakId: null, repairedSavedId: null,
});
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character] as string);
const STATE_FIELDS = Object.keys(freshState());
const parseState = (text: string): OnboardingState => {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("saved guide must be an object");
  const row = value as Record<string, unknown>;
  const extra = Object.keys(row).find((key) => !STATE_FIELDS.includes(key));
  const missing = STATE_FIELDS.find((key) => !Object.prototype.hasOwnProperty.call(row, key));
  if (extra) throw new Error(`saved guide has unknown field "${extra}"`);
  if (missing) throw new Error(`saved guide is missing field "${missing}"`);
  if (row.version !== 3 || row.protocolDigest !== CONSTRUCT_PLAYTEST_PROTOCOL_DIGEST) throw new Error("saved guide belongs to another protocol");
  for (const key of STATE_FIELDS.filter((field) => !["version", "protocolDigest", "weakSavedId", "weakLabSide", "diagnosedWeakId", "repairedSavedId"].includes(field))) {
    if (typeof row[key] !== "boolean") throw new Error(`saved guide field "${key}" must be boolean`);
  }
  for (const key of ["weakSavedId", "diagnosedWeakId", "repairedSavedId"]) if (row[key] !== null && typeof row[key] !== "string") {
    throw new Error(`saved guide field "${key}" must be string or null`);
  }
  if (row.weakLabSide !== null && row.weakLabSide !== "left" && row.weakLabSide !== "right") throw new Error("saved guide weakLabSide is invalid");
  return Object.freeze(row) as unknown as OnboardingState;
};

const limbQuadrants = (blueprint: ConstructBlueprint): number => {
  const children = new Map<string, string[]>();
  for (const joint of blueprint.joints) children.set(joint.parentPart, [...(children.get(joint.parentPart) ?? []), joint.childPart]);
  const quadrants = new Set<string>();
  for (const child of children.get(blueprint.rootPart) ?? []) {
    let depth = 0; let frontier = [child];
    while (frontier.length > 0 && depth < 4) { depth += 1; frontier = frontier.flatMap((part) => children.get(part) ?? []); }
    const rootJoint = blueprint.joints.find((joint) => joint.parentPart === blueprint.rootPart && joint.childPart === child);
    if (depth >= 3 && rootJoint) quadrants.add(`${Math.sign(rootJoint.parentFrame.positionM[0])}:${Math.sign(rootJoint.parentFrame.positionM[2])}`);
  }
  return quadrants.size;
};
const weakExpression = (expression: Expression): boolean => expression.op === "constant" &&
  (expression.value === false || (typeof expression.value === "number" && expression.value <= 0));
export const programIsDeliberatelyWeak = (program: ConstructProgram): boolean => program.rules.length === 0 ||
  program.rules.some((rule) => weakExpression(rule.condition) || weakExpression(rule.utility));

export function onboardingProgress(state: OnboardingState): readonly boolean[] {
  return Object.freeze([
    state.inspectedBody && state.sawFourLimbs && state.changedBody && state.builtFrontLeft && state.builtFrontRight &&
      state.builtRearLeft && state.builtRearRight,
    state.sawLauncher && state.swappedToSword,
    state.changedControl && state.hasLocomotion && state.hasAttack && state.probedLocomotion && state.probedAttack,
    state.sawWeakMind && state.sawDiagnostic && state.repairedMind && state.launchedLab,
  ]);
}

export function constructOnboardingMarkup(state: OnboardingState, issue: string | null): string {
  const done = onboardingProgress(state);
  const steps = CONSTRUCT_PLAYTEST_PROTOCOL.assignments.map((assignment, index) => `<li data-guide-step="${assignment.id}" data-complete="${done[index]}">` +
    `<b>${done[index] ? "Complete" : `Step ${index + 1}`} -- ${escapeHtml(assignment.task)}</b>` +
    (index === 0 ? `<p>Start from this powered core. In Body, select the core and attach each of the four named connected limb fragments. The guide requires one real four-joint branch in every corner; a prebuilt Warden cannot complete this step.</p>` +
      `<button type="button" data-guide-action="body">Open Body</button> <button type="button" data-guide-action="inspected">I inspected my four built branches</button>` : "") +
    (index === 1 ? `<p>In Body, select the dorsal output socket, unmount the launcher, then mount the sword from the ordinary catalog.</p><button type="button" data-guide-action="body">Open Body</button>` : "") +
    (index === 2 ? `<p>In Actions, author or materially change one quadruped action and one aim, fire, or sweep action, including their role bindings. Probe those exact changed action rows; probing the starter's unchanged actions does not count.</p><button type="button" data-guide-action="actions">Open Actions</button>` : "") +
    (index === 3 ? `<p>In Mind, make a deliberately weak revision and Save it. Run that saved weak revision in visible Lab, then inspect a real refusal or stuck diagnostic. Reopen Forge, repair the Mind, Save the repair, and run the repaired saved revision in visible Lab. The steps only count in that order.</p>` +
      `<button type="button" data-guide-action="mind">Open Mind</button> <button type="button" data-guide-action="lab" ${state.sawWeakMind ? "" : "disabled"}>Choose this saved machine in visible Lab</button>` : "") +
    `</li>`).join("");
  return `<aside class="construct-onboarding" aria-label="Construct Forge guided checklist"><header><div><p class="forge-kicker">Guided first machine</p>` +
    `<h2>${done.filter(Boolean).length} / ${done.length} assignments</h2></div><code>${escapeHtml(CONSTRUCT_PLAYTEST_PROTOCOL_DIGEST)}</code></header>` +
    `<p>This checklist autosaves locally and resumes after short sessions. It watches only ordinary blueprints, saved control/program data, public probe commands, diagnostics and visible Lab.</p>` +
    `<p class="forge-refusal" role="alert" ${issue ? "" : "hidden"}>${escapeHtml(issue ?? "")}` +
    `${issue ? ` <button type="button" data-guide-action="restart">Archive and restart guide</button>` : ""}</p><ol>${steps}</ol></aside>`;
}

export class ConstructOnboarding {
  private readonly host: HTMLElement; private readonly options: ConstructOnboardingOptions;
  private state: OnboardingState = freshState(); private issue: string | null = null; private readonly initialBlueprintJson: string;
  private readonly initialControlJson: string;
  private readonly initialActions: ReadonlyMap<string, string>;
  private currentProgramWeak = false;
  constructor(host: HTMLElement, options: ConstructOnboardingOptions) {
    this.host = host; this.options = options; this.initialBlueprintJson = canonicalBlueprintJson(options.initialBlueprint);
    this.initialControlJson = canonicalControlJson(options.initialControl);
    this.initialActions = new Map(options.initialControl.actions.map((action) => [action.id, JSON.stringify(action)])); this.load();
    this.observeBlueprint(options.initialBlueprint); host.addEventListener("click", this.onClick); this.render();
  }
  get progress(): readonly boolean[] { return onboardingProgress(this.state); }
  checkpoint(): ConstructOnboardingCheckpoint { return Object.freeze({
    stateJson: JSON.stringify(this.state), currentProgramWeak: this.currentProgramWeak, issue: this.issue,
    persisted: localStorage.getItem(CONSTRUCT_ONBOARDING_STORAGE_KEY),
  }); }
  restore(checkpoint: ConstructOnboardingCheckpoint): void {
    if (checkpoint.persisted === null) localStorage.removeItem(CONSTRUCT_ONBOARDING_STORAGE_KEY);
    else localStorage.setItem(CONSTRUCT_ONBOARDING_STORAGE_KEY, checkpoint.persisted);
    this.state = parseState(checkpoint.stateJson); this.currentProgramWeak = checkpoint.currentProgramWeak;
    this.issue = checkpoint.issue; this.render();
  }
  dispose(): void { this.host.removeEventListener("click", this.onClick); this.host.innerHTML = ""; }
  observeBlueprint(blueprint: ConstructBlueprint): void {
    this.update({ sawFourLimbs: this.state.sawFourLimbs || limbQuadrants(blueprint) >= 4,
      changedBody: this.state.changedBody || canonicalBlueprintJson(blueprint) !== this.initialBlueprintJson,
      sawLauncher: this.state.sawLauncher || blueprint.modules.some(({ kind }) => kind === "launcher"),
      swappedToSword: this.state.swappedToSword || blueprint.modules.some(({ kind }) => kind === "sword") && !blueprint.modules.some(({ kind }) => kind === "launcher") });
  }
  observeBodyEdit(command: ForgeCommand): void {
    if (command.kind !== "attach-connected-fragment") return;
    const rootJoint = command.joints.find((joint) => joint.parentPart === this.options.initialBlueprint.rootPart);
    if (!rootJoint) return;
    const x = rootJoint.parentFrame.positionM[0] < 0 ? "Left" : "Right";
    const z = rootJoint.parentFrame.positionM[2] < 0 ? "Rear" : "Front";
    this.update({ [`built${z}${x}`]: true } as Partial<OnboardingState>);
  }
  observeControl(graph: ConstructControlGraph): void { this.update({
    hasLocomotion: this.state.hasLocomotion || graph.actions.some(({ controller }) => controller.startsWith("quadruped-")),
    hasAttack: this.state.hasAttack || graph.actions.some(({ controller }) => ["fire-projectile", "sweep-arc", "aim-direction", "track-target"].includes(controller)),
    changedControl: this.state.changedControl || canonicalControlJson(graph) !== this.initialControlJson,
  }); }
  observeProbe(command: ConstructCommand, graph: ConstructControlGraph): void {
    const controllers = command.requests.map(({ request }) => {
      const action = graph.actions.find(({ id }) => id === request.action);
      if (!action || this.initialActions.get(action.id) === JSON.stringify(action)) return "";
      return action.controller;
    });
    this.update({ probedLocomotion: this.state.probedLocomotion || controllers.some((name) => name.startsWith("quadruped-")),
      probedAttack: this.state.probedAttack || controllers.some((name) => ["fire-projectile", "sweep-arc", "aim-direction", "track-target"].includes(name)) });
  }
  observeProgram(program: ConstructProgram): void { this.currentProgramWeak = programIsDeliberatelyWeak(program); }
  observeSaved(saved: SavedConstruct): void {
    this.currentProgramWeak = programIsDeliberatelyWeak(saved.program);
    const id = `${saved.digests.blueprint}/${saved.digests.control}/${saved.digests.program}`;
    if (this.currentProgramWeak) this.update({ sawWeakMind: true, weakSavedId: id, launchedWeakLab: false,
      weakLabSide: null, sawDiagnostic: false, diagnosedWeakId: null, repairedMind: false, repairedSavedId: null, launchedLab: false });
    else if (this.state.diagnosedWeakId === this.state.weakSavedId && this.state.weakSavedId?.split("/").slice(0, 2).join("/") ===
        id.split("/").slice(0, 2).join("/") && id !== this.state.weakSavedId) {
      this.update({ repairedMind: true, repairedSavedId: id });
    }
  }
  observeDiagnostic(savedId: string | undefined, side: "left" | "right", hasRefusalOrStuck: boolean): void {
    if (hasRefusalOrStuck && savedId === this.state.weakSavedId && side === this.state.weakLabSide && !this.state.repairedMind) {
      this.update({ sawDiagnostic: true, diagnosedWeakId: savedId });
    }
  }
  visibleLabStarted(savedId: string, side: "left" | "right"): void {
    if (savedId === this.state.repairedSavedId && side === this.state.weakLabSide) this.update({ launchedLab: true });
    else if (savedId === this.state.weakSavedId) this.update({ launchedWeakLab: true, weakLabSide: side });
  }
  private update(change: Partial<OnboardingState>): void { this.state = Object.freeze({ ...this.state, ...change }); this.save(); this.render(); }
  private load(): void { try { const source = localStorage.getItem(CONSTRUCT_ONBOARDING_STORAGE_KEY); if (source !== null) this.state = parseState(source); }
    catch (error) { this.issue = `Saved Forge guide was refused (${error instanceof Error ? error.message : String(error)}). It was not overwritten.`; } }
  private save(): void { if (this.issue) return; try { localStorage.setItem(CONSTRUCT_ONBOARDING_STORAGE_KEY, JSON.stringify(this.state)); }
    catch (error) { this.issue = `Forge guide could not autosave (${error instanceof Error ? error.message : String(error)}).`; } }
  private render(): void { this.host.innerHTML = constructOnboardingMarkup(this.state, this.issue); }
  private readonly onClick = (event: Event): void => { const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("button[data-guide-action]"); if (!button) return;
    const action = button.dataset.guideAction; if (action === "inspected") { this.update({ inspectedBody: true }); return; }
    if (action === "restart") {
      try {
        const source = localStorage.getItem(CONSTRUCT_ONBOARDING_STORAGE_KEY);
        if (source !== null) localStorage.setItem(`${CONSTRUCT_ONBOARDING_STORAGE_KEY}.archive.${Date.now()}`, source);
        localStorage.removeItem(CONSTRUCT_ONBOARDING_STORAGE_KEY);
        this.issue = null; this.state = freshState(); this.observeBlueprint(this.options.initialBlueprint);
      } catch (error) { this.issue = `Forge guide could not restart (${error instanceof Error ? error.message : String(error)}).`; this.render(); }
      return;
    }
    if (action === "body" || action === "actions" || action === "mind") { this.options.onSection(action); return; }
    if (action === "lab") {
      const id = this.state.repairedSavedId ?? this.state.weakSavedId;
      if (id) this.options.onVisibleLab(id);
    }
  };
}
