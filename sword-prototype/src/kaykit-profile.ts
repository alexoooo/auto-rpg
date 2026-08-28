import profile from "../asset-src/armour/kaykit-adventurers-1.0/derived-profile.json" with {
  type: "json",
};

import { CONFIG } from "./config.ts";
import type { HumanoidProfile } from "./fighter.ts";
import type { KayKitPhysicsBone } from "./kaykit-adapter.ts";

type Triple = readonly [number, number, number];

interface RegionBounds {
  minM: Triple;
  maxM: Triple;
  centreM: Triple;
  sizeM: Triple;
  halfExtentsM: Triple;
}

const regions = profile.physics.regionBounds as unknown as
  Readonly<Record<KayKitPhysicsBone, RegionBounds>>;
const joints = Object.fromEntries(profile.regions.map((region) => [
  region.region,
  region.bindWorldJointCentreM,
])) as unknown as Readonly<Record<KayKitPhysicsBone, Triple>>;

const radial = (region: KayKitPhysicsBone, longitudinalAxis: 0 | 1 = 1): number => {
  const half = regions[region].halfExtentsM;
  return Math.max(...half.filter((_, axis) => axis !== longitudinalAxis));
};

const sourceArmLength = profile.lengthsM.swordUpperArm +
  profile.lengthsM.swordForearm + profile.lengthsM.swordHandToSlot;
const warriorArmLength = CONFIG.arm.upperLength + CONFIG.arm.foreLength + CONFIG.arm.handLength;
const sourceReach = (warriorReach: number): number =>
  warriorReach / warriorArmLength * sourceArmLength;

/**
 * The authoritative dimensions of the experimental body.
 *
 * Every geometric number below is a direct projection of the generated asset
 * profile: region AABBs define capsule centres/radii, creator joints define
 * pivots, and creator bone/slot distances define the arm chain. Control gains,
 * masses and health remain the established Fighter values so this visual trial
 * does not also pretend to be a balance pass.
 */
export const KAYKIT_KNIGHT_PROFILE: HumanoidProfile = Object.freeze({
  kind: "kaykit-knight",
  scale: 1,
  massScale: 1,
  healthScale: 1,
  forceScale: 1,
  mobilityScale: 1,
  turnScale: 1,
  appearance: "kaykit-knight",
  values: Object.freeze({
    body: Object.freeze({
      torsoCentre: regions.torso.centreM[1],
      torsoLength: regions.torso.sizeM[1],
      torsoRadius: radial("torso"),
      neck: joints.head[1],
      headCentre: regions.head.centreM[1],
      headLength: regions.head.sizeM[1],
      headRadius: radial("head"),
      waist: joints.pelvis[1],
      pelvisCentre: regions.pelvis.centreM[1],
      pelvisLength: Math.max(regions.pelvis.sizeM[1], radial("pelvis") * 2),
      pelvisRadius: radial("pelvis"),
      hip: joints.thighLeft[1],
      // Fighter names its first leg `thighLeft` at `-hipSide`; KayKit's `.l`
      // is positive X in the creator frame, so the signed table value matters.
      hipSide: -joints.thighLeft[0],
      thighCentre: regions.thighLeft.centreM[1],
      thighLength: regions.thighLeft.sizeM[1],
      thighRadius: radial("thighLeft"),
      knee: joints.shinLeft[1],
      shinCentre: regions.shinLeft.centreM[1],
      shinLength: Math.max(regions.shinLeft.sizeM[1], radial("shinLeft") * 2),
      shinRadius: radial("shinLeft"),
      crouchDepth: CONFIG.body.crouchDepth / CONFIG.fighter.height * profile.bodyOnlyBounds.heightM,
    }),
    fighter: Object.freeze({
      height: profile.bodyOnlyBounds.heightM,
      shoulderHeight: joints.swordUpperArm[1],
      // The creator's sword hand is anatomical right at negative model X.
      shoulderSide: joints.swordUpperArm[0],
      shoulderFront: joints.swordUpperArm[2],
    }),
    arm: Object.freeze({
      upperLength: profile.lengthsM.swordUpperArm,
      upperRadius: radial("swordUpperArm", 0),
      foreLength: profile.lengthsM.swordForearm,
      foreRadius: radial("swordForearm", 0),
      handLength: profile.lengthsM.swordHandToSlot,
      handRadius: radial("swordHand", 0),
      reachNeutral: sourceReach(CONFIG.arm.reachNeutral),
      reachThrust: sourceReach(CONFIG.arm.reachThrust),
      reachGuard: sourceReach(CONFIG.arm.reachGuard),
      reachMax: sourceReach(CONFIG.arm.reachMax),
    }),
  }),
});

export const KAYKIT_KNIGHT_METRICS = Object.freeze({
  crownHeight: regions.head.centreM[1] + radial("head"),
  vitalHeight: regions.torso.centreM[1],
  collisionRadius: radial("pelvis"),
  reach: sourceReach(CONFIG.arm.reachNeutral),
});

export { profile as KAYKIT_KNIGHT_ASSET_PROFILE };
