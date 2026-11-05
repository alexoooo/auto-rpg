import type { BodyRef } from "./read-body.ts";
/** Permitted contact identity, detached from engine handles: a body's segment says whether its body covers with it (`Marks.guards`). */
export type ContactTarget = { readonly kind: "body"; readonly body: string; readonly segment: string; readonly guard: boolean }
  | { readonly kind: "object"; readonly id: string } | { readonly kind: "world"; readonly id?: string };

/** Trusted adapter maps physics bodies to permitted identities; only detached results enter a view. */
export type ContactIdentity = (other: BodyRef | null) => ContactTarget | null;
