import {
  EQUIPMENT,
  constructSelectionRefusal,
  withControl,
  withConstruct,
  withEquipment,
  withPolicy,
  withUnit,
  type Control,
  type Matchup,
} from "./bout";
import { supportsLoadoutForUnit, UNITS, unitDefinition } from "./units";
import type { Side } from "./physics";

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character] as string);

export interface ConstructSetupAffordance {
  /** Installed exact saved revisions. IDs pin blueprint, Control Graph and Mind together. */
  entries(): readonly Readonly<{ id: string; label: string; blueprint: string; control: string; program: string }>[];
  /** The initial installed revision used only when a side has never selected one. */
  defaultId(): string;
  /** Opens the mouse-driven Forge without changing the bout selection underneath it. */
  open(side: Side): void;
}

/**
 * The screen before the fight.
 *
 * It is the only thing inside `#curtain`, because setup genuinely replaces the
 * arena: there is no bout to look at yet. Pause is a compact sibling in the game
 * view and never routes through this class, so focusing a screenshot tool cannot
 * turn a standing fight into character selection.
 *
 * The two corners are generated from `UNITS` and `POLICIES` rather than written
 * out in `index.html`, so an option that exists is selectable and an option that
 * is selectable exists. Hand-written markup is how a picker ends up offering a
 * policy the code no longer has, and the failure is silent right up until
 * somebody selects it.
 *
 * This holds the live selection and `src/bout.ts` holds the rules that constrain
 * it -- notably that there is one of you, so taking a side gives the other back
 * to its policy. Two radio groups cannot express that between them, because
 * neither knows the other exists; `withControl` does, and `render` puts its
 * answer back into both groups. That is why every change re-reads the whole
 * screen from the matchup instead of trusting the control that was just
 * clicked.
 */
export class SetupScreen {
  private readonly host: HTMLElement;
  private readonly unavailableUnits: Readonly<Record<string, string>>;
  private matchup: Matchup;

  private readonly units: Record<Side, HTMLSelectElement>;
  private readonly policies: Record<Side, HTMLSelectElement>;
  private readonly hands: Record<"handA" | "handB", Record<Side, HTMLSelectElement>>;
  private readonly controls: Record<Side, HTMLInputElement[]>;
  private readonly beginButton: HTMLButtonElement | null;
  private readonly constructAffordance: ConstructSetupAffordance | null;
  private readonly humanoidEquipment: Record<Side, HTMLElement[]>;
  private readonly blueprintFields: Record<Side, HTMLElement>;
  private readonly blueprintLabels: Record<Side, HTMLOutputElement>;
  private readonly constructs: Record<Side, HTMLSelectElement>;
  private readonly forgeButtons: Record<Side, HTMLButtonElement>;

  constructor(
    host: HTMLElement,
    matchup: Matchup,
    unavailableUnits: Readonly<Record<string, string>> = Object.freeze({}),
    beginButton: HTMLButtonElement | null = null,
    constructAffordance: ConstructSetupAffordance | null = null,
  ) {
    this.host = host;
    this.unavailableUnits = unavailableUnits;
    this.matchup = matchup;
    this.beginButton = beginButton;
    this.constructAffordance = constructAffordance;

    host.innerHTML = `${this.corner("left", "Left")}${this.corner("right", "Right")}`;

    const one = <T extends HTMLElement>(selector: string): T => {
      const found = host.querySelector<T>(selector);
      if (!found) throw new Error(`the setup screen is missing ${selector}`);
      return found;
    };
    const pick = <T extends HTMLElement>(field: string): Record<Side, T> => ({
      left: one<T>(`[data-side="left"][data-field="${field}"]`),
      right: one<T>(`[data-side="right"][data-field="${field}"]`),
    });

    this.units = pick<HTMLSelectElement>("unit");
    this.policies = pick<HTMLSelectElement>("policy");
    this.hands = {
      handA: pick<HTMLSelectElement>("handA"),
      handB: pick<HTMLSelectElement>("handB"),
    };
    this.controls = {
      left: [...host.querySelectorAll<HTMLInputElement>('[data-side="left"][data-field="control"]')],
      right: [...host.querySelectorAll<HTMLInputElement>('[data-side="right"][data-field="control"]')],
    };
    this.humanoidEquipment = {
      left: [...host.querySelectorAll<HTMLElement>('[data-side="left"][data-humanoid-equipment]')],
      right: [...host.querySelectorAll<HTMLElement>('[data-side="right"][data-humanoid-equipment]')],
    };
    this.blueprintFields = pick<HTMLElement>("blueprint-field");
    this.blueprintLabels = pick<HTMLOutputElement>("blueprint-label");
    this.constructs = pick<HTMLSelectElement>("construct");
    this.forgeButtons = pick<HTMLButtonElement>("open-forge");

    // One delegated listener rather than seven. The controls are built here and
    // never replaced -- `render` writes values into them -- so there is nothing
    // to rebind and nothing to leak.
    host.addEventListener("change", this.onChange);
    host.addEventListener("click", this.onClick);
    this.render();
  }

