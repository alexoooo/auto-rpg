/** An expected unsupported input, carried to its caller without an exception. */
export interface Refused { readonly refused: string }
export const isRefused = (value: unknown): value is Refused =>
  value !== null && typeof value === "object" && typeof (value as Refused).refused === "string";
