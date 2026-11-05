import type { OrdersEntry } from "../../game/arena/duel.ts";
import type { TeamRecipe } from "../../game/arena/team-bout.ts";
import type { RosterBody } from "./frame.ts";
import type { StageNews } from "./stage.ts";
import type { DuelInput, DuelStart } from "./duel-stage.ts";
import type { CryptInput, CryptStart, CryptTapeEntry } from "./crypt-stage.ts";

/** What a page tells its stage as it runs. */
export type WorldInput = DuelInput | CryptInput;

/** A stage's tape: a bout's orders (`OrdersEntry`), or a Crypt run's inputs (`CryptTapeEntry`). */
export type TapeEntry = OrdersEntry | CryptTapeEntry;

/**
 * **What a page and its world's worker say to each other.** The page says what to build, then
 * whether the world runs; the worker answers with the world's bodies once, then a frame each step
 * (`frame.ts`), each frame's array transferred, with what the stage has to tell beside it.
 */
export type ToWorker =
  /** Build a team bout's stage (`teamStage`), played until `aftermath` s past its verdict. */
  | { readonly kind: "team"; readonly recipe: TeamRecipe; readonly aftermath: number }
  /** Build a duel's stage as the Arena plays it (`duelStage`). */
  | { readonly kind: "duel"; readonly start: DuelStart }
  /** Build a Crypt run's stage (`cryptStage`). */
  | { readonly kind: "crypt"; readonly start: CryptStart }
  /** What a person does, or what the page looks at, applied before the next step: news of it comes back at once. */
  | { readonly kind: "input"; readonly input: WorldInput }
  /** Send the stage's tape. */
  | { readonly kind: "tape"; readonly request: number }
  /** Run the world in real time, or hold it. */
  | { readonly kind: "run"; readonly running: boolean }
  /** Take `steps` steps now, running or held: a console's step. */
  | { readonly kind: "step"; readonly steps: number; readonly request: number }
  /** Make each step take at least `ms` more, a wait in the worker: what a page's frame rate is checked under. */
  | { readonly kind: "burden"; readonly ms: number }
  /** Dispose of the world and close. */
  | { readonly kind: "stop" };

export type FromWorker =
  /** The stage is built: its rate, its bodies, and the world as it stands before its first step. */
  | { readonly kind: "ready"; readonly hz: number; readonly roster: readonly RosterBody[]; readonly frame: Float64Array }
  /** A step taken. */
  | { readonly kind: "frame"; readonly frame: Float64Array; readonly news: StageNews | null }
  /** The stage's news between steps: as it is built, and once it has taken an input. */
  | { readonly kind: "news"; readonly news: StageNews }
  /** The steps a `step` message asked for are taken, or as many as the stage had left. */
  | { readonly kind: "stepped"; readonly request: number }
  /** The stage's tape, as asked. */
  | { readonly kind: "tape"; readonly tape: readonly TapeEntry[]; readonly request: number }
  /** The stage failed: the error's message. */
  | { readonly kind: "fault"; readonly message: string };