  /** What the Fight button should start. */
  get selection(): Matchup {
    return this.matchup;
  }

  /**
   * Put a matchup back on the screen.
   *
   * Leaving a finished bout comes back here with the same one selected,
   * because the thing you want after a bout is the same bout again. Nothing else
   * edits the matchup, so this is usually a no-op -- and it is called anyway,
   * because "the screen happens to still have it" is not the same promise as
   * "the screen is showing what is about to be fought".
   */
  show(matchup: Matchup): void {
    this.matchup = matchup;
    this.render();
  }

  chooseConstruct(side: Side, id: string): void {
    this.matchup = withConstruct(this.matchup, side, id);
    this.render();
  }

  dispose(): void {
    this.host.removeEventListener("change", this.onChange);
    this.host.removeEventListener("click", this.onClick);
  }

  private corner(side: Side, title: string): string {
    const options = (items: readonly { name: string; label: string }[]): string =>
      items.map((item) => `<option value="${item.name}">${item.label}</option>`).join("");

    // The policy picker stays enabled on the side a person is driving, and that
    // is not an oversight. Session 07 lets you leave a body mid-fight, and the
    // one you leave picks its policy back up -- so what is chosen here is what
    // that fighter becomes the moment you step out of it, which is worth being
    // able to set before you step in.
    return `
      <div class="corner">
        <div class="corner-title">${title}</div>
        <label class="field">
          <span class="field-name">Unit</span>
          <select data-side="${side}" data-field="unit">${options(UNITS)}</select>
        </label>
        <label class="field">
          <span class="field-name">Policy</span>
          <select data-side="${side}" data-field="policy"></select>
        </label>
        <label class="field" data-side="${side}" data-humanoid-equipment>
          <span class="field-name">Hand A</span>
          <select data-side="${side}" data-field="handA">${options(EQUIPMENT)}</select>
        </label>
        <label class="field" data-side="${side}" data-humanoid-equipment>
          <span class="field-name">Hand B</span>
          <select data-side="${side}" data-field="handB">${options(EQUIPMENT)}</select>
        </label>
        <div class="field construct-blueprint" data-side="${side}" data-field="blueprint-field" hidden>
          <span class="field-name">Saved machine</span>
          <select data-side="${side}" data-field="construct"></select>
          <output data-side="${side}" data-field="blueprint-label"></output>
          <button type="button" class="setup-forge" data-side="${side}" data-field="open-forge">Open Forge</button>
        </div>
        <div class="field">
          <span class="field-name">Control</span>
          <span class="choice">
            <label><input type="radio" name="control-${side}" value="mind"
              data-side="${side}" data-field="control" /> mind</label>
            <label><input type="radio" name="control-${side}" value="you"
              data-side="${side}" data-field="control" /> you</label>
          </span>
        </div>
      </div>
    `;
  }

