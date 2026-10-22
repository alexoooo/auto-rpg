/** **The stub evaluation**: does a mind keep its body up alone for a second? A battery of lone bodies, registered by a line of the evaluations list (`evaluations.mjs`). */
import { STUB_STAND_CASES } from "./cases.mjs";

export const STUB_STAND = Object.freeze({
  id: "stub-stand", title: "Stand alone", group: "skills", question: "Does a mind keep its body up alone for a second?",
  protocols: STUB_STAND_CASES, defaultProtocol: "standard", schedule: "all", analysis: {},
  subjects: (choice) => choice.map((one) => ({ id: one.id, label: one.label, parts: [{ id: `mind:${one.id}`, value: one.value }], value: one.value })),
  figures: Object.freeze([{ name: "down", unit: "share of cases", kind: "rate", better: "lower", of: (reading) => reading.down }]),
  summary: () => ({ lines: [], json: null }),
});
