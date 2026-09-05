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
  golemEffectorOption,
  golemHeadOptions,
  golemLocomotionOptions,
  golemSetupRefusal,
  golemTerminalOptions,
  golemTorsoOptions,
  type GolemSlotOption,
} from "./golem/build";
import type { PartsBin } from "./golem/parts-bin";
import { supportsLoadoutForUnit, UNITS, unitDefinition } from "./units";
import type { Side } from "./physics";

/**
 * The nine `<select>`s a golem corner adds, and what each edits.
 *
 * Seven of them are the body plan. Nine and not five, because the two effector slots are **two**
 * choices each: the overview's whole design for an effector is that the chain and the terminal are
 * picked independently, the chain owning motion and the terminal owning what is on the end. A
 * single "arm" picker would be a shelf of pairs somebody had to write down, which is the second
 * copy of the ladder this plan set keeps refusing to make.
 *
 * The last two are Session 10's, and they sit **beside** the shelf rather than inside it. A salvage
 * picker names a module the parts bin is holding, which is a chain, a terminal *and* a durability
 * at once -- so it cannot be a row in the terminal picker, and a bin whose entries were folded into
 * the two shelf pickers would be a screen that could not tell a fresh blade from a worn one. `new
 * off the shelf` is the first option and the default, so a corner nobody has salvaged into looks
 * exactly as it did before this session.
 */
const GOLEM_FIELDS = [
  { field: "golemLocomotion", label: "Legs" },
  { field: "golemTorso", label: "Trunk" },
  { field: "golemHead", label: "Head" },
  { field: "golemPrimaryChain", label: "Primary arm" },
  { field: "golemPrimaryTerminal", label: "Primary end" },
  { field: "golemPrimarySalvage", label: "Primary, fitted from" },
  { field: "golemSecondaryChain", label: "Secondary arm" },
  { field: "golemSecondaryTerminal", label: "Secondary end" },
  { field: "golemSecondarySalvage", label: "Secondary, fitted from" },
] as const;

type GolemField = typeof GOLEM_FIELDS[number]["field"];

/** The value of the salvage picker's first option: a module built new rather than fitted. */
const OFF_THE_SHELF = "";

