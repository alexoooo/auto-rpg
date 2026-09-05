import {
  EQUIPMENT,
  withControl,
  withEquipment,
  withGolemEffector,
  withGolemSlot,
  withPolicy,
  withUnit,
  type Control,
  type GolemEffectorSetup,
  type GolemSlotName,
  type Matchup,
} from "./bout";
import {
  NO_TERMINAL,
  golemChainOptions,
  golemEffector,
  golemHeadOptions,
  golemLocomotionOptions,
  golemSetupRefusal,
  golemTerminalOptions,
  golemTorsoOptions,
  type GolemSlotOption,
} from "./golem/build";
import { supportsLoadoutForUnit, UNITS, unitDefinition } from "./units";
import type { Side } from "./physics";

/**
 * The seven `<select>`s a golem corner adds, and what each edits.
 *
 * Seven and not five, because the two effector slots are **two** choices each: the overview's
 * whole design for an effector is that the chain and the terminal are picked independently, the
 * chain owning motion and the terminal owning what is on the end. A single "arm" picker would be
 * a shelf of pairs somebody had to write down, which is the second copy of the ladder this plan
 * set keeps refusing to make.
 */
const GOLEM_FIELDS = [
  { field: "golemLocomotion", label: "Legs" },
  { field: "golemTorso", label: "Trunk" },
  { field: "golemHead", label: "Head" },
  { field: "golemPrimaryChain", label: "Primary arm" },
  { field: "golemPrimaryTerminal", label: "Primary end" },
  { field: "golemSecondaryChain", label: "Secondary arm" },
  { field: "golemSecondaryTerminal", label: "Secondary end" },
] as const;

