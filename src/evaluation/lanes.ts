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
  if (!Number.isSafeInteger(lanes) || lanes < 1) throw new Error("worker lanes must be a positive integer");
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("a worker timeout must be positive");
  let next = 0, failed = false, failure: unknown;
  const cancel = new Set<() => void>();
  const fail = (error: unknown) => {
    if (!failed) { failed = true; failure = error; }
    for (const stopLane of cancel) stopLane();
  };
  const lane = async (): Promise<void> => {
    let settle: ((outcome: { answer: A } | { lost: string } | null) => void) | null = null;
    let early: string | null = null, worker: Lane<J> | null = null, generation = 0;
    const finish = (outcome: { answer: A } | { lost: string } | null) => { const done = settle; settle = null; done?.(outcome); };
    const listening = (): Listen<A> => {
      const born = ++generation;
      return {
        answer: (answer) => { if (born === generation && !failed) finish({ answer }); },
        lost: (reason) => {
          if (born !== generation || failed) return;
          if (settle) finish({ lost: reason }); else early = reason;
        },
      };
    };
    const abort = () => finish(null);
    cancel.add(abort);
    try {
      while (!failed && next < jobs.length && !stop?.()) {
        const job = jobs[next++]!;
        if (!worker) { early = null; worker = spawn(listening()); }
        const current = worker;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let outcome: { answer: A } | { lost: string } | null;
        try {
          outcome = await new Promise<{ answer: A } | { lost: string } | null>((resolve, reject) => {
            settle = resolve;
            if (early !== null) { finish({ lost: early }); return; }
            timer = setTimeout(() => finish({ lost: `no answer in ${minutes} min` }), minutes * 60_000);
            try { current.post(job); } catch (error) { settle = null; reject(error); }
          });
        } finally { clearTimeout(timer); settle = null; }
        if (outcome === null) return;
        if ("answer" in outcome) onAnswer(job, outcome.answer);
        else { worker = null; generation++; current.terminate(); onLost(job, outcome.lost); }
      }
    } catch (error) {
      fail(error);
      throw error;
    } finally {
      cancel.delete(abort); generation++;
      try { worker?.terminate(); } catch (error) { fail(error); }
    }
  };
  const work = Array.from({ length: Math.min(lanes, jobs.length) }, lane);
  const results = await Promise.allSettled(work);
  if (failed) throw failure;
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (rejected) throw rejected.reason;
}
