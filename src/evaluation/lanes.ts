/**
 * **Lanes**: jobs fed one at a time to each of several workers, whatever a worker is (a Node worker
 * thread, a page's Web Worker): `spawn` makes one and says how it answers and how it is lost.
 */

/** A worker as the lanes use it. */
interface Lane<J> {
  post(job: J): void;
  terminate(): void;
}

/** What a worker tells its lane: an answer to the job it was given, or that it is gone and why. */
interface Listen<A> {
  answer(answer: A): void;
  lost(reason: string): void;
}

export type Spawn<J, A> = (listen: Listen<A>) => Lane<J>;

interface LaneOptions<J, A> {
  readonly lanes: number;
  readonly spawn: Spawn<J, A>;
  /** How long a job may take before its worker is stopped, min. */
  readonly minutes: number;
  onAnswer(job: J, answer: A): void;
  /** Whether to give out no more jobs: those under way finish. */
  stop?(): boolean;
  /** A job whose worker died or ran past `minutes`: it has no answer, and may be tried again. */
  onLost(job: J, reason: string): void;
}

/**
 * Give each of `jobs` to a worker, `lanes` at once, each worker one job at a time, until every job
 * is answered or lost, or `stop` says so. A lost job's worker is replaced; the others go on.
 */
export async function runLanes<J, A>(jobs: readonly J[], { lanes, spawn, minutes, onAnswer, onLost, stop }: LaneOptions<J, A>): Promise<void> {
  let next = 0;
  const lane = async (): Promise<void> => {
    let settle: ((outcome: { answer: A } | { lost: string }) => void) | null = null;
    const listen: Listen<A> = {
      answer: (answer) => { const done = settle; settle = null; done?.({ answer }); },
      lost: (reason) => { const done = settle; settle = null; done?.({ lost: reason }); },
    };
    let worker: Lane<J> | null = null;
    try {
      while (next < jobs.length && !stop?.()) {
        const job = jobs[next++];
        const current: Lane<J> = worker ??= spawn(listen);
        const outcome = await new Promise<{ answer: A } | { lost: string }>((resolve) => {
          const timer = setTimeout(() => listen.lost(`no answer in ${minutes} min`), minutes * 60_000);
          settle = (outcome) => { clearTimeout(timer); resolve(outcome); };
          current.post(job);
        });
        if ("answer" in outcome) onAnswer(job, outcome.answer);
        else { worker = null; current.terminate(); onLost(job, outcome.lost); }
      }
    } catch (error) {
      next = jobs.length;
      throw error;
    } finally { worker?.terminate(); }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(lanes, jobs.length)) }, lane));
}
