/**
 * **The core's vectors and turns**: `Vector3` and `Quaternion`, plain number fields and the members
 * the core and the entrants call. Each member is `@babylonjs/core` 9.33.1's
 * (`Maths/math.vector.pure.js`), operation for operation and in the same order, so the core computes
 * as Babylon's would to the bit, in every JavaScript engine: `+ - * /` and `Math.sqrt`, and
 * `Math.fround` where Babylon's matrix rounds (`Quaternion.RotationQuaternionFromAxis`).
 *
 * A page's renderer has vectors of its own: it converts to and from these by their numbers. Each
 * class is its own type (`brand`), so the checker refuses one where the other is asked for.
 */
export class Vector3 {
  declare private readonly brand: "core";
  // Declared, not defined: a class field starts undefined, and a field once undefined boxes every
  // double written to it, so each write would allocate a number.
  declare x: number;
  declare y: number;
  declare z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x: number, y: number, z: number): this {
    return this.copyFromFloats(x, y, z);
  }

  setAll(v: number): this {
    this.x = this.y = this.z = v;
    return this;
  }

  copyFrom(source: Vector3): this {
    return this.copyFromFloats(source.x, source.y, source.z);
  }

  copyFromFloats(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  add(other: Vector3): Vector3 {
    return new Vector3(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  addInPlace(other: Vector3): this {
    this.x += other.x;
    this.y += other.y;
    this.z += other.z;
    return this;
  }

  addInPlaceFromFloats(x: number, y: number, z: number): this {
    this.x += x;
    this.y += y;
    this.z += z;
    return this;
  }

  addToRef<T extends Vector3>(other: Vector3, result: T): T {
    result.x = this.x + other.x;
    result.y = this.y + other.y;
    result.z = this.z + other.z;
    return result;
  }

  subtract(other: Vector3): Vector3 {
    return new Vector3(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  subtractInPlace(other: Vector3): this {
    this.x -= other.x;
    this.y -= other.y;
    this.z -= other.z;
    return this;
  }

  subtractToRef<T extends Vector3>(other: Vector3, result: T): T {
    const x = other.x, y = other.y, z = other.z;
    result.x = this.x - x;
    result.y = this.y - y;
    result.z = this.z - z;
    return result;
  }

  scale(scale: number): Vector3 {
    return new Vector3(this.x * scale, this.y * scale, this.z * scale);
  }

  scaleInPlace(scale: number): this {
    this.x *= scale;
    this.y *= scale;
    this.z *= scale;
    return this;
  }

  scaleToRef<T extends Vector3>(scale: number, result: T): T {
    result.x = this.x * scale;
    result.y = this.y * scale;
    result.z = this.z * scale;
    return result;
  }

  lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length(): number {
    return Math.sqrt(this.lengthSquared());
  }

  /** Scaled to length 1 by the reciprocal of its length; a zero or unit vector as it is. */
  normalize(): this {
    return this.normalizeFromLength(this.length());
  }

  normalizeFromLength(len: number): this {
    if (len === 0 || len === 1.0) return this;
    return this.scaleInPlace(1.0 / len);
  }

  normalizeToRef<T extends Vector3>(result: T): T {
    const len = this.length();
    if (len === 0 || len === 1.0) {
      result.x = this.x;
      result.y = this.y;
      result.z = this.z;
      return result;
    }
    return this.scaleToRef(1.0 / len, result);
  }

  /** This turned by `q`, written to `result`: v + w t + q × t, t = 2 q × v. */
  applyRotationQuaternionToRef<T extends Vector3>(q: Quaternion, result: T): T {
    const vx = this.x, vy = this.y, vz = this.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    result.x = vx + qw * tx + qy * tz - qz * ty;
    result.y = vy + qw * ty + qz * tx - qx * tz;
    result.z = vz + qw * tz + qx * ty - qy * tx;
    return result;
  }

  asArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  static Dot(left: Vector3, right: Vector3): number {
    return left.x * right.x + left.y * right.y + left.z * right.z;
  }

  static Cross(left: Vector3, right: Vector3): Vector3 {
    const result = new Vector3();
    Vector3.CrossToRef(left, right, result);
    return result;
  }

  static CrossToRef<T extends Vector3>(left: Vector3, right: Vector3, result: T): T {
    const x = left.y * right.z - left.z * right.y;
    const y = left.z * right.x - left.x * right.z;
    const z = left.x * right.y - left.y * right.x;
    result.copyFromFloats(x, y, z);
    return result;
  }

  static DistanceSquared(value1: Vector3, value2: Vector3): number {
    const x = value1.x - value2.x;
    const y = value1.y - value2.y;
    const z = value1.z - value2.z;
    return x * x + y * y + z * z;
  }

  static Distance(value1: Vector3, value2: Vector3): number {
    return Math.sqrt(Vector3.DistanceSquared(value1, value2));
  }

  static Up(): Vector3 {
    return new Vector3(0.0, 1.0, 0.0);
  }

  static Right(): Vector3 {
    return new Vector3(1.0, 0.0, 0.0);
  }

  /** +z; -z in a right-handed system. */
  static Forward(rightHandedSystem = false): Vector3 {
    return new Vector3(0.0, 0.0, rightHandedSystem ? -1.0 : 1.0);
  }

  /** Up, one vector shared by every reader: never written. */
  static get UpReadOnly(): Vector3 {
    return UP;
  }
}

const UP = Vector3.Up();

export class Quaternion {
  declare private readonly brand: "core";
  // Declared, not defined, as `Vector3`'s are.
  declare x: number;
  declare y: number;
  declare z: number;
  declare w: number;

  constructor(x = 0.0, y = 0.0, z = 0.0, w = 1.0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  set(x: number, y: number, z: number, w: number): this {
    return this.copyFromFloats(x, y, z, w);
  }

  copyFrom(other: Quaternion): this {
    this.x = other.x;
    this.y = other.y;
    this.z = other.z;
    this.w = other.w;
    return this;
  }

  copyFromFloats(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  clone(): Quaternion {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }

  multiply(q1: Quaternion): Quaternion {
    const result = new Quaternion(0, 0, 0, 1.0);
    this.multiplyToRef(q1, result);
    return result;
  }

  multiplyInPlace(other: Quaternion): this {
    return this.multiplyToRef(other, this);
  }

  /** This then `q1`, the Hamilton product this q1, written to `result`. */
  multiplyToRef<T extends Quaternion>(q1: Quaternion, result: T): T {
    const x = this.x * q1.w + this.y * q1.z - this.z * q1.y + this.w * q1.x;
    const y = -this.x * q1.z + this.y * q1.w + this.z * q1.x + this.w * q1.y;
    const z = this.x * q1.y - this.y * q1.x + this.z * q1.w + this.w * q1.z;
    const w = -this.x * q1.x - this.y * q1.y - this.z * q1.z + this.w * q1.w;
    result.copyFromFloats(x, y, z, w);
    return result;
  }

  scaleInPlace(value: number): this {
    this.x *= value;
    this.y *= value;
    this.z *= value;
    this.w *= value;
    return this;
  }

  lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
  }

  length(): number {
    return Math.sqrt(this.lengthSquared());
  }

  /** Scaled to length 1 by the reciprocal of its length; a zero or unit quaternion as it is. */
  normalize(): this {
    return this.normalizeFromLength(this.length());
  }

  normalizeFromLength(len: number): this {
    if (len === 0 || len === 1.0) return this;
    return this.scaleInPlace(1.0 / len);
  }

  asArray(): [number, number, number, number] {
    return [this.x, this.y, this.z, this.w];
  }

  static Identity(): Quaternion {
    return new Quaternion(0.0, 0.0, 0.0, 1.0);
  }

  /** The conjugate: the inverse of a unit quaternion. */
  static Inverse(q: Quaternion): Quaternion {
    return new Quaternion(-q.x, -q.y, -q.z, q.w);
  }

  static InverseToRef<T extends Quaternion>(q: Quaternion, result: T): T {
    result.set(-q.x, -q.y, -q.z, q.w);
    return result;
  }

  /**
   * The turn whose frame has the axes `axis1`, `axis2`, `axis3` (x, y, z), each normalized
   * (`normalizeToRef`) and rounded to single precision as Babylon's matrix stores them
   * (`Matrix.FromXYZAxesToRef`), then read as a rotation matrix (`Quaternion.FromRotationMatrixToRef`).
   */
  static RotationQuaternionFromAxis(axis1: Vector3, axis2: Vector3, axis3: Vector3): Quaternion {
    const a1 = axis1.normalizeToRef(AXES[0]!), a2 = axis2.normalizeToRef(AXES[1]!), a3 = axis3.normalizeToRef(AXES[2]!);
    const m11 = Math.fround(a1.x), m12 = Math.fround(a2.x), m13 = Math.fround(a3.x);
    const m21 = Math.fround(a1.y), m22 = Math.fround(a2.y), m23 = Math.fround(a3.y);
    const m31 = Math.fround(a1.z), m32 = Math.fround(a2.z), m33 = Math.fround(a3.z);
    const result = new Quaternion(0.0, 0.0, 0.0, 0.0);
    const trace = m11 + m22 + m33;
    let s: number;
    if (trace > 0) {
      s = 0.5 / Math.sqrt(trace + 1.0);
      result.w = 0.25 / s;
      result.x = (m32 - m23) * s;
      result.y = (m13 - m31) * s;
      result.z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
      s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
      result.w = (m32 - m23) / s;
      result.x = 0.25 * s;
      result.y = (m12 + m21) / s;
      result.z = (m13 + m31) / s;
    } else if (m22 > m33) {
      s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
      result.w = (m13 - m31) / s;
      result.x = (m12 + m21) / s;
      result.y = 0.25 * s;
      result.z = (m23 + m32) / s;
    } else {
      s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
      result.w = (m21 - m12) / s;
      result.x = (m13 + m31) / s;
      result.y = (m23 + m32) / s;
      result.z = 0.25 * s;
    }
    return result;
  }
}

/** The normalized axes of `RotationQuaternionFromAxis`, written and read within one call. */
const AXES = [new Vector3(), new Vector3(), new Vector3()];
