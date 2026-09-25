/**
 * A whole world as data: the native half (`native.ts`) and the JavaScript half (`graph.ts`), and
 * the order they go back in.
 *
 * Restore order, each step for a reason:
 * 1. **Topology.** Every `Topological` body replays its severs, ruins and death on the fresh body,
 *    because those dispose joints and re-layer shapes and no field write can do that.
 * 2. **JavaScript state**, paired in place from the roots. It runs after the topology so that the
 *    fields sever wrote are overwritten with the original's, and before the natives so that nothing
 *    a closure does on restore can move a body after it has been placed.
 * 3. **Native state**: every body teleported with its velocities, every live joint's motors,
 *    limits and targets, the physics accumulator. Last, so it is exactly what was captured. A
 *    capture taken with `{ heap: true }` instead copies Havok's whole memory over the fork's own
 *    instance here, which makes the fork exact (`native.ts` says when that is allowed).
 */
import { Node } from "@babylonjs/core/node.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Material } from "@babylonjs/core/Materials/material.js";
import { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import { Observable, Observer } from "@babylonjs/core/Misc/observable.js";
import { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import { PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { PhysicsConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";

import type { Topological } from "../forkable.ts";
import { captureGraph, restoreGraph, type RestoreReport, type StateGraph } from "./graph.ts";
import { captureNative, identityLookup, restoreNative, worldIdentities, type NativeCaptureOptions, type NativeState } from "./native.ts";

/** Engine structure: never walked into, never written, kept as the fork built it. */
export function babylonStructure(value: object): boolean {
  return value instanceof Node || value instanceof Scene || value instanceof Material
    || value instanceof BaseTexture || value instanceof Observable || value instanceof Observer
    || value instanceof AbstractEngine || value instanceof PhysicsBody || value instanceof PhysicsShape
    || value instanceof PhysicsConstraint || value instanceof PhysicsEngine || value instanceof PhysicsAggregate
    || isHavokObject(value);
}

/** Havok's plugin and its bindings, recognised without importing the plugin class. */
function isHavokObject(value: object): boolean {
  return typeof (value as { HP_World_Step?: unknown }).HP_World_Step === "function"
    || (value as { _hknp?: unknown })._hknp !== undefined;
}

export interface WorldCapture {
  readonly topology: readonly unknown[];
  readonly graph: StateGraph;
  readonly native: NativeState;
}

export interface WorldRoots {
  /** Everything stateful in the world is reachable from these, by field or by `captureState`. */
  readonly roots: Record<string, unknown>;
  /** The bodies that can lose parts, in a fixed order. */
  readonly topological: readonly Topological[];
}

/** Capture a world. Reads only. */
export function captureWorld(scene: Scene, world: WorldRoots, options: NativeCaptureOptions = {}): WorldCapture {
  const topology = world.topological.map((body) => body.captureTopology());
  const graph = captureGraph(world.roots, { identities: worldIdentities(scene), structural: babylonStructure });
  const native = captureNative(scene, options);
  return { topology, graph, native };
}

/** Write a capture into a world built by the same code, in the order above. */
export function restoreWorld(scene: Scene, world: WorldRoots, capture: WorldCapture): RestoreReport {
  if (world.topological.length !== capture.topology.length) {
    throw new Error("fork: the fork world has a different number of topological bodies");
  }
  world.topological.forEach((body, i) => body.restoreTopology(capture.topology[i]));
  const report = restoreGraph(capture.graph, world.roots, identityLookup(scene));
  restoreNative(scene, capture.native);
  return report;
}
