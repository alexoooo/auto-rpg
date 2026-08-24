import { RESEARCH_ALGORITHMS } from "../src/learning/artifact.ts";

const at = process.argv.indexOf("--idea"); const idea = at < 0 ? "" : process.argv[at + 1];
if (!RESEARCH_ALGORITHMS.includes(idea)) throw new Error(`--idea must name one of ${RESEARCH_ALGORITHMS.join(", ")}`);
if (idea === "neat-qd") await import("./train-neat-qd.mjs");
else if (idea === "dagger") await import("./collect-dagger.mjs");
else if (idea === "ppo") await (await import("./train-ppo.mjs")).runPpoCli();
else if (idea === "lookahead") await (await import("./train-lookahead.mjs")).runLookaheadCli();
