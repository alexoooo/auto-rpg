import type { Vec3 } from "../spec/quantity.ts";
import { add, dot, scale, sub } from "../spec/vec.ts";

/** First entry of a finite ray into outward convex planes; an internal start has no exposed entry. */
export function hullEntry(planes: readonly { readonly normal: Vec3; readonly offset: number }[], from: Vec3, to: Vec3): Vec3 | null {
  const direction = sub(to,from);
  let enter = 0, leave = 1, outside = false;
  for(const plane of planes) {
    const distance = plane.offset-dot(plane.normal,from), speed = dot(plane.normal,direction);
    if(distance<0)outside=true;
    if(speed===0){if(distance<0)return null;}
    else if(speed<0)enter=Math.max(enter,distance/speed);
    else leave=Math.min(leave,distance/speed);
    if(enter>leave)return null;
  }
  return outside?add(from,scale(direction,enter)):null;
}
