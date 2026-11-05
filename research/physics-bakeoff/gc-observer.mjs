import { PerformanceObserver } from "node:perf_hooks";

/** GC entries are delivered after synchronous work; attribute them by their actual time interval. */
export function gcObserver() {
  const entries = [];
  const observer = new PerformanceObserver(list => entries.push(...list.getEntries()));
  observer.observe({ entryTypes: ["gc"] });
  return {
    async between(start, end) {
      // Delivery crosses an event-loop turn; drain records as well as the delivered callback batch.
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
      entries.push(...observer.takeRecords());
      const counted = entries.filter(entry => entry.startTime < end && entry.startTime + entry.duration > start);
      entries.splice(0, entries.length, ...entries.filter(entry => entry.startTime >= end));
      return { gcCount: counted.length, gcMs: counted.reduce((sum, entry) => sum + entry.duration, 0) };
    },
    dispose() { observer.disconnect(); },
  };
}
