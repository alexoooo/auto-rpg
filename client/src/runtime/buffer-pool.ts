import type { BufferId, ReturnSnapshotMessage } from "../protocol/messages.js";

export type BufferLease = {
  bufferId: BufferId;
  leaseToken: number;
  issuedEpoch: number;
  byteLength: number;
  buffer: ArrayBuffer;
};

type Slot = {
  readonly id: BufferId;
  buffer: ArrayBuffer | null;
  outstanding: Omit<BufferLease, "buffer"> | null;
};

export type PoolReturnError = "invalidBufferId" | "invalidLeaseToken" | "invalidBufferCapacity";
export type PoolDiagnostics = { allocations: 3; free: number; outstanding: number; nextLeaseToken: number };

export class LeaseTokenExhaustedError extends Error {}

export class FixedBufferPool {
  readonly capacity: number;
  private readonly slots: [Slot, Slot, Slot];
  private nextLeaseToken = 1;

  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) throw new RangeError("snapshot capacity must be positive");
    this.capacity = capacity;
    this.slots = [0, 1, 2].map((id) => ({ id: id as BufferId, buffer: new ArrayBuffer(capacity), outstanding: null })) as [Slot, Slot, Slot];
  }

  checkout(epoch: number): BufferLease | null {
    const slot = this.slots.find((candidate) => candidate.buffer !== null && candidate.outstanding === null);
    if (!slot) return null;
    if (this.nextLeaseToken > 0xffff_ffff) throw new LeaseTokenExhaustedError("snapshot lease token exhausted");
    const leaseToken = this.nextLeaseToken++;
    const buffer = slot.buffer as ArrayBuffer;
    slot.buffer = null;
    slot.outstanding = { bufferId: slot.id, leaseToken, issuedEpoch: epoch, byteLength: this.capacity };
    return { ...slot.outstanding, buffer };
  }

  reclaim(message: ReturnSnapshotMessage): { ok: true; issuedEpoch: number } | { ok: false; error: PoolReturnError } {
    const slot = this.slots[message.bufferId];
    if (!slot) return { ok: false, error: "invalidBufferId" };
    const lease = slot.outstanding;
    if (!lease || lease.leaseToken !== message.leaseToken || lease.issuedEpoch !== message.epoch) {
      return { ok: false, error: "invalidLeaseToken" };
    }
    if (message.buffer.byteLength !== lease.byteLength || message.buffer.byteLength !== this.capacity) {
      return { ok: false, error: "invalidBufferCapacity" };
    }
    slot.buffer = message.buffer;
    slot.outstanding = null;
    return { ok: true, issuedEpoch: lease.issuedEpoch };
  }

  reclaimUntransferred(lease: BufferLease): void {
    const slot = this.slots[lease.bufferId];
    if (!slot || slot.outstanding?.leaseToken !== lease.leaseToken || slot.outstanding.issuedEpoch !== lease.issuedEpoch) {
      throw new Error("cannot reclaim an untransferred lease that is no longer outstanding");
    }
    slot.buffer = lease.buffer;
    slot.outstanding = null;
  }

  outstandingCount(): number {
    return this.slots.reduce((count, slot) => count + (slot.outstanding ? 1 : 0), 0);
  }

  diagnostics(): PoolDiagnostics {
    const outstanding = this.outstandingCount();
    return { allocations: 3, free: 3 - outstanding, outstanding, nextLeaseToken: this.nextLeaseToken };
  }

  // Test seam for the otherwise unreachable u32 exhaustion boundary.
  setNextLeaseTokenForTest(token: number): void {
    this.nextLeaseToken = token;
  }
}
