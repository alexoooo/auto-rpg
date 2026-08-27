/**
 * What a controller says about its stance head: how many distinct postures it
 * can choose meaningfully.
 *
 * This is a declaration rather than an inference for the same reason
 * `PersistenceHead` is. A look-ahead controller writes
 * `UNLEARNED_STANCE` on every label because it has no stance head; a learned
 * controller can converge on that same constant. Counting what one bout used
 * therefore cannot tell those two cases apart.
 *
 * The body's capability is a separate half of the answer. A centipede publishes
 * zero crouch, lean and twist and never consumes `Intent.posture`, so its six
 * named stances are six spellings of one behaviour. `stanceOptionsForBody`
 * narrows every controller to one on that body rather than letting a real head
 * advertise choices the executor cannot express.
 *
 * Silence means one. That under-claims an undeclared controller instead of
 * inventing a head for it, and keeps small scripted probes honest by default.
 */
export interface StanceHead {
  readonly stanceOptions: number;
}

/** Read and validate the controller's declaration. */
export function stanceOptionsOf(mind: unknown): number {
  const declared = (mind as Partial<StanceHead> | null | undefined)?.stanceOptions;
  if (declared === undefined) return 1;
  if (!Number.isSafeInteger(declared) || declared < 1) {
    throw new Error(`a controller declared ${declared} stance options; the contract is a whole number of at least 1`);
  }
  return declared;
}

/** The choices both the controller and the body can turn into different commands. */
export function stanceOptionsForBody(mind: unknown, unit: string): number {
  const declared = stanceOptionsOf(mind);
  return unit === "centipede" ? 1 : declared;
}
