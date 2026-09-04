import { humanoidSavedConstruct, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { runConstructWarriorBout } from "./construct-warrior-bout.mjs";

/**
 * A deliberately small real-Havok contact witness for the permanent offhand.
 *
 * The ordinary dynamic corpus proves every Effigy cell drives both arms. This probe answers the
 * narrower hardware question the corpus cannot guarantee in every stochastic exchange: does the
 * visible bronze chisel ever make its own armed physical contact? The Warrior keeps one ordinary
 * sword but no buckler. A block is success here -- it proves an attack action met real opposing
 * hardware, and a zero wound is the correct physical result of that guard rather than a damage
 * exception. There is no target transform, trigger-only hitbox or synthetic collision in this
 * fixture.
 */
export const EFFIGY_GAUNTLET_CONTACT_V1 = Object.freeze({
  physics: "real-havok-fixed-240hz",
  physicsHz: 240,
  seconds: 30,
  warriorSeed: 4140987459,
  constructSide: "left",
  warriorLoadout: Object.freeze({ primary: "sword", secondary: "empty" }),
});

export async function runEffigyGauntletContactProbe() {
  const config = EFFIGY_GAUNTLET_CONTACT_V1;
  const bout = await runConstructWarriorBout({
    saved: humanoidSavedConstruct(), sensors: HUMANOID_SENSORS, constructPolicy: "humanoid-authored",
    warriorPolicy: "duelist", warriorSeed: config.warriorSeed, constructSide: config.constructSide,
    warriorLoadout: config.warriorLoadout, maxSteps: config.seconds * config.physicsHz,
  });
  return Object.freeze({ version: 1, config, physics: bout.physics,
    contacts: Object.freeze(bout.constructContacts.filter(({ effectorId }) => effectorId === "effigy-gauntlet")),
    bout: Object.freeze({ simulatedSeconds: bout.simulatedSeconds, winner: bout.winner,
      posture: bout.posture, startedActions: bout.startedActions, completedActions: bout.completedActions }) });
}

export function assertEffigyGauntletContactProbe(report) {
  if (!report || report.version !== 1 || report.physics !== EFFIGY_GAUNTLET_CONTACT_V1.physics) {
    throw new Error("Effigy gauntlet probe requires real fixed-step Havok evidence");
  }
  if (!(report.bout?.simulatedSeconds >= EFFIGY_GAUNTLET_CONTACT_V1.seconds)) {
    throw new Error("Effigy gauntlet probe did not complete its fixed physical horizon");
  }
  const contact = report.contacts.find(({ blocked, weapon, action, phase, sourceModuleId, speedMps }) => blocked === true &&
    weapon === "axe" && action === "gauntlet-strike" && (phase === "drive" || phase === "hold") &&
    sourceModuleId === "effigy-gauntlet" && Number.isFinite(speedMps) && speedMps > 0);
  if (!contact) {
    throw new Error("Effigy gauntlet probe found no armed bronze-chisel contact against the Warrior's real guard");
  }
  return Object.freeze({ ...report, contact });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  const report = await runEffigyGauntletContactProbe();
  let accepted = null;
  let rejection = null;
  try { accepted = assertEffigyGauntletContactProbe(report); }
  catch (error) { rejection = error instanceof Error ? error.message : String(error); process.exitCode = 1; }
  console.log(JSON.stringify({ accepted: accepted !== null, rejection, contact: accepted?.contact ?? null,
    simulatedSeconds: report.bout.simulatedSeconds, winner: report.bout.winner }, null, 2));
}
