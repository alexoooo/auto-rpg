import {
  commanderOf,
  withCommander,
  withGolemAttribute,
  withGolemBuild,
  withGolemEffector,
  withGolemSlot,
  withPolicy,
  withUnit,
  type GolemEffectorSetup,
  type GolemSlotName,
  type Matchup,
} from "./bout";
import {
  NO_TERMINAL,
  golemBuildRows,
  golemChainOptions,
  golemEffector,
  golemEffectorOption,
  golemHeadOptions,
  golemLocomotionOptions,
  golemSetupRefusal,
  golemTerminalOptions,
  golemTorsoOptions,
  type GolemBuildSlot,
  type GolemSlotOption,
} from "./golem/build";
import type { PartsBin } from "./golem/parts-bin";
import {
  BODY_FAMILIES, FAMILY_FIXED_ATTRIBUTES, FAMILY_LABEL, FAMILY_POLICY, bodyFamily, isBodyFamily, moduleFamily,
} from "./golem/family.ts";
import { FAMILY_SETUP } from "./golem/family-setup.ts";
import { AUTO_COMMANDERS, isAutoCommanderName, type AutoCommanderName } from "./orders";

/**
 * The auto-commanders a corner can be given, as the screen names them. A side nobody commands takes
 * its orders from one of these; a side a person commands (the HUD's Command) takes the person's.
 */
const COMMANDER_LABEL: Record<AutoCommanderName, { label: string; title: string }> = {
  "attack-nearest": { label: "Attack nearest", title: "No orders: fight the nearest enemy" },
  "hold-here": { label: "Hold here", title: "Hold the ground it starts on, and fight from there" },
};
import { ATTRIBUTE_IDS } from "./golem/attributes.ts";
import { attributeAction, attributesPanel, followAttributeSlider, renderAttributes } from "./attributes-ui";
import { randomSeed } from "./rng";
import { randomCorner } from "./random-corner.ts";
import { unitDefinition } from "./units";
import { POLICIES } from "./mind";
import { assessPolicy, policyPickerRows } from "./policy-applicability";
import type { Side } from "./physics";
import ratingArtifact from "./policy-ratings.json";
import currentFingerprint from "virtual:ai-fingerprint";
import { policyRatingBadge, policyRatingNote } from "./policy-rating";
import { policyLine } from "./policy-lines.ts";
import researchedVariants from "./golem/researched-variants.json";
import researchedLab from "./golem/researched-lab.json";

const policyVersion = (name: string): string => {
  const variant = ([...researchedVariants, ...researchedLab] as { name: string }[]).find((row) => row.name === name);
  return variant ? JSON.stringify(variant) : name;
};

/**
 * The nine `<select>`s a golem corner keeps behind its Customize toggle, and what each edits.
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

/** The unit a Randomize on a corner that is not yet a golem turns it into. */
const GOLEM_UNIT = "golem";

/** What each row of a contender's build summary is called. */
const BUILD_ROW_LABEL: Readonly<Record<GolemBuildSlot, string>> =
  Object.freeze({ locomotion: "Legs", torso: "Torso", head: "Head", primary: "Main hand", secondary: "Off hand" });

/**
 * A small line drawing beside each build row, in the panel's gold. Inline, so the screen owns no
 * asset and each glyph takes `currentColor`; one per slot rather than per module, because the row's
 * words already say which module it is.
 */
const BUILD_ROW_GLYPH: Readonly<Record<GolemBuildSlot, string>> = Object.freeze({
  locomotion: '<path d="M6 1.5v6L4.5 14.5M10 1.5v6l1.5 7M2.5 14.5h3M10.5 14.5h3"/>',
  torso: '<path d="M2.5 2.5h11L12 13.5H4z"/><path d="M5.5 6h5"/>',
  head: '<circle cx="8" cy="7" r="4.5"/><path d="M6 14h4"/>',
  primary: '<path d="M2.5 13.5 11 5M9.5 2.5l4 4M3.5 9.5l3 3"/>',
  secondary: '<path d="M8 1.8 13.2 4v4c0 3.1-2.3 5.2-5.2 6.3C5.1 13.2 2.8 11.1 2.8 8V4z"/>',
});

const glyph = (slot: GolemBuildSlot): string =>
  `<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true">${BUILD_ROW_GLYPH[slot]}</svg>`;

