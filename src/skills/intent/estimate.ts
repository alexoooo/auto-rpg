/** The meaning of a numeric estimate, owned and named by its producing implementation. */
export type EstimateUnit = string;

/** Only estimates whose declared units agree may be compared numerically. */
export interface Estimate { readonly unit: EstimateUnit; readonly value: number }