/** How worn a bin entry is, as a person reads it. */
const wearLabel = (id: string, durability: number): string => {
  const label = golemEffectorOption(id)?.label ?? id;
  return `${label} - ${Math.round(durability * 100)}% left`;
};

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
  /**
   * The parts bin, or null for a screen with no salvage at all.
   *
   * Nullable rather than always present because the bin is a browser's own storage and a harness
   * that builds this screen has none -- and because "there is no bin" and "the bin is empty" are
   * different states the screen shows differently.
   */
  private readonly bin: PartsBin | null;

  private readonly units: Record<Side, HTMLSelectElement>;
  private readonly policies: Record<Side, HTMLSelectElement>;
  private readonly hands: Record<"handA" | "handB", Record<Side, HTMLSelectElement>>;
  private readonly golem: Record<GolemField, Record<Side, HTMLSelectElement>>;
  private readonly handFields: Record<"handA" | "handB", Record<Side, HTMLElement>>;
  private readonly golemFields: Record<GolemField, Record<Side, HTMLElement>>;
  private readonly controls: Record<Side, HTMLInputElement[]>;
  private readonly beginButton: HTMLButtonElement | null;
  private readonly binRow: HTMLElement;
  private readonly binNote: HTMLElement;

  constructor(
    host: HTMLElement,
    matchup: Matchup,
    unavailableUnits: Readonly<Record<string, string>> = Object.freeze({}),
    beginButton: HTMLButtonElement | null = null,
    bin: PartsBin | null = null,
  ) {
    this.host = host;
    this.unavailableUnits = unavailableUnits;
    this.matchup = matchup;
    this.beginButton = beginButton;
    this.bin = bin;

    host.innerHTML = `${this.corner("left", "Left")}${this.corner("right", "Right")}${this.binPanel()}`;

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
    this.binRow = one<HTMLElement>('[data-field="partsBin"]');
    this.binNote = one<HTMLElement>('[data-field="partsBinNote"]');

    // One delegated listener rather than six. The controls are built here and
    // never replaced -- `render` writes values into them -- so there is nothing
    // to rebind and nothing to leak.
    host.addEventListener("change", this.onChange);
    // A button is not a `change`, so the reset needs its own delegated listener. Same argument:
    // one on the host, nothing to rebind.
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

  dispose(): void {
    this.host.removeEventListener("change", this.onChange);
    this.host.removeEventListener("click", this.onClick);
  }

  /**
   * The parts bin's own row, under both corners.
   *
   * One row rather than one per corner, because there is one bin: it is per browser and it is the
   * person's, not a fighter's. What it says is what is in it, and the one control on it empties it
   * -- "a prototype without one is a prototype somebody has to clear from the console", which is
   * the session plan's own sentence and the whole of why the button exists.
   */
  private binPanel(): string {
    return `
      <div class="corner bin-row" data-field="partsBin">
        <div class="corner-title">Parts bin</div>
        <p class="note" data-field="partsBinNote"></p>
        <button class="action quiet" type="button" data-field="partsBinReset">Empty the bin</button>
      </div>
    `;
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
      case "golemPrimarySalvage":
      case "golemSecondarySalvage": {
        // Ahead of the chain and terminal cases, because `startsWith("golemPrimary")` would
        // otherwise swallow this one -- and it is a different act: the two shelf pickers choose
        // what a module *is*, and this chooses **which** of the ones already owned is fitted.
        const socket = target.dataset.field === "golemPrimarySalvage" ? "primary" : "secondary";
        const current = this.matchup[side].golem?.[socket];
        if (!current) return;
        const entry = target.value === OFF_THE_SHELF ? null : this.bin?.entry(target.value) ?? null;
        const option = entry ? golemEffectorOption(entry.id) : null;
        // A salvaged module carries its own chain and terminal with it -- it is that module -- and
        // going back to the shelf keeps the pair and drops the wear. Never the other way round: a
        // durability without an entry behind it is a fresh part somebody did not earn.
        const pick: GolemEffectorSetup = entry && option
          ? {
            chain: option.chain,
            terminal: option.terminal ?? NO_TERMINAL,
            salvage: entry.key,
            durability: entry.durability,
          }
          : { chain: current.chain, terminal: current.terminal };
        this.matchup = withGolemEffector(this.matchup, side, socket, pick,
          (candidate) => (golemEffector(candidate.chain, candidate.terminal)?.sockets ?? 1) === 2);
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
        //
        // Both branches build a fresh pair with no `salvage` and no `durability`, and that is the
        // rule rather than a consequence of how it is written: choosing a chain or a terminal by
        // hand is choosing off the shelf, and a socket that kept a bin key while its module changed
        // underneath would fit one stored blade and report a different one.
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

  /**
   * Empty the bin, and take every salvage pick off the screen with it.
   *
   * Both halves, because they are one act. A matchup naming a bin entry that no longer exists is
   * refused by `refusal` -- deliberately, so a stale key can never be silently substituted with a
   * fresh part -- and leaving the screen in that state after somebody pressed a button that says
   * "Empty the bin" would be a refusal they caused and cannot see the cause of. Emptying by hand is
   * a stated choice; a bin refused by its own codec is not, which is why only this path clears the
   * picks.
   */
  private readonly onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.dataset.field !== "partsBinReset") return;
    this.bin?.reset();
    for (const side of ["left", "right"] as const) {
      const build = this.matchup[side].golem;
      if (!build) continue;
      for (const socket of ["primary", "secondary"] as const) {
        const pick = build[socket];
        if (pick.salvage === undefined && pick.durability === undefined) continue;
        this.matchup = withGolemEffector(this.matchup, side, socket,
          { chain: pick.chain, terminal: pick.terminal },
          (candidate) => (golemEffector(candidate.chain, candidate.terminal)?.sockets ?? 1) === 2);
      }
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
          // And the bin beside the shelf. A key the bin no longer holds is offered back as a
          // disabled row naming itself, which is exactly how an incompatible policy is shown
          // above -- the person sees what happened, and `refusal` blocks Fight until they choose.
          const salvageField: GolemField = socket === "primary"
            ? "golemPrimarySalvage" : "golemSecondarySalvage";
          const held = this.bin?.entries ?? [];
          const stale = pick.salvage !== undefined
            && !held.some((entry) => entry.key === pick.salvage);
          fill(salvageField, [
            { id: OFF_THE_SHELF, label: "new off the shelf" },
            ...held.map((entry) => ({ id: entry.key, label: wearLabel(entry.id, entry.durability) })),
            ...(stale ? [{ id: pick.salvage as string, label: "no longer in the bin" }] : []),
          ], pick.salvage ?? OFF_THE_SHELF);
          if (stale) {
            for (const option of this.golem[salvageField][side].options) {
              if (option.value === pick.salvage) option.disabled = true;
            }
          }
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
    this.renderBin();
    if (this.beginButton) {
      const reason = this.refusal;
      this.beginButton.disabled = reason !== null;
      this.beginButton.title = reason ?? "";
    }
  }

  /**
   * What the bin says about itself.
   *
   * Four states and they are genuinely four, which is why none of them is written as an absence of
   * another. **No bin at all** is a harness or a browser that would not hand one over. **Refused**
   * is a bin that was stored and did not survive its own checksum or its own shape, and it says so
   * by name rather than quietly reading as empty -- that sentence is the reader the codec's
   * refusals exist for. **Empty** is the first run, and is not a failure. Anything else is the
   * list, and the row is hidden entirely when there is nothing to salvage into, so a matchup of
   * two Warriors is the screen it was before this session.
   */
  private renderBin(): void {
    const anyGolem = this.matchup.left.golem !== undefined || this.matchup.right.golem !== undefined;
    this.binRow.hidden = !anyGolem;
    if (!anyGolem) return;
    if (!this.bin) {
      this.binNote.textContent = "no parts bin in this window, so nothing can be salvaged";
      return;
    }
    const refused = this.bin.refusal;
    if (refused !== null) {
      this.binNote.textContent = `the stored bin was refused and not repaired: ${refused}`;
      return;
    }
    const held = this.bin.entries;
    this.binNote.textContent = held.length === 0
      ? "empty -- win a bout against a golem and whatever came off it intact is kept here"
      : held.map((entry) => wearLabel(entry.id, entry.durability)).join(" / ");
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
        // The bin's half, which `golemSetupRefusal` cannot answer: it validates a build and knows
        // nothing about what this browser is holding. A socket naming an entry that is gone is
        // refused rather than quietly rebuilt new, because rebuilding it new is handing somebody a
        // fresh module in place of a worn one -- a substitution, in the one place this session is
        // most careful not to make them.
        for (const socket of ["primary", "secondary"] as const) {
          const key = setup.golem[socket].salvage;
          if (key === undefined) continue;
          if (!this.bin?.entry(key)) {
            return `the ${side} golem's ${socket} socket is fitted from parts bin entry "${key}", which is not in the bin`;
          }
        }
      }
    }
    return null;
  }
}