/** One build row: a glyph and a slot name when it has a slot, and the words, always as text. */
const buildRow = (slot: GolemBuildSlot | null, label: string | null, text: string): HTMLLIElement => {
  const row = document.createElement("li");
  if (slot !== null) row.innerHTML = glyph(slot);
  const span = (className: string, words: string): void => {
    const element = document.createElement("span");
    element.className = className;
    element.textContent = words;
    row.append(element);
  };
  if (label !== null) span("build-slot", label);
  span("build-text", text);
  return row;
};

/** How worn a bin entry is, as a person reads it. */
const wearLabel = (id: string, durability: number): string => {
  const label = golemEffectorOption(id)?.label ?? id;
  return `${label} - ${Math.round(durability * 100)}% left`;
};

/**
 * The screen before the fight, and a screen you can see *through*: the two bodies it describes are
 * standing in the arena behind it, in the open centre between its two contender panels.
 *
 * It is the only thing inside `#matchup`, and `#matchup` lays its children straight into the
 * curtain's grid, so this class owns both panels, the parts bin row and the line under Fight that
 * says why Fight is refused -- and nothing else on the curtain. Pause is a compact sibling in the
 * game view and never routes through this class, so focusing a screenshot tool cannot turn a
 * standing fight into character selection.
 *
 * Each contender is a build and a mind and nothing about who drives it: since the duel-setup plan
 * set's Session 01, taking a body is a click in the fight (`Take` beside its name in the readout),
 * not a choice made here. In order: the body family, the build one row per part, the attributes,
 * the policy with its one line and its rating, and Randomize and Customize -- the last swapping the
 * build rows for the nine slot pickers, for anyone who wants a hand-picked body or a salvaged arm.
 * The pickers are generated from the registries rather than written out in `index.html`, so an
 * option that exists is selectable and an option that is selectable exists.
 *
 * This holds the live selection and `src/bout.ts` holds the rules that constrain it, which is why
 * every change re-reads the whole screen from the matchup instead of trusting the control that was
 * just touched.
 *
 * **The host is told, not asked.** `onSelection` fires after every change a person makes here,
 * with the matchup as it now stands, and `src/main.ts` is what decides whether the bodies behind
 * the sheet have to be rebuilt to match. The screen owns the selection; the arena owns the bodies;
 * neither reads the other's state.
 */
export class SetupScreen {
  private readonly host: HTMLElement;
  private matchup: Matchup;
  /**
   * The parts bin, or null for a screen with no salvage at all.
   *
   * Nullable rather than always present because the bin is a browser's own storage and a harness
   * that builds this screen has none -- and because "there is no bin" and "the bin is empty" are
   * different states the screen shows differently.
   */
  private readonly bin: PartsBin | null;
  private readonly onSelection: ((matchup: Matchup) => void) | null;

  private readonly builds: Record<Side, HTMLElement>;
  private readonly seeds: Record<Side, HTMLElement>;
  private readonly policies: Record<Side, HTMLSelectElement>;
  private readonly policyLines: Record<Side, HTMLElement>;
  private readonly ratings: Record<Side, HTMLElement>;
  private readonly showAllRows: Record<Side, HTMLElement>;
  private readonly showAllPolicies: Record<Side, boolean> = { left: false, right: false };
  private readonly golem: Record<GolemField, Record<Side, HTMLSelectElement>>;
  private readonly golemFields: Record<GolemField, Record<Side, HTMLElement>>;
  private readonly customizePanels: Record<Side, HTMLElement>;
  private readonly customizeButtons: Record<Side, HTMLButtonElement>;
  private readonly attributePanels: Record<Side, HTMLElement>;
  private readonly beginButton: HTMLButtonElement | null;
  private readonly binRow: HTMLElement;
  private readonly binNote: HTMLElement;
  private readonly refusalNote: HTMLElement;
  /** Which corners have their slot pickers open. Screen state, not matchup state. */
  private readonly customizing: Record<Side, boolean> = { left: false, right: false };

