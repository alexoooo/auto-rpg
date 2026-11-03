/**
 * **A mind's config**: plain data, so it rides in a recipe, a save and a link, its kind naming
 * its controller (`CONTROLLERS`). Each kind of mind declares its own type in its own module; a
 * fight passes one through and reads nothing in it.
 */
export interface MindConfig { readonly kind: string }