  private readonly onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) && !(target instanceof HTMLInputElement)) return;
    const side = target.dataset.side as Side | undefined;
    if (side !== "left" && side !== "right") return;

    switch (target.dataset.field) {
      case "unit":
        this.matchup = withUnit(
          this.matchup,
          side,
          target.value,
          unitDefinition(target.value),
        );
        break;
      case "handA":
      case "handB":
        // Straight through the reducer, club rule and all. The screen does not
        // know that choosing a club fills both hands; `render` below re-reads
        // every control from the matchup afterwards, which is the same
        // arrangement that lets `withControl` move the *other* corner.
        this.matchup = withEquipment(this.matchup, side, target.dataset.field, target.value);
        break;
      case "policy":
        this.matchup = withPolicy(this.matchup, side, target.value);
        break;
      case "construct":
        this.matchup = withConstruct(this.matchup, side, target.value);
        break;
      case "control":
        this.matchup = withControl(this.matchup, side, target.value as Control);
        break;
      default:
        return;
    }
    this.render();
  };

  private readonly onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('button[data-field="open-forge"]');
    const side = button?.dataset.side;
    if (!button || (side !== "left" && side !== "right")) return;
    this.constructAffordance?.open(side);
  };

  private render(): void {
    for (const side of ["left", "right"] as const) {
      const setup = this.matchup[side];
      const definition = unitDefinition(setup.unit);
      const construct = definition.controlSurface.startsWith("construct-");
      const savedMachine = definition.controlSurface === "construct-v3";
      const policyOptions = definition.driverOptions.some((driver) => driver.name === setup.policy)
        ? definition.driverOptions
        : [{ name: setup.policy, label: `${setup.policy} (incompatible)` }, ...definition.driverOptions];
      this.policies[side].innerHTML = policyOptions
        .map((driver) => `<option value="${driver.name}">${driver.label}</option>`).join("");
      for (const option of this.units[side].options) {
        const unavailableReason = this.unavailableUnits[option.value];
        option.disabled = unavailableReason !== undefined;
        option.title = unavailableReason ?? "";
      }
      for (const hand of ["handA", "handB"] as const) {
        const field = this.hands[hand][side];
        for (const option of field.options) {
          // Judge the result of the reducer, rather than this option beside an
          // unchanged other hand. That distinction keeps the existing route
          // from bow+bow to sword+empty enabled while a fixed authored pair,
          // such as the KayKit knight's sword+buckler, stays exact.
          const candidate = withEquipment(this.matchup, side, hand, option.value)[side];
          option.disabled = !supportsLoadoutForUnit(
            setup.unit,
            candidate.handA,
            candidate.handB,
          );
        }
        field.disabled = definition.hands === 0;
      }
      for (const field of this.humanoidEquipment[side]) field.hidden = construct;
      this.blueprintFields[side].hidden = !savedMachine;
      if (savedMachine) {
        const entries = this.constructAffordance?.entries() ?? [];
        if (setup.constructId === undefined && this.constructAffordance) {
          setup.constructId = this.constructAffordance.defaultId();
        }
        const selected = entries.find(({ id }) => id === setup.constructId);
        const shown = selected ? entries : [{ id: setup.constructId ?? "", label: "Unavailable saved machine",
          blueprint: "missing", control: "missing", program: "missing" }, ...entries];
        this.constructs[side].innerHTML = shown.map((entry) =>
          `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</option>`).join("");
        this.constructs[side].value = setup.constructId ?? "";
        this.blueprintLabels[side].textContent = selected
          ? `Blueprint ${selected.blueprint} -- Control ${selected.control} -- Mind ${selected.program}`
          : `Saved revision ${setup.constructId ?? "(none)"} is unavailable`;
        this.forgeButtons[side].disabled = this.constructAffordance === null;
        this.forgeButtons[side].title = this.constructAffordance === null
          ? "Construct Forge is unavailable: no Forge host is installed"
          : `Edit ${selected?.label ?? "this unavailable revision"} in Construct Forge`;
      }
      for (const option of this.policies[side].options) {
        option.disabled = !definition.driverOptions.some((driver) => driver.name === option.value);
      }
      this.units[side].value = setup.unit;
      this.policies[side].value = setup.policy;
      this.hands.handA[side].value = setup.handA;
      this.hands.handB[side].value = setup.handB;
      for (const button of this.controls[side]) {
        button.checked = button.value === setup.control;
        button.disabled = button.value === "you" && !definition.humanAdapter;
        button.title = button.disabled ? `control surface ${definition.kind} has no human adapter` : "";
      }
    }
    if (this.beginButton) {
      const reason = this.refusal;
      this.beginButton.disabled = reason !== null;
      this.beginButton.title = reason ?? "";
    }
  }

  get refusal(): string | null {
    for (const side of ["left", "right"] as const) {
      const setup = this.matchup[side];
      const definition = unitDefinition(setup.unit);
      if (!definition.driverOptions.some((driver) => driver.name === setup.policy)) {
        return `unit "${definition.kind}" does not support policy "${setup.policy}"`;
      }
      if (setup.control === "you" && !definition.humanAdapter) {
        return `control surface ${definition.kind} has no human adapter`;
      }
      if (definition.controlSurface === "construct-v3") {
        const refusal = constructSelectionRefusal(setup, this.constructAffordance?.entries().map(({ id }) => id) ?? []);
        if (refusal) return refusal;
      }
    }
    return null;
  }
}