  constructor(
    host: HTMLElement,
    matchup: Matchup,
    beginButton: HTMLButtonElement | null = null,
    bin: PartsBin | null = null,
    onSelection: ((matchup: Matchup) => void) | null = null,
  ) {
    this.host = host;
    this.matchup = matchup;
    this.beginButton = beginButton;
    this.bin = bin;
    this.onSelection = onSelection;

    // The refusal is the screen's, and sits in the curtain's grid under Fight: one line saying why
    // Fight is disabled, rather than a reason that only a hover over a greyed button could find.
    host.innerHTML = `${this.corner("left")}${this.corner("right")}${this.binPanel()}`
      + `<p class="refusal" data-field="refusal" role="status" hidden></p>`;

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

    this.builds = pick<HTMLElement>("build");
    this.seeds = pick<HTMLElement>("seed");
    this.policies = pick<HTMLSelectElement>("policy");
    this.policyLines = pick<HTMLElement>("policyLine");
    this.ratings = pick<HTMLElement>("rating");
    this.showAllRows = wrapper<HTMLElement>("showAllPolicies");
    this.golem = Object.fromEntries(GOLEM_FIELDS.map(({ field }) =>
      [field, pick<HTMLSelectElement>(field)])) as Record<GolemField, Record<Side, HTMLSelectElement>>;
    this.golemFields = Object.fromEntries(GOLEM_FIELDS.map(({ field }) =>
      [field, wrapper<HTMLElement>(field)])) as Record<GolemField, Record<Side, HTMLElement>>;
    this.customizePanels = wrapper<HTMLElement>("customize");
    this.customizeButtons = pick<HTMLButtonElement>("customize");
    this.attributePanels = wrapper<HTMLElement>("attributes");
    this.binRow = one<HTMLElement>('[data-field="partsBin"]');
    this.binNote = one<HTMLElement>('[data-field="partsBinNote"]');
    this.refusalNote = one<HTMLElement>('[data-field="refusal"]');

    // One delegated listener rather than one per control. The controls are built here and
    // never replaced -- `render` writes values into them -- so there is nothing to rebind and
    // nothing to leak. A button is not a `change`, so the clicks have their own; a slider's drag
    // is neither, and moves only its readout until the `change` that commits it.
    host.addEventListener("change", this.onChange);
    host.addEventListener("click", this.onClick);
    host.addEventListener("input", followAttributeSlider);
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
   * "the screen is showing what is about to be fought". It does not fire
   * `onSelection`: the host is the caller, and already knows.
   */
  show(matchup: Matchup): void {
    this.matchup = matchup;
    this.render();
  }

  dispose(): void {
    this.host.removeEventListener("change", this.onChange);
    this.host.removeEventListener("click", this.onClick);
    this.host.removeEventListener("input", followAttributeSlider);
  }

  /**
   * The parts bin's own row, at the foot of the open centre between the two panels.
   *
   * One row rather than one per corner, because there is one bin: it is per browser and it is the
   * person's, not a fighter's. What it says is what is in it, and the one control on it empties it
   * -- "a prototype without one is a prototype somebody has to clear from the console", which is
   * the session plan's own sentence and the whole of why the button exists.
   */
  private binPanel(): string {
    return `
      <div class="bin-row" data-field="partsBin">
        <div class="section-head">Parts bin</div>
        <p class="note" data-field="partsBinNote"></p>
        <button class="action quiet" type="button" data-field="partsBinReset">Empty the bin</button>
      </div>
    `;
  }

  private corner(side: Side): string {
    const title = side === "left" ? "Left contender" : "Right contender";
    // The policy picker stays enabled on the side a person is driving, and that is not an
    // oversight: the body you let go of picks this policy back up, so what is chosen here is what
    // that fighter becomes the moment you step out of it.
    return `
      <section class="contender" data-side="${side}" aria-label="${title}">
        <header class="contender-head">
          <h2>${title}</h2>
          <span class="seed-note" data-side="${side}" data-field="seed"></span>
        </header>
        <div class="section-head">Body</div>
        <div class="segmented" role="group" aria-label="${title} body">
          ${BODY_FAMILIES.map((family) => `<button class="segment" type="button" data-side="${side}"`
            + ` data-field="family" data-family="${family}"`
            + ` title="A fresh ${FAMILY_LABEL[family].toLowerCase()}, with its own duelist">`
            + `${FAMILY_LABEL[family]}</button>`).join("")}
        </div>
        <div class="section-head">Build</div>
        <ul class="build-rows" data-side="${side}" data-field="build"></ul>
        <div class="customize" data-side="${side}" data-wrap="customize" hidden>
          ${GOLEM_FIELDS.map(({ field, label }) => `
          <label class="field" data-side="${side}" data-wrap="${field}">
            <span class="field-name">${label}</span>
            <select data-side="${side}" data-field="${field}"></select>
          </label>`).join("")}
        </div>
        ${attributesPanel(side)}
        <div class="section-head">Policy</div>
        <select class="policy-select" data-side="${side}" data-field="policy"
          aria-label="${title} policy" aria-describedby="policy-line-${side} rating-${side}"></select>
        <p class="policy-line" id="policy-line-${side}" data-side="${side}" data-field="policyLine"></p>
        <div class="policy-meta">
          <span class="rating-badge" id="rating-${side}" tabindex="0" data-side="${side}" data-field="rating"></span>
          <label class="show-all" data-side="${side}" data-wrap="showAllPolicies"><input type="checkbox"
            data-side="${side}" data-field="showAllPolicies" /> show every policy</label>
        </div>
        <div class="section-head">Orders</div>
        <div class="segmented" role="group" aria-label="${title} orders">
          ${AUTO_COMMANDERS.map((name) => `<button class="segment" type="button" data-side="${side}"`
            + ` data-field="commander" data-commander="${name}" title="${COMMANDER_LABEL[name].title}">`
            + `${COMMANDER_LABEL[name].label}</button>`).join("")}
        </div>
        <div class="contender-actions">
          <button class="action" type="button" data-side="${side}" data-field="randomize">Randomize</button>
          <button class="action quiet" type="button" data-side="${side}" data-field="customize">Customize</button>
        </div>
      </section>
    `;
  }

  private readonly onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) && !(target instanceof HTMLInputElement)) return;
    const side = target.dataset.side as Side | undefined;
    if (side !== "left" && side !== "right") return;

    switch (target.dataset.field) {
      case "showAllPolicies":
        this.showAllPolicies[side] = (target as HTMLInputElement).checked;
        this.render();
        return;
      case "policy":
        this.matchup = withPolicy(this.matchup, side, target.value);
        break;
      case "attribute": {
        const action = attributeAction(target);
        if (action?.kind !== "set") return;
        this.matchup = withGolemAttribute(this.matchup, side, action.id, action.value);
        break;
      }
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
    this.onSelection?.(this.matchup);
  };

  private readonly onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    switch (target.dataset.field) {
      case "partsBinReset":
        this.emptyBin();
        break;
      case "family": {
        // One button per family, generated from `BODY_FAMILIES`: the family's own body, then its
        // own policy, in that order and with one fresh seed, as each hand-written button did.
        const side = target.dataset.side as Side;
        const family = target.dataset.family;
        if ((side !== "left" && side !== "right") || !isBodyFamily(family)) return;
        // A segmented control's lit segment is the current state, and pressing it again changes
        // nothing -- here it would silently throw away a build and its policy. Randomize is the
        // button for a fresh body of the same family.
        const golem = this.matchup[side].golem;
        if (golem && bodyFamily(golem) === family) return;
        this.matchup = withGolemBuild(this.matchup, side, FAMILY_SETUP[family](), randomSeed());
        this.matchup = withPolicy(this.matchup, side, FAMILY_POLICY[family]);
        break;
      }
      case "randomize": {
        const side = target.dataset.side as Side | undefined;
        if (side !== "left" && side !== "right") return;
        this.randomize(side);
        break;
      }
      case "commander": {
        const side = target.dataset.side as Side | undefined;
        const name = target.dataset.commander ?? "";
        if ((side !== "left" && side !== "right") || !isAutoCommanderName(name)) return;
        if (commanderOf(this.matchup[side]) === name) return;
        this.matchup = withCommander(this.matchup, side, name);
        break;
      }
      case "attributeReset":
      case "attributesReset": {
        const side = target.dataset.side as Side | undefined;
        const action = attributeAction(target);
        if ((side !== "left" && side !== "right") || !action) return;
        // Reset all is every stat back to 1 through the one reducer, which deletes each key and
        // then the field -- so the corner is the record of a body nobody tuned, link and all.
        const reset = action.kind === "set" ? [action] : ATTRIBUTE_IDS.map((id) => ({ id, value: 1 }));
        for (const { id, value } of reset) this.matchup = withGolemAttribute(this.matchup, side, id, value);
        break;
      }
      case "customize": {
        // Screen state and not matchup state, so it is not a reducer and it does not tell the
        // host: opening the pickers changes nothing about what is going to be fought.
        const side = target.dataset.side as Side | undefined;
        if (side !== "left" && side !== "right") return;
        this.customizing[side] = !this.customizing[side];
        this.render();
        return;
      }
      default:
        return;
    }
    this.render();
    this.onSelection?.(this.matchup);
  };

  /**
   * A fresh build for one corner, from a fresh seed, and the seed kept on the corner.
   *
   * The draw is over `mulberry32` of a seed nobody chose, which is the same generator every seeded
   * thing in this tree uses -- so the number the corner then shows is enough to draw this body
   * again anywhere. A corner that is not a golem yet is made one first, through `withUnit` with the
   * golem's own rules, exactly as the old unit picker did it.
   *
   * **Viable, since Session 01 of the learn set, and that is the owner's first sentence about this
   * plan set.** Before it, Random drew uniformly from 2,376 assemblies and a shade over half of
   * the pairs two presses produced could not finish each other, so pressing it twice usually
   * bought sixty seconds of two things circling.
   *
   * **It draws an opponent, not a body**, whenever there is already a golem in the other corner.
   * That is not what the plan said and it is what the measurement forced: `viableBuild` turned out
   * to accept every class on the shelf -- the maul finishes all seven, so the second admission rule
   * admitted all seven -- and a per-body filter that refuses nothing cannot keep a pair on the
   * screen honest. `randomViableOpponent` redraws until `viablePair` accepts the pair the owner is
   * actually going to watch. The pickers behind Customize are untouched and still offer
   * everything, because restricting a menu is a different act from redrawing a draw and only the
   * second one was asked for.
   */
  private randomize(side: Side): void {
    if (!this.matchup[side].golem) {
      this.matchup = withUnit(this.matchup, side, GOLEM_UNIT, unitDefinition(GOLEM_UNIT));
    }
    // The draw itself is `randomCorner`'s, which the arena's Random replay shares.
    this.matchup = randomCorner(this.matchup, side, randomSeed());
  }

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
  private emptyBin(): void {
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
  }

  private render(): void {
    for (const side of ["left", "right"] as const) {
      const setup = this.matchup[side];
      const definition = unitDefinition(setup.unit);
      const rows = POLICIES.map((policy) => ({ ...policy,
        assessment: assessPolicy(policy, definition.driverOptions.some((d) => d.name === policy.name), setup.golem),
      }));
      if (!rows.some((row) => row.name === setup.policy)) rows.push({ name: setup.policy,
        label: setup.policy, surface: null, create: () => { throw new Error("unknown policy"); },
        assessment: assessPolicy(undefined, false, setup.golem) });
      const policyOptions = policyPickerRows(rows, setup.policy, this.showAllPolicies[side]);
      const select = this.policies[side];
      select.replaceChildren(...policyOptions.map((driver) => {
        const option = document.createElement("option");
        option.value = driver.name;
        option.disabled = driver.assessment.status !== "applicable";
        // The name and the rating, so the open list still compares policies; the date and the rest
        // are the badge's tooltip.
        option.textContent = `${driver.label} · ${policyRatingBadge(driver.name, ratingArtifact)}`
          + (option.disabled ? ` (${driver.assessment.status}: ${driver.assessment.reason})` : "");
        return option;
      }));
      const selected = rows.find((row) => row.name === setup.policy)!;
      this.host.querySelector<HTMLInputElement>(`[data-side="${side}"][data-field="showAllPolicies"]`)!.checked = this.showAllPolicies[side];
      // **One sentence, and a badge whose tooltip carries the rest.** The rating's long note and
      // the applicability reason were two paragraphs under every picker; they are the badge's
      // `title` now, and the badge turns to a warning when the policy cannot drive this body.
      this.policyLines[side].textContent = policyLine(setup.policy) ?? "";
      const usable = selected.assessment.status === "applicable";
      const rating = this.ratings[side];
      rating.textContent = usable ? policyRatingBadge(setup.policy, ratingArtifact) : selected.assessment.status;
      rating.classList.toggle("warn", !usable);
      rating.title = [
        usable ? "" : selected.assessment.reason,
        policyRatingNote(setup.policy, ratingArtifact, currentFingerprint, policyVersion(setup.policy)),
        selected.evidenceScope,
        usable ? selected.assessment.reason : "",
      ].filter(Boolean).join("\n");
      // **The build, one row per part, and the seed is where it came from.** A corner that is not
      // a golem -- a Warrior put there from the console, or a link -- is one row naming its unit
      // and its hands, and has no pickers to open.
      const build = setup.golem ?? null;
      const parts = build ? golemBuildRows(build) : [];
      // No off-hand row is a two-handed primary, and its row says so.
      const bothHands = build !== null && !parts.some((row) => row.slot === "secondary");
      // The glyph is this file's own markup; every word goes in as text, because a hand kind off a
      // link is whatever string the link carried.
      this.builds[side].replaceChildren(...(build
        ? parts.map((row) => buildRow(row.slot,
          bothHands && row.slot === "primary" ? "Both hands" : BUILD_ROW_LABEL[row.slot], row.text))
        : [buildRow(null, null, `${definition.label} with ${setup.handA} and ${setup.handB}`)]));
      this.seeds[side].textContent = !build ? ""
        : setup.seed !== undefined ? `seed ${setup.seed}` : "picked by hand";
      for (const button of this.host.querySelectorAll<HTMLButtonElement>(`[data-side="${side}"][data-field="commander"]`)) {
        const current = commanderOf(setup) === button.dataset.commander;
        button.classList.toggle("active", current);
        button.setAttribute("aria-pressed", String(current));
      }
      for (const button of this.host.querySelectorAll<HTMLButtonElement>(`[data-side="${side}"][data-field="family"]`)) {
        const current = build !== null && bodyFamily(build) === button.dataset.family;
        button.classList.toggle("active", current);
        button.setAttribute("aria-pressed", String(current));
      }
      const open = build !== null && this.customizing[side];
      this.customizePanels[side].hidden = !open;
      // Customize swaps the summary for the pickers rather than stacking them under it: the rows
      // say what the pickers say, and a panel with both is taller than a laptop window.
      this.builds[side].hidden = open;
      this.showAllRows[side].hidden = !open;
      this.customizeButtons[side].disabled = build === null;
      this.customizeButtons[side].textContent = open ? "Done" : "Customize";
      for (const { field } of GOLEM_FIELDS) this.golemFields[field][side].hidden = build === null;
      // Attributes are a golem's, so a corner holding anything else has none to show.
      this.attributePanels[side].hidden = build === null;
      if (build) {
        renderAttributes(this.attributePanels[side], side, build.attributes, false,
          FAMILY_FIXED_ATTRIBUTES[bodyFamily(build)]);
      }
      if (build) {
        const family = bodyFamily(build);
        const fill = (field: GolemField, items: readonly GolemSlotOption[], value: string): void => {
          const select = this.golem[field][side];
          // As elements, not markup: a stale salvage key comes back here off a link as its bare id.
          select.replaceChildren(...items.map((item) => new Option(item.label, item.id)));
          select.value = value;
        };
        fill("golemLocomotion", golemLocomotionOptions(family), build.locomotion);
        fill("golemTorso", golemTorsoOptions(family), build.torso);
        fill("golemHead", golemHeadOptions(family), build.head);
        for (const socket of ["primary", "secondary"] as const) {
          const pick = build[socket];
          const chainField: GolemField = socket === "primary"
            ? "golemPrimaryChain" : "golemSecondaryChain";
          const terminalField: GolemField = socket === "primary"
            ? "golemPrimaryTerminal" : "golemSecondaryTerminal";
          fill(chainField, golemChainOptions(family), pick.chain);
          // Only the terminals this chain is actually offered with, which is the picker "hides
          // pairs the registry does not have" with the registry itself as the list.
          fill(terminalField, golemTerminalOptions(pick.chain), pick.terminal);
          // And the bin beside the shelf. A key the bin no longer holds is offered back as a
          // disabled row naming itself, which is exactly how an incompatible policy is shown
          // above -- the person sees what happened, and `refusal` blocks Fight until they choose.
          const salvageField: GolemField = socket === "primary"
            ? "golemPrimarySalvage" : "golemSecondarySalvage";
          const held = (this.bin?.entries ?? []).filter(entry => moduleFamily(entry.id) === family);
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
      this.policies[side].value = setup.policy;
    }
    this.renderBin();
    const reason = this.refusal;
    this.refusalNote.textContent = reason ?? "";
    this.refusalNote.hidden = reason === null;
    if (this.beginButton) {
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
   * list. The row is shown only while a corner has its pickers open, because the bin is something
   * you fit from, and the open centre between the panels is where the two bodies stand.
   */
  private renderBin(): void {
    const anyGolem = this.matchup.left.golem !== undefined || this.matchup.right.golem !== undefined;
    const anyOpen = this.customizing.left || this.customizing.right;
    this.binRow.hidden = !anyGolem || !anyOpen;
    if (this.binRow.hidden) return;
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
      const assessment = assessPolicy(POLICIES.find((p) => p.name === setup.policy), true, setup.golem);
      if (assessment.status !== "applicable") return `${side}: ${assessment.reason}`;

      // The build's own refusal, by name, from the file that owns the legal pairs. It should be
      // unreachable through the pickers -- every option offered is one the registry has and the
      // two-socket rule is applied by the reducer -- which is exactly why it is checked here: a
      // matchup can also arrive from a restart, from `toSelect`, from a link, or from a console
      // assignment.
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
