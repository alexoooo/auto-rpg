import { constructLearningMorphology } from "../src/construct/learning/corpus.ts";
import { runConstructLearningShard } from "../src/construct/learning/rollout.ts";
import { createConstructHeadlessArena } from "./construct-headless-arena.mjs";

export async function runConstructRolloutJob(job, weights) {
  const split = job.spec.stage === "validation" ? "validation" : job.spec.stage === "held-out" ? "test" : "train";
  const candidate = constructLearningMorphology(job.spec.morphology, split);
  const opponent = constructLearningMorphology(job.spec.opponent ?? "crossbow-standard", "train");
  const arena = await createConstructHeadlessArena();
  try {
    return runConstructLearningShard(arena.scene, job, candidate, opponent, weights);
  } finally {
    arena.dispose();
  }
}
