export interface Indexed<T> { index: number; value: T }

/** Partition work by authoritative index; completion order never becomes evolutionary order. */
export function partitionIndexed<T>(values: readonly T[], workers: number): Indexed<T>[][] {
  if (!Number.isInteger(workers) || workers <= 0) throw new Error(`invalid worker count ${workers}`);
  const batches = Array.from({ length: Math.min(workers, Math.max(1, values.length)) }, () => [] as Indexed<T>[]);
  values.forEach((value, index) => (batches[index % batches.length] as Indexed<T>[]).push({ index, value })); return batches;
}

export function restoreIndexed<T>(batches: readonly (readonly Indexed<T>[])[], expected: number): T[] {
  const rows = batches.flat().sort((a, b) => a.index - b.index);
  if (rows.length !== expected || rows.some((row, index) => row.index !== index)) throw new Error("worker results are missing or duplicate indexed jobs");
  return rows.map((row) => row.value);
}
