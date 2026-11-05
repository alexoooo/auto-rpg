import { CENTRE_AIM } from "../../skills/perception/centre-aim.ts";
import { SURFACE_AIM } from "../../skills/strikes/aims/surface.ts";
import { LEG_HEIGHT_AIM } from "../../skills/strikes/stomp/leg-height-aim.ts";

/** The registered aiming implementations, in picker order. */
export const AIMS = Object.freeze({ centre: CENTRE_AIM, surface: SURFACE_AIM, "leg-height": LEG_HEIGHT_AIM });
