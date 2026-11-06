/** Persistent workers own queued and active jobs until each settles or the pool closes. */
export function workerJobPool({ lanes, create, message = (job) => job, result = (answer) => answer.result, onError }) {
  if (!Number.isSafeInteger(lanes) || lanes < 1) throw new Error("worker lanes must be a positive integer");
  const workers = [], queue = [];
  let closed = false, closing = null, serial = 0, failed = false, failure;
  const close = (reason) => {
    if (closing) return closing;
    closed = true;
    if (reason !== undefined) { failed = true; failure = reason; }
    const refusal = reason ?? new Error("worker pool closed");
    for (const entry of queue.splice(0)) entry.reject(refusal);
    for (const slot of workers) { slot.current?.reject(refusal); slot.current = null; }
    closing = Promise.allSettled(workers.map(({ worker }) => Promise.resolve().then(() => worker.terminate()))).then(results => {
      const stopped = results.find(result => result.status === "rejected");
      if (!failed && stopped) throw stopped.reason;
    });
    return closing;
  };
  const pump = () => {
    if (closed) return;
    try {
      while (queue.length && workers.length < Math.min(lanes, queue.length + workers.filter(slot => slot.current).length)) {
        const worker = create(), slot = { worker, current: null };
        workers.push(slot);
        worker.on("error", error => { void close(error); });
        worker.on("exit", code => { if (!closed) void close(new Error(`research worker exited (${code})`)); });
        worker.on("message", answer => {
          if (closed) return;
          const entry = slot.current;
          try {
            if (!entry) throw new Error("research worker answered without a job");
            if (answer?.error) { onError?.(answer, entry.job); throw new Error(answer.error); }
            const value = result(answer, entry.job, entry.index);
            slot.current = null; entry.resolve(value); pump();
          } catch (error) { void close(error); }
        });
      }
      for (const slot of workers) if (!slot.current && queue.length) {
        const entry = slot.current = queue.shift();
        slot.worker.postMessage(message(entry.job, entry.index));
      }
    } catch (error) { void close(error); }
  };
  return {
    async run(jobs) {
      if (closed) throw failed ? failure : new Error("worker pool closed");
      const promises = jobs.map(job => new Promise((resolve, reject) => queue.push({ job, resolve, reject, index: serial++ })));
      pump();
      try { return await Promise.all(promises); }
      catch (error) { try { await close(error); } finally { throw error; } }
    },
    close,
  };
}

/** One job per worker at a time; every completion or defect ends the owned pool before returning. */
export async function workerJobs(jobs, options) {
  const pool = workerJobPool(options);
  let results;
  try { results = await pool.run(jobs); }
  catch (error) { try { await pool.close(); } finally { throw error; } }
  await pool.close();
  return results;
}
