/**
 * **A learnable part's seam**, kept in its memory as `learner`: a part with a network decides by
 * it; with none, each time it decides it publishes what it reads (`inputs`) and counts the decision
 * (`decisions`), and it acts on the outputs its memory holds (`outputs`), which a trainer writes.
 * It is `running` while it decides at all: a punch's drive, a bare mind always.
 */
export interface Learner {
  readonly inputs: number[];
  readonly outputs: number[];
  decisions: number;
  running: boolean;
}

/** A learner that has read nothing and decided nothing, holding `outputs` zeros, running or not. */
export const learnerOf = (outputs: number, running: boolean): Learner => ({ inputs: [], outputs: new Array<number>(outputs).fill(0), decisions: 0, running });
