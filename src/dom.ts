/** The element with id `id`, which the page's markup must hold. */
export function need<T extends HTMLElement>(id: string, root: ParentNode = document): T {
  const element = root.querySelector(`[id="${id}"]`);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
}