type GolemField = typeof GOLEM_FIELDS[number]["field"];

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
  private readonly golem: Record<GolemField, Record<Side, HTMLSelectElement>>;
  private readonly handFields: Record<"handA" | "handB", Record<Side, HTMLElement>>;
  private readonly golemFields: Record<GolemField, Record<Side, HTMLElement>>;
  private readonly controls: Record<Side, HTMLInputElement[]>;
  private readonly beginButton: HTMLButtonElement | null;

  constructor(
    host: HTMLElement,
    matchup: Matchup,
    unavailableUnits: Readonly<Record<string, string>> = Object.freeze({}),
    beginButton: HTMLButtonElement | null = null,
  ) {
    this.host = host;
    this.unavailableUnits = unavailableUnits;
    this.matchup = matchup;
    this.beginButton = beginButton;

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

    const wrapper = <T extends HTMLElement>(field: string): Record<Side, T> => ({
      left: one<T>(`[data-side="left"][data-wrap="${field}"]`),
      right: one<T>(`[data-side="right"][data-wrap="${field}"]`),
    });

    this.units = pick<HTMLSelectElement>("unit");
    this.policies = pick<HTMLSelectElement>("policy");
    this.hands = {
      handA: pick<HTMLSelectElement>("handA"),
      handB: pick<HTMLSelectElement>("handB"),
    };
    this.handFields = {
      handA: wrapper<HTMLElement>("handA"),
      handB: wrapper<HTMLElement>("handB"),
    };
    this.golem = Object.fromEntries(GOLEM_FIELDS.map(({ field }) =>
      [field, pick<HTMLSelectElement>(field)])) as Record<GolemField, Record<Side, HTMLSelectElement>>;
    this.golemFields = Object.fromEntries(GOLEM_FIELDS.map(({ field }) =>
      [field, wrapper<HTMLElement>(field)])) as Record<GolemField, Record<Side, HTMLElement>>;
    this.controls = {
      left: [...host.querySelectorAll<HTMLInputElement>('[data-side="left"][data-field="control"]')],
      right: [...host.querySelectorAll<HTMLInputElement>('[data-side="right"][data-field="control"]')],
    };

    // One delegated listener rather than six. The controls are built here and
    // never replaced -- `render` writes values into them -- so there is nothing
    // to rebind and nothing to leak.
    host.addEventListener("change", this.onChange);
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

  dispose(): void {
    this.host.removeEventListener("change", this.onChange);
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
        <label class="field" data-side="${side}" data-wrap="handA">
          <span class="field-name">Hand A</span>
          <select data-side="${side}" data-field="handA">${options(EQUIPMENT)}</select>
        </label>
        <label class="field" data-side="${side}" data-wrap="handB">
          <span class="field-name">Hand B</span>
          <select data-side="${side}" data-field="handB">${options(EQUIPMENT)}</select>
        </label>
        ${GOLEM_FIELDS.map(({ field, label }) => `
        <label class="field" data-side="${side}" data-wrap="${field}" hidden>
          <span class="field-name">${label}</span>
          <select data-side="${side}" data-field="${field}"></select>
        </label>`).join("")}
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
      case "control":
        this.matchup = withControl(this.matchup, side, target.value as Control);
        break;
      case "golemLocomotion":
      case "golemTorso":
      case "golemHead": {
        const slot: GolemSlotName = target.dataset.field === "golemLocomotion" ? "locomotion"
          : target.dataset.field === "golemTorso" ? "torso" : "head";
        this.matchup = withGolemSlot(this.matchup, side, slot, target.value);
        break;
      }
      case "golemPrimaryChain":
      case "golemPrimaryTerminal":
      case "golemSecondaryChain":
      case "golemSecondaryTerminal": {
        const socket = target.dataset.field.startsWith("golemPrimary") ? "primary" : "secondary";
        const current = this.matchup[side].golem?.[socket];
        if (!current) return;
        // A chain change carries whatever terminal that chain still offers, because the pairs are
        // not a full grid: the whip is offered on the wrist alone and rung 0 pairs with nothing at
        // all. Falling back to the chain's first offered terminal is the same repair `withUnit`
        // makes when a loadout stops being legal for a newly chosen unit.
        const wanted: GolemEffectorSetup = target.dataset.field.endsWith("Chain")
          ? { chain: target.value, terminal: current.terminal }
          : { chain: current.chain, terminal: target.value };
        const legal = golemEffector(wanted.chain, wanted.terminal)
          ? wanted
          : { chain: wanted.chain, terminal: golemTerminalOptions(wanted.chain)[0]?.id ?? NO_TERMINAL };
        this.matchup = withGolemEffector(this.matchup, side, socket, legal,
          (pick) => (golemEffector(pick.chain, pick.terminal)?.sockets ?? 1) === 2);
        break;
      }
      default:
        return;
    }
    this.render();
  };

  private render(): void {
    for (const side of ["left", "right"] as const) {
      const setup = this.matchup[side];
      const definition = unitDefinition(setup.unit);
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
      // **A corner shows one vocabulary or the other.** A Warrior carries equipment and a golem is
      // assembled from modules; offering both at once would be a screen that says a golem can hold
      // a sword. `SideSetup.golem` is the presence that decides, and `withUnit` is what installs
      // it -- so nothing here asks which unit a corner is.
      const build = setup.golem ?? null;
      for (const hand of ["handA", "handB"] as const) this.handFields[hand][side].hidden = build !== null;
      for (const { field } of GOLEM_FIELDS) this.golemFields[field][side].hidden = build === null;
      if (build) {
        const fill = (field: GolemField, items: readonly GolemSlotOption[], value: string): void => {
          const select = this.golem[field][side];
          select.innerHTML = items
            .map((item) => `<option value="${item.id}">${item.label}</option>`).join("");
          select.value = value;
        };
        fill("golemLocomotion", golemLocomotionOptions(), build.locomotion);
        fill("golemTorso", golemTorsoOptions(), build.torso);
        fill("golemHead", golemHeadOptions(), build.head);
        for (const socket of ["primary", "secondary"] as const) {
          const pick = build[socket];
          const chainField: GolemField = socket === "primary"
            ? "golemPrimaryChain" : "golemSecondaryChain";
          const terminalField: GolemField = socket === "primary"
            ? "golemPrimaryTerminal" : "golemSecondaryTerminal";
          fill(chainField, golemChainOptions(), pick.chain);
          // Only the terminals this chain is actually offered with, which is the picker "hides
          // pairs the registry does not have" with the registry itself as the list.
          fill(terminalField, golemTerminalOptions(pick.chain), pick.terminal);
        }
      }
      for (const hand of ["handA", "handB"] as const) {
        const field = this.hands[hand][side];
        for (const option of field.options) {
          // Judge the result of the reducer, rather than this option beside an
          // unchanged other hand. That distinction keeps the existing route
          // from bow+bow to sword+empty enabled while a unit with a fixed
          // authored pair stays exact.
          const candidate = withEquipment(this.matchup, side, hand, option.value)[side];
          option.disabled = !supportsLoadoutForUnit(
            setup.unit,
            candidate.handA,
            candidate.handB,
          );
        }
        field.disabled = definition.hands === 0;
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
      // The build's own refusal, by name, from the file that owns the legal pairs. It should be
      // unreachable through the pickers -- every option offered is one the registry has and the
      // two-socket rule is applied by the reducer -- which is exactly why it is checked here: a
      // matchup can also arrive from a restart, from `toSelect`, or from a console assignment.
      if (setup.golem) {
        const refusal = golemSetupRefusal(setup.golem);
        if (refusal) return refusal;
      }
    }
    return null;
  }
}
