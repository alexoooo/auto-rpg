import { deepFreeze } from "../../../../core/state.ts";
import type { StraightDrive } from "../../shared/straight-drive.ts";

/**
 * **The punch on the move**: the straight drive thrown by the arm and the trunk on legs it leaves
 * to whatever walks them (`StraightDriveOptions.leavesLegs`), so a walk goes on under it and no
 * strike learns the legs again. These settings go over its body's record, the drive's: no turn of
 * the hips, which is the stance's heading and so the legs', and no wait for a quiet stance before
 * it is admitted. The record's network was trained standing, its hips turned and its stance asked
 * for a turn and a shift: here it steers a punch it was not trained on, until one is trained.
 */
export const MOVING: Partial<StraightDrive> = deepFreeze({ hips: 0, poised: false });
