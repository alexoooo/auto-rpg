/**
 * A turn given as yaw about y, then pitch about x, then roll about z, rad, into `result`: the
 * quaternion Babylon's `Quaternion.RotationYawPitchRollToRef` makes, its arithmetic kept, for the
 * research scripts that place bodies by it. `Math.sin` rounds by the engine's own rule, so the
 * core never uses it.
 */
export function yawPitchRollToRef(yaw, pitch, roll, result) {
  const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2), sp = Math.sin(pitch / 2), cp = Math.cos(pitch / 2);
  const sr = Math.sin(roll / 2), cr = Math.cos(roll / 2);
  return result.set(cy * sp * cr + sy * cp * sr, sy * cp * cr - cy * sp * sr, cy * cp * sr - sy * sp * cr, cy * cp * cr + sy * sp * sr);
}
