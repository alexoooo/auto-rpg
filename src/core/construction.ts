interface Disposable { dispose(): void }

/** Resources stay with a construction until its completed owner takes this lifetime. */
export function constructionScope() {
  const resources: Disposable[] = [];
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    try { while (resources.length) resources.pop()!.dispose(); }
    finally { if (resources.length) { disposed = false; dispose(); } }
  };
  return {
    own<T extends Disposable | null | undefined>(value: T): T {
      if (disposed) throw new Error("a disposed construction cannot acquire resources");
      if (value) resources.push(value);
      return value;
    },
    /** A completed child has taken responsibility for this resource. */
    forget(value: Disposable): void { const at = resources.lastIndexOf(value); if (at >= 0) resources.splice(at, 1); },
    dispose,
  };
}
