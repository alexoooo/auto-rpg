/** One job per worker at a time; every completion or defect ends the owned pool before returning. */
export async function workerJobs(jobs, { lanes, create, message = (job) => job, result = (answer) => answer.result, onError }) {
  if (!Number.isSafeInteger(lanes) || lanes < 1) throw new Error("worker lanes must be a positive integer");
  const workers = [], results = new Array(jobs.length);
  let next = 0, closing = false;
  try {
    await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, () => new Promise((resolve, reject) => {
      const worker = create(); workers.push(worker);
      let current = null;
      const feed = () => {
        if (next >= jobs.length) { current = null; resolve(); return; }
        current = next++;
        worker.postMessage(message(jobs[current], current));
      };
      worker.on("error", reject);
      worker.on("exit", code => { if (!closing) reject(new Error(`research worker exited (${code})`)); });
      worker.on("message", answer => {
        try {
          if (current === null) throw new Error("research worker answered without a job");
          if (answer.error) { onError?.(answer, jobs[current]); throw new Error(answer.error); }
          results[current] = result(answer, jobs[current], current);
          feed();
        } catch (error) { reject(error); }
      });
      feed();
    })));
    return results;
  } finally {
    closing = true;
    await Promise.all(workers.map(worker => worker.terminate()));
  }
}
