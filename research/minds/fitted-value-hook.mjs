/**
 * The load hook `research/minds/fitted-value.mjs` registers: it hands each tree search's root, as
 * the search reads it, and the states it reads (`space`), to `globalThis.__searchRoot`. It changes
 * no result: the search goes on as it would.
 */
/** Where the tree search makes its states and its leaf (`treeSearch`). */
const AT = /const at = space\(root, searched\), leafAt = [^;]*;/;
const textOf = (source) => typeof source === "string" ? source : new TextDecoder().decode(source);

export async function load(url, context, next) {
  const out = await next(url, context);
  if (!url.endsWith("/src/minds/option/choosers/tree-search.ts")) return out;
  const text = textOf(out.source);
  if (!AT.test(text)) throw new Error("the tree search no longer makes its states where the fitted value's hook looks");
  return { ...out, source: text.replace(AT, (made) => `${made} globalThis.__searchRoot?.(root, at);`) };
}
