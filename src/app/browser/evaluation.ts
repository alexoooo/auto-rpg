import { CONTEXT } from "./context.ts";
import { evaluationApplication } from "../evaluation.ts";

/** Browser evaluation composition. */
export const { EVALUATIONS } = evaluationApplication(CONTEXT);
