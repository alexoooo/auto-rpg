/**
 * **`make`, remembered by its argument**: each made once, an object's held weakly, any other key
 * (a string, a number, null) for good. For what is made of frozen data, which a key always answers
 * alike; several keys are several of these, one inside the other.
 */
export function remembered<K, V>(make: (key: K) => V): (key: K) => V {
  const weak = new WeakMap<object, { readonly value: V }>(), strong = new Map<K, { readonly value: V }>();
  return (key) => {
    if (typeof key === "object" && key !== null) {
      const known = weak.get(key);
      if (known) return known.value;
      const value = make(key);
      weak.set(key, { value });
      return value;
    }
    const known = strong.get(key);
    if (known) return known.value;
    const value = make(key);
    strong.set(key, { value });
    return value;
  };
}
