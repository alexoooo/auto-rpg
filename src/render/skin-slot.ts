import type { BuiltBody } from "../core/build/build-body.ts";
import type { Dresser } from "./dress.ts";
import type { SkinOptions, SkinView } from "./skin-view.ts";

/** A body's replaceable skin, including requests whose assets are still loading. */
export interface SkinSlot extends SkinView {
  replace(loading: Promise<Dresser>, options: SkinOptions): Promise<void>;
}

/** The latest request owns the skin. Visibility and clothing also apply while assets are loading. */
export function skinSlot(built: BuiltBody, changed: () => void = () => {}): SkinSlot {
  const state = { view: null as SkinView | null, revision: 0, disposed: false, enabled: true,
    clothing: null as SkinOptions["clothing"] | null };
  return {
    get meshes() { return state.view?.meshes ?? []; },
    async replace(loading, options) {
      if (state.disposed) { await loading.catch(() => {}); return; }
      const revision = ++state.revision;
      state.clothing = options.clothing;
      let dress: Dresser;
      try { dress = await loading; }
      catch (error) { if (state.disposed || state.revision !== revision) return; throw error; }
      if (state.disposed || state.revision !== revision) return;
      const view = dress(built, { ...options, clothing: state.clothing });
      view.setEnabled(state.enabled);
      const previous = state.view;
      state.view = view;
      previous?.dispose();
      changed();
    },
    setEnabled(enabled) { state.enabled = enabled; state.view?.setEnabled(enabled); },
    wear(clothing) { state.clothing = clothing; state.view?.wear(clothing); },
    dispose() {
      state.disposed = true; state.revision++;
      state.view?.dispose(); state.view = null;
    },
  };
}
