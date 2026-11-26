/**
 * The load hook `research/minds/move-prior.mjs` registers: it hands each tree search's root, the
 * states the search read (`space`) and the root's Options as the search left them (`TreeEdge`) to
 * `globalThis.__searchLines`, before the search prices them. It changes no result.
 */
/** Where the tree search ends: its root's edges priced (`treeSearch`). */
const END = /\n  started\.keep\(edges\);\n/;
const textOf = (source) => typeof source === "string" ? source : new TextDecoder().decode(source);

export async function load(url, context, next) {
  const out = await next(url, context);
  if (!url.endsWith("/src/minds/option/choosers/tree-search.ts")) return out;
  const text = textOf(out.source);
  if (!END.test(text)) throw new Error("the tree search no longer ends where the move prior's hook looks");
  return { ...out, source: text.replace(END, (end) => `${end}  globalThis.__searchLines?.(root, at, edges);\n`) };
}
