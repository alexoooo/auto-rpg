/** A worker's failure belongs to its lifetime, including intervals with no outstanding request. */
export function learningWorker(worker) {
  let waiting = null, failure = null, ready = null;
  const receive = message => {
    if (message.error) failure ??= message;
    if (waiting) { const answer = waiting; waiting = null; answer(failure ?? message); }
    else if (message.ready) ready = message;
  };
  worker.on("message", receive);
  worker.on("error", error => receive({ error: String(error.stack ?? error) }));
  worker.on("exit", code => receive({ error: `learning worker exited (${code})` }));
  return { worker,
    ask(message) {
      if (failure) return Promise.resolve(failure);
      if (ready && message === null) { const answer = ready; ready = null; return Promise.resolve(answer); }
      if (waiting) return Promise.reject(new Error("learning worker already has a request"));
      return new Promise(resolve => {
        waiting = resolve;
        try { if (message) worker.postMessage(message); }
        catch (error) { receive({ error: String(error.stack ?? error) }); }
      });
    },
  };
}
