import { CENTRE_AIM, SURFACE_AIM, LEG_HEIGHT_AIM } from "../../skills/framework/aims.ts";

/** The registered aiming implementations, in picker order. */
export const AIMS = Object.freeze({ centre: CENTRE_AIM, surface: SURFACE_AIM, "leg-height": LEG_HEIGHT_AIM });
