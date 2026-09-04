import assert from "node:assert/strict";
import test from "node:test";

import { assertEffigyGauntletContactProbe, EFFIGY_GAUNTLET_CONTACT_V1 } from "../scripts/effigy-gauntlet-contact.mjs";

const report = () => ({ version: 1, physics: EFFIGY_GAUNTLET_CONTACT_V1.physics,
  bout: { simulatedSeconds: EFFIGY_GAUNTLET_CONTACT_V1.seconds }, contacts: [{
    blocked: true, weapon: "axe", action: "gauntlet-strike", phase: "drive",
    sourceModuleId: "effigy-gauntlet", speedMps: 1.1,
  }] });

test("the_effigy_contact_probe_requires_a_real_armed_bronze_chisel_guard_contact", () => {
  assert.equal(assertEffigyGauntletContactProbe(report()).contact.action, "gauntlet-strike");
  const wrongPhase = report(); wrongPhase.contacts[0].phase = "chamber";
  assert.throws(() => assertEffigyGauntletContactProbe(wrongPhase), /no armed bronze-chisel contact/);
  const invisibleSource = report(); invisibleSource.contacts[0].sourceModuleId = null;
  assert.throws(() => assertEffigyGauntletContactProbe(invisibleSource), /no armed bronze-chisel contact/);
});
